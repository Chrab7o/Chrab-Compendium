-- Folders -> tag groups.
--
-- Folders were the primary way to organize and find entries; search turned
-- out to be how entries actually get found, and filing a new entry into the
-- tree was the biggest friction point in creating one. Once tags carry
-- grouping, visibility, and campaign scoping, folders hold no unique
-- capability - so this converts everything they held into tags and drops
-- the whole folder stack, including the pieces that only existed to work
-- around folder limitations (entry_placements: an entry can live in exactly
-- one folder, but can carry any number of tags).
--
-- Everything is converted before anything is dropped. The conversion steps
-- stamp inherited values (visibility, campaign_id, ancestor tags) onto the
-- entries that were inheriting them, so no information is lost - but after
-- that point the folder tree is no longer the source of truth. Back up
-- entries, folders, and entry_placements before running this.
--
-- Run via `npx supabase db push`.

-- 1. Tag groups -----------------------------------------------------------
-- The pseudo-folders. A group is a facet (Type, Collection, Region,
-- Faction); search renders one filter row per group and ANDs across them
-- while ORing within one, which is what makes a group read like a folder
-- path without an entry having to pick just one.
create table if not exists tag_groups (
  id uuid primary key default gen_random_uuid(),
  value text not null unique,
  label text not null,
  sort_order integer not null default 0,
  -- Single-select: picking one tag from this group clears the others
  -- (Type). Enforced in the editor UI, not by constraint - entries.tags is
  -- a plain array and a stray second value should degrade to "both match",
  -- not to a failed write.
  exclusive boolean not null default false,
  -- The editor requires a tag from this group before saving (Type).
  required boolean not null default false,
  color text,
  -- DM-only group: hides the group and everything tagged from it, the way
  -- a DM-only folder hid its whole subtree.
  visibility text not null default 'public'
    check (visibility in ('public', 'dm')),
  created_at timestamptz not null default now()
);

alter table tag_groups enable row level security;

drop policy if exists "tag groups are publicly readable" on tag_groups;
create policy "tag groups are publicly readable"
  on tag_groups for select
  using (visibility = 'public' or is_dm());

drop policy if exists "dm manages tag groups" on tag_groups;
create policy "dm manages tag groups"
  on tag_groups for all
  using (is_dm())
  with check (is_dm());

alter table tags add column if not exists group_id uuid references tag_groups(id) on delete set null;
alter table tags add column if not exists color text;
alter table tags add column if not exists description text;
alter table tags add column if not exists visibility text not null default 'public'
  check (visibility in ('public', 'dm'));

create index if not exists tags_group_id_idx on tags(group_id);

-- 2. Seed the groups ------------------------------------------------------
insert into tag_groups (value, label, sort_order, exclusive, required) values
  ('type', 'Type', 0, true, true),
  ('role', 'Role', 1, false, false),
  ('region', 'Region', 2, false, false),
  ('collection', 'Collection', 3, false, false),
  ('faction', 'Faction', 4, false, false),
  ('campaign', 'Campaign', 5, false, false)
on conflict (value) do nothing;

-- Categories become the exclusive/required Type group, carrying their own
-- visibility across so a DM-only category stays DM-only.
insert into tags (value, label, sort_order, group_id, visibility)
select c.value, c.label, c.sort_order, g.id, c.visibility
from categories c, tag_groups g
where g.value = 'type'
on conflict (value) do update
  set group_id = excluded.group_id,
      visibility = excluded.visibility;

-- Existing loose tags (location/person/session-note) go to Role, not Type.
-- They overlap with categories rather than replacing them - an entry can
-- easily be category 'lore' and tagged 'person' at once - so folding them
-- into the exclusive Type group would make picking one silently clear the
-- other. Role is its own non-exclusive axis, and the /locations, /people
-- and /session-notes nav pages match on tag value regardless of group, so
-- they keep working untouched.
update tags set group_id = (select id from tag_groups where value = 'role')
where group_id is null;

-- One tag per campaign, so an entry can appear under more than one campaign
-- (entries.campaign_id stays authoritative for the single primary one).
insert into tags (value, label, sort_order, group_id)
select 'campaign-' || c.id::text, c.name, 0, g.id
from campaigns c, tag_groups g
where g.value = 'campaign'
on conflict (value) do nothing;

-- One tag per folder. Name collisions across different branches of the tree
-- would silently merge two unrelated folders into one tag, so the slug
-- carries the folder id.
insert into tags (value, label, sort_order, group_id, visibility)
select
  'collection-' || f.id::text,
  f.name,
  f.sort_order,
  g.id,
  f.visibility
from folders f, tag_groups g
where g.value = 'collection'
on conflict (value) do nothing;

-- 3. Stamp what entries were inheriting ----------------------------------
-- Everything below this point reads the folder tree for the last time.

-- Each folder's full ancestor chain, so inherited values resolve in one
-- pass instead of a recursive call per entry.
create temporary table folder_ancestry as
with recursive chain as (
  select f.id as folder_id, f.id as ancestor_id, f.parent_folder_id, 0 as depth
  from folders f
  union all
  select c.folder_id, f.id, f.parent_folder_id, c.depth + 1
  from chain c
  join folders f on f.id = c.parent_folder_id
)
select * from chain;

-- Visibility: DM-only anywhere up the chain made the whole subtree DM-only
-- (the old is_folder_public()). That becomes the entry's own flag.
update entries e
set visibility = 'dm'
where e.folder_id is not null
  and exists (
    select 1 from folder_ancestry a
    join folders f on f.id = a.ancestor_id
    where a.folder_id = e.folder_id and f.visibility = 'dm'
  );

-- Campaign: nearest ancestor with a campaign_id won, and an entry's own
-- explicit campaign_id always beat the folder's.
update entries e
set campaign_id = sub.campaign_id
from (
  select distinct on (a.folder_id) a.folder_id, f.campaign_id
  from folder_ancestry a
  join folders f on f.id = a.ancestor_id
  where f.campaign_id is not null
  order by a.folder_id, a.depth
) sub
where e.campaign_id is null and e.folder_id = sub.folder_id;

-- Tags: own tags + every ancestor folder's tags (additive, any ancestor
-- applies) + the entry's category + a collection tag for every folder in
-- its chain. Tagging with the whole chain rather than just the immediate
-- folder is what lets a single region/collection tag still match everything
-- that used to live anywhere beneath it.
update entries e
set tags = (
  select array(
    select distinct t from unnest(
      e.tags
      || array[e.category]
      || coalesce((
        select array_agg(x)
        from folder_ancestry a
        join folders f on f.id = a.ancestor_id
        cross join lateral unnest(
          f.tags || array['collection-' || f.id::text]
        ) as x
        where a.folder_id = e.folder_id
      ), '{}'::text[])
    ) as t
    where t is not null and t <> ''
  )
);

-- 4. Fold entry_placements into tags --------------------------------------
-- A placement was "this entry also appears in folder X" - as a tag that is
-- just another value in the array, with the same ancestor-chain expansion
-- so it keeps matching the enclosing collections too. A placement with no
-- folder_id was a top-level placement in a category, so it contributes that
-- category's (now Type) tag instead.
update entries e
set tags = (
  select array(
    select distinct t from unnest(
      e.tags || coalesce((
        select array_agg(x)
        from entry_placements p
        left join folder_ancestry a on a.folder_id = p.folder_id
        left join folders f on f.id = a.ancestor_id
        cross join lateral unnest(
          coalesce(f.tags, '{}'::text[])
          || case when f.id is null then array[p.category]
                  else array['collection-' || f.id::text] end
        ) as x
        where p.entry_id = e.id
      ), '{}'::text[])
    ) as t
    where t is not null and t <> ''
  )
)
where exists (select 1 from entry_placements p where p.entry_id = e.id);

-- 5. Regions target a tag query instead of a folder -----------------------
-- Strictly more expressive than folder_id: a region can now point at a
-- combination ("Locations in Ashfall") that no single folder held.
alter table map_regions add column if not exists tag_query text[] not null default '{}';

update map_regions r
set tag_query = array['collection-' || r.folder_id::text]
where r.folder_id is not null;

-- 6. Per-timeline region overrides ----------------------------------------
create table if not exists region_tag_links (
  id uuid primary key default gen_random_uuid(),
  region_id uuid not null references map_regions(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  tag_query text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (region_id, campaign_id)
);

create index if not exists region_tag_links_region_id_idx on region_tag_links(region_id);

alter table region_tag_links enable row level security;

drop policy if exists "region tag links are publicly readable" on region_tag_links;
create policy "region tag links are publicly readable"
  on region_tag_links for select
  using (true);

drop policy if exists "dm manages region tag links" on region_tag_links;
create policy "dm manages region tag links"
  on region_tag_links for all
  using (is_dm())
  with check (is_dm());

insert into region_tag_links (region_id, campaign_id, tag_query)
select l.region_id, l.campaign_id, array['collection-' || l.folder_id::text]
from region_folder_links l
on conflict (region_id, campaign_id) do nothing;

-- 7. Tag-driven visibility ------------------------------------------------
-- Replaces both is_category_public() and is_folder_public(): an entry is
-- hidden if any tag it carries - or that tag's group - is DM-only. Keeps
-- the "one toggle hides many" power folders had, and now works across any
-- axis rather than only down a single tree.
--
-- Fails open on tags with no matching row, the same way is_category_public()
-- did, so a renamed or hand-typed tag never silently hides everything
-- carrying it.
create or replace function public.is_tags_public(t text[])
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select not exists (
    select 1
    from tags
    left join tag_groups g on g.id = tags.group_id
    where tags.value = any(t)
      and (tags.visibility = 'dm' or g.visibility = 'dm')
  );
$$;

drop policy if exists "public entries are publicly readable" on entries;
create policy "public entries are publicly readable"
  on entries for select
  using (is_dm() or (visibility = 'public' and is_tags_public(tags)));

-- A DM-only tag's *name* is a spoiler in itself, and every filter row in
-- search is built straight from this table - so hide the tag row too, not
-- just the entries carrying it. Same for a tag in a DM-only group.
drop policy if exists "tags are publicly readable" on tags;
create policy "tags are publicly readable"
  on tags for select
  using (
    is_dm()
    or (
      visibility = 'public'
      and (
        group_id is null
        or exists (
          select 1 from tag_groups g
          where g.id = tags.group_id and g.visibility = 'public'
        )
      )
    )
  );

-- 8. Demolition -----------------------------------------------------------
drop policy if exists "placements visible if entry is" on entry_placements;
drop policy if exists "dm manages placements" on entry_placements;
drop table if exists entry_placements;

drop table if exists region_folder_links;

alter table map_regions drop column if exists folder_id;

drop policy if exists "folders are publicly readable" on folders;
drop policy if exists "dm manages folders" on folders;

alter table entries drop column if exists folder_id;
alter table entries drop column if exists sort_order;

drop table if exists folders;

-- categories is fully represented by the Type tag group now. entries.category
-- goes with it; the Type tag on each entry carries the same value.
alter table entries drop constraint if exists entries_category_fkey;
alter table entries drop column if exists category;

drop policy if exists "categories are publicly readable" on categories;
drop policy if exists "dm manages categories" on categories;
drop table if exists categories;

drop function if exists public.is_folder_public(uuid);
drop function if exists public.is_category_public(text);

-- The Obsidian-over-Drive sync these supported is not in use, and
-- obsidian_folder_id died with the folders table.
drop table if exists obsidian_synced_images;
alter table entries drop column if exists obsidian_file_id;

-- 9. Keep campaign mirror tags in sync ------------------------------------
-- Hand-maintaining these against renames would rot immediately.
create or replace function public.sync_campaign_tag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    delete from tags where value = 'campaign-' || old.id::text;
    return old;
  end if;

  insert into tags (value, label, group_id)
  values (
    'campaign-' || new.id::text,
    new.name,
    (select id from tag_groups where value = 'campaign')
  )
  on conflict (value) do update set label = excluded.label;
  return new;
end;
$$;

drop trigger if exists campaigns_sync_tag on campaigns;
create trigger campaigns_sync_tag
  after insert or update or delete on campaigns
  for each row execute function public.sync_campaign_tag();

-- entries.tags is now the primary filter axis on every read path.
create index if not exists entries_tags_idx on entries using gin (tags);
