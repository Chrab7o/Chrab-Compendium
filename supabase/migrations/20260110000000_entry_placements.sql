-- Lets an entry show up in more than one place in the folder tree. An
-- entry's own `category`/`folder_id` remain its primary/default location
-- (used everywhere that expects a single location); rows here are
-- *additional* spots the same entry also appears in when browsing.
create table if not exists entry_placements (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references entries(id) on delete cascade,
  category text not null references categories(value),
  folder_id uuid references folders(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists entry_placements_entry_id_idx on entry_placements(entry_id);
create index if not exists entry_placements_folder_id_idx on entry_placements(folder_id);

-- A plain UNIQUE constraint wouldn't stop duplicate top-level (null
-- folder_id) placements, since NULL <> NULL — this index treats "no folder"
-- as its own fixed value for uniqueness purposes.
create unique index if not exists entry_placements_unique_idx
  on entry_placements (entry_id, category, coalesce(folder_id, '00000000-0000-0000-0000-000000000000'));

alter table entry_placements enable row level security;

drop policy if exists "placements visible if entry is" on entry_placements;
create policy "placements visible if entry is"
  on entry_placements for select
  using (
    is_dm()
    or exists (
      select 1 from entries e where e.id = entry_placements.entry_id and e.visibility = 'public'
    )
  );

drop policy if exists "dm manages placements" on entry_placements;
create policy "dm manages placements"
  on entry_placements for all
  using (is_dm())
  with check (is_dm());
