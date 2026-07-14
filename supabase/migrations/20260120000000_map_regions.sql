-- Freeform polygon regions on a map: hoverable (name tooltip), clickable
-- (link to a folder whose entries + descendant-folder entries are shown,
-- grouped by tag). Points are stored as a jsonb array of {x,y} pixel
-- coordinates in image space (top-left origin, y down) — same convention
-- as map_markers.x/y. A plain jsonb array (not a child table) because
-- nothing ever queries individual vertices server-side; only the client
-- renders/hit-tests the whole shape at once. Run via `npx supabase db push`.

create table if not exists map_regions (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references maps(id) on delete cascade,
  name text not null,
  points jsonb not null,
  folder_id uuid references folders(id) on delete set null,
  visibility text not null default 'public'
    check (visibility in ('public', 'dm')),
  created_at timestamptz not null default now(),
  constraint map_regions_points_shape check (
    jsonb_typeof(points) = 'array' and jsonb_array_length(points) >= 3
  )
);

create index if not exists map_regions_map_id_idx on map_regions(map_id);

alter table map_regions enable row level security;

drop policy if exists "public regions are publicly readable" on map_regions;
create policy "public regions are publicly readable"
  on map_regions for select
  using (visibility = 'public' or is_dm());

drop policy if exists "dm manages regions" on map_regions;
create policy "dm manages regions"
  on map_regions for all
  using (is_dm())
  with check (is_dm());
