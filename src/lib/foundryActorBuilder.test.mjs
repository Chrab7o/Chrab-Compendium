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
  activitySummary,
  averageFormula,
  buildNpcActor,
  changeFromFoundry,
  damagePart,
  emptyActivity,
  emptyChange,
  emptyEffect,
  emptyNpcItem,
  emptySpend,
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

test('draft flag is scoped to the Chrab Sync module id, so the module can find the actor again', () => {
  const moduleJson = JSON.parse(readFileSync(new URL('../../foundry/chrab-sync/module.json', import.meta.url), 'utf8'))
  const actor = buildNpcActor(krakenSpec(), { draftId: 'draft-123' })
  assert.equal(actor.flags[moduleJson.id]?.npcDraftId, 'draft-123')
  assert.deepEqual(buildNpcActor(krakenSpec()).flags, {})
})

// A monk-style NPC using the custom-activity features: a shared Focus pool,
// named rolls that spend from it, a reaction inside an Action item, a midi
// trigger, guided effect changes and an over-time poison.
function monkSpec() {
  const spec = { ...emptyNpcSpec(), name: 'Drunken Master', cr: 5, abilities: { str: 10, dex: 18, con: 14, int: 10, wis: 16, cha: 10 } }
  const focus = { ...emptyNpcItem('trait'), name: 'Focus', usesMax: '@prof', usesRecovery: 'sr', activities: [] }
  const stun = act('save', { name: 'Stun', saveAbility: 'con', dcAbility: 'wis', onSave: 'none', damage: [] })
  const strike = act('attack', {
    name: 'Strike',
    ability: 'dex',
    damage: [{ formula: '1d8 + @abilities.dex.mod', types: ['bludgeoning'] }],
    triggerKey: stun.key,
    triggerOnlyIf: 'hit',
  })
  const deflect = act('heal', { name: 'Deflect', activation: 'reaction', healing: '1d10 + @abilities.dex.mod' })
  const fist = {
    ...emptyNpcItem('action'),
    name: 'Stunning Fist',
    magical: true,
    activities: [strike, stun, deflect],
    effects: [{ ...emptyEffect(), name: 'Stunned', statuses: ['stunned'], specialDuration: ['turnStartSource'], appliedBy: [stun.key] }],
  }
  const launch = {
    ...emptyNpcItem('bonus'),
    name: 'Launch',
    activities: [1, 2].map((n) =>
      act('damage', {
        name: `${n * 10}ft Moved`,
        damage: [{ formula: `${n}d4`, types: ['bludgeoning'] }],
        spend: [{ ...emptySpend(), target: focus.key, amount: String(n) }],
      })
    ),
  }
  const venom = {
    ...emptyNpcItem('action'),
    name: 'Venom Dart',
    activities: [act('save', { saveAbility: 'con', dc: 13, damage: [] })],
    effects: [
      {
        ...emptyEffect(),
        name: 'Envenomed',
        changes: [
          {
            ...emptyChange('overTime'),
            overTime: { turn: 'end', saveAbility: 'con', saveDc: '', damage: '2d6 + @abilities.con.mod', damageType: 'poison', saveRemoves: true },
          },
        ],
      },
    ],
  }
  const iron = {
    ...emptyNpcItem('trait'),
    name: 'Iron Body',
    effects: [
      {
        ...emptyEffect(),
        passive: true,
        name: 'Iron Body',
        changes: [
          { ...emptyChange('ac'), value: '+2' },
          { ...emptyChange('resist'), value: 'poison' },
          { ...emptyChange('speed'), param: 'walk', type: 'upgrade', value: '40' },
          { ...emptyChange('advSave'), param: 'dex' },
          { ...emptyChange('custom'), path: 'system.attributes.hp.bonuses.level', type: 'add', value: '2' },
          { ...emptyChange('ac'), value: '' }, // blank rows are dropped
        ],
      },
    ],
  }
  spec.items = [focus, fist, launch, venom, iron]
  return spec
}

test('custom activities: names, per-activity activation, spending from a shared pool', () => {
  const spec = monkSpec()
  const built = buildNpcActor(spec)
  const focus = byName(built, 'Focus')
  assert.equal(focus.system.uses.max, '@prof')

  const launch = Object.values(byName(built, 'Launch').system.activities)
  assert.deepEqual(launch.map((a) => a.name), ['10ft Moved', '20ft Moved'])
  assert.deepEqual(launch[1].consumption.targets, [{ type: 'itemUses', target: focus._id, value: '2', scaling: {} }])
  assert.equal(launch[0].activation.type, 'bonus')

  const fist = Object.values(byName(built, 'Stunning Fist').system.activities)
  assert.equal(fist[0].activation.type, 'action')
  assert.equal(fist[2].activation.type, 'reaction')
  assert.equal(activitySummary(spec, spec.items[2].activities[1]), '20ft Moved (Costs 2 Focus). 5 (2d4) Bludgeoning damage.')
})

test('midi-qol: triggers, automation-only targets, magical damage', () => {
  const built = buildNpcActor(monkSpec())
  const fist = byName(built, 'Stunning Fist')
  const [strike, stun, deflect] = Object.values(fist.system.activities)
  assert.equal(strike.midiProperties.triggeredActivityId, stun._id)
  assert.equal(strike.midiProperties.triggeredActivityConditionText, 'workflow.hitTargets.size > 0')
  assert.equal(stun.midiProperties.automationOnly, true)
  assert.equal(strike.midiProperties.magicDamage, true)
  assert.equal(deflect.midiProperties.automationOnly, undefined)
  // Stunned lands from the Stun save only, not the Strike that triggers it.
  assert.deepEqual([strike, stun, deflect].map((a) => a.effects.length), [0, 1, 0])
  assert.equal(stun.effects[0].onSave, false)
  assert.deepEqual(fist.system.properties, ['mgc'])
  // Untouched items carry no midi block at all.
  assert.equal(Object.values(byName(built, 'Launch').system.activities)[0].midiProperties, undefined)
})

test('effect changes use the v14 system.changes shape', () => {
  const built = buildNpcActor(monkSpec())
  const [iron] = byName(built, 'Iron Body').effects
  assert.equal(iron.transfer, true)
  assert.deepEqual(iron.system.changes, [
    { key: 'system.attributes.ac.bonus', value: '+2', type: 'add', phase: 'initial' },
    { key: 'system.traits.dr.value', value: 'poison', type: 'add', phase: 'initial' },
    { key: 'system.attributes.movement.walk', value: '40', type: 'upgrade', phase: 'initial' },
    { key: 'flags.midi-qol.advantage.ability.save.dex', value: '1', type: 'custom', phase: 'initial' },
    { key: 'system.attributes.hp.bonuses.level', value: '2', type: 'add', phase: 'initial' },
  ])
  // Over time bakes this NPC's numbers in: DC from the item's save, +2 CON.
  const [venom] = byName(built, 'Venom Dart').effects
  assert.deepEqual(venom.system.changes, [
    {
      key: 'flags.midi-qol.OverTime',
      value: 'turn=end, label=Envenomed, saveAbility=con, saveDC=13, saveRemove=true, damageRoll=2d6+2, damageType=poison',
      type: 'override',
      phase: 'initial',
    },
  ])
})

test('custom features survive a round trip through npcActorToSpec', () => {
  const first = buildNpcActor(monkSpec())
  const again = buildNpcActor(npcActorToSpec(first))
  for (const name of ['Focus', 'Stunning Fist', 'Launch', 'Venom Dart', 'Iron Body']) {
    const a = byName(first, name)
    const b = byName(again, name)
    assert.deepEqual(b.system.activities, a.system.activities, name)
    assert.deepEqual(b.effects.map((e) => e.system.changes), a.effects.map((e) => e.system.changes), name)
    assert.deepEqual(b.system.properties, a.system.properties, name)
  }
})

test('changeFromFoundry maps shapes seen in the world onto the guided catalog', () => {
  // Shapes from the world's exports (Tough, Unarmored Defense, Plutonium midi flags).
  assert.equal(changeFromFoundry({ key: 'system.traits.dr.value', value: 'fire', type: 'add' }).id, 'resist')
  const sv = changeFromFoundry({ key: 'flags.midi-qol.superSaver.dex', value: '1', type: 'custom' })
  assert.deepEqual([sv.id, sv.param], ['superSaver', 'dex'])
  const ac = changeFromFoundry({ key: 'system.attributes.ac.calc', value: 'unarmoredMonk', type: 'override' })
  assert.deepEqual([ac.id, ac.path, ac.type, ac.value], ['custom', 'system.attributes.ac.calc', 'override', 'unarmoredMonk'])
  assert.equal(changeFromFoundry({ key: 'system.bonuses.mwak.attack', value: '+2', mode: 2 }).type, 'add') // pre-v14 mode
  const ot = changeFromFoundry({ key: 'flags.midi-qol.OverTime', value: 'turn=start, saveAbility=wis, saveDC=15, saveRemove=false', type: 'override' })
  assert.deepEqual(ot.overTime, { turn: 'start', saveAbility: 'wis', saveDc: '15', damage: '', damageType: '', saveRemoves: false })
})

test('averageFormula resolves dotted @references', () => {
  const data = { abilities: { str: { mod: 4 } }, prof: 3 }
  assert.equal(averageFormula('2d6 + @abilities.str.mod + @prof', data), 14)
  assert.equal(averageFormula('@nothing.here + 1', data), 1)
})
