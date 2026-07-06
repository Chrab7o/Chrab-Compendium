-- Organizational folders for entries. Folders are NOT a visibility boundary
-- — entries.visibility remains the only access control, exactly as before.
-- Folders are purely for browsing/navigation, so they're publicly readable
-- like campaigns; the client prunes folders with no publicly-visible
-- content before showing them to anonymous visitors.
create table if not exists folders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null
    check (category in ('lore', 'npc', 'location', 'session-note', 'homebrew', 'item')),
  parent_folder_id uuid references folders(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists folders_parent_folder_id_idx on folders(parent_folder_id);
create index if not exists folders_category_idx on folders(category);

alter table entries add column if not exists folder_id uuid references folders(id) on delete set null;
alter table entries add column if not exists sort_order integer not null default 0;

alter table folders enable row level security;

drop policy if exists "folders are publicly readable" on folders;
create policy "folders are publicly readable"
  on folders for select
  using (true);

drop policy if exists "dm manages folders" on folders;
create policy "dm manages folders"
  on folders for all
  using (is_dm())
  with check (is_dm());
