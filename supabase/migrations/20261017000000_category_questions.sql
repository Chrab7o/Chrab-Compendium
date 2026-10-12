-- Questions for every second-level kind.
--
-- The 37 categories directly under the major kinds (Settlements, Wilderness,
-- Common, Guild, Weapon, Past, Legends, Mystery, ...) had no questions of
-- their own. Writing them at this level also covers the 45 kinds beneath
-- (a Forest inherits Wilderness's questions), so every kind now asks
-- something specific to it on top of its major kind's shared set.
--
-- Labels never repeat one the kind already inherits or one a child asks -
-- e.g. Town keeps its own "Who runs it", so Settlements asks about defense,
-- outsiders and faith instead. Existing questions are never touched.
--
-- Run via `npx supabase db push`.

create or replace function pg_temp.kind_by_path(path text)
returns uuid
language plpgsql
as $$
declare
  part text;
  current_id uuid := null;
  found_id uuid;
begin
  foreach part in array string_to_array(path, ' > ') loop
    found_id := null;
    select id into found_id
    from public.sphere_kinds
    where label = part and parent_id is not distinct from current_id;
    if found_id is null then
      raise exception 'No sphere kind at path: %', path;
    end if;
    current_id := found_id;
  end loop;
  return current_id;
end;
$$;

insert into sphere_prompts (kind_id, label, question, ideas, spawn_kind_id, sort_order)
select k.kind_id, v.label, v.question, v.ideas,
  case when v.spawn is null then null else pg_temp.kind_by_path(v.spawn) end,
  v.sort_order
from (values
  -- Location ----------------------------------------------------------------
  ('Location > Settlements', 'Defense', 'How is it defended?',
    array['a stone wall', 'a militia', 'a hired company', 'a wizard''s ward', 'a river and a drawbridge',
          'nothing - it relies on being forgotten'], null::text, 0),
  ('Location > Settlements', 'Outsiders', 'How do they treat outsiders?',
    array['warmly - travelers mean coin', 'with suspicion', 'they charge a gate fee', 'they don''t let them stay the night',
          'they hide something from them', 'they''re desperate for help'], null, 1),
  ('Location > Settlements', 'Faith', 'Where do people worship?',
    array['a crumbling shrine', 'a grand temple', 'a sacred tree', 'the old gods, in secret', 'nobody does anymore'], null, 2),

  ('Location > Structures & Sites', 'Purpose', 'What was it built for - and what is it used for now?',
    array['the same as always', 'a temple turned warehouse', 'a jail turned inn', 'a home turned ruin',
          'a fort turned market', 'nobody remembers the first use'], null, 0),
  ('Location > Structures & Sites', 'Keeper', 'Who looks after it?',
    array['an old caretaker', 'a family that has for generations', 'the crown', 'a guild', 'squatters', 'no one'],
    'Person', 1),
  ('Location > Structures & Sites', 'Key spot', 'Which room or spot matters most?',
    array['a locked study', 'the cellar', 'a private chapel', 'a hidden passage', 'the roof', 'the kitchens'], null, 2),

  ('Location > Wilderness', 'Inhabitants', 'What lives here?',
    array['wolves', 'a reclusive hermit', 'a druid circle', 'giants', 'fey', 'nomads', 'something nobody has seen'], null, 0),
  ('Location > Wilderness', 'Crossing', 'How hard is it to cross?',
    array['easy in summer, deadly in winter', 'you need a guide', 'it changes every time', 'only by one known path',
          'the locals won''t say', 'it''s easy - which worries people'], null, 1),
  ('Location > Wilderness', 'Landmark', 'What landmark do travelers steer by?',
    array['a lightning-split tree', 'standing stones', 'a dead dragon''s skull', 'a waterfall', 'a lone tower'],
    'Location', 2),

  ('Location > Underground & Hidden', 'Way in', 'How do you get in?',
    array['a gap behind a waterfall', 'a well shaft', 'a door that only opens at night', 'a collapsed floor',
          'a password', 'the front gate - but nobody comes back out'], null, 0),
  ('Location > Underground & Hidden', 'Hazard', 'What hazard does everyone forget about?',
    array['bad air', 'flooding', 'unstable ceilings', 'mazelike tunnels', 'echoes that wake things', 'the dark itself'], null, 1),
  ('Location > Underground & Hidden', 'Deepest point', 'What is at the very bottom?',
    array['a sealed door', 'an underground lake', 'a sleeping god', 'a hoard', 'a way to somewhere else', 'nothing - yet'], null, 2),

  ('Location > Strange Places', 'Broken rule', 'What rule of the world breaks here?',
    array['time runs differently', 'the dead can speak', 'gravity is wrong', 'no one can lie', 'magic fails', 'distances shift'], null, 0),
  ('Location > Strange Places', 'Finding it', 'How do you find or enter it?',
    array['only at a certain moon', 'by getting lost on purpose', 'through a mirror', 'by invitation', 'in a dream', 'by accident'], null, 1),
  ('Location > Strange Places', 'Toll', 'What does it take from visitors?',
    array['a memory', 'their name', 'years of their life', 'their shadow', 'nothing - it gives', 'a promise'], null, 2),

  ('Location > Regions', 'Ruled by', 'Who rules it?',
    array['a king', 'a council of lords', 'a distant empire', 'a church', 'nobody - it''s contested', 'an old treaty'],
    'Faction', 0),
  ('Location > Regions', 'Borders', 'What is happening at its borders?',
    array['raids', 'a slow invasion', 'smuggling', 'refugees crossing', 'a disputed river', 'nothing - suspiciously'], null, 1),
  ('Location > Regions', 'Land', 'What is the land like?',
    array['rolling farmland', 'dense forest', 'mountains and passes', 'marsh and fen', 'dry steppe', 'a scarred battlefield'], null, 2),

  -- Person ------------------------------------------------------------------
  ('Person > Common', 'Home', 'Where do they live?',
    array['above their shop', 'a crowded tenement', 'a farm outside town', 'a houseboat', 'wherever they''re working'],
    'Location', 0),
  ('Person > Common', 'Daily trouble', 'What is making their life hard right now?',
    array['debt', 'a sick relative', 'a bully', 'bad harvests', 'a new tax', 'a rival business'], null, 1),
  ('Person > Common', 'Connections', 'Who do they know that matters?',
    array['a guard captain', 'a noble''s servant', 'a fence', 'a priest', 'nobody important - yet'], 'Person', 2),

  ('Person > Humanoid', 'People', 'What people are they from, and how do they fit in?',
    array['elf, far from home', 'dwarf, exiled', 'orc, trying to be accepted', 'goblin, underestimated',
          'halfling, overlooked', 'half-blood, belonging nowhere'], null, 0),
  ('Person > Humanoid', 'Custom', 'What custom of their people do they keep?',
    array['a coming-of-age mark', 'a vow of silence at meals', 'ancestor offerings', 'never giving their true name',
          'a duel for every insult'], null, 1),
  ('Person > Humanoid', 'Treatment', 'How are their kind treated here?',
    array['welcomed', 'tolerated', 'feared', 'exploited', 'hunted', 'ignored'], null, 2),

  -- Faction -----------------------------------------------------------------
  ('Faction > Guild', 'Monopoly', 'What do they control, and who resents it?',
    array['all river shipping', 'the city''s bread', 'every license to practice magic', 'stonework',
          'the docks', 'information'], null, 0),
  ('Faction > Guild', 'Dues', 'What does membership cost?',
    array['a yearly fee', 'an apprenticeship of seven years', 'a masterwork', 'loyalty in a vote', 'a share of every job'], null, 1),
  ('Faction > Guild', 'Undercut', 'Who is undercutting them?',
    array['unlicensed workers', 'foreign traders', 'a rival guild', 'a noble with a new charter', 'their own members'], null, 2),

  ('Faction > Cult', 'Devotion', 'What do they worship or serve?',
    array['a forgotten god', 'a demon', 'a dead prophet', 'the end of the world', 'a living leader', 'something from the stars'], null, 0),
  ('Faction > Cult', 'Recruitment', 'How do they recruit?',
    array['charity to the poor', 'promising cures', 'dreams', 'blackmail', 'family ties', 'they choose you'], null, 1),
  ('Faction > Cult', 'Ritual', 'What ritual are they building toward?',
    array['a summoning', 'a mass sacrifice', 'opening a gate', 'a resurrection', 'an eclipse rite', 'nobody below the top knows'], null, 2),

  ('Faction > Kingdom', 'Succession', 'Who inherits the throne, and who disputes it?',
    array['a child heir', 'a bastard with a claim', 'two siblings', 'an elected council', 'a foreign cousin', 'no one yet'], null, 0),
  ('Faction > Kingdom', 'Neighbors', 'How do they stand with their neighbors?',
    array['an uneasy peace', 'open war', 'a marriage alliance', 'paying tribute', 'receiving tribute', 'a trade war'], null, 1),
  ('Faction > Kingdom', 'Law of the land', 'What law shapes daily life?',
    array['no magic without a license', 'a curfew', 'a crushing tithe', 'serfdom', 'trial by combat', 'open borders'], null, 2),

  ('Faction > Army', 'Campaign', 'Where are they marching, and why?',
    array['to the border', 'to put down a revolt', 'home, defeated', 'to a siege', 'nowhere - they''re waiting', 'to a holy war'], null, 0),
  ('Faction > Army', 'Morale', 'How are the troops holding up?',
    array['eager', 'exhausted', 'unpaid and angry', 'sick', 'fanatical', 'on the edge of mutiny'], null, 1),
  ('Faction > Army', 'Supply', 'What are they short of?',
    array['food', 'arrows', 'horses', 'healers', 'good officers', 'a reason to fight'], null, 2),

  ('Faction > Noble House', 'Heir', 'Who is the heir, and what is wrong with them?',
    array['too young', 'a gambler', 'missing', 'sickly', 'beloved but foolish', 'secretly illegitimate'], 'Person', 0),
  ('Faction > Noble House', 'Scandal', 'What scandal are they hiding?',
    array['an affair', 'bankruptcy', 'a murder', 'a hidden child', 'a pact with a fiend', 'treason'], null, 1),
  ('Faction > Noble House', 'Seat', 'Where is their seat of power?',
    array['a hilltop castle', 'a city manor', 'a river fortress', 'a crumbling estate', 'a palace wing'], 'Location', 2),

  ('Faction > Mercenary Company', 'Contract', 'Who is paying them now?',
    array['a desperate town', 'a rebel lord', 'a merchant league', 'both sides', 'no one - they''re between jobs'], null, 0),
  ('Faction > Mercenary Company', 'Code', 'What won''t they do?',
    array['harm children', 'break a contract', 'fight their own', 'work for a church', 'nothing is off the table'], null, 1),
  ('Faction > Mercenary Company', 'Reputation', 'What are they known for?',
    array['never losing', 'switching sides', 'brutality', 'honor', 'a famous captain', 'a famous defeat'], null, 2),

  ('Faction > Secret Society', 'Cover', 'What front do they hide behind?',
    array['a gentlemen''s club', 'a charity', 'a library', 'a trading company', 'a church choir', 'nothing - they''re a rumor'], null, 0),
  ('Faction > Secret Society', 'Test', 'How are new members tested?',
    array['a secret kept for a year', 'a theft', 'a riddle', 'a betrayal', 'a night in a crypt', 'they never know they''re tested'], null, 1),
  ('Faction > Secret Society', 'Inner circle', 'Who is really in the inner circle?',
    array['a royal advisor', 'the high priest', 'a famous merchant', 'someone the party trusts', 'a dragon in disguise'],
    'Person', 2),

  -- Item --------------------------------------------------------------------
  ('Item > Weapon', 'Kills', 'Whose blood is on it?',
    array['a king''s', 'a monster''s', 'its maker''s', 'an innocent''s', 'nobody''s - it''s never been used'], null, 0),
  ('Item > Weapon', 'Quirk', 'What is strange about it in a fight?',
    array['it hums before danger', 'it is lighter than it looks', 'it won''t strike a certain foe', 'it bleeds',
          'it remembers techniques'], null, 1),

  ('Item > Armor', 'Last wearer', 'Who wore it last?',
    array['a fallen knight', 'a deserter', 'a hero of legend', 'a coward', 'a monster', 'nobody - it was never finished'],
    'Person', 0),
  ('Item > Armor', 'Marks', 'What marks does it bear?',
    array['a crest scratched off', 'a hole over the heart', 'old prayers etched inside', 'scorch marks', 'gold inlay', 'teeth marks'], null, 1),

  ('Item > Relic', 'Holy figure', 'Which holy figure or story is it tied to?',
    array['a martyred saint', 'a god''s first prophet', 'a founding king', 'a miracle at a battle', 'a myth nobody believes'], null, 0),
  ('Item > Relic', 'Power', 'What can it do?',
    array['heal', 'ward off the dead', 'reveal lies', 'command the faithful', 'nothing - its power is belief'], null, 1),
  ('Item > Relic', 'Guardians', 'Who guards it - or wants it back?',
    array['a temple', 'a hidden order', 'a cursed spirit', 'a rival church', 'the descendants of its saint'], 'Faction', 2),

  ('Item > Tool', 'Use', 'What is it for?',
    array['opening any lock', 'finding water', 'measuring the stars', 'speaking to animals', 'building', 'mending anything'], null, 0),
  ('Item > Tool', 'Catch', 'What is the catch in using it?',
    array['it takes hours', 'it needs blood', 'it only works once a day', 'it breaks something else', 'it attracts attention'], null, 1),

  ('Item > Document / Map', 'Contents', 'What does it show or say?',
    array['a route nobody knows', 'a true name', 'a royal confession', 'a treaty', 'a ritual', 'the location of a vault'], null, 0),
  ('Item > Document / Map', 'Author', 'Who wrote or drew it?',
    array['a dead explorer', 'a mad scholar', 'a spy', 'a child', 'the villain', 'someone still alive'], 'Person', 1),
  ('Item > Document / Map', 'Missing piece', 'What part is missing?',
    array['the last page', 'the legend', 'a torn corner', 'the signature', 'the key to the cipher', 'nothing - that''s the problem'], null, 2),

  ('Item > Potion', 'Effect', 'What does it do?',
    array['heals', 'grants a vision', 'changes a face', 'brings sleep', 'gives strength', 'nobody knows yet'], null, 0),
  ('Item > Potion', 'Side effect', 'What else does it do?',
    array['glowing eyes', 'lost memories', 'addiction', 'speaking only truth', 'aging', 'nothing - or so it seems'], null, 1),
  ('Item > Potion', 'Ingredient', 'What rare ingredient goes into it?',
    array['dragon blood', 'a mandrake root', 'tears of a saint', 'deep-cave moss', 'a phoenix feather', 'something best not asked'], null, 2),

  ('Item > Treasure', 'Former owner', 'Whose was it?',
    array['a sunken fleet''s', 'a dragon''s', 'a dead king''s', 'a temple''s', 'a pirate''s', 'a family''s, stolen'], null, 0),
  ('Item > Treasure', 'Who comes looking', 'Who will come looking for it?',
    array['its old owners', 'tax collectors', 'thieves', 'a curse', 'a jealous god', 'nobody - yet'], null, 1),

  ('Item > Cursed Object', 'Curse', 'What does the curse do?',
    array['brings bad luck', 'whispers', 'makes the bearer age', 'draws the dead', 'won''t let go', 'turns friends against you'], null, 0),
  ('Item > Cursed Object', 'Breaking it', 'How can the curse be broken?',
    array['return it to its maker', 'a sacrifice', 'destroy it in a certain fire', 'pass it on willingly', 'it can''t'], null, 1),
  ('Item > Cursed Object', 'Victims', 'Who suffered it before?',
    array['a whole family line', 'a famous adventurer', 'a priest who tried to cleanse it', 'a child', 'nobody survived to tell'], null, 2),

  -- Event -------------------------------------------------------------------
  ('Event > Past', 'Traces', 'What traces of it remain?',
    array['ruins', 'a statue', 'a scar on the land', 'a song', 'a holiday', 'nothing visible'], null, 0),
  ('Event > Past', 'Lesson', 'What lesson did people take from it - rightly or wrongly?',
    array['never trust outsiders', 'magic is dangerous', 'the gods punish pride', 'kings can fall', 'nothing - they forgot'], null, 1),

  ('Event > Present', 'Clock', 'How long until it is over - or too late?',
    array['days', 'until the next full moon', 'until the harvest', 'nobody knows', 'it''s already too late for some'], null, 0),
  ('Event > Present', 'Opportunists', 'Who is taking advantage of it?',
    array['merchants raising prices', 'a cult recruiting', 'a noble seizing land', 'thieves', 'a rival kingdom'], 'Faction', 1),

  ('Event > Future', 'Signs', 'What signs point to it?',
    array['strange weather', 'animals fleeing', 'a comet', 'dreams shared by many', 'a prophecy coming true piece by piece'], null, 0),
  ('Event > Future', 'Forewarned', 'Who knows it is coming?',
    array['an oracle', 'a scholar nobody believes', 'the villain', 'a child', 'everyone - and they''re ignoring it'], 'Person', 1),
  ('Event > Future', 'Prevention', 'Can it be stopped, and how?',
    array['by finding a relic', 'by a sacrifice', 'by killing someone', 'by uniting enemies', 'it can only be survived'], null, 2),

  -- Lore --------------------------------------------------------------------
  ('Lore > Gods & Myths', 'Domain', 'What do they rule over?',
    array['the sun', 'the dead', 'storms', 'the harvest', 'secrets', 'war', 'the sea'], null, 0),
  ('Lore > Gods & Myths', 'Myth', 'What story do people tell about them?',
    array['how they made the world', 'how they were betrayed', 'how they died', 'a love story', 'a war among gods'], null, 1),
  ('Lore > Gods & Myths', 'Worship', 'How are they worshipped?',
    array['with offerings', 'with silence', 'with blood', 'with feasts', 'in secret', 'not anymore'], 'Faction', 2),

  ('Lore > Magic Systems', 'Price', 'What does using it cost?',
    array['stamina', 'memories', 'years', 'sanity', 'a material component', 'nothing - which is suspicious'], null, 0),
  ('Lore > Magic Systems', 'Who can use it', 'Who can use it?',
    array['anyone who studies', 'only the born', 'only the chosen', 'only the licensed', 'only at certain places'], null, 1),
  ('Lore > Magic Systems', 'Forbidden', 'What is forbidden?',
    array['raising the dead', 'reading minds', 'binding spirits', 'changing the past', 'nothing - yet'], null, 2),

  ('Lore > Laws & Customs', 'Enforcer', 'Who enforces it?',
    array['the city watch', 'a church', 'elders', 'nobody - it''s custom', 'a secret court'], 'Faction', 0),
  ('Lore > Laws & Customs', 'Punishment', 'What happens to those who break it?',
    array['a fine', 'exile', 'a brand', 'death', 'shunning', 'nothing, if they''re rich'], null, 1),
  ('Lore > Laws & Customs', 'Loophole', 'What loophole do people use?',
    array['paying a priest', 'doing it on holy days', 'doing it outside the walls', 'claiming ignorance', 'there isn''t one'], null, 2),

  ('Lore > Languages', 'Speakers', 'Who speaks it?',
    array['everyone in the region', 'scholars', 'the dead', 'a single family', 'traders', 'nobody - it''s only written'], null, 0),
  ('Lore > Languages', 'Script', 'How is it written?',
    array['runes', 'knots in cord', 'pictures', 'it isn''t', 'a borrowed alphabet', 'in song'], null, 1),
  ('Lore > Languages', 'Untranslatable', 'What word has no translation?',
    array['a word for grief shared by a village', 'a word for owing a life', 'a word for the hour before dawn',
          'a word only spoken to gods'], null, 2),

  ('Lore > Legends', 'Hero', 'Who is the legend about?',
    array['a peasant hero', 'a cursed king', 'a monster slayer', 'a trickster', 'a lost child'], 'Person', 0),
  ('Lore > Legends', 'Setting', 'Where did it happen?',
    array['a mountain peak', 'a sunken city', 'the old forest', 'this very town', 'nobody knows'], 'Location', 1),
  ('Lore > Legends', 'Proof', 'What proof remains?',
    array['a sword in a stone', 'a grave', 'a footprint in rock', 'a song', 'nothing at all'], null, 2),

  ('Lore > Rumors', 'Spreader', 'Who is spreading it?',
    array['a bard', 'a jealous rival', 'a cult', 'a drunk', 'someone who wants it to be true'], 'Person', 0),
  ('Lore > Rumors', 'Kernel', 'What grain of truth is in it?',
    array['all of it', 'the place is right', 'the person is right', 'the date is right', 'none'], null, 1),

  -- Plot --------------------------------------------------------------------
  ('Plot > Hook', 'Bait', 'What is being offered?',
    array['gold', 'a favor from someone powerful', 'a cure', 'information', 'revenge', 'a chance to be a hero'], null, 0),
  ('Plot > Hook', 'Urgency', 'Why does it have to be now?',
    array['someone is dying', 'a deadline', 'a rival is moving', 'a door is closing', 'a festival ends'], null, 1),

  ('Plot > Mystery', 'What happened', 'What actually happened?',
    array['a murder', 'a theft', 'a disappearance', 'a forgery', 'a haunting that isn''t one'], null, 0),
  ('Plot > Mystery', 'Clues', 'What three clues point to the truth?',
    array['a torn letter', 'mud from a certain place', 'a missing ring', 'a witness who lied', 'a smell of smoke'], null, 1),
  ('Plot > Mystery', 'Red herring', 'Who looks guilty but isn''t?',
    array['the butler', 'a stranger in town', 'the victim''s heir', 'a rival', 'the party'], 'Person', 2),

  ('Plot > Quest', 'Objective', 'What must be retrieved or done?',
    array['a relic', 'a missing person', 'a message delivered', 'a monster slain', 'a seal restored'], null, 0),
  ('Plot > Quest', 'Guide', 'Who helps them along the way?',
    array['an old ranger', 'a talking animal', 'a reluctant scholar', 'a ghost', 'a rival who joins'], 'Person', 1),
  ('Plot > Quest', 'Reward', 'What is the reward - and is it real?',
    array['gold', 'land', 'a title', 'knowledge', 'the reward is a lie'], null, 2),

  ('Plot > Heist', 'Target', 'What is being stolen?',
    array['a crown', 'a ledger', 'a prisoner', 'a dragon egg', 'a painting', 'a soul'], null, 0),
  ('Plot > Heist', 'Security', 'What is guarding it?',
    array['guards', 'magic wards', 'a monster', 'a vault door', 'a crowd', 'its owner, personally'], null, 1),
  ('Plot > Heist', 'Inside help', 'Who is the inside help?',
    array['a servant', 'a guard with debts', 'a disgruntled mage', 'the owner''s child', 'nobody - yet'], 'Person', 2),

  ('Plot > Conflict', 'Sides', 'Who are the sides?',
    array['two noble houses', 'a guild and the crown', 'a town and the forest', 'old faith and new', 'siblings'], 'Faction', 0),
  ('Plot > Conflict', 'Flashpoint', 'What will set it off?',
    array['a murder', 'a wedding', 'a tax', 'a theft', 'an insult at a feast'], null, 1),
  ('Plot > Conflict', 'Caught between', 'Who is caught in the middle?',
    array['farmers', 'a child', 'a merchant', 'the party', 'a priest'], null, 2)
) as v(path, label, question, ideas, spawn, sort_order)
cross join lateral (select pg_temp.kind_by_path(v.path) as kind_id) k
where not exists (
  select 1 from sphere_prompts p where p.kind_id = k.kind_id and p.label = v.label
);
