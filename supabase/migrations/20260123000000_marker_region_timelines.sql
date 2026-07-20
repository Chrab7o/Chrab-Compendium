-- Campaign scoping moves from maps down to individual markers/regions —
-- a map now belongs to a world (shared by every campaign/era in it), while
-- a marker or region can be tagged to a specific campaign ("timeline"), or
-- left general so it shows in every era. Lets one map image serve multiple
-- campaigns without duplicating the whole row per campaign.
alter table map_markers add column if not exists campaign_id uuid references campaigns(id) on delete cascade;
alter table map_regions add column if not exists campaign_id uuid references campaigns(id) on delete cascade;
create index if not exists map_markers_campaign_id_idx on map_markers(campaign_id);
create index if not exists map_regions_campaign_id_idx on map_regions(campaign_id);

-- Preserve existing intent: markers/regions on a map that had its own
-- campaign_id inherit that campaign specifically, rather than silently
-- becoming "general" (visible in every timeline) once maps.campaign_id
-- goes away.
update map_markers mm set campaign_id = m.campaign_id
from maps m where mm.map_id = m.id and m.campaign_id is not null and mm.campaign_id is null;

update map_regions mr set campaign_id = m.campaign_id
from maps m where mr.map_id = m.id and m.campaign_id is not null and mr.campaign_id is null;

alter table maps drop column if exists campaign_id;
