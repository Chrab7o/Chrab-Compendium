-- Place names now come in invented languages (src/data/place-languages/), and
-- a kind's default generator can pin one: `place:ruins@old` always names
-- ruins in the Old Tongue, while a plain `place:lake` uses whichever language
-- is picked in the generator panel.
--
-- Pin the few kinds whose flavor clearly belongs to one language. Only a value
-- still exactly as 20261023000000_kind_name_generators.sql seeded it is
-- changed, so anything picked by hand since is left alone.
--
-- Run via `npx supabase db push`.

update sphere_kinds k
set name_generator = v.pinned
from (values
  ('place:ruins', 'place:ruins@old'),
  ('place:sunken', 'place:sunken@old'),
  ('place:rift', 'place:rift@old'),
  ('place:mine', 'place:mine@dwarven'),
  ('place:feyGrove', 'place:feyGrove@sylvan'),
  ('place:desert', 'place:desert@sun')
) as v(seeded, pinned)
where k.name_generator = v.seeded;
