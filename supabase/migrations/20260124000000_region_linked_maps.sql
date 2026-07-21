-- A region can now link to another map instead of a folder — clicking it
-- zooms into that map (e.g. a "Calypso" region drawn on the Alva overview
-- map, taking you to the Calypso continent map) rather than opening the
-- entries-by-folder panel. Nullable; most regions still just link to a
-- folder, unchanged. `set null` (not cascade) since deleting the target
-- map should just drop the dangling link, not the region that pointed to it.
alter table map_regions add column if not exists linked_map_id uuid references maps(id) on delete set null;
