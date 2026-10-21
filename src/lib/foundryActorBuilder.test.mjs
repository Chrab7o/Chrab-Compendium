// Run with: npm test   (node --test, no extra dependencies)
//
// The fixture is a real export of the Plutonium-imported MM'25 Kraken from the
// eclipse-of-the-burning-sun world (Foundry 14.368, dnd5e 5.3.3). The builder
// should produce the same game-relevant data from a hand-written spec, and
// survive a round trip through npcActorToSpec (the "make a variant" path).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  averageFormula,
  buildNpcActor,
  damagePart,
  emptyActivity,
  emptyNpcItem,
  emptyNpcSpec,
  npcActorToSpec,
  proficiencyForCr,
} from './foundryActorBuilder.js'

const kraken = JSON.parse(readFileSync(new URL('./__fixtures__/kraken.actor.json', import.meta.url), 'utf8'))

function item(overrides, activities) {
  return { ...emptyNpcItem(overrides.section), ...overrides, activities }
}

function act(kind, overrides) {
  return { ...emptyActivity(kind), ...overrides }
}

function krakenSpec() {
  return {
    ...emptyNpcSpec(),
    name: 'Kraken',
    cr: 23,
    size: 'grg',
    creatureType: 'monstrosity',
    subtype: 'Titan',
    alignment: 'Chaotic Evil',
    abilities: { str: 30, dex: 11, con: 26, int: 22, wis: 18, cha: 20 },
    saves: ['str', 'dex', 'con', 'wis'],
    skills: { his: 1, prc: 1 },
    ac: 18,
    hpFormula: '26d20 + 208',
    initiative: 14,
    speed: { walk: 30, swim: 120, fly: null, climb: null, burrow: null, hover: false },
    senses: { truesight: 120, darkvision: null, blindsight: null, tremorsense: null, special: '' },
    immunities: ['cold', 'lightning'],
    conditionImmunities: ['frightened', 'grappled', 'paralyzed', 'restrained'],
    languages: ['Celestial', 'Infernal', 'Abyssal', 'Primordial'],
    legendaryActions: 3,
    legendaryResistances: 4,
    items: [
      item({ name: 'Amphibious', section: 'trait' }, []),
      item({ name: 'Tentacle', section: 'action', itemType: 'weapon', effects: [{ key: '', name: 'Tentacle', statuses: ['grappled', 'restrained'] }] }, [
        act('attack', { ability: 'str', reach: 30, damage: [{ formula: '4d6 + @mod', types: ['bludgeoning'] }] }),
      ]),
      item({ name: 'Lightning Strike', section: 'action' }, [
        act('save', { saveAbility: 'dex', dc: 23, targetCount: 1, damage: [{ formula: '6d10', types: ['lightning'] }] }),
      ]),
      item({ name: 'Storm Bolt', section: 'legendary', legendaryCost: 1 }, [act('utility', {})]),
      item({ name: 'Toxic Ink', section: 'legendary', effects: [{ key: '', name: 'Toxic Ink', statuses: ['blinded', 'poisoned'], specialDuration: ['turnStart'] }] }, [
        act('save', { saveAbility: 'con', dc: 23, areaType: 'radius', areaSize: 15, onSave: 'none', damage: [] }),
      ]),
    ],
  }
}

function byName(actor, name) {
  return actor.items.find((i) => i.name === name)
}

function onlyActivity(i) {
  return Object.values(i.system.activities)[0]
}

// The game-relevant comparison against the real export, shared by both tests.
function assertMatchesKraken(built) {
  const s = built.system
  const k = kraken.system
  for (const a of ['str', 'dex', 'con', 'int', 'wis', 'cha']) {
    assert.equal(s.abilities[a].value, k.abilities[a].value, `${a} score`)
    assert.equal(s.abilities[a].proficient, k.abilities[a].proficient, `${a} save proficiency`)
  }
  assert.equal(s.skills.his.value, 1)
  assert.equal(s.skills.prc.value, 1)
  assert.equal(s.attributes.hp.max, k.attributes.hp.max)
  assert.equal(s.attributes.init.bonus, k.attributes.init.bonus)
  assert.equal(s.attributes.movement.walk, k.attributes.movement.walk)
  assert.equal(s.attributes.movement.swim, k.attributes.movement.swim)
  assert.equal(s.attributes.senses.ranges.truesight, 120)
  assert.equal(s.details.cr, k.details.cr)
  assert.equal(s.traits.size, k.traits.size)
  assert.deepEqual([...s.traits.di.value].sort(), [...k.traits.di.value].sort())
  assert.deepEqual([...s.traits.ci.value].sort(), [...k.traits.ci.value].sort())
  assert.deepEqual([...s.traits.languages.value].sort(), [...k.traits.languages.value].sort())
  assert.equal(s.resources.legact.max, k.resources.legact.max)
  assert.equal(s.resources.legres.max, k.resources.legres.max)

  const t = built.prototypeToken
  assert.equal(t.width, kraken.prototypeToken.width)
  assert.equal(t.height, kraken.prototypeToken.height)
  assert.equal(t.disposition, kraken.prototypeToken.disposition)
  assert.equal(t.actorLink, false)
  assert.deepEqual(t.detectionModes.seeAll, { range: 120, enabled: true })

  // GM-only, always
  assert.deepEqual(built.ownership, { default: 0 })
  for (const i of built.items) assert.deepEqual(i.ownership, { default: 0 }, `${i.name} ownership`)

  const tentacle = onlyActivity(byName(built, 'Tentacle'))
  const kTentacle = onlyActivity(byName(kraken, 'Tentacle'))
  assert.equal(byName(built, 'Tentacle').type, 'weapon')
  assert.equal(tentacle.type, 'attack')
  assert.equal(tentacle.attack.ability, kTentacle.attack.ability)
  assert.equal(tentacle.attack.type.value, 'melee')
  assert.equal(byName(built, 'Tentacle').system.range.value, 30)
  const part = tentacle.damage.parts[0]
  const kPart = kTentacle.damage.parts[0]
  assert.deepEqual([part.number, part.denomination, part.bonus, part.types], [kPart.number, kPart.denomination, kPart.bonus, kPart.types])
  const tentacleEffect = byName(built, 'Tentacle').effects[0]
  assert.deepEqual(tentacleEffect.statuses, ['grappled', 'restrained'])
  assert.deepEqual(tentacle.effects, [{ _id: tentacleEffect._id, level: {} }])

  const strike = onlyActivity(byName(built, 'Lightning Strike'))
  const kStrike = onlyActivity(byName(kraken, 'Lightning Strike'))
  assert.equal(strike.type, 'save')
  assert.deepEqual(strike.save, kStrike.save)
  assert.equal(strike.damage.onSave, 'half')
  assert.deepEqual(
    [strike.damage.parts[0].number, strike.damage.parts[0].denomination, strike.damage.parts[0].types],
    [6, 10, ['lightning']]
  )

  for (const name of ['Storm Bolt', 'Toxic Ink']) {
    const a = onlyActivity(byName(built, name))
    const ka = onlyActivity(byName(kraken, name))
    assert.equal(a.activation.type, 'legendary', `${name} activation`)
    assert.deepEqual(a.consumption.targets, ka.consumption.targets, `${name} legendary cost`)
  }
  const ink = onlyActivity(byName(built, 'Toxic Ink'))
  assert.equal(ink.target.template.type, 'radius')
  assert.equal(ink.target.template.size, '15')
  assert.deepEqual(byName(built, 'Toxic Ink').effects[0].flags.dae.specialDuration, ['turnStart'])

  const lr = onlyActivity(byName(built, 'Legendary Resistance'))
  const klr = onlyActivity(byName(kraken, 'Legendary Resistance'))
  assert.equal(lr.activation.type, 'special')
  assert.deepEqual(lr.consumption.targets, klr.consumption.targets)

  // Every id Foundry will see must be a valid 16-char document id.
  for (const i of built.items) {
    assert.match(i._id, /^[A-Za-z0-9]{16}$/)
    for (const a of Object.values(i.system.activities)) assert.match(a._id, /^[A-Za-z0-9]{16}$/)
    for (const e of i.effects) assert.match(e._id, /^[A-Za-z0-9]{16}$/)
  }
}

test('hand-written Kraken spec builds an actor matching the Plutonium export', () => {
  assertMatchesKraken(buildNpcActor(krakenSpec()))
})

test('Kraken export survives a round trip through npcActorToSpec', () => {
  const spec = npcActorToSpec(kraken)
  assert.equal(spec.ac, 18) // custom formula "@attributes.ac.armor + @attributes.ac.dex +8" resolved
  assert.equal(spec.initiative, 14)
  const built = buildNpcActor(spec)
  assertMatchesKraken(built)
  // ids carried over from the source actor, so a re-export updates in place
  assert.equal(byName(built, 'Tentacle')._id, byName(kraken, 'Tentacle')._id)
})

test('re-building the same spec keeps document ids stable', () => {
  const spec = krakenSpec()
  const a = buildNpcActor(spec)
  const b = buildNpcActor(spec)
  assert.equal(byName(a, 'Tentacle')._id, byName(b, 'Tentacle')._id)
  assert.deepEqual(Object.keys(byName(a, 'Tentacle').system.activities), Object.keys(byName(b, 'Tentacle').system.activities))
})

test('averageFormula', () => {
  assert.equal(averageFormula('26d20 + 208'), 481)
  assert.equal(averageFormula('4d6 + @mod', { mod: 10 }), 24)
  assert.equal(averageFormula('2d8 + 1d6 - 1'), 11)
  assert.equal(averageFormula(''), 0)
})

test('damagePart', () => {
  assert.deepEqual(
    [damagePart({ formula: '4d6 + @mod', types: ['bludgeoning'] })].map((p) => [p.number, p.denomination, p.bonus]),
    [[4, 6, '@mod']]
  )
  assert.equal(damagePart({ formula: '1d8 - 1', types: [] }).bonus, '-1')
  const custom = damagePart({ formula: '2d8 + 1d6', types: ['fire'] })
  assert.deepEqual(custom.custom, { enabled: true, formula: '2d8 + 1d6' })
  assert.equal(damagePart({ formula: '7', types: [] }).bonus, '7')
})

test('proficiencyForCr follows the DMG table', () => {
  const expected = { 0: 2, 4: 2, 5: 3, 8: 3, 9: 4, 12: 4, 13: 5, 17: 6, 21: 7, 23: 7, 25: 8, 29: 9, 30: 9 }
  for (const [cr, prof] of Object.entries(expected)) assert.equal(proficiencyForCr(Number(cr)), prof, `CR ${cr}`)
})
