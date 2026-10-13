-- Default name generator per sphere kind.
--
-- Picking a kind for a generated batch on the Sphere Grid now also picks the
-- generator that names it: a Lake batch draws lake names, a Tavern batch
-- tavern names. Sub-kinds inherit the nearest generator above them (Nomad
-- Camp uses Camp's), the same way they inherit tags; that walk happens in the
-- client (kindChain), so only the kind that sets one stores it.
--
-- The value is the generator panel's own source string:
--   place:<key>    a generator in src/data/place-names.json (our word lists)
--   scheme:<id>    a name scheme in src/data/name-schemes/
--   pool:<uuid>    a curated name pool
-- It is plain text rather than a foreign key because two of the three live in
-- the app bundle, not the database. A pool that is later deleted just leaves
-- a value the panel ignores.
--
-- Run via `npx supabase db push`.

alter table sphere_kinds add column if not exists name_generator text;

-- Seed the Location kinds. Matched by full path, so a kind renamed or deleted
-- by hand since the master migration is skipped rather than failing, and a
-- generator already chosen by hand is left alone.
with recursive paths as (
  select id, label::text as path
  from sphere_kinds
  where parent_id is null and not universal
  union all
  select k.id, p.path || ' > ' || k.label
  from sphere_kinds k
  join paths p on p.id = k.parent_id
)
update sphere_kinds k
set name_generator = v.generator
from paths p
join (values
  ('Location > Settlements', 'place:town'),
  ('Location > Settlements > City', 'place:city'),
  ('Location > Settlements > Town', 'place:town'),
  ('Location > Settlements > Village', 'place:village'),
  ('Location > Settlements > Hamlet', 'place:hamlet'),
  ('Location > Settlements > Outpost', 'place:outpost'),
  ('Location > Settlements > Camp', 'place:camp'),

  ('Location > Structures & Sites > Temple / Shrine', 'place:temple'),
  ('Location > Structures & Sites > Fortress / Castle', 'place:fortress'),
  ('Location > Structures & Sites > Tower', 'place:tower'),
  ('Location > Structures & Sites > Ruins', 'place:ruins'),
  ('Location > Structures & Sites > Tavern / Inn', 'place:tavern'),
  ('Location > Structures & Sites > Market', 'place:market'),
  ('Location > Structures & Sites > Shop', 'place:shop'),
  ('Location > Structures & Sites > Harbor / Port', 'place:harbor'),
  ('Location > Structures & Sites > Graveyard', 'place:graveyard'),
  ('Location > Structures & Sites > Mine', 'place:mine'),

  ('Location > Wilderness > Forest', 'place:forest'),
  ('Location > Wilderness > Lake', 'place:lake'),
  ('Location > Wilderness > River', 'place:river'),
  ('Location > Wilderness > Mountain / Pass', 'place:mountain'),
  ('Location > Wilderness > Swamp', 'place:swamp'),
  ('Location > Wilderness > Desert', 'place:desert'),
  ('Location > Wilderness > Coast / Island', 'place:coast'),
  ('Location > Wilderness > Plains', 'place:plains'),
  ('Location > Wilderness > Road / Trade Route', 'place:road'),

  ('Location > Underground & Hidden', 'place:dungeon'),
  ('Location > Underground & Hidden > Cave', 'place:cave'),
  ('Location > Underground & Hidden > Dungeon', 'place:dungeon'),
  ('Location > Underground & Hidden > Tunnel Network', 'place:tunnels'),
  ('Location > Underground & Hidden > Sunken Ruin', 'place:sunken'),
  ('Location > Underground & Hidden > Hidden Vault', 'place:vault'),

  ('Location > Strange Places > Fey Grove', 'place:feyGrove'),
  ('Location > Strange Places > Portal Site', 'place:portal'),
  ('Location > Strange Places > Planar Rift', 'place:rift'),
  ('Location > Strange Places > Impossible Place', 'place:impossible'),

  ('Location > Regions', 'place:kingdom'),
  ('Location > Regions > Kingdom', 'place:kingdom'),
  ('Location > Regions > Duchy', 'place:duchy'),
  ('Location > Regions > Wilderness Territory', 'place:territory'),
  ('Location > Regions > Marches', 'place:marches')
) as v(path, generator) on v.path = p.path
where k.id = p.id and k.name_generator is null;
