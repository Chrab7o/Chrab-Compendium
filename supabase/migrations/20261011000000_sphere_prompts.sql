-- Sphere Grid prompts: curated questions that guide filling in a sphere.
--
-- Opening a sphere used to give an empty text box. Now each kind of thing
-- (a tag - Location, Person, ...) carries a short list of questions, and each
-- question carries idea chips the DM curates. Picking or rolling an idea fills
-- the answer; the answer is written into the entry's own markdown as a
-- `**Label:** answer` line, so the content stays the single source of truth
-- and a prompt counts as answered when that line is present. Nothing here is
-- generated - every idea is one somebody typed in.
--
-- Prompts attach to ANY tag, not only Type: the wiki's Type group holds just
-- `worlds` and `homebrew`, while `location` and `person` are Role tags.
--
-- Run via `npx supabase db push`.

-- 1. Kinds the starter set needs ------------------------------------------
insert into tags (value, label, sort_order, group_id)
select v.value, v.label, v.sort_order, g.id
from (values ('organization', 'Organization', 10), ('event', 'Event', 11)) as v(value, label, sort_order),
     tag_groups g
where g.value = 'role'
on conflict (value) do nothing;

-- 2. Prompts --------------------------------------------------------------
create table if not exists sphere_prompts (
  id uuid primary key default gen_random_uuid(),
  tag text not null references tags(value) on update cascade on delete cascade,
  -- Short name written into the entry: "**Power:** a merchant council".
  label text not null,
  question text not null,
  ideas text[] not null default '{}',
  -- Non-empty: the answer can become a linked sphere carrying these tags
  -- ("Who holds power?" -> a Person). Always offered, never automatic.
  spawn_tags text[] not null default '{}',
  -- Optional pool to roll that sphere's *name* from, since an idea is
  -- usually an archetype ("an aging lord") rather than a name.
  pool_id uuid references name_pools(id) on delete set null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists sphere_prompts_tag_idx on sphere_prompts(tag);

alter table sphere_prompts enable row level security;

drop policy if exists "dm manages sphere prompts" on sphere_prompts;
create policy "dm manages sphere prompts"
  on sphere_prompts for all
  using (is_dm())
  with check (is_dm());

-- 3. Starter set ----------------------------------------------------------
-- Setting-agnostic on purpose; edit, delete and add to it from the
-- Questions tab. Only seeded when the table is empty, so re-running never
-- duplicates or overwrites curated work.
insert into sphere_prompts (tag, label, question, ideas, spawn_tags, sort_order)
select tag, label, question, ideas, spawn_tags, sort_order
from (values
  -- Location
  ('location', 'Known for', 'What is this place known for?',
    array['a famous market', 'a sacred spring', 'a ruined tower', 'its fighting pits', 'a strange yearly festival',
          'master craftsmen', 'an old battlefield', 'a place of pilgrimage'], '{}'::text[], 0),
  ('location', 'Power', 'Who holds power here?',
    array['a merchant council', 'an aging lord with no heir', 'a temple hierarchy', 'a crime family',
          'an elected speaker', 'a foreign governor', 'nobody - it is contested', 'a reclusive mage'], array['person'], 1),
  ('location', 'Trouble', 'What is going wrong here right now?',
    array['a drought', 'a missing heir', 'a spreading sickness', 'bandits on the roads', 'a broken treaty',
          'something stirring below', 'a rigged election', 'a fire nobody admits starting'], '{}'::text[], 2),
  ('location', 'Secret', 'What do the locals not talk about?',
    array['a mass grave', 'who really owns the land', 'the last ones who left', 'a deal with something old',
          'the founder was a fraud', 'a sealed door', 'smuggling everyone profits from'], '{}'::text[], 3),
  ('location', 'First sight', 'What does a traveler notice first?',
    array['the smell of the tanneries', 'bells that never stop', 'everyone is armed', 'colorful banners everywhere',
          'unnerving quiet', 'children selling charms', 'a giant statue', 'fog that clings to the streets'], '{}'::text[], 4),
  ('location', 'Depends on', 'What other place does this one depend on?',
    array['a mine upriver', 'a distant capital', 'a neighboring rival town', 'a monastery in the hills',
          'a port across the sea', 'a forest it is slowly cutting down'], array['location'], 5),

  -- Person
  ('person', 'Wants', 'What do they want most?',
    array['revenge', 'to be remembered', 'to protect a child', 'to pay off a debt', 'a seat of power',
          'to undo a mistake', 'forbidden knowledge', 'to go home'], '{}'::text[], 0),
  ('person', 'Fears', 'What are they afraid of?',
    array['being found out', 'growing old', 'a specific person', 'the dark', 'losing their station',
          'their own temper', 'the gods', 'being forgotten'], '{}'::text[], 1),
  ('person', 'Answers to', 'Who do they answer to?',
    array['a guild', 'a noble house', 'a temple', 'a secret society', 'a criminal syndicate',
          'the crown', 'no one - and it shows'], array['organization'], 2),
  ('person', 'Recognizable by', 'How will the players recognize them?',
    array['a missing finger', 'an unusual laugh', 'always eating', 'immaculate clothes', 'a pet on their shoulder',
          'speaks in proverbs', 'a burn scar', 'never sits down'], '{}'::text[], 3),
  ('person', 'Secret', 'What are they hiding?',
    array['a second family', 'a false name', 'they are dying', 'they betrayed a friend', 'stolen wealth',
          'a curse', 'they work for a rival', 'they cannot read'], '{}'::text[], 4),
  ('person', 'Rival', 'Who stands in their way?',
    array['a sibling', 'a former partner', 'an ambitious apprentice', 'a creditor', 'an old flame',
          'a magistrate', 'a rival merchant'], array['person'], 5),
  ('person', 'Found at', 'Where can they usually be found?',
    array['a tavern corner', 'the docks', 'a workshop', 'the temple steps', 'a manor house',
          'on the road', 'the market square'], array['location'], 6),

  -- Organization
  ('organization', 'Goal', 'What does this group want?',
    array['control of trade', 'to bring back an old order', 'protect a secret', 'wealth, plainly',
          'to topple a ruler', 'to keep something sealed', 'converts', 'to be left alone'], '{}'::text[], 0),
  ('organization', 'Leader', 'Who leads them?',
    array['a charismatic founder', 'a council that never agrees', 'a figurehead with a hidden master',
          'an elder nobody has seen in years', 'whoever won the last duel', 'a young heir'], array['person'], 1),
  ('organization', 'Methods', 'How do they get what they want?',
    array['bribery', 'blackmail', 'quiet violence', 'charity and favors', 'law and paperwork',
          'propaganda', 'magic', 'patience'], '{}'::text[], 2),
  ('organization', 'Rival', 'Who are they in conflict with?',
    array['a rival guild', 'the authorities', 'a splinter faction of their own', 'a foreign power',
          'a church', 'an old ally'], array['organization'], 3),
  ('organization', 'Base', 'Where do they operate from?',
    array['a guildhall', 'catacombs', 'a ship', 'a respectable shopfront', 'a fortified estate',
          'nowhere fixed', 'a tower'], array['location'], 4),
  ('organization', 'Offers members', 'What do members get out of it?',
    array['protection', 'coin', 'belonging', 'secrets', 'a path to power', 'absolution', 'a way out'], '{}'::text[], 5),
  ('organization', 'Secret', 'What would ruin them if it got out?',
    array['the founder''s true origin', 'who funds them', 'a massacre they caused', 'they are nearly broke',
          'their leader is dead', 'they serve something inhuman'], '{}'::text[], 6),

  -- Event
  ('event', 'When', 'When did it happen?',
    array['generations ago', 'within living memory', 'last winter', 'it is still happening',
          'on a night everyone remembers', 'nobody agrees'], '{}'::text[], 0),
  ('event', 'Cause', 'What set it off?',
    array['a broken oath', 'a famine', 'an assassination', 'a prophecy', 'a natural disaster',
          'a discovery', 'greed', 'a misunderstanding'], '{}'::text[], 1),
  ('event', 'Involved', 'Which group was at the heart of it?',
    array['a royal house', 'a rebel army', 'a religious order', 'a merchant league',
          'an invading people', 'a cabal of mages'], array['organization'], 2),
  ('event', 'Where', 'Where did it happen?',
    array['a capital', 'a border fort', 'a holy site', 'a river crossing', 'at sea',
          'a now-abandoned town'], array['location'], 3),
  ('event', 'Aftermath', 'What changed because of it?',
    array['a new ruler', 'a border moved', 'a people scattered', 'a law nobody questions now',
          'a ruin', 'a holiday', 'a lasting grudge'], '{}'::text[], 4),
  ('event', 'Remembered', 'How is it remembered - and what is wrong with that?',
    array['as a victory that was really a defeat', 'a hero who was really a villain', 'erased from records',
          'turned into a children''s song', 'blamed on the wrong people', 'remembered differently by each side'], '{}'::text[], 5)
) as seed(tag, label, question, ideas, spawn_tags, sort_order)
where not exists (select 1 from sphere_prompts)
  and exists (select 1 from tags t where t.value = seed.tag);
