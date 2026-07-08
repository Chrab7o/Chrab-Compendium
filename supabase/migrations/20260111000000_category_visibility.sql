-- DM-only categories. Unlike folders (which are pure organization, not a
-- security boundary), a DM-only category is a real access-control gate:
-- hiding the category also hides every folder, entry, and placement filed
-- under it, regardless of that entry's own visibility — otherwise a
-- "public" entry tucked inside a "DM only" category would still leak via a
-- direct link.
alter table categories add column if not exists visibility text not null default 'public'
  check (visibility in ('public', 'dm'));

drop policy if exists "categories are publicly readable" on categories;
create policy "categories are publicly readable"
  on categories for select
  using (visibility = 'public' or is_dm());

-- Central check other policies delegate to, mirroring is_dm(). Defaults to
-- true (fail open to "public") if the category row can't be found, so a
-- stray/renamed category value never silently hides everything under it.
create or replace function public.is_category_public(cat text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce((select visibility = 'public' from categories where value = cat), true);
$$;

drop policy if exists "folders are publicly readable" on folders;
create policy "folders are publicly readable"
  on folders for select
  using (is_dm() or is_category_public(category));

drop policy if exists "public entries are publicly readable" on entries;
create policy "public entries are publicly readable"
  on entries for select
  using (is_dm() or (visibility = 'public' and is_category_public(category)));

drop policy if exists "placements visible if entry is" on entry_placements;
create policy "placements visible if entry is"
  on entry_placements for select
  using (
    is_dm()
    or (
      is_category_public(category)
      and exists (
        select 1 from entries e where e.id = entry_placements.entry_id and e.visibility = 'public'
      )
    )
  );
