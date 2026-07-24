-- A region's shape/position is often shared across every timeline on a map
-- (the same "Padian Desert" outline exists in 484 AC and 500 AC alike), but
-- what it should browse to can differ per era. map_regions.folder_id stays
-- the default (used when no timeline is selected, or the active timeline
-- has no override); this table holds the per-campaign exceptions on top of
-- that default - resolved at read time, same pattern as the rest of the
-- campaign-scoping in this app. Run via `npx supabase db push`.

create table if not exists region_folder_links (
  id uuid primary key default gen_random_uuid(),
  region_id uuid not null references map_regions(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  folder_id uuid not null references folders(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (region_id, campaign_id)
);

create index if not exists region_folder_links_region_id_idx on region_folder_links(region_id);

alter table region_folder_links enable row level security;

drop policy if exists "region folder links are publicly readable" on region_folder_links;
create policy "region folder links are publicly readable"
  on region_folder_links for select
  using (true);

drop policy if exists "dm manages region folder links" on region_folder_links;
create policy "dm manages region folder links"
  on region_folder_links for all
  using (is_dm())
  with check (is_dm());
