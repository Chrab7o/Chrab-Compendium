-- Rebuild the Sphere Grid's kinds and questions from the Story Engine master
-- reference.
--
-- Everything replaced here was starter content seeded by earlier migrations
-- (nothing had been added by hand yet), so it is rebuilt from scratch rather
-- than patched. Entries that already had a kind are moved onto the matching
-- new kind at the end.
--
--   * "Every sphere": universal questions shown on every sphere, whatever its
--     kind (or with none). A kind can still switch them off or tailor their
--     ideas, exactly like any inherited question. Name is the sphere's own
--     title, so it isn't a question.
--   * Type tags / top-level kinds: Location, Person, Faction (the old
--     Organization tag, relabelled), Item, Event, Lore, Plot - each with the
--     reference's sub-kinds.
--   * Questions from the reference for Town, Road, Cave, Person and its
--     Martial / Magic / Monster sub-kinds. Where a reference question repeats
--     a universal one ("What do they want?", "First thing you notice", "What
--     locals don't talk about") its answers become tailored ideas for the
--     universal question instead of a duplicate.
--   * Faction and Event are "not yet built out" in the reference; they keep
--     the earlier starter questions (minus "Secret", now universal).
--
-- Run via `npx supabase db push`.

-- 0. Universal kinds ------------------------------------------------------
alter table sphere_kinds add column if not exists universal boolean not null default false;

-- 1. Type tags --------------------------------------------------------------
update tags set label = 'Faction' where value = 'organization';

insert into tags (value, label, sort_order, group_id, color)
select v.value, v.label, v.sort_order, g.id, v.color
from (values
  ('item', 'Item', 5, '#0e7490'),
  ('lore', 'Lore', 6, '#b8860b'),
  ('plot', 'Plot', 7, '#be185d')
) as v(value, label, sort_order, color),
tag_groups g
where g.value = 'type'
on conflict (value) do update set group_id = excluded.group_id;

update tags set sort_order = 8 where value = 'homebrew';

-- 2. Remember which entries had which kind, then clear the old set -------
create temporary table old_entry_kinds as
select e.id as entry_id, k.label
from entries e
join sphere_kinds k on k.id = e.sphere_kind_id;

-- Cascades to questions, switched-off questions and tailored ideas; entries
-- keep their text and tags, and lose the kind until step 7.
delete from sphere_kinds;

-- Resolves "Location > Settlements > Town" to a kind id ('*' = universal).
create or replace function pg_temp.kind_by_path(path text)
returns uuid
language plpgsql
as $$
declare
  part text;
  current_id uuid := null;
  found_id uuid;
begin
  if path = '*' then
    select id into found_id from public.sphere_kinds where universal limit 1;
    return found_id;
  end if;
  foreach part in array string_to_array(path, ' > ') loop
    found_id := null;
    select id into found_id
    from public.sphere_kinds
    where label = part and parent_id is not distinct from current_id and not universal;
    if found_id is null then
      raise exception 'No sphere kind at path: %', path;
    end if;
    current_id := found_id;
  end loop;
  return current_id;
end;
$$;

-- 3. Kinds, one level at a time ------------------------------------------
insert into sphere_kinds (label, universal, sort_order) values ('Every sphere', true, -1);

insert into sphere_kinds (label, tag, sort_order) values
  ('Location', 'location', 0),
  ('Person', 'person', 1),
  ('Faction', 'organization', 2),
  ('Item', 'item', 3),
  ('Event', 'event', 4),
  ('Lore', 'lore', 5),
  ('Plot', 'plot', 6);

insert into sphere_kinds (parent_id, label, sort_order)
select pg_temp.kind_by_path(v.parent), v.label, v.sort_order
from (values
  ('Location', 'Settlements', 0),
  ('Location', 'Structures & Sites', 1),
  ('Location', 'Wilderness', 2),
  ('Location', 'Underground & Hidden', 3),
  ('Location', 'Strange Places', 4),
  ('Location', 'Regions', 5),

  ('Person', 'Martial', 0),
  ('Person', 'Magic', 1),
  ('Person', 'Common', 2),
  ('Person', 'Humanoid', 3),
  ('Person', 'Monster', 4),

  ('Faction', 'Guild', 0),
  ('Faction', 'Cult', 1),
  ('Faction', 'Kingdom', 2),
  ('Faction', 'Army', 3),
  ('Faction', 'Noble House', 4),
  ('Faction', 'Mercenary Company', 5),
  ('Faction', 'Religion', 6),
  ('Faction', 'Secret Society', 7),

  ('Item', 'Weapon', 0),
  ('Item', 'Armor', 1),
  ('Item', 'Relic', 2),
  ('Item', 'Tool', 3),
  ('Item', 'Document / Map', 4),
  ('Item', 'Potion', 5),
  ('Item', 'Treasure', 6),
  ('Item', 'Cursed Object', 7),

  ('Event', 'Past', 0),
  ('Event', 'Present', 1),
  ('Event', 'Future', 2),

  ('Lore', 'Gods & Myths', 0),
  ('Lore', 'Magic Systems', 1),
  ('Lore', 'Laws & Customs', 2),
  ('Lore', 'Languages', 3),
  ('Lore', 'Legends', 4),
  ('Lore', 'Rumors', 5),

  ('Plot', 'Hook', 0),
  ('Plot', 'Mystery', 1),
  ('Plot', 'Quest', 2),
  ('Plot', 'Heist', 3),
  ('Plot', 'Conflict', 4)
) as v(parent, label, sort_order);

insert into sphere_kinds (parent_id, label, sort_order)
select pg_temp.kind_by_path(v.parent), v.label, v.sort_order
from (values
  ('Location > Settlements', 'City', 0),
  ('Location > Settlements', 'Town', 1),
  ('Location > Settlements', 'Village', 2),
  ('Location > Settlements', 'Hamlet', 3),
  ('Location > Settlements', 'Outpost', 4),
  ('Location > Settlements', 'Camp', 5),

  ('Location > Structures & Sites', 'Temple / Shrine', 0),
  ('Location > Structures & Sites', 'Fortress / Castle', 1),
  ('Location > Structures & Sites', 'Tower', 2),
  ('Location > Structures & Sites', 'Ruins', 3),
  ('Location > Structures & Sites', 'Tavern / Inn', 4),
  ('Location > Structures & Sites', 'Market', 5),
  ('Location > Structures & Sites', 'Shop', 6),
  ('Location > Structures & Sites', 'Harbor / Port', 7),
  ('Location > Structures & Sites', 'Graveyard', 8),
  ('Location > Structures & Sites', 'Mine', 9),

  ('Location > Wilderness', 'Forest', 0),
  ('Location > Wilderness', 'Lake', 1),
  ('Location > Wilderness', 'River', 2),
  ('Location > Wilderness', 'Mountain / Pass', 3),
  ('Location > Wilderness', 'Swamp', 4),
  ('Location > Wilderness', 'Desert', 5),
  ('Location > Wilderness', 'Coast / Island', 6),
  ('Location > Wilderness', 'Plains', 7),
  ('Location > Wilderness', 'Road / Trade Route', 8),

  ('Location > Underground & Hidden', 'Cave', 0),
  ('Location > Underground & Hidden', 'Dungeon', 1),
  ('Location > Underground & Hidden', 'Tunnel Network', 2),
  ('Location > Underground & Hidden', 'Sunken Ruin', 3),
  ('Location > Underground & Hidden', 'Hidden Vault', 4),

  ('Location > Strange Places', 'Fey Grove', 0),
  ('Location > Strange Places', 'Portal Site', 1),
  ('Location > Strange Places', 'Planar Rift', 2),
  ('Location > Strange Places', 'Impossible Place', 3),

  ('Location > Regions', 'Kingdom', 0),
  ('Location > Regions', 'Duchy', 1),
  ('Location > Regions', 'Wilderness Territory', 2),
  ('Location > Regions', 'Marches', 3),

  ('Event > Past', 'War', 0),
  ('Event > Past', 'Founding', 1),
  ('Event > Past', 'Disaster', 2),
  ('Event > Present', 'Festival', 0),
  ('Event > Present', 'Plague', 1),
  ('Event > Present', 'Siege', 2),
  ('Event > Future', 'Prophecy', 0),
  ('Event > Future', 'Looming Threat', 1)
) as v(parent, label, sort_order);

insert into sphere_kinds (parent_id, label, sort_order)
select pg_temp.kind_by_path(v.parent), v.label, v.sort_order
from (values
  ('Location > Settlements > Camp', 'Nomad Camp', 0),
  ('Location > Settlements > Camp', 'Military Camp', 1),
  ('Location > Settlements > Camp', 'Refugee Camp', 2)
) as v(parent, label, sort_order);

-- 4. Questions ------------------------------------------------------------
insert into sphere_prompts (kind_id, label, question, ideas, spawn_kind_id, sort_order)
select pg_temp.kind_by_path(v.kind), v.label, v.question, v.ideas,
  case when v.spawn is null then null else pg_temp.kind_by_path(v.spawn) end,
  v.sort_order
from (values
  -- Every sphere
  ('*', 'First glance', 'What does it look like at first glance?',
    array['grander than expected', 'shabby and patched', 'eerily quiet', 'crowded and loud',
          'beautiful, but wrong somehow', 'ordinary - suspiciously so'], null::text, 0),
  ('*', 'Secret', 'What''s a secret about it?',
    array['it is not what it claims to be', 'someone died for it', 'it is being watched',
          'it is older than anyone knows', 'it belongs to someone else', 'it is failing'], null, 1),
  ('*', 'Wants', 'What does it want or need?',
    array['protection', 'to be found', 'to be left alone', 'power', 'repair', 'revenge', 'a missing piece'], null, 2),
  ('*', 'Change', 'What''s changing?',
    array['it is growing', 'it is dying', 'new people are arriving', 'someone is taking control',
          'an old threat is returning', 'nothing - and that is the problem'], null, 3),

  -- Location > Settlements > Town
  ('Location > Settlements > Town', 'Known for', 'What is it known for?',
    array['market day', 'a famous brewery', 'a guild hall', 'a bridge', 'a festival', 'a grim reputation'], null, 0),
  ('Location > Settlements > Town', 'Lifeblood', 'What keeps it alive?',
    array['farming', 'mining', 'river trade', 'pilgrims', 'a garrison', 'a road toll'], null, 1),
  ('Location > Settlements > Town', 'Who runs it', 'Who really runs things?',
    array['an elected mayor', 'a noble''s steward', 'a merchant council', 'a thieves'' guild', 'a temple',
          'nobody (and it shows)'], 'Person', 2),
  ('Location > Settlements > Town', 'Mood', 'What''s the mood on the streets?',
    array['prosperous', 'wary', 'festive', 'tired', 'superstitious', 'quietly afraid'], null, 3),
  ('Location > Settlements > Town', 'Problem', 'What''s the current problem?',
    array['missing people', 'a failing harvest', 'a family feud', 'a new tax', 'a stranger asking questions'], null, 4),

  -- Location > Wilderness > Road / Trade Route
  ('Location > Wilderness > Road / Trade Route', 'Origin', 'What does it connect, and who built it?',
    array['an old imperial highway', 'a merchant-funded trade route', 'a game trail made official', 'a pilgrim path'], null, 0),
  ('Location > Wilderness > Road / Trade Route', 'Condition', 'What condition is it in?',
    array['paved and patrolled', 'rutted but busy', 'overgrown', 'half-washed-out', 'suspiciously well-maintained'], null, 1),
  ('Location > Wilderness > Road / Trade Route', 'Travelers', 'Who travels it?',
    array['caravans', 'pilgrims', 'soldiers', 'couriers', 'refugees', 'no one anymore'], null, 2),
  ('Location > Wilderness > Road / Trade Route', 'Danger', 'What''s the danger?',
    array['bandits', 'toll-keepers', 'a monster at the bridge', 'bad weather', 'a haunted stretch'], null, 3),
  ('Location > Wilderness > Road / Trade Route', 'Along the way', 'What''s along the way?',
    array['a waystation', 'a shrine', 'a gallows', 'an abandoned inn', 'a milestone with strange carvings'], 'Location', 4),
  ('Location > Wilderness > Road / Trade Route', 'Why it matters', 'Why does it matter?',
    array['the only route to the capital', 'a mountain shortcut', 'a supply line for a war'], null, 5),

  -- Location > Underground & Hidden > Cave
  ('Location > Underground & Hidden > Cave', 'Origin', 'Who or what made it?',
    array['a natural formation', 'a dwarven mine', 'an ancient tomb', 'a dragon''s lair', 'a collapsed temple',
          'something that burrowed'], null, 0),
  ('Location > Underground & Hidden > Cave', 'Occupants', 'Who''s using it now?',
    array['bandits', 'a hibernating beast', 'a hermit scholar', 'a cult', 'smugglers', 'nobody (but fresh tracks)'], null, 1),
  ('Location > Underground & Hidden > Cave', 'Hiding', 'What is it hiding?',
    array['a sealed door', 'an underground river', 'a buried relic', 'a sleeping thing', 'a map carved in the walls'], null, 2),
  ('Location > Underground & Hidden > Cave', 'Why care', 'Why does anyone care?',
    array['rich ore', 'a sacred site', 'a local legend', 'a trade shortcut', 'the source of the missing livestock'], null, 3),

  -- Person (shared)
  ('Person', 'Disposition', 'How do they feel about the party?',
    array['ally', 'rival', 'neutral', 'hostile', 'unreadable'], null, 0),
  ('Person', 'Role', 'What story function do they serve?',
    array['mentor', 'quest giver', 'villain', 'informant', 'obstacle', 'red herring'], null, 1),
  ('Person', 'Occupation', 'What do they do day to day?', '{}'::text[], null, 2),
  ('Person', 'Affiliation', 'Who do they answer to?',
    array['the crown', 'a temple', 'a guild', 'a crime boss', 'no one'], 'Faction', 3),
  ('Person', 'Justification', 'Why do they think they''re right?', '{}'::text[], null, 4),
  ('Person', 'Weakness', 'What is their weakness?',
    array['a loved one', 'pride', 'an oath', 'a debt', 'a secret that would ruin them'], null, 5),

  -- Person > Martial
  ('Person > Martial', 'Training', 'Where did they learn to fight?',
    array['army ranks', 'a famous duelist', 'the streets', 'a monastery', 'self-taught'], null, 0),
  ('Person > Martial', 'Fights for', 'What do they fight for?',
    array['coin', 'honor', 'a flag', 'a person', 'a grudge'], null, 1),
  ('Person > Martial', 'Signature', 'What is their signature style or weapon?',
    array['a heavy shield wall', 'twin knives', 'a bow', 'a borrowed relic'], null, 2),
  ('Person > Martial', 'Scar', 'What scar or loss do they carry?',
    array['a lost unit', 'a failed oath', 'a missing hand'], null, 3),

  -- Person > Magic
  ('Person > Magic', 'Source', 'Where does their power come from?',
    array['study', 'a god', 'a pact', 'their bloodline', 'something that found them'], null, 0),
  ('Person > Magic', 'Cost', 'What does their magic cost them?',
    array['eyesight', 'years', 'a name', 'a memory', 'a debt coming due'], null, 1),
  ('Person > Magic', 'Standing', 'How does the world treat them?',
    array['revered', 'feared', 'licensed', 'hunted', 'ignored'], null, 2),

  -- Person > Monster
  ('Person > Monster', 'Creature', 'What is it?',
    array['a dragon', 'a lich', 'a hag', 'a beholder', 'something unnamed'], null, 0),
  ('Person > Monster', 'Mind', 'How smart is it, and will it bargain?',
    array['cunning', 'alien', 'bestial', 'ancient and bored'], null, 1),
  ('Person > Monster', 'Lair', 'Where is its lair, and who are its victims?',
    array['a cave', 'a ruin', 'a sunken temple', 'beneath the town', 'a mountain peak'], 'Location', 2),

  -- Faction (starter questions kept until it is built out)
  ('Faction', 'Goal', 'What does this group want?',
    array['control of trade', 'to bring back an old order', 'to protect a secret', 'wealth, plainly',
          'to topple a ruler', 'to keep something sealed', 'converts', 'to be left alone'], null, 0),
  ('Faction', 'Leader', 'Who leads them?',
    array['a charismatic founder', 'a council that never agrees', 'a figurehead with a hidden master',
          'an elder nobody has seen in years', 'whoever won the last duel', 'a young heir'], 'Person', 1),
  ('Faction', 'Methods', 'How do they get what they want?',
    array['bribery', 'blackmail', 'quiet violence', 'charity and favors', 'law and paperwork',
          'propaganda', 'magic', 'patience'], null, 2),
  ('Faction', 'Rival', 'Who are they in conflict with?',
    array['a rival guild', 'the authorities', 'a splinter faction of their own', 'a foreign power',
          'a church', 'an old ally'], 'Faction', 3),
  ('Faction', 'Base', 'Where do they operate from?',
    array['a guildhall', 'catacombs', 'a ship', 'a respectable shopfront', 'a fortified estate',
          'nowhere fixed', 'a tower'], 'Location', 4),
  ('Faction', 'Offers members', 'What do members get out of it?',
    array['protection', 'coin', 'belonging', 'secrets', 'a path to power', 'absolution', 'a way out'], null, 5),
  ('Faction', 'Sign', 'How do you recognize a member?',
    array['a tattoo', 'a ring', 'a turn of phrase', 'a particular color', 'a scar', 'you don''t - that''s the point'], null, 6),

  ('Faction > Religion', 'Worship', 'What do they worship?',
    array['a sun god', 'their ancestors', 'the sea', 'a saint', 'a dead god', 'a living ruler', 'the stars'], null, 0),
  ('Faction > Religion', 'Rite', 'What is their central rite?',
    array['a yearly pilgrimage', 'a sacrifice', 'silence at dawn', 'a feast', 'a trial by ordeal'], null, 1),
  ('Faction > Religion', 'Schism', 'What heresy divides them?',
    array['who the true prophet was', 'whether magic is a sin', 'the place of the crown', 'a forged scripture'], null, 2),

  -- Event (starter questions kept until it is built out)
  ('Event', 'When', 'When did it happen?',
    array['generations ago', 'within living memory', 'last winter', 'it is still happening',
          'on a night everyone remembers', 'nobody agrees'], null, 0),
  ('Event', 'Cause', 'What set it off?',
    array['a broken oath', 'a famine', 'an assassination', 'a prophecy', 'a natural disaster',
          'a discovery', 'greed', 'a misunderstanding'], null, 1),
  ('Event', 'Involved', 'Which group was at the heart of it?',
    array['a royal house', 'a rebel army', 'a religious order', 'a merchant league',
          'an invading people', 'a cabal of mages'], 'Faction', 2),
  ('Event', 'Where', 'Where did it happen?',
    array['a capital', 'a border fort', 'a holy site', 'a river crossing', 'at sea', 'a now-abandoned town'], 'Location', 3),
  ('Event', 'Aftermath', 'What changed because of it?',
    array['a new ruler', 'a border moved', 'a people scattered', 'a law nobody questions now',
          'a ruin', 'a holiday', 'a lasting grudge'], null, 4),
  ('Event', 'Remembered', 'How is it remembered - and what is wrong with that?',
    array['as a victory that was really a defeat', 'a hero who was really a villain', 'erased from records',
          'turned into a children''s song', 'blamed on the wrong people', 'remembered differently by each side'], null, 5),
  ('Event', 'Witness', 'Who still remembers it firsthand?',
    array['an old soldier', 'a bitter widow', 'a priest who hid the truth', 'a child grown old',
          'a long-lived elf', 'nobody - which is convenient'], 'Person', 6),

  ('Event > Past > War', 'Victor', 'Who won, and at what cost?',
    array['the defenders, barely', 'nobody', 'the invaders, then lost the peace', 'a third party that waited'], 'Faction', 0),
  ('Event > Past > War', 'Lost', 'What was lost on the field?',
    array['a king', 'a sacred banner', 'a whole village', 'a famous sword', 'a secret'], null, 1),
  ('Event > Past > War', 'Turning point', 'What turned the war?',
    array['a betrayal', 'the weather', 'a hero''s sacrifice', 'a mage''s spell', 'a cavalry charge',
          'plague in the camp'], null, 2)
) as v(kind, label, question, ideas, spawn, sort_order);

-- 5. Tailored ideas ---------------------------------------------------------
-- Reference answers that belong to a question asked higher up the chain.
insert into sphere_kind_prompt_ideas (kind_id, prompt_id, ideas)
select pg_temp.kind_by_path(v.kind), p.id, v.ideas
from (values
  ('Location > Underground & Hidden > Cave', '*', 'First glance',
    array['dripping silence', 'glowing fungus', 'warm, sulfur-smelling air', 'old campfire ashes',
          'distant rhythmic knocking']),
  ('Location > Settlements > Town', '*', 'Secret',
    array['a past massacre', 'a sealed cellar', 'a founder''s crime', 'what''s in the well']),
  ('Person', '*', 'Wants',
    array['power', 'revenge', 'to restore something lost', 'to protect someone', 'to prove a point']),
  ('Person > Magic', '*', 'Wants',
    array['knowledge', 'a cure', 'a lost person', 'influence', 'to be left alone']),
  ('Person > Monster', '*', 'Wants',
    array['territory', 'treasure', 'worship', 'food', 'to be freed', 'to be finished']),

  -- "Occupation: answers vary by subcategory."
  ('Person > Martial', 'Person', 'Occupation',
    array['soldier', 'guard', 'mercenary', 'knight', 'assassin', 'hunter']),
  ('Person > Magic', 'Person', 'Occupation',
    array['wizard', 'priest', 'witch', 'oracle', 'cultist']),
  ('Person > Common', 'Person', 'Occupation',
    array['merchant', 'innkeeper', 'farmer', 'scholar', 'craftsman', 'sailor']),
  ('Person > Humanoid', 'Person', 'Occupation',
    array['hunter', 'chieftain', 'raider', 'trader', 'shaman', 'outcast']),
  ('Person > Monster', 'Person', 'Occupation',
    array['guardian of something', 'hoarder', 'ruler of its domain', 'predator', 'prisoner'])
) as v(kind, source, label, ideas)
join sphere_prompts p on p.kind_id = pg_temp.kind_by_path(v.source) and p.label = v.label;

-- 6. Put the entries back on a kind ---------------------------------------
update entries e
set sphere_kind_id = pg_temp.kind_by_path(m.new_path)
from old_entry_kinds o
join (values
  ('Location', 'Location'),
  ('Settlement', 'Location > Settlements'),
  ('Wilderness', 'Location > Wilderness'),
  ('Cave / Dungeon', 'Location > Underground & Hidden > Cave'),
  ('Building', 'Location > Structures & Sites'),
  ('Person', 'Person'),
  ('Ally', 'Person'),
  ('Enemy', 'Person'),
  ('Neutral', 'Person'),
  ('Organization', 'Faction'),
  ('Religion', 'Faction > Religion'),
  ('Event', 'Event'),
  ('Battle', 'Event > Past > War')
) as m(old_label, new_path) on m.old_label = o.label
where e.id = o.entry_id;

drop table old_entry_kinds;
