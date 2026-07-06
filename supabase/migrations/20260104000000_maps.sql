-- Interactive maps: an uploaded image with pixel-coordinate markers that
-- optionally link to an entry. Run via `npx supabase db push`.

create table if not exists maps (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  campaign_id uuid references campaigns(id) on delete cascade,
  image_path text not null,
  image_width int not null,
  image_height int not null,
  created_at timestamptz not null default now()
);

create table if not exists map_markers (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references maps(id) on delete cascade,
  x double precision not null,
  y double precision not null,
  label text not null,
  visibility text not null default 'public'
    check (visibility in ('public', 'dm')),
  entry_id uuid references entries(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists map_markers_map_id_idx on map_markers(map_id);

alter table maps enable row level security;
alter table map_markers enable row level security;

drop policy if exists "maps are publicly readable" on maps;
create policy "maps are publicly readable"
  on maps for select
  using (true);

drop policy if exists "dm manages maps" on maps;
create policy "dm manages maps"
  on maps for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists "public markers are publicly readable" on map_markers;
create policy "public markers are publicly readable"
  on map_markers for select
  using (visibility = 'public' or auth.role() = 'authenticated');

drop policy if exists "dm manages markers" on map_markers;
create policy "dm manages markers"
  on map_markers for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Storage bucket for map images. Public so images can be shown to
-- anonymous visitors; writes still require the DM to be logged in.
insert into storage.buckets (id, name, public)
values ('maps', 'maps', true)
on conflict (id) do nothing;

drop policy if exists "map images are publicly readable" on storage.objects;
create policy "map images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'maps');

drop policy if exists "dm manages map images" on storage.objects;
create policy "dm manages map images"
  on storage.objects for all
  using (bucket_id = 'maps' and auth.role() = 'authenticated')
  with check (bucket_id = 'maps' and auth.role() = 'authenticated');
