-- Worlds: the top-level "which setting am I in" concept the landing page
-- lets a visitor pick, replacing the informal "someone named a folder
-- Worlds" convention with a real entity a map (and eventually other
-- content) can belong to. Run via `npx supabase db push`.

create table if not exists worlds (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  hero_image_path text,
  created_at timestamptz not null default now()
);

alter table worlds enable row level security;

drop policy if exists "worlds are publicly readable" on worlds;
create policy "worlds are publicly readable"
  on worlds for select
  using (true);

drop policy if exists "dm manages worlds" on worlds;
create policy "dm manages worlds"
  on worlds for all
  using (is_dm())
  with check (is_dm());

-- A map optionally belongs to a world; multiple maps per world is how a
-- world gets more than one "timeline" (e.g. different eras of the same
-- setting) without any separate timeline/era table.
alter table maps add column if not exists world_id uuid references worlds(id) on delete set null;

-- Storage bucket for world hero images, same shape as the existing 'maps'
-- bucket: public read, DM-only write.
insert into storage.buckets (id, name, public)
values ('worlds', 'worlds', true)
on conflict (id) do nothing;

drop policy if exists "world images are publicly readable" on storage.objects;
create policy "world images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'worlds');

drop policy if exists "dm manages world images" on storage.objects;
create policy "dm manages world images"
  on storage.objects for all
  using (bucket_id = 'worlds' and is_dm())
  with check (bucket_id = 'worlds' and is_dm());
