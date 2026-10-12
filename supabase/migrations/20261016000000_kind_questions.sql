-- No universal questions: each major kind asks its own.
--
-- "Every sphere" (First glance / Secret / Wants / Change on everything) read
-- oddly on half the kinds - a Plot has no first glance, a Location doesn't
-- want anything. So the universal kind goes, and each top-level kind gets the
-- questions that actually fit it, worded for it; sub-kinds keep their own.
--
--   * Location: First glance, Secret, Change
--   * Person:   First glance, Wants, Secret, Change
--   * Faction:  Secret, Change           (Goal already covers "wants")
--   * Event:    Secret                   (Aftermath already covers change)
--   * Item, Lore, Plot: small starter sets of their own
--
-- Tailored ideas that hung off a universal question move to the matching new
-- question on the kind's top-level ancestor (Cave's "First glance" ideas now
-- tailor Location's "First glance").
--
-- Run via `npx supabase db push`.

-- 1. The new per-kind questions --------------------------------------------
insert into sphere_prompts (kind_id, label, question, ideas, spawn_kind_id, sort_order)
select k.id, v.label, v.question, v.ideas, spawn.id, v.sort_order
from (values
  -- Location
  ('location', 'First glance', 'What does it look like at first glance?',
    array['towering walls', 'smoke-stained roofs', 'overgrown and quiet', 'carved into the rock',
          'shimmering in the heat', 'half-sunk in mist'], null::text, -1),
  ('location', 'Secret', 'What''s a secret about this place?',
    array['it was built over something older', 'someone died here', 'there is a hidden way in',
          'it is slowly failing', 'it is not on any map for a reason'], null, 100),
  ('location', 'Change', 'What''s changing here?',
    array['new settlers', 'the water is drying up', 'a new ruler', 'danger is growing', 'a boom', 'a slow decline'], null, 101),

  -- Person
  ('person', 'First glance', 'What do they look like at first glance?',
    array['scarred and watchful', 'impeccably dressed', 'ragged', 'younger than expected', 'huge', 'forgettable'], null, -1),
  ('person', 'Wants', 'What do they want?',
    array['power', 'revenge', 'to restore something lost', 'to protect someone', 'to prove a point'], null, 100),
  ('person', 'Secret', 'What are they hiding?',
    array['a second family', 'a false name', 'they are dying', 'they betrayed a friend', 'stolen wealth',
          'they work for a rival'], null, 101),
  ('person', 'Change', 'What''s changing for them?',
    array['a promotion', 'a debt coming due', 'a new love', 'failing health', 'losing their faith', 'a rival rising'], null, 102),

  -- Faction (the tag value is still `organization`)
  ('organization', 'Secret', 'What would ruin them if it got out?',
    array['the founder''s true origin', 'who funds them', 'a massacre they caused', 'they are nearly broke',
          'their leader is dead', 'they serve something inhuman'], null, 100),
  ('organization', 'Change', 'What''s changing for them?',
    array['growing fast', 'splitting apart', 'losing their leader', 'new enemies', 'going public', 'going underground'], null, 101),

  -- Event
  ('event', 'Secret', 'What''s the hidden truth about it?',
    array['it was staged', 'the wrong people were blamed', 'it never really ended', 'someone profited',
          'the records were rewritten'], null, 100),

  -- Item
  ('item', 'First glance', 'What does it look like?',
    array['plain and worn', 'jeweled', 'warm to the touch', 'humming faintly', 'broken', 'too heavy for its size'], null, 0),
  ('item', 'Origin', 'Who made it?',
    array['a forgotten smith', 'a god', 'a mad wizard', 'an ancient empire', 'nobody knows'], null, 1),
  ('item', 'Holder', 'Who has it now?',
    array['a collector', 'a temple', 'a thief', 'a dragon', 'nobody - it is lost', 'someone who doesn''t know what it is'],
    'person', 2),
  ('item', 'Secret', 'What''s secret about it?',
    array['it is cursed', 'it is a forgery', 'it is alive', 'it is a key', 'it remembers its owners'], null, 3),

  -- Lore
  ('lore', 'Source', 'Where does this knowledge come from?',
    array['scripture', 'a children''s rhyme', 'a scholar''s book', 'an oral tradition', 'a dream'], null, 0),
  ('lore', 'Believers', 'Who believes it?',
    array['everyone', 'the common folk', 'one temple', 'scholars', 'nobody anymore'], null, 1),
  ('lore', 'Truth', 'How much of it is true?',
    array['all of it', 'half', 'none', 'the opposite', 'more than anyone suspects'], null, 2),

  -- Plot
  ('plot', 'Hook', 'How do the players get pulled in?',
    array['a job offer', 'a desperate plea', 'a stranger''s death', 'a rumor', 'a debt', 'they witness it'], null, 0),
  ('plot', 'Stakes', 'What happens if nobody acts?',
    array['a town falls', 'someone dies', 'a war starts', 'a seal breaks', 'the villain wins'], null, 1),
  ('plot', 'Obstacle', 'What''s standing in the way?',
    array['a rival', 'the law', 'a monster', 'a time limit', 'distrust'], null, 2),
  ('plot', 'Twist', 'What''s the twist?',
    array['the client is the villain', 'the victim faked it', 'two groups want the same thing', 'the prize is a trap'], null, 3)
) as v(tag, label, question, ideas, spawn_tag, sort_order)
join sphere_kinds k on k.parent_id is null and not k.universal and k.tag = v.tag
left join sphere_kinds spawn on spawn.parent_id is null and not spawn.universal and spawn.tag = v.spawn_tag
where not exists (select 1 from sphere_prompts p where p.kind_id = k.id and p.label = v.label);

-- 2. Move tailored ideas off the universal questions -----------------------
-- Each tailored list lands on the question with the same label on the
-- kind's top-level ancestor. Person's own "Wants" list is now that
-- question's base ideas, so it isn't carried as a tailoring of itself.
with recursive roots as (
  select id as kind_id, id as root_id, parent_id from sphere_kinds where not universal
  union all
  select r.kind_id, k.id, k.parent_id
  from roots r
  join sphere_kinds k on k.id = r.parent_id
)
insert into sphere_kind_prompt_ideas (kind_id, prompt_id, ideas)
select o.kind_id, target.id, o.ideas
from sphere_kind_prompt_ideas o
join sphere_prompts universal_prompt on universal_prompt.id = o.prompt_id
join sphere_kinds universal_kind on universal_kind.id = universal_prompt.kind_id and universal_kind.universal
join roots r on r.kind_id = o.kind_id and r.parent_id is null
join sphere_prompts target on target.kind_id = r.root_id and target.label = universal_prompt.label
where o.kind_id <> r.root_id
on conflict (kind_id, prompt_id) do nothing;

-- 3. Remove the universal kind --------------------------------------------
-- Cascades to its questions and to every tailoring/switch-off that pointed
-- at them (the tailorings were copied across above).
delete from sphere_kinds where universal;
alter table sphere_kinds drop column if exists universal;
