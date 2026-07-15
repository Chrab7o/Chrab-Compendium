-- Folders can carry tags too, inherited by everything filed inside them —
-- same computed-at-read-time approach as campaign_id/visibility (see
-- 20260112000000_folder_visibility.sql): tagging a "Locations" folder
-- "location" once covers every entry nested inside, at any depth, without
-- hand-tagging each one individually. Not a security boundary (tags never
-- gate RLS, only visibility does), so no policy changes needed here.
alter table folders add column if not exists tags text[] not null default '{}';
