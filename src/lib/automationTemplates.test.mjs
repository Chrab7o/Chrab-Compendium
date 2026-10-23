// Run with: npm test
//
// Automation templates (automationTemplates.js), starting with Defenses -
// the Dark Knight's Tainted Soul (advantage on saves against being
// frightened), generalized to every condition and damage type.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptyActivity, emptySpend, saveAgainstCondition } from './foundryActorBuilder.js'
import { buildFeatureItem, emptyFeatureSpec, featureItemToSpec, mechanicsSummary } from './foundryFeatures.js'
import { AUTOMATION_TEMPLATES, buildFromTemplate, findTemplate, templateDefaults } from './automationTemplates.js'

const defenses = findTemplate('defenses')

function build(values) {
  const { spec, error } = buildFromTemplate(defenses, { ...templateDefaults(defenses), ...values })
  assert.equal(error, undefined)
  spec.item.name = 'Tainted Soul'
  return { spec, item: buildFeatureItem(spec) }
}

test('Tainted Soul: one always-on effect with advantage on saves against frightened', () => {
  const { item } = build({ saveAdvantage: ['frightened'] })
  assert.deepEqual(item.system.activities, {}, 'nothing to click: it is passive')
  assert.equal(item.effects.length, 1)
  const [effect] = item.effects
  assert.equal(effect.transfer, true)
  assert.equal(effect.name, 'Tainted Soul')
  assert.equal(effect.system.changes.length, 1)
  const [change] = effect.system.changes
  assert.equal(change.key, 'flags.midi-qol.advantage.ability.save.all')
  assert.equal(change.type, 'custom')
  assert.equal(change.value, saveAgainstCondition('frightened'))
})

// The condition midi evaluates, with the workflow that asked for the save.
const evaluate = (expr, workflow) => Function('workflow', `return (${expr})`)(workflow)
const fx = (statuses, name = 'Effect') => ({ statuses: new Set(statuses), name })
// Foundry Collections iterate their values, like a Map's values.
const collection = (...docs) => new Map(docs.map((d, i) => [i, d])).values()

test('the save condition: true only for saves against something that frightens', () => {
  const expr = saveAgainstCondition('frightened')
  // Wyrmling's Frightful Presence: a save activity whose effect has the status.
  assert.equal(evaluate(expr, { saveActivity: { effects: [{ _id: 'a', effect: fx(['frightened']) }] } }), true)
  // An over-time repeat save: rolled from the item, effect only named for it.
  assert.equal(evaluate(expr, { activity: { effects: [] }, item: { effects: [...collection(fx([], 'Frightened'))] } }), true)
  // Anything else: a poison save, a save with no effects, no workflow at all.
  assert.equal(evaluate(expr, { saveActivity: { effects: [{ effect: fx(['poisoned'], 'Poisoned') }] }, item: { effects: [] } }), false)
  assert.equal(evaluate(expr, { activity: {}, item: {} }), false)
  assert.equal(evaluate(expr, undefined), false)
})

test('every choice becomes its own change, and the whole lot reads back', () => {
  const { item } = build({ saveAdvantage: ['frightened', 'charmed'], conditionImmune: ['poisoned'], resist: ['necrotic'], immune: ['poison'], vulnerable: ['radiant'] })
  assert.deepEqual(
    item.effects[0].system.changes.map((c) => [c.key, c.key.startsWith('flags.midi-qol') ? 'expr' : c.value]),
    [
      ['flags.midi-qol.advantage.ability.save.all', 'expr'],
      ['flags.midi-qol.advantage.ability.save.all', 'expr'],
      ['system.traits.ci.value', 'poisoned'],
      ['system.traits.dr.value', 'necrotic'],
      ['system.traits.di.value', 'poison'],
      ['system.traits.dv.value', 'radiant'],
    ],
  )
  const back = featureItemToSpec(item).item.effects[0].changes.map((c) => [c.id, c.value])
  assert.deepEqual(back, [
    ['advSaveVs', 'frightened'],
    ['advSaveVs', 'charmed'],
    ['condImmune', 'poisoned'],
    ['resist', 'necrotic'],
    ['immune', 'poison'],
    ['vulnerable', 'radiant'],
  ])
})

test('plain "advantage on all saves" still reads back as itself', () => {
  const item = { type: 'feat', name: 'Lucky', system: { activities: {} }, effects: [{ _id: 'e1', name: 'Lucky', transfer: true, system: { changes: [{ key: 'flags.midi-qol.advantage.ability.save.all', value: '1', type: 'custom' }] } }], flags: {} }
  assert.deepEqual(featureItemToSpec(item).item.effects[0].changes.map((c) => [c.id, c.param]), [['advSave', 'all']])
})

test('a template with nothing chosen says so instead of building', () => {
  assert.deepEqual(buildFromTemplate(defenses, templateDefaults(defenses)), { error: 'Pick at least one condition or damage type.' })
})

// ---------------------------------------------------------------------------
// Resource pools (the Dark Knight's Darkness) and the features that spend them.

test('Darkness: a pool feature with a fixed identifier, sized by the class table', () => {
  const pool = findTemplate('resourcePool')
  const { spec } = buildFromTemplate(pool, templateDefaults(pool))
  spec.item.name = 'Dark Arts'
  const item = buildFeatureItem(spec)
  assert.equal(item.system.identifier, 'darkness', 'not "dark-arts": spenders name the pool, not the feature')
  assert.deepEqual(item.system.uses, { max: '@scale.the-dark-knight.darkness-points', spent: 0, recovery: [{ period: 'lr', type: 'recoverAll' }] })
  assert.deepEqual(item.system.activities, {})
  assert.equal(featureItemToSpec(item).item.identifier, 'darkness', 'reads back')
  assert.match(mechanicsSummary(spec), /pool “darkness”/)
  assert.deepEqual(buildFromTemplate(pool, { ...templateDefaults(pool), identifier: ' ' }), { error: 'Give the pool an identifier, e.g. darkness.' })
})

function spender(activity) {
  const spec = emptyFeatureSpec('feat')
  spec.item = { ...spec.item, name: 'Restore Vitality', activities: [{ ...emptyActivity('heal'), ...activity }] }
  return buildFeatureItem(spec)
}

test('Restore Vitality: spends 3 Darkness by identifier, more for +1d8 each', () => {
  const item = spender({ healing: '2d8 + @abilities.con.mod', spend: [{ ...emptySpend(), source: 'pool', target: 'Darkness', amount: '3', extra: true }] })
  const [act] = Object.values(item.system.activities)
  assert.deepEqual(act.consumption.targets, [{ type: 'itemUses', target: 'darkness', value: '3', scaling: { mode: 'amount', formula: '1' } }])
  assert.equal(act.consumption.scaling.allowed, true)
  assert.deepEqual(act.healing.scaling, { mode: 'whole', number: 1 }, 'each extra point: +1d8')
  const back = featureItemToSpec(item).item.activities[0].spend
  assert.deepEqual(back.map((s) => [s.source, s.target, s.amount, s.extra]), [['pool', 'darkness', '3', true]])
})

test('a fixed cost stays fixed, and a custom damage formula grows by its first die', () => {
  const fixed = Object.values(spender({ healing: '2d8', spend: [{ ...emptySpend(), source: 'pool', target: 'darkness', amount: '2' }] }).system.activities)[0]
  assert.equal(fixed.consumption.scaling.allowed, false)
  assert.deepEqual(fixed.consumption.targets[0].scaling, {})
  assert.notEqual(fixed.healing.scaling.mode, 'whole')

  const spec = emptyFeatureSpec('feat')
  spec.item = {
    ...spec.item,
    name: 'Grasp of Shadows',
    activities: [{ ...emptyActivity('save'), damage: [{ formula: '3d10 + 1d4', types: ['necrotic'] }], spend: [{ ...emptySpend(), source: 'pool', target: 'darkness', amount: '5', extra: true }] }],
  }
  const [grasp] = Object.values(buildFeatureItem(spec).system.activities)
  assert.deepEqual(grasp.damage.parts[0].scaling, { mode: 'whole', number: 1, formula: '1d10' })
})

test('an NPC’s spend of another of its own items still reads back as that item', () => {
  const item = { type: 'feat', name: 'Flurry', system: { activities: { a: { _id: 'aaaaaaaaaaaaaaaa', type: 'utility', consumption: { targets: [{ type: 'itemUses', target: 'Ab3dEf6hIj9kLm2n', value: '1' }] } } } }, effects: [], flags: {} }
  assert.deepEqual(featureItemToSpec(item).item.activities[0].spend.map((s) => [s.source, s.target]), [['item', 'Ab3dEf6hIj9kLm2n']])
})

test('templates are types first, finished features as examples', () => {
  assert.equal(AUTOMATION_TEMPLATES[0].kind, 'type')
  const example = findTemplate('deathStance')
  assert.equal(example.kind, 'example')
  assert.equal(buildFromTemplate(example).spec.item.name, 'Death Stance')
  for (const t of AUTOMATION_TEMPLATES) for (const p of t.params) assert.ok(p.key && p.label && p.kind, `${t.key} params are complete`)
})
