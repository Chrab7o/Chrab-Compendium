-- One-time content seed, not a schema change: loads the DM's "Godless
-- Domain" Cleric subclass (authored outside the app, in a Homebrewery-style
-- doc) as a standalone subclass (class_id null, parent_class_name 'Cleric' -
-- Cleric is an official class this app doesn't track as its own
-- homebrew_classes row, same shape 20260204000000_standalone_subclasses.sql
-- was built for). Safe to re-run: upserts the subclass by its unique slug,
-- then replaces its feature list, same delete-then-reinsert pattern
-- StandaloneSubclassEditor.jsx itself uses when saving from the UI. Once
-- this lands, the DM can keep editing it from DM Dashboard -> Homebrew ->
-- Subclasses like anything else made through the tool.
do $$
declare
  v_subclass_id uuid;
begin
  insert into homebrew_subclasses (name, slug, parent_class_name, description, class_id)
  values (
    'Godless Domain',
    'godless-domain',
    'Cleric',
    'You have lost faith in the concept of a god, or decided that you are better than any god. '
    || 'You have ultimately decided you don''t need to believe in anyone but yourself to channel. '
    || 'By choosing this subclass you either had a god you chose to give up on due to a strong '
    || 'emotional response, or you are a narcissist.' || E'\n\n'
    || 'This subclass is centered around the idea of being a self-centered savior - many of its '
    || 'spells and features are charm-focused.' || E'\n\n'
    || 'The only god worth believing in is yourself. You have either lost faith in the concept of '
    || 'worship and become fueled by disdain for gods, or you are so narcissistic that you worship '
    || 'yourself. Regardless of the reason, you cultivate such a profound belief in your own ability '
    || 'that you have become your own god - a god within you strong enough to allow you to channel, '
    || 'but lacking the world-altering strength that gods with lots of followers have.' || E'\n\n'
    || 'Example Deity: You. Pantheon: Yourself.',
    null
  )
  on conflict (slug) do update set
    name = excluded.name,
    parent_class_name = excluded.parent_class_name,
    description = excluded.description
  returning id into v_subclass_id;

  delete from homebrew_subclass_features where subclass_id = v_subclass_id;

  insert into homebrew_subclass_features (subclass_id, level, name, description, sort_order)
  values
    (
      v_subclass_id, 1, 'Domain Spells',
      'You gain domain spells at the cleric levels listed below. Once you gain a domain spell, you '
      || 'always have it prepared, and it doesn''t count against the number of spells you can prepare '
      || 'each day.' || E'\n\n'
      || '1st: Charm Person, Compel Duel' || E'\n'
      || '3rd: Mirror Image, Fortune''s Favor' || E'\n'
      || '5th: Antagonize, Hunger of Hadar' || E'\n'
      || '7th: Aura of Life, Find Greater Steed' || E'\n'
      || '9th: Dominate Person, Reincarnate',
      0
    ),
    (
      v_subclass_id, 1, 'Reach of the Local God',
      'You gain the guidance cantrip. This version of the cantrip has a range of 15 feet instead of '
      || 'touch.',
      1
    ),
    (
      v_subclass_id, 1, 'Witness My Superiority',
      'You wish for your allies and enemies to see how superior you are to the gods. As an action, '
      || 'create a statue of light somewhere 30 feet in front of you. Allies who can see the statue '
      || 'are empowered by your greatness: when they start their turn or walk within 15 feet of the '
      || 'statue, they gain 1d4 temporary hit points (no stacking). Enemies who start their turn or '
      || 'walk within 15 feet of the statue have disadvantage on checks involving sight. This effect '
      || 'lasts 1 minute and can be used a number of times equal to your proficiency bonus.',
      2
    ),
    (
      v_subclass_id, 2, 'Channel Divinity: Worship Me',
      'You can use your Channel Divinity to make your very presence a sight to behold. All creatures '
      || 'of your choice within 30 feet must make a Wisdom saving throw or be charmed by you (you can '
      || 'opt to exclude certain creatures from this effect). Charmed targets are effectively stunned '
      || 'while within your radius - they cannot act, but lose the charm effect if damaged by another '
      || 'creature. On their turn, a charmed target can attempt another save. You can make charmed '
      || 'targets bow down, forcing them prone. If you move more than 30 feet away from a charmed '
      || 'target, the charm automatically ends.',
      3
    ),
    (
      v_subclass_id, 6, 'Self Empower',
      'You become empowered by your confidence. For the next minute, you are immune to all status '
      || 'effects caused by non-physical means (for example, you can still be entangled or stunned by '
      || 'a blow to the head, but an attempt to psychically stun or paralyze you will not work). You '
      || 'also gain temporary hit points equal to 1d6 + your cleric level. You can use this feature a '
      || 'number of times equal to your proficiency bonus.',
      4
    ),
    (
      v_subclass_id, 8, 'Divine Strike',
      'You gain the ability to infuse your weapon strikes with divine energy. Once on each of your '
      || 'turns when you hit a creature with a weapon attack or spell attack, you can cause the attack '
      || 'to deal an extra 1d8 psychic damage.',
      5
    ),
    (
      v_subclass_id, 17, 'Blessing of the Almighty',
      'The benefits of your Witness My Superiority feature now extend to 60 feet from the statue. '
      || 'Additionally, you and allies within the statue''s radius deal an extra 1d4 psychic damage '
      || 'once per turn, and the statue now heals affected creatures 1d6 hit points instead of '
      || 'granting temporary hit points.',
      6
    );
end $$;
