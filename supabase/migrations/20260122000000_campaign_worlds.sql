-- Campaigns now belong to a world (World -> Campaign hierarchy), so browsing
-- can be world-first: pick a world, then pick a campaign within it, instead
-- of a campaign filter floating independently in the nav. Backfills every
-- existing campaign onto the one world that exists today ("Alva") before
-- making the column required.
alter table campaigns add column if not exists world_id uuid references worlds(id) on delete cascade;

update campaigns set world_id = (select id from worlds limit 1) where world_id is null;

alter table campaigns alter column world_id set not null;
