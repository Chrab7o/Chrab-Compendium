// Every attribute of a dnd5e 5.3 NPC the NPC Forge lets you pick from, so
// nobody has to remember paths. One entry per path, tagged with where it can
// be used:
//   f - formula reference  (@abilities.dex.mod in a damage roll; roll data,
//       so derived values like skill totals and AC are here)
//   e - effect change target (system.abilities.dex.value; only stored fields
//       and bonus fields, because effects apply before dnd5e derives totals)
//   s - something an activity can spend (consumption target)
// Paths are written without the leading "@" / "system.". The catalog is
// checked against a live actor.getRollData() dump by the sandbox repo's
// scripts/check-attributes.mjs.

const ABILITIES = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' }

const SKILLS = {
  acr: 'Acrobatics', ani: 'Animal Handling', arc: 'Arcana', ath: 'Athletics', dec: 'Deception', his: 'History',
  ins: 'Insight', itm: 'Intimidation', inv: 'Investigation', med: 'Medicine', nat: 'Nature', prc: 'Perception',
  prf: 'Performance', per: 'Persuasion', rel: 'Religion', slt: 'Sleight of Hand', ste: 'Stealth', sur: 'Survival',
}

const MOVES = { walk: 'Walk', fly: 'Fly', swim: 'Swim', climb: 'Climb', burrow: 'Burrow' }
const SENSES = { darkvision: 'Darkvision', blindsight: 'Blindsight', tremorsense: 'Tremorsense', truesight: 'Truesight' }
const ATTACKS = { mwak: 'Melee weapon', rwak: 'Ranged weapon', msak: 'Melee spell', rsak: 'Ranged spell' }

const a = (path, label, group, use = 'f') => ({ path, label, group, use })

export const ATTRIBUTE_CATALOG = [
  a('prof', 'Proficiency bonus', 'Core'),
  a('details.cr', 'Challenge rating', 'Core', 'fe'),
  a('attributes.exhaustion', 'Exhaustion level', 'Core', 'fes'),

  ...Object.entries(ABILITIES).flatMap(([k, name]) => [
    a(`abilities.${k}.mod`, `${name} modifier`, 'Abilities'),
    a(`abilities.${k}.value`, `${name} score`, 'Abilities', 'fe'),
    a(`abilities.${k}.save.value`, `${name} saving throw bonus`, 'Abilities'),
    a(`abilities.${k}.dc`, `${name} DC (8 + prof + mod)`, 'Abilities'),
    a(`abilities.${k}.proficient`, `${name} save proficiency (0/1)`, 'Abilities', 'e'),
    a(`abilities.${k}.bonuses.save`, `${name} save bonus`, 'Bonuses', 'e'),
    a(`abilities.${k}.bonuses.check`, `${name} check bonus`, 'Bonuses', 'e'),
  ]),

  ...Object.entries(SKILLS).flatMap(([k, name]) => [
    a(`skills.${k}.total`, `${name} bonus`, 'Skills'),
    a(`skills.${k}.passive`, `Passive ${name}`, 'Skills'),
    a(`skills.${k}.value`, `${name} proficiency (0, 0.5, 1, 2)`, 'Skills', 'e'),
    a(`skills.${k}.bonuses.check`, `${name} check bonus`, 'Bonuses', 'e'),
  ]),

  a('attributes.ac.value', 'Armor class', 'Defense'),
  a('attributes.ac.flat', 'Base AC (flat / natural armor)', 'Defense', 'fe'),
  a('attributes.ac.bonus', 'AC bonus', 'Bonuses', 'e'),
  a('attributes.hp.value', 'Current hit points', 'Defense', 'fs'),
  a('attributes.hp.max', 'Max hit points', 'Defense', 'fe'),
  a('attributes.hp.temp', 'Temporary hit points', 'Defense', 'fes'),
  a('attributes.hp.tempmax', 'Max HP modifier', 'Defense', 'fe'),
  a('attributes.hp.bonuses.overall', 'Max HP bonus', 'Bonuses', 'e'),
  a('attributes.hp.dt', 'Damage threshold', 'Defense', 'fe'),
  a('traits.dr.value', 'Damage resistances', 'Defense', 'e'),
  a('traits.di.value', 'Damage immunities', 'Defense', 'e'),
  a('traits.dv.value', 'Damage vulnerabilities', 'Defense', 'e'),
  a('traits.ci.value', 'Condition immunities', 'Defense', 'e'),

  a('attributes.init.total', 'Initiative bonus', 'Movement & senses'),
  a('attributes.init.bonus', 'Initiative bonus (added)', 'Bonuses', 'e'),
  ...Object.entries(MOVES).map(([k, name]) => a(`attributes.movement.${k}`, `${name} speed`, 'Movement & senses', 'fe')),
  ...Object.entries(SENSES).map(([k, name]) => a(`attributes.senses.ranges.${k}`, `${name} range`, 'Movement & senses', 'fe')),

  a('attributes.spell.dc', 'Spell save DC', 'Spellcasting'),
  a('attributes.spell.mod', 'Spellcasting ability modifier', 'Spellcasting'),
  a('attributes.spell.attack', 'Spell attack bonus', 'Spellcasting'),
  a('attributes.spell.level', 'Spellcaster level', 'Spellcasting', 'fe'),
  a('bonuses.spell.dc', 'Spell save DC bonus', 'Bonuses', 'e'),
  ...Array.from({ length: 9 }, (_, i) => a(`spells.spell${i + 1}.value`, `Level ${i + 1} slots left`, 'Spellcasting', 'fs')),
  ...Array.from({ length: 9 }, (_, i) => a(`spells.spell${i + 1}.override`, `Level ${i + 1} slots (max override)`, 'Spellcasting', 'e')),
  a('spells.pact.value', 'Pact slots left', 'Spellcasting', 'fs'),

  a('resources.legact.value', 'Legendary actions left', 'Legendary', 'fs'),
  a('resources.legact.max', 'Legendary actions per round', 'Legendary', 'fe'),
  a('resources.legres.value', 'Legendary resistances left', 'Legendary', 'fs'),
  a('resources.legres.max', 'Legendary resistances per day', 'Legendary', 'fe'),

  ...Object.entries(ATTACKS).flatMap(([k, name]) => [
    a(`bonuses.${k}.attack`, `${name} attack bonus`, 'Bonuses', 'e'),
    a(`bonuses.${k}.damage`, `${name} damage bonus`, 'Bonuses', 'e'),
  ]),
  a('bonuses.abilities.check', 'All ability checks bonus', 'Bonuses', 'e'),
  a('bonuses.abilities.save', 'All saving throws bonus', 'Bonuses', 'e'),
  a('bonuses.abilities.skill', 'All skill checks bonus', 'Bonuses', 'e'),
]

export const ATTRIBUTE_GROUPS = [...new Set(ATTRIBUTE_CATALOG.map((e) => e.group))]

// What the picker shows for one kind of field, with the prefix that kind of
// field writes: "@" for formulas, "system." for effect keys, bare for spends.
export const ATTRIBUTE_USES = {
  formula: { flag: 'f', prefix: '@' },
  effect: { flag: 'e', prefix: 'system.' },
  spend: { flag: 's', prefix: '' },
}

export function attributeOptions(use) {
  const { flag, prefix } = ATTRIBUTE_USES[use]
  return ATTRIBUTE_CATALOG.filter((e) => e.use.includes(flag)).map((e) => ({ ...e, ref: prefix + e.path }))
}

// Case-insensitive match on label, path and group; every word must hit.
export function searchAttributes(options, query) {
  const words = String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return options
  return options.filter((o) => {
    const hay = `${o.label} ${o.path} ${o.group}`.toLowerCase()
    return words.every((w) => hay.includes(w))
  })
}
