// Run with: npm test
//
// One automation format (automation.js): behavior rules, flows and recipes
// read into parts and written back without losing anything.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { automationCounts, automationOf, automationProblems, automationSummary, withAutomation } from './automation.js'
import { AUTOMATION_TEMPLATES, buildFromTemplate } from './automationTemplates.js'
import { BLOCKS, buildFeatureFromBlocks } from './forgeBlocks.js'
import { emptyFlow, emptyLine, emptySection } from './automationFlow.js'
import { emptyActivity } from './foundryActorBuilder.js'
import { emptyBehavior, emptyBehaviorAction, emptyBehaviorRule } from './foundryBehaviors.js'
import { buildFeatureItem, emptyFeatureSpec, featureSpecFromRow } from './foundryFeatures.js'

const MINIMAL = { defenses: { resist: ['fire'] }, passiveBonus: { ac: '1' }, selfBuff: { ac: '1' }, reaction: { ac: '2' }, aura: { ac: '1' }, turnReminder: { text: 'Hi' }, summon: { crMax: '1' }, transform: { crMax: '1' }, saveOrSuffer: { condition: 'prone' }, condition: { name: 'Marked' } }
const plain = (v) => JSON.parse(JSON.stringify(v))
// Fields the round trip may drop: an explicit null flow or script means none.
const tidy = (spec) => {
  const s = plain(spec)
  for (const a of s.item?.activities ?? []) for (const f of ['flow', 'script']) if (a[f] == null) delete a[f]
  return s
}
const roundTrip = (spec) => ({ ...spec, item: withAutomation(spec.item, automationOf(spec.item)) })

function assertLossless(spec, label) {
  const back = roundTrip(spec)
  assert.deepEqual(tidy(back), tidy(spec), `${label}: the spec`)
  assert.deepEqual(plain(buildFeatureItem(back)), plain(buildFeatureItem(spec)), `${label}: the Foundry item`)
}

function featureWith(item) {
  const spec = emptyFeatureSpec('feat')
  spec.item = { ...spec.item, name: 'Test', ...item }
  return spec
}

test('every template and every block round-trips, spec and Foundry item', () => {
  for (const t of AUTOMATION_TEMPLATES) {
    const { spec, error } = buildFromTemplate(t, MINIMAL[t.key] ?? {})
    assert.equal(error, undefined, t.key)
    assertLossless(featureSpecFromRow(plain(spec)), `template ${t.key}`)
  }
  for (const block of BLOCKS) {
    const spec = buildFeatureFromBlocks({ blocks: [{ id: 'a', block: block.key, settings: MINIMAL[block.key] ?? {} }] })
    assertLossless(featureSpecFromRow(plain(spec)), `block ${block.key}`)
  }
})

test('behavior rules become owner-event parts, with their checks and cost on the part', () => {
  const rule = { ...emptyBehaviorRule('bonusDamage'), label: 'Necrotic Strike', event: 'damage', attackRange: 'melee', oncePerTurn: true, costPool: 'darkness', formula: '1d10', actions: [{ ...emptyBehaviorAction('message'), text: 'Hi' }] }
  const behavior = { ...emptyBehavior('toggle'), rules: [rule] }
  const spec = featureWith({ behavior })
  const auto = automationOf(spec.item)
  assert.equal(auto.version, 3)
  assert.equal(auto.behavior.mode, 'toggle')
  assert.equal(auto.behavior.rules, undefined)
  const [part] = auto.parts
  assert.deepEqual(part.on, { event: 'damage' })
  assert.equal(part.rule.attackRange, 'melee')
  assert.equal(part.rule.costPool, 'darkness')
  assert.deepEqual(part.lines.map((l) => l.type), ['outcome', 'action'])
  assert.equal(part.lines[0].outcome, 'bonusDamage')
  assert.equal(part.lines[0].formula, '1d10')
  assert.equal(part.rule.formula, undefined, 'outcome fields stay on the outcome line')
  assertLossless(spec, 'a stance with a rule')
  assert.deepEqual(automationCounts(auto), { events: 1, rolls: 0 })
})

test('flows become roll parts, one per section; the flow’s card settings stay with the roll', () => {
  const flow = { ...emptyFlow(), name: 'Reap', color: 'necrotic', sections: [{ ...emptySection('attack'), lines: [emptyLine('makeCrit')] }, { ...emptySection('done'), lines: [emptyLine('flavor')] }] }
  const roll = { ...emptyActivity('attack'), flow }
  const spec = featureWith({ activities: [roll] })
  const auto = automationOf(spec.item)
  assert.deepEqual(auto.parts.map((p) => p.on), [{ roll: roll.key, at: 'attack' }, { roll: roll.key, at: 'done' }])
  assert.equal(auto.rolls[roll.key].flow.name, 'Reap')
  assertLossless(spec, 'a flow')
})

test('an old (version 1) flow is upgraded to its script once, then round-trips', () => {
  const v1 = { ...emptyFlow(), version: 1, sections: undefined, blocks: [{ key: 'b1', trigger: 'damage', checks: [{ key: 'c1', type: 'hit' }], steps: [{ ...emptyLine('flavor'), text: 'Hit!' }], otherwise: [] }] }
  const spec = featureWith({ activities: [{ ...emptyActivity('attack'), damage: [{ formula: '1d8', types: ['necrotic'] }], flow: v1 }] })
  // The editor does the same upgrade when it opens one (toScript).
  const upgraded = roundTrip(spec)
  const flow = upgraded.item.activities[0].flow
  assert.equal(flow.version, 2)
  assert.equal(flow.blocks, undefined)
  assert.equal(flow.sections[0].trigger, 'damage')
  assert.equal(flow.sections[0].lines[0].type, 'if')
  assertLossless(upgraded, 'after the upgrade')
})

test('recipes become a roll part with one recipe line, at their pass', () => {
  const { spec } = buildFromTemplate(AUTOMATION_TEMPLATES.find((t) => t.key === 'teleport'), {})
  const auto = automationOf(spec.item)
  const part = auto.parts.find((p) => p.lines[0].type === 'recipe')
  assert.equal(part.lines[0].script.recipe, 'teleport')
  assert.ok(part.on.roll)
  assertLossless(featureSpecFromRow(plain(spec)), 'a recipe')
})

test('a roll with both a recipe and a flow keeps both', () => {
  const flow = { ...emptyFlow(), sections: [{ ...emptySection('done'), lines: [emptyLine('flavor')] }] }
  const roll = { ...emptyActivity('utility'), flow, script: { recipe: 'announce', pass: 'postActiveEffects', params: { text: 'Hi' }, code: '', edited: false } }
  assertLossless(featureWith({ activities: [roll] }), 'recipe and flow')
})

test('no automation: nothing added', () => {
  const spec = featureWith({ activities: [emptyActivity('attack')] })
  assert.deepEqual(automationOf(spec.item).parts, [])
  assertLossless(spec, 'plain')
})

test('the summary reads every part in words', () => {
  const rule = { ...emptyBehaviorRule('healSelf'), event: 'hit', formula: '1d10' }
  const flow = { ...emptyFlow(), sections: [{ ...emptySection('attack'), lines: [emptyLine('makeCrit')] }] }
  const item = { name: 'X', activities: [{ ...emptyActivity('attack'), name: 'Strike', flow }], behavior: { ...emptyBehavior('passive'), rules: [rule] } }
  const lines = automationSummary(automationOf(item), item)
  assert.equal(lines.length, 2)
  assert.match(lines[0], /^Strike, after the attack roll: /)
  assert.match(lines[1], /hit/i)
})

test('problems: a part on a missing roll, an outcome that doesn’t fit, an event part today’s runtime can’t run', () => {
  const item = { activities: [emptyActivity('attack')] }
  const auto = {
    version: 3,
    behavior: null,
    rolls: {},
    parts: [
      { key: 'p1', on: { roll: 'gone', at: 'done' }, lines: [emptyLine('flavor')] },
      { key: 'p2', on: { event: 'hit' }, rule: {}, lines: [{ key: 'o', type: 'outcome', outcome: 'stayUp', formula: '1' }] },
      { key: 'p3', on: { event: 'hit' }, rule: {}, lines: [emptyLine('flavor')] },
    ],
  }
  const problems = automationProblems(auto, item)
  assert.deepEqual(problems.map((p) => p.key), ['p1', 'p2', 'p3'])
  assert.throws(() => withAutomation(item, auto), /can’t run yet/)
})

test('rules written as parts from scratch get a behavior to run in', () => {
  const item = { activities: [] }
  const auto = { version: 3, behavior: null, rolls: {}, parts: [{ key: 'p', on: { event: 'hit' }, rule: { label: 'Heal' }, lines: [{ key: 'o', type: 'outcome', outcome: 'healSelf', formula: '1d6' }] }] }
  const out = withAutomation(item, auto)
  assert.equal(out.behavior.mode, 'passive')
  assert.equal(out.behavior.rules[0].formula, '1d6')
  assert.equal(out.behavior.rules[0].event, 'hit')
})

test('an item saved in the new format builds the same Foundry item as the old fields', () => {
  const rule = { ...emptyBehaviorRule('healSelf'), event: 'hit', formula: '1d10' }
  const flow = { ...emptyFlow(), sections: [{ ...emptySection('attack'), lines: [emptyLine('makeCrit')] }] }
  const old = featureWith({ activities: [{ ...emptyActivity('attack'), flow }], behavior: { ...emptyBehavior('passive'), rules: [rule] } })
  const { behavior: _b, ...rest } = old.item
  const stored = { ...old, item: { ...rest, activities: rest.activities.map(({ flow: _f, ...a }) => a), automation: automationOf(old.item) } }
  assert.deepEqual(plain(buildFeatureItem(stored)), plain(buildFeatureItem(old)))
})
