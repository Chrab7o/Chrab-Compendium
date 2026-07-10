-- Support for a scheduled Obsidian -> Compendium sync job (a Node script run
-- by GitHub Actions, reading a Google Drive mirror of the vault). Google
-- Drive assigns every file and folder a permanent id that survives renames
-- and moves, so storing it lets the sync job upsert by that id instead of
-- blindly inserting — re-running against the same vault updates existing
-- rows rather than duplicating them.
alter table folders add column if not exists obsidian_folder_id text unique;
alter table entries add column if not exists obsidian_file_id text unique;

-- Caches which Drive image files have already been uploaded to the
-- entry-images bucket, so a re-sync doesn't re-upload an unchanged image
-- under a fresh random filename every run.
create table if not exists obsidian_synced_images (
  drive_file_id text primary key,
  storage_path text not null,
  updated_at timestamptz not null default now()
);

alter table obsidian_synced_images enable row level security;

drop policy if exists "dm manages synced image cache" on obsidian_synced_images;
create policy "dm manages synced image cache"
  on obsidian_synced_images for all
  using (is_dm())
  with check (is_dm());
