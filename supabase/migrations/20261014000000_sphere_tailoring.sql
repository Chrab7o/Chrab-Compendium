-- Tailored ideas, Person stances, and more questions.
--
-- 1. A sub-kind can replace the idea chips of a question it inherits, so a
--    Cave's "What is this place known for?" suggests cave things rather than
--    "a famous market". The nearest kind with its own list wins, so a list set
--    on Cave / Dungeon also applies to any kind beneath it. The question
--    itself (and its label) is still the parent's - only the ideas change.
-- 2. Person gets Ally / Enemy / Neutral sub-kinds with their own questions.
-- 3. A few more questions on the top-level kinds.
--
-- Run via `npx supabase db push`.

-- 1. Tailored ideas ----------------------------------------------------------
create table if not exists sphere_kind_prompt_ideas (
  kind_id uuid not null references sphere_kinds(id) on delete cascade,
  prompt_id uuid not null references sphere_prompts(id) on delete cascade,
  ideas text[] not null default '{}',
  primary key (kind_id, prompt_id)
);

alter table sphere_kind_prompt_ideas enable row level security;

drop policy if exists "dm manages tailored ideas" on sphere_kind_prompt_ideas;
create policy "dm manages tailored ideas"
  on sphere_kind_prompt_ideas for all
  using (is_dm())
  with check (is_dm());

-- 2. Person stances ---------------------------------------------------------
insert into sphere_kinds (parent_id, label, sort_order)
select k.id, v.label, v.sort_order
from (values ('Ally', 0), ('Enemy', 1), ('Neutral', 2)) as v(label, sort_order)
join sphere_kinds k on k.parent_id is null and k.tag = 'person'
where not exists (
  select 1 from sphere_kinds s where s.parent_id = k.id and s.label = v.label
);

insert into sphere_prompts (kind_id, label, question, ideas, spawn_kind_id, sort_order)
select sk.id, v.label, v.question, v.ideas, spawn.id, v.sort_order
from (values
  ('Ally', 'Offers', 'What can they offer the party?',
    array['a safe house', 'information', 'healing', 'an introduction to someone powerful', 'a ship',
          'forged papers', 'a sword arm', 'old maps'], null::text, 0),
  ('Ally', 'Price', 'What do they ask in return?',
    array['nothing - which is suspicious', 'a favor, named later', 'gold', 'protection for someone they love',
          'that the party keep a secret', 'help settling an old score'], null, 1),
  ('Ally', 'Breaking point', 'What would make them turn on the party?',
    array['harm to their family', 'being lied to', 'a better offer', 'the party siding with their rival',
          'a threat to their home', 'nothing - they would die first'], null, 2),

  ('Enemy', 'Against the party', 'Why are they against the party?',
    array['the party wronged them', 'they want what the party carries', 'they were paid to be',
          'the party stands between them and their goal', 'a misunderstanding they will not let go',
          'pure ideology'], null, 0),
  ('Enemy', 'Lengths', 'How far will they go?',
    array['ruin reputations, nothing more', 'hire killers', 'hurt the people the party loves', 'burn a city',
          'bargain with something worse', 'they draw a line at murder - for now'], null, 1),
  ('Enemy', 'Weakness', 'What is their weakness?',
    array['pride', 'a child', 'debt', 'an old wound', 'a creature they fear', 'they trust the wrong lieutenant',
          'they cannot refuse a challenge'], null, 2),
  ('Enemy', 'Lieutenant', 'Who does their dirty work?',
    array['a loyal brute', 'a cold accountant', 'a mercenary captain', 'a former friend of the party',
          'a summoned thing', 'their own child'], 'person', 3),

  ('Neutral', 'Sway', 'What would make them pick a side?',
    array['money', 'a personal favor', 'proof of a lie', 'a threat to their home', 'a debt called in',
          'seeing which side is winning'], null, 0),
  ('Neutral', 'Useful for', 'What can they do for whoever wins them over?',
    array['open a gate', 'testify', 'lend an army', 'keep a secret', 'stop trading with the other side',
          'tell what they have seen'], null, 1),
  ('Neutral', 'Watching', 'Who are they keeping an eye on?',
    array['the party', 'their own employer', 'a rival', 'a stranger in town', 'everyone, always'], 'person', 2)
) as v(kind, label, question, ideas, spawn_tag, sort_order)
join sphere_kinds person on person.parent_id is null and person.tag = 'person'
join sphere_kinds sk on sk.parent_id = person.id and sk.label = v.kind
left join sphere_kinds spawn on spawn.parent_id is null and spawn.tag = v.spawn_tag
where not exists (select 1 from sphere_prompts p where p.kind_id = sk.id and p.label = v.label);

-- 3. More questions on the top-level kinds --------------------------------
insert into sphere_prompts (kind_id, label, question, ideas, spawn_kind_id, sort_order)
select k.id, v.label, v.question, v.ideas, spawn.id,
  (select coalesce(max(p.sort_order), -1) from sphere_prompts p where p.kind_id = k.id) + v.offset_order
from (values
  ('person', 'Voice', 'How do they talk?',
    array['never finishes a sentence', 'formal to the point of rudeness', 'whispers', 'laughs at their own jokes',
          'a heavy foreign accent', 'swears constantly', 'asks questions instead of answering'], null::text, 1),
  ('person', 'First meeting', 'How do the players first meet them?',
    array['they ask the party for help', 'they are in the party''s way', 'they save someone', 'they are robbing someone',
          'a mutual friend introduces them', 'they were following the party'], null, 2),
  ('location', 'Rumor', 'What rumor draws people here?',
    array['buried treasure', 'a healer who works miracles', 'a missing person was seen here', 'work for anyone who asks',
          'a monster with a bounty on it', 'a door that grants wishes'], null, 1),
  ('organization', 'Sign', 'How do you recognize a member?',
    array['a tattoo', 'a ring', 'a turn of phrase', 'a particular color', 'a scar', 'you don''t - that''s the point'], null, 1),
  ('event', 'Witness', 'Who still remembers it firsthand?',
    array['an old soldier', 'a bitter widow', 'a priest who hid the truth', 'a child grown old',
          'a long-lived elf', 'nobody - which is convenient'], 'person', 1)
) as v(tag, label, question, ideas, spawn_tag, offset_order)
join sphere_kinds k on k.parent_id is null and k.tag = v.tag
left join sphere_kinds spawn on spawn.parent_id is null and spawn.tag = v.spawn_tag
where not exists (select 1 from sphere_prompts p where p.kind_id = k.id and p.label = v.label);

-- 4. Tailored ideas for inherited questions --------------------------------
insert into sphere_kind_prompt_ideas (kind_id, prompt_id, ideas)
select sk.id, p.id, v.ideas
from (values
  -- Location > Settlement
  ('location', 'Settlement', 'Known for', array['a great market', 'its brewers', 'a famous academy', 'a cathedral',
    'its horse fairs', 'a tyrant''s statue', 'a bridge older than the town']),
  ('location', 'Settlement', 'Trouble', array['a guild strike', 'a succession crisis', 'sickness in the slums', 'a crime wave',
    'refugees at the gates', 'a rigged election', 'a fire']),
  ('location', 'Settlement', 'Secret', array['the mayor is a puppet', 'a smuggling ring under the docks', 'a cult in the sewers',
    'the founding charter is forged', 'its wealth comes from something ugly']),
  ('location', 'Settlement', 'First sight', array['smoke from a hundred chimneys', 'a gallows in the square', 'market criers',
    'a looming castle', 'washing lines across the alleys', 'guards checking papers']),
  ('location', 'Settlement', 'Rumor', array['the lord is dying', 'gold in the old mine', 'a tavern that serves anyone',
    'the well water heals', 'a noble is hiring blades']),

  -- Location > Wilderness
  ('location', 'Wilderness', 'Known for', array['ancient trees', 'a haunted ford', 'wild horses', 'rare herbs',
    'an overgrown battlefield', 'giant footprints']),
  ('location', 'Wilderness', 'Trouble', array['wildfire', 'a beast that has learned to hunt people', 'poachers',
    'a cursed spring', 'a hard winter', 'a missing ranger']),
  ('location', 'Wilderness', 'Secret', array['a buried city beneath', 'a fey crossing', 'a hermit who knows everything',
    'the trail markers lie', 'the forest moves']),
  ('location', 'Wilderness', 'First sight', array['mist between the trunks', 'no birdsong', 'grass to the horizon',
    'a ruined watchtower', 'bones by the path', 'smoke far off']),
  ('location', 'Wilderness', 'Rumor', array['a unicorn was seen', 'outlaws hide treasure here', 'a lost caravan',
    'the old road still leads somewhere', 'a druid grants boons']),

  -- Location > Cave / Dungeon
  ('location', 'Cave / Dungeon', 'Known for', array['glowing crystals', 'a lost expedition', 'echoing voices',
    'an old dragon lair', 'treasure never found', 'being impossible to map']),
  ('location', 'Cave / Dungeon', 'Trouble', array['the tunnels are collapsing', 'something has woken', 'the water is rising',
    'a rival party got here first', 'the air is going bad']),
  ('location', 'Cave / Dungeon', 'Secret', array['it is a tomb', 'it breathes', 'it connects to the deep places below',
    'the map everyone sells is wrong', 'it was dug from below']),
  ('location', 'Cave / Dungeon', 'First sight', array['cold breath from the entrance', 'scratched warnings', 'old bones',
    'a rusted gate', 'glowing fungus', 'total darkness']),
  ('location', 'Cave / Dungeon', 'Rumor', array['a dwarf king''s hoard', 'a monster that grants a wish if fed',
    'a way under the mountains', 'nobody who went in came back', 'an old wizard''s workshop']),

  -- Location > Building
  ('location', 'Building', 'Known for', array['its hospitality', 'a famous murder', 'its library', 'a ghost',
    'its architecture', 'the parties held there']),
  ('location', 'Building', 'Trouble', array['the owner is missing', 'debts are due', 'a fire last week',
    'guests keep disappearing', 'it is under siege']),
  ('location', 'Building', 'Secret', array['a hidden room', 'a body in the walls', 'a passage to the sewers',
    'it was built on a grave', 'the staff are not who they seem']),
  ('location', 'Building', 'First sight', array['a crooked sign', 'armed doormen', 'ivy-choked walls',
    'a roaring hearth', 'boarded windows']),

  -- Person stances
  ('person', 'Enemy', 'Wants', array['to see the party ruined', 'a throne', 'vengeance for an old wrong',
    'the thing the party carries', 'to remake the world', 'to be feared']),
  ('person', 'Enemy', 'Secret', array['they were once a hero', 'they are being blackmailed', 'they are dying',
    'they are the party''s kin', 'someone else gives the orders']),
  ('person', 'Ally', 'Wants', array['to see justice done', 'to protect their family', 'a fair wage', 'redemption',
    'the party to succeed - for their own reasons']),
  ('person', 'Ally', 'Secret', array['they owe the enemy money', 'they were once on the other side',
    'they are spying - for someone', 'they are in love with a party member', 'they cannot fight']),
  ('person', 'Neutral', 'Wants', array['to stay out of it', 'to profit from both sides', 'to be left alone',
    'information', 'to protect their trade'])
) as v(parent_tag, kind, label, ideas)
join sphere_kinds parent on parent.parent_id is null and parent.tag = v.parent_tag
join sphere_kinds sk on sk.parent_id = parent.id and sk.label = v.kind
join sphere_prompts p on p.kind_id = parent.id and p.label = v.label
on conflict (kind_id, prompt_id) do nothing;
