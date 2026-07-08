-- DM-only folders, same idea as DM-only categories: marking one folder
-- DM-only hides it and everything nested inside it (subfolders and
-- entries, recursively) from anyone but the DM — regardless of what those
-- entries' own visibility says.
--
-- This is computed at read time by walking the parent_folder_id chain
-- rather than writing 'dm' onto every descendant row, so toggling a
-- folder's visibility takes effect (and reverses) instantly for its whole
-- subtree with no cascade-write or cascade-undo needed.
alter table folders add column if not exists visibility text not null default 'public'
  check (visibility in ('public', 'dm'));

create or replace function public.is_folder_public(fid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  with recursive ancestors as (
    select id, parent_folder_id, visibility from folders where id = fid
    union all
    select f.id, f.parent_folder_id, f.visibility
    from folders f
    join ancestors a on f.id = a.parent_folder_id
  )
  select coalesce(bool_and(visibility = 'public'), true) from ancestors;
$$;

drop policy if exists "folders are publicly readable" on folders;
create policy "folders are publicly readable"
  on folders for select
  using (is_dm() or (is_category_public(category) and is_folder_public(id)));

drop policy if exists "public entries are publicly readable" on entries;
create policy "public entries are publicly readable"
  on entries for select
  using (
    is_dm()
    or (
      visibility = 'public'
      and is_category_public(category)
      and (folder_id is null or is_folder_public(folder_id))
    )
  );

drop policy if exists "placements visible if entry is" on entry_placements;
create policy "placements visible if entry is"
  on entry_placements for select
  using (
    is_dm()
    or (
      is_category_public(category)
      and (folder_id is null or is_folder_public(folder_id))
      and exists (
        select 1 from entries e where e.id = entry_placements.entry_id and e.visibility = 'public'
      )
    )
  );
