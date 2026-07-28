-- Content cleanup, not a schema change: the DM asked for em dashes and
-- "dashes of the like" removed from all class/subclass text. No literal em
-- dashes (—) or en dashes (–) exist in the current content, but many
-- descriptions use a spaced hyphen ( - ) the same way, as a clause break.
-- Each one below is replaced with whatever plain punctuation (comma, colon,
-- semicolon, or a period splitting into two sentences) actually fits that
-- sentence, rather than a blind find/replace - hyphens that are genuinely
-- part of a word (self-centered, world-altering, a -2 penalty) are left
-- alone since those aren't the "dash" being asked about.

update homebrew_classes set description = replace(
  description,
  'Some evil-aligned golemancers do exist, however - their disposition shows',
  'Some evil-aligned golemancers do exist, however. Their disposition shows'
) where id = 'cc153675-c269-4b44-ac78-c5ff88332364';

update homebrew_classes set description = replace(
  description,
  'You will either feel very weak or very useful - not a class for a player who values consistency.',
  'You will either feel very weak or very useful. This isn''t a class for a player who values consistency.'
) where id = 'ebb841a2-f176-4f07-8e3a-b55ba4349c4d';

update homebrew_classes set description = replace(
  description,
  'consider how your character feels about their abilities - do they see them as a curse or a boon?',
  'consider how your character feels about their abilities: do they see them as a curse or a boon?'
) where id = '466740aa-e967-4aa9-be11-7de7538cc70d';

update homebrew_class_features set description = replace(
  description,
  'with the appearance of your choosing - you are proficient with this weapon,',
  'with the appearance of your choosing. You are proficient with this weapon,'
) where id = '06a759a5-da35-44c4-9880-7f3ed39ad94d';

update homebrew_class_features set description = replace(
  description,
  'Pick an ability score - the cursed creature takes an extra 1d6 damage',
  'Pick an ability score: the cursed creature takes an extra 1d6 damage'
) where id = '60736cd8-d9bc-4807-b675-87ac2f9bfe37';

update homebrew_class_features set description = replace(
  description,
  '[source text is incomplete here - the sentence cuts off after "or end", effect needs to be finished]',
  '[source text is incomplete here: the sentence cuts off after "or end", effect needs to be finished]'
) where id = '96276daf-4ea8-452d-a4ea-2a8227cefa02';

update homebrew_class_features set description = replace(
  description,
  'add the remainder to your temp hp - you cannot gain more temp hp than half your maximum. On subsequent turns',
  'add the remainder to your temp hp; you cannot gain more temp hp than half your maximum. On subsequent turns'
) where id = '297b45d2-8505-4977-a95d-6627c45a1af8';

update homebrew_class_features set description = replace(
  description,
  'gain temp hp for the remainder - you cannot gain more temp hp than half your maximum.',
  'gain temp hp for the remainder; you cannot gain more temp hp than half your maximum.'
) where id = '53e8c15a-ae19-4b3c-93e4-cd83ab2b31f7';

update homebrew_class_features set description = replace(
  description,
  'follow you around for free - it''s so small it can fit in your backpack.',
  'follow you around for free; it''s so small it can fit in your backpack.'
) where id = 'be427f77-10c5-4fe1-8feb-dbd7e53dd553';

update homebrew_class_features set description = replace(
  replace(
    replace(
      description,
      '**Resistance** *(Abjuration cantrip)* - Casting Time:',
      '**Resistance** *(Abjuration cantrip):* Casting Time:'
    ),
    '**Guidance** *(Divination cantrip)* - Casting Time:',
    '**Guidance** *(Divination cantrip):* Casting Time:'
  ),
  '**Manifest Ruin** *(Divination cantrip)* - Casting Time:',
  '**Manifest Ruin** *(Divination cantrip):* Casting Time:'
) where id = 'f7de9dc0-1a43-4b33-8d43-a891962d5696';

update homebrew_class_features set description = replace(
  description,
  'predict a die value - if correct, you deal an additional 1d4 psychic damage.',
  'predict a die value; if correct, you deal an additional 1d4 psychic damage.'
) where id = 'f7de9dc0-1a43-4b33-8d43-a891962d5696';

update homebrew_class_features set description = replace(
  replace(
    replace(
      description,
      'who can see or hear you - that creature gains one of your Manifestation dice.',
      'who can see or hear you; that creature gains one of your Manifestation dice.'
    ),
    'roll the Manifestation die - if the die lands on one of the 3 chosen results',
    'roll the Manifestation die; if the die lands on one of the 3 chosen results'
  ),
  'your bonus effect die goes up with it - d6 at level 5, d8 at level 10, and d10 at level 15.',
  'your bonus effect die goes up with it: d6 at level 5, d8 at level 10, and d10 at level 15.'
) where id = 'e8061121-8951-480f-ac3b-373f8c82c743';

update homebrew_class_features set description = replace(
  description,
  'empower your sight - for the next minute, enemies cannot get advantage on you.',
  'empower your sight: for the next minute, enemies cannot get advantage on you.'
) where id = 'bb80a2f5-0f0e-4cee-827c-6096c5d1cbae';

update homebrew_class_features set description = replace(
  description,
  'ask the DM a question - the DM will respond with a hot-to-cold answer.',
  'ask the DM a question; the DM will respond with a hot-to-cold answer.'
) where id = '0eb83f02-f399-4925-b433-0b5c89264cf5';

update homebrew_class_features set description = replace(
  description,
  'barring lair actions - functionally, you will start combat with the maximum possible initiative.',
  'barring lair actions; functionally, you will start combat with the maximum possible initiative.'
) where id = '40816d07-f79d-4d84-8d08-46908c82865b';

update homebrew_class_features set description = replace(
  description,
  'ask the DM a question - the DM will respond with the truth.',
  'ask the DM a question; the DM will respond with the truth.'
) where id = '7ea4c8bb-ab61-48fa-8977-0c6ed13c3ba2';

update homebrew_class_features set description = replace(
  description,
  'you are pulled within 5 ft of the target - there must be at least 5 ft of open space',
  'you are pulled within 5 ft of the target. There must be at least 5 ft of open space'
) where id = '908d83dc-6233-44a7-9da3-c7766bb9341c';

update homebrew_class_features set description = replace(
  description,
  'morph your body into more intricate weapons - you have unlocked additional weapon forms.',
  'morph your body into more intricate weapons: you have unlocked additional weapon forms.'
) where id = 'a251a9bd-6a65-45ae-9f54-e3753fae832c';

update homebrew_class_features set description = replace(
  description,
  'to appear as someone else - it takes a minute to complete the transformation.',
  'to appear as someone else; it takes a minute to complete the transformation.'
) where id = '1ad1e130-17a2-4325-8b31-b25c24c71958';

update homebrew_class_features set description = replace(
  description,
  'faster at altering your appearance - it now only costs the time of one action.',
  'faster at altering your appearance: it now only costs the time of one action.'
) where id = '907e3a86-f000-450c-b7ee-e3d77da6d336';

update homebrew_subclasses set description = replace(
  replace(
    description,
    'being a self-centered savior - many of its spells and features are charm-focused.',
    'being a self-centered savior; many of its spells and features are charm-focused.'
  ),
  'that you have become your own god - a god within you strong enough to allow you to channel,',
  'that you have become your own god, a god within you strong enough to allow you to channel,'
) where id = '87bb3ddf-ee54-4579-bbb6-735729f2719c';

update homebrew_subclass_features set description = replace(
  description,
  'to get back up with that much hp instead - you do not lose Death Stance if you do.',
  'to get back up with that much hp instead; you do not lose Death Stance if you do.'
) where id = '2ef6f2a3-ff7e-4100-966f-e09889df968b';

update homebrew_subclass_features set description = replace(
  description,
  '(Source text originally said "Dark Pulse" - no Dark Art by that name exists;',
  '(Source text originally said "Dark Pulse": no Dark Art by that name exists;'
) where id = 'c25970ba-eaf2-40f5-8a9a-4f168534bdd8';

update homebrew_subclass_features set description = replace(
  description,
  'Your champion functions independently from you - it does not need to eat or sleep,',
  'Your champion functions independently from you; it does not need to eat or sleep,'
) where id = 'af205399-9c3a-4f80-9bab-b1985b679883';

update homebrew_subclass_features set description = replace(
  description,
  'you may use an action to adjust max hp - raising the max hp of either yourself',
  'you may use an action to adjust max hp; raising the max hp of either yourself'
) where id = 'a0054d8a-1d1b-4bff-85d4-759ce6b55a67';

update homebrew_subclass_features set description = replace(
  description,
  'or stow it away somewhere - however, whoever holds your soul holds power over you.',
  'or stow it away somewhere; however, whoever holds your soul holds power over you.'
) where id = 'ec6faa9a-ded1-4d45-8258-976c188b3f0c';

update homebrew_subclass_features set description = replace(
  description,
  'add the remainder to your temp hp - you cannot gain more temp hp than half your maximum. This cantrip',
  'add the remainder to your temp hp; you cannot gain more temp hp than half your maximum. This cantrip'
) where id = '2ea1a257-f9bb-48c3-9a50-f66d861eb21c';

update homebrew_subclass_features set description = replace(
  description,
  '(The original notes just say "check sheets for upgrades" - this wasn''t fully written up in the source document.)',
  '(The original notes just say "check sheets for upgrades"; this wasn''t fully written up in the source document.)'
) where id = '845cd04d-f243-4987-a1e3-cc1c057a8124';

update homebrew_subclass_features set description = replace(
  description,
  'features of level 3 or lower from any class - you will gain more as you level up.',
  'features of level 3 or lower from any class; you will gain more as you level up.'
) where id = '493c2e38-53e2-4c46-b6a1-efaa5dc7a46a';

update homebrew_subclass_features set description = replace(
  description,
  'certain features have quirks - Twinned Spell only works under the 2014 ruleset;',
  'certain features have quirks: Twinned Spell only works under the 2014 ruleset;'
) where id = '3e10844d-1380-4384-8236-e5ea83781eef';

update homebrew_subclass_features set description = replace(
  description,
  'you can reroll them - you must use the new roll.',
  'you can reroll them; you must use the new roll.'
) where id = '165ff9a2-79c6-4253-a852-f7569d065dda';

update homebrew_subclass_features set description = replace(
  description,
  'are effectively stunned while within your radius - they cannot act,',
  'are effectively stunned while within your radius; they cannot act,'
) where id = 'afe08c39-274d-4342-9dd2-76fc74d2782b';
