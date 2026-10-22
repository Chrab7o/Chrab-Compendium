// Run with: npm test
//
// Spells: 5etools spell data -> editor spells -> dnd5e 5.3 spell items. The
// 5etools objects are trimmed copies of the real XPHB entries from the
// 5etools v2.36.1 release the bundled catalog is compiled from.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  activitySummary,
  buildNpcActor,
  emptyNpcSpec,
  normalizeFormula,
  npcActorToSpec,
  spellAttackBonus,
  spellSaveDc,
  spellcastingText,
} from './foundryActorBuilder.js'
import { fiveToolsSpellList, prepareFiveToolsSpell, spellRecordToNpcSpell } from './fiveToolsSpells.js'

const FIVE_TOOLS = {
  fireball: {
    name: 'Fireball',
    source: 'XPHB',
    page: 274,
    level: 3,
    school: 'V',
    time: [{ number: 1, unit: 'action' }],
    range: { type: 'point', distance: { type: 'feet', amount: 150 } },
    components: { v: true, s: true, m: 'a ball of bat guano and sulfur' },
    duration: [{ type: 'instant' }],
    entries: [
      'A bright streak flashes from you to a point you choose within range and then blossoms with a low roar into a fiery explosion. Each creature in a 20-foot-radius {@variantrule Sphere [Area of Effect]|XPHB|Sphere} centered on that point makes a Dexterity saving throw, taking {@damage 8d6} Fire damage on a failed save or half as much damage on a successful one.',
    ],
    entriesHigherLevel: [
      { type: 'entries', name: 'Using a Higher-Level Spell Slot', entries: ['The damage increases by {@scaledamage 8d6|3-9|1d6} for each spell slot level above 3.'] },
    ],
    damageInflict: ['fire'],
    savingThrow: ['dexterity'],
    areaTags: ['S'],
  },
  fireBolt: {
    name: 'Fire Bolt',
    source: 'XPHB',
    level: 0,
    school: 'V',
    time: [{ number: 1, unit: 'action' }],
    range: { type: 'point', distance: { type: 'feet', amount: 120 } },
    components: { v: true, s: true },
    duration: [{ type: 'instant' }],
    entries: ['Make a ranged spell attack against the target. On a hit, the target takes {@damage 1d10} Fire damage.'],
    damageInflict: ['fire'],
    spellAttack: ['R'],
  },
  cureWounds: {
    name: 'Cure Wounds',
    source: 'XPHB',
    level: 1,
    school: 'A',
    time: [{ number: 1, unit: 'action' }],
    range: { type: 'point', distance: { type: 'touch' } },
    components: { v: true, s: true },
    duration: [{ type: 'instant' }],
    entries: ['A creature you touch regains a number of {@variantrule Hit Points|XPHB} equal to {@dice 2d8} plus your spellcasting ability modifier.'],
    entriesHigherLevel: [
      { type: 'entries', name: 'Using a Higher-Level Spell Slot', entries: ['The healing increases by {@scaledice 2d8|1-9|2d8} for each spell slot level above 1.'] },
    ],
    miscTags: ['HL'],
  },
  holdPerson: {
    name: 'Hold Person',
    source: 'XPHB',
    level: 2,
    school: 'E',
    time: [{ number: 1, unit: 'action' }],
    range: { type: 'point', distance: { type: 'feet', amount: 60 } },
    components: { v: true, s: true, m: 'a straight piece of iron' },
    duration: [{ type: 'timed', duration: { type: 'minute', amount: 1 }, concentration: true }],
    entries: ['The target must succeed on a Wisdom saving throw or have the {@condition Paralyzed|XPHB} condition for the duration.'],
    conditionInflict: ['paralyzed'],
    savingThrow: ['wisdom'],
  },
}

// 5etools' own Foundry data for Hold Person (spells/foundry.json).
const HOLD_PERSON_FOUNDRY = {
  activities: [
    { type: 'save', activation: { type: 'action' }, damage: { onSave: 'half' }, save: { ability: ['wis'], dc: { calculation: 'spellcasting' } }, effects: [{ foundryId: 'holdPerson' }] },
  ],
  effects: [{ foundryId: 'holdPerson', name: 'Paralyzed', duration: { seconds: 60 }, statuses: ['paralyzed'] }],
}

function casterSpec() {
  const convert = (raw, opts) => spellRecordToNpcSpell(prepareFiveToolsSpell(raw, opts))
  const spells = [
    { ...convert(FIVE_TOOLS.fireBolt), method: 'atwill' },
    { ...convert(FIVE_TOOLS.fireball), method: 'perDay', usesPerDay: 1 },
    { ...convert(FIVE_TOOLS.holdPerson, { foundry: HOLD_PERSON_FOUNDRY }), method: 'perDay', usesPerDay: 2 },
    { ...convert(FIVE_TOOLS.cureWounds), method: 'perDay', usesPerDay: 2 },
  ]
  const base = emptyNpcSpec()
  // CR 5 (prof +3), WIS 18 (+4): spell save DC 15, +7 to hit.
  return { ...base, name: 'Cult Fanatic', cr: 5, abilities: { ...base.abilities, wis: 18 }, spellcasting: { ...base.spellcasting, ability: 'wis' }, spells }
}

test('5etools spells convert: text, area, damage, upcast, healing, 5etools Foundry data', () => {
  const fireball = prepareFiveToolsSpell(FIVE_TOOLS.fireball)
  assert.equal(fireball.school, 'evo')
  assert.equal(fireball.damage, '8d6')
  assert.equal(fireball.upcast, '1d6')
  assert.match(fireball.html, /^<p>A bright streak.*20-foot-radius Sphere.*taking 8d6 Fire damage/)
  const spell = spellRecordToNpcSpell(fireball)
  assert.deepEqual(spell.area, { type: 'sphere', size: '20' })
  assert.deepEqual(spell.range, { value: '150', units: 'ft' })
  const [save] = spell.activities
  assert.deepEqual([save.kind, save.saveAbility, save.dcAbility, save.onSave], ['save', 'dex', 'spellcasting', 'half'])
  assert.deepEqual(save.damage, [{ formula: '8d6', types: ['fire'] }])

  const cure = spellRecordToNpcSpell(prepareFiveToolsSpell(FIVE_TOOLS.cureWounds))
  assert.equal(cure.activities[0].healing, '2d8 + @mod')
  assert.equal(cure.upcast, '2d8')
  assert.deepEqual(cure.range, { value: '', units: 'touch' })

  const hold = spellRecordToNpcSpell(prepareFiveToolsSpell(FIVE_TOOLS.holdPerson, { foundry: HOLD_PERSON_FOUNDRY }))
  assert.equal(hold.concentration, true)
  assert.deepEqual(hold.duration, { value: '1', units: 'minute' })
  assert.deepEqual(hold.effects.map((e) => [e.name, e.statuses]), [['Paralyzed', ['paralyzed']]])

  assert.equal(fiveToolsSpellList({ spell: [FIVE_TOOLS.fireball, FIVE_TOOLS.fireBolt] }).length, 2)
  assert.equal(fiveToolsSpellList(FIVE_TOOLS.fireball).length, 1)
  assert.equal(fiveToolsSpellList({ monster: [] }).length, 0)
})

test('spell items: dnd5e 5.x shape, innate per-day uses, slots, upcasting', () => {
  const spec = casterSpec()
  const actor = buildNpcActor(spec)
  const spell = (name) => actor.items.find((i) => i.type === 'spell' && i.name === name)

  const fireball = spell('Fireball')
  assert.equal(fireball.system.level, 3)
  assert.equal(fireball.system.school, 'evo')
  assert.deepEqual(fireball.system.properties, ['vocal', 'somatic', 'material'])
  assert.equal(fireball.system.materials.value, 'a ball of bat guano and sulfur')
  assert.equal(fireball.system.method, 'innate')
  assert.equal(fireball.system.uses.max, '1')
  assert.deepEqual(fireball.system.uses.recovery, [{ period: 'day', type: 'recoverAll' }])
  assert.equal(fireball.system.target.template.type + fireball.system.target.template.size, 'sphere20')
  assert.equal(fireball.system.type, undefined) // no feat subtype on a spell
  const [boom] = Object.values(fireball.system.activities)
  assert.deepEqual(boom.save.dc, { calculation: 'spellcasting', formula: '' })
  assert.equal(boom.consumption.spellSlot, false)
  assert.deepEqual(boom.consumption.targets, [{ type: 'itemUses', target: '', value: '1', scaling: {} }])
  assert.deepEqual(boom.damage.parts[0].scaling, { mode: 'whole', number: 1 })
  assert.deepEqual(boom.range, { override: false })

  const [bolt] = Object.values(spell('Fire Bolt').system.activities)
  assert.equal(bolt.attack.ability, '') // dnd5e uses the spellcasting ability
  assert.equal(bolt.attack.type.classification, 'spell')
  assert.deepEqual(bolt.consumption.targets, []) // at will

  const [cure] = Object.values(spell('Cure Wounds').system.activities)
  assert.deepEqual([cure.healing.number, cure.healing.denomination, cure.healing.bonus], [2, 8, '@mod'])
  assert.deepEqual(cure.healing.scaling, { mode: 'whole', number: 1, formula: '2d8' })

  // Slots: prepared spells spend slots; the actor gets caster level + slot counts.
  const slotted = {
    ...spec,
    spellcasting: { ...spec.spellcasting, slots: true, casterLevel: 5, slotCounts: { 1: 4, 2: 3, 3: 2, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 } },
    spells: spec.spells.map((s) => ({ ...s, method: 'slots' })),
  }
  const slotActor = buildNpcActor(slotted)
  const slotFireball = slotActor.items.find((i) => i.name === 'Fireball')
  assert.equal(slotFireball.system.method, 'spell')
  assert.equal(Object.values(slotFireball.system.activities)[0].consumption.spellSlot, true)
  assert.deepEqual(slotActor.system.attributes.spell, { level: 5 })
  assert.deepEqual(slotActor.system.spells.spell3, { value: 2, override: 2 })
  assert.equal(slotActor.system.attributes.spellcasting, 'wis')
})

test('the Spellcasting entry reads like a 2024 statblock', () => {
  const spec = casterSpec()
  assert.equal(spellSaveDc(spec), 15)
  assert.equal(spellAttackBonus(spec), 7)
  assert.equal(
    spellcastingText(spec),
    [
      'Cult Fanatic casts one of the following spells, requiring no Material components, using Wisdom as the spellcasting ability (spell save DC 15, +7 to hit with spell attacks):',
      'At Will: Fire Bolt',
      '2/Day Each: Cure Wounds, Hold Person',
      '1/Day: Fireball',
    ].join('\n')
  )
  const entry = buildNpcActor(spec).items.find((i) => i.name === 'Spellcasting')
  assert.equal(entry.type, 'feat')
  assert.deepEqual(entry.system.activities, {})
  // Roll text inside a spell uses the spellcasting ability for @mod.
  assert.match(activitySummary(spec, spec.spells[3].activities[0], true), /Regains 13 \(2d8 \+ 4\) Hit Points/)
  assert.match(activitySummary(spec, spec.spells[0].activities[0], true), /Ranged Spell Attack Roll: \+7/)
})

test('spells survive a round trip through npcActorToSpec', () => {
  const first = buildNpcActor(casterSpec())
  const spec = npcActorToSpec(first)
  assert.equal(spec.spells.length, 4)
  assert.equal(spec.spellcasting.ability, 'wis')
  assert.ok(!spec.items.some((i) => i.name === 'Spellcasting')) // regenerated, not duplicated
  assert.deepEqual(spec.spells.map((s) => s.method), ['atwill', 'perDay', 'perDay', 'perDay'])
  const again = buildNpcActor(spec)
  for (const item of first.items) {
    const twin = again.items.find((i) => i._id === item._id)
    assert.ok(twin, item.name)
    assert.deepEqual(twin.system, item.system, item.name)
  }
})

test('a dice count already in brackets is left alone (Armor of Agathys)', () => {
  assert.equal(normalizeFormula('(5 * @item.level)d1[cold]'), '(5 * @item.level)d1[cold]')
  assert.equal(normalizeFormula('x + @a.b d6'), 'x + (@a.b)d6')
})
