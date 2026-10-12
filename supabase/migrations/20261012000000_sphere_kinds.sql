-- Sphere kinds: questions belong to a kind list, not to wiki tags.
--
-- Tying questions to tags was too coarse - a cave and a city are both
-- "location", but "Who holds power here?" makes no sense for a cave. So the
-- grid gets its own list of kinds, which can nest (Location > Cave / Dungeon):
--
--   * a sub-kind inherits every question from the kinds above it, plus its
--     own, and can switch off inherited questions that don't fit. Switching
--     one off also hides it from that kind's own sub-kinds.
--   * each sphere (entry) has one kind. A kind can name a wiki tag that is
--     added to the entry when the kind is picked, so search still works; a
--     sub-kind with no tag of its own uses its parent's.
--
-- Only `parent_id` is stored; inheritance is resolved at read time by walking
-- up the chain in JS, the same computed-hierarchy pattern used elsewhere.
--
-- Run via `npx supabase db push`.

-- 1. Kinds ----------------------------------------------------------------
create table if not exists sphere_kinds (
  id uuid primary key default gen_random_uuid(),
  -- Deleting a kind lifts its sub-kinds to the top level rather than taking
  -- them (and their questions) with it.
  parent_id uuid references sphere_kinds(id) on delete set null,
  label text not null,
  tag text references tags(value) on update cascade on delete set null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists sphere_kinds_parent_id_idx on sphere_kinds(parent_id);

alter table entries add column if not exists sphere_kind_id uuid references sphere_kinds(id) on delete set null;

-- A question switched off for a kind (and everything beneath it).
create table if not exists sphere_kind_hidden_prompts (
  kind_id uuid not null references sphere_kinds(id) on delete cascade,
  prompt_id uuid not null references sphere_prompts(id) on delete cascade,
  primary key (kind_id, prompt_id)
);

alter table sphere_kinds enable row level security;
alter table sphere_kind_hidden_prompts enable row level security;

drop policy if exists "dm manages sphere kinds" on sphere_kinds;
create policy "dm manages sphere kinds"
  on sphere_kinds for all
  using (is_dm())
  with check (is_dm());

drop policy if exists "dm manages hidden prompts" on sphere_kind_hidden_prompts;
create policy "dm manages hidden prompts"
  on sphere_kind_hidden_prompts for all
  using (is_dm())
  with check (is_dm());

-- 2. The four existing question sets become top-level kinds --------------
insert into sphere_kinds (label, tag, sort_order)
select t.label, t.value,
  case t.value when 'location' then 0 when 'person' then 1 when 'organization' then 2 else 3 end
from tags t
where t.value in (select distinct tag from sphere_prompts);

-- 3. Questions move from tags to kinds -----------------------------------
alter table sphere_prompts add column if not exists kind_id uuid references sphere_kinds(id) on delete cascade;
alter table sphere_prompts add column if not exists spawn_kind_id uuid references sphere_kinds(id) on delete set null;

update sphere_prompts p
set kind_id = k.id
from sphere_kinds k
where k.parent_id is null and k.tag = p.tag;

-- "Can become a sphere tagged person" becomes "can become a Person".
update sphere_prompts p
set spawn_kind_id = k.id
from sphere_kinds k
where k.parent_id is null and k.tag = p.spawn_tags[1];

delete from sphere_prompts where kind_id is null;
alter table sphere_prompts alter column kind_id set not null;
alter table sphere_prompts drop column if exists tag;
alter table sphere_prompts drop column if exists spawn_tags;

create index if not exists sphere_prompts_kind_id_idx on sphere_prompts(kind_id);

-- 4. Existing entries get a kind where their tags make it unambiguous -----
update entries e
set sphere_kind_id = k.id
from sphere_kinds k
where k.parent_id is null
  and e.sphere_kind_id is null
  and k.tag = any(e.tags)
  and (select count(*) from sphere_kinds k2 where k2.parent_id is null and k2.tag = any(e.tags)) = 1;

-- 5. Starter sub-kinds ----------------------------------------------------
-- No tag of their own: they use their parent's (a Cave is tagged Location).
insert into sphere_kinds (parent_id, label, sort_order)
select k.id, v.label, v.sort_order
from (values
  ('location', 'Settlement', 0),
  ('location', 'Wilderness', 1),
  ('location', 'Cave / Dungeon', 2),
  ('location', 'Building', 3),
  ('organization', 'Religion', 0),
  ('event', 'Battle', 0)
) as v(parent_tag, label, sort_order)
join sphere_kinds k on k.parent_id is null and k.tag = v.parent_tag;

-- Their own questions. Labels never repeat an inherited one, since a label
-- is how an answer is recognised in the entry text.
insert into sphere_prompts (kind_id, label, question, ideas, spawn_kind_id, sort_order)
select sk.id, v.label, v.question, v.ideas, spawn.id, v.sort_order
from (values
  ('Settlement', 'Trade', 'What does it trade, and with whom?',
    array['grain', 'ore', 'salted fish', 'wool and cloth', 'wine', 'relics', 'information', 'something outlawed elsewhere'], null::text, 0),
  ('Settlement', 'Defense', 'How is it defended?',
    array['a stone wall', 'a militia', 'a hired company', 'a wizard''s ward', 'a river and a drawbridge',
          'nothing - it relies on being forgotten'], null, 1),
  ('Settlement', 'Faith', 'Where do people worship?',
    array['a crumbling shrine', 'a grand temple', 'a sacred tree', 'the old gods, in secret', 'nobody does anymore'], null, 2),

  ('Wilderness', 'Hazard', 'What makes travel here dangerous?',
    array['sudden storms', 'sinking ground', 'territorial beasts', 'getting lost', 'raiders', 'strange magic', 'the cold'], null, 0),
  ('Wilderness', 'Inhabitants', 'What lives here?',
    array['wolves', 'a reclusive hermit', 'a druid circle', 'giants', 'fey', 'nomads', 'something nobody has seen'], null, 1),
  ('Wilderness', 'Landmark', 'What landmark do travelers steer by?',
    array['a lightning-split tree', 'standing stones', 'a dead dragon''s skull', 'a waterfall', 'a lone tower'], 'location', 2),

  ('Cave / Dungeon', 'In the dark', 'What lives in the dark?',
    array['blind fish', 'a hibernating beast', 'cultists', 'goblins', 'oozes', 'a ghost', 'nothing - and that is wrong'], null, 0),
  ('Cave / Dungeon', 'Origin', 'Who made it, or what carved it?',
    array['an old dwarf hold', 'a collapsed mine', 'an underground river', 'a tomb', 'a sorcerer''s prison',
          'a burrowing monster'], null, 1),
  ('Cave / Dungeon', 'At the bottom', 'What is at the very bottom?',
    array['a sealed door', 'an underground lake', 'a sleeping god', 'a hoard', 'a way to somewhere else',
          'the first king''s grave'], null, 2),
  ('Cave / Dungeon', 'Hazard', 'What hazard does everyone forget about?',
    array['bad air', 'flooding', 'unstable ceilings', 'mazelike tunnels', 'echoes that wake things'], null, 3),

  ('Building', 'Owner', 'Who owns it?',
    array['a widow', 'a guild', 'the crown', 'a priest', 'an absent noble', 'squatters'], 'person', 0),
  ('Building', 'Purpose', 'What is it used for now - and what was it built for?',
    array['an inn that was a jail', 'a temple turned warehouse', 'a library', 'a mansion turned orphanage',
          'a watchtower nobody mans'], null, 1),
  ('Building', 'Key room', 'Which room matters most?',
    array['a locked study', 'the cellar', 'a private chapel', 'a hidden passage', 'the kitchens'], null, 2),

  ('Religion', 'Worship', 'What do they worship?',
    array['a sun god', 'their ancestors', 'the sea', 'a saint', 'a dead god', 'a living ruler', 'the stars'], null, 0),
  ('Religion', 'Rite', 'What is their central rite?',
    array['a yearly pilgrimage', 'a sacrifice', 'silence at dawn', 'a feast', 'a trial by ordeal'], null, 1),
  ('Religion', 'Schism', 'What heresy divides them?',
    array['who the true prophet was', 'whether magic is a sin', 'the place of the crown', 'a forged scripture'], null, 2),

  ('Battle', 'Victor', 'Who won, and at what cost?',
    array['the defenders, barely', 'nobody', 'the invaders, then lost the peace', 'a third party that waited'], 'organization', 0),
  ('Battle', 'Lost', 'What was lost on the field?',
    array['a king', 'a sacred banner', 'a whole village', 'a famous sword', 'a secret'], null, 1),
  ('Battle', 'Turning point', 'What turned the battle?',
    array['a betrayal', 'the weather', 'a hero''s sacrifice', 'a mage''s spell', 'a cavalry charge', 'plague in the camp'], null, 2)
) as v(kind, label, question, ideas, spawn_tag, sort_order)
join sphere_kinds sk on sk.label = v.kind and sk.parent_id is not null
left join sphere_kinds spawn on spawn.parent_id is null and spawn.tag = v.spawn_tag;

-- Inherited questions that don't fit a sub-kind.
insert into sphere_kind_hidden_prompts (kind_id, prompt_id)
select sk.id, p.id
from (values
  ('Wilderness', 'Power'),
  ('Wilderness', 'Depends on'),
  ('Cave / Dungeon', 'Power'),
  ('Cave / Dungeon', 'Depends on'),
  ('Building', 'Power')
) as v(kind, label)
join sphere_kinds sk on sk.label = v.kind and sk.parent_id is not null
join sphere_prompts p on p.kind_id = sk.parent_id and p.label = v.label
on conflict do nothing;
