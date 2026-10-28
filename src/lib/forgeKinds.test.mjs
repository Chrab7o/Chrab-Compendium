// Run with: npm test
//
// What the Item Forge offers per kind of thing (forgeKinds.js): the Start
// choices, and fitToKind() changing what an item has that its kind doesn't allow.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptyActivity, emptyEffect } from './foundryActorBuilder.js'
import { emptyBehavior, emptyBehaviorRule } from './foundryBehaviors.js'
import {
  FORGE_KINDS,
  allowedEffects,
  allowedLimits,
  canTickEachTurn,
  fitToKind,
  forgeKindOf,
  newForgeSpec,
  ruleEventFor,
  usageOf,
} from './forgeKinds.js'

const kind = (key) => FORGE_KINDS.find((k) => k.key === key)

test('each Start choice makes its kind, ready to use', () => {
  for (const k of FORGE_KINDS) assert.equal(forgeKindOf(newForgeSpec(k.key)), k.key)
  assert.equal(forgeKindOf(newForgeSpec('gear')), 'wondrous', 'old ?kind=gear links')
  const weapon = newForgeSpec('weapon')
  assert.equal(usageOf(weapon.item), 'action')
  assert.deepEqual(weapon.item.activities.map((a) => a.kind), ['attack'])
  const potion = newForgeSpec('consumable')
  assert.equal(usageOf(potion.item), 'action')
  assert.equal(potion.item.usesRecovery, 'none')
  assert.equal(usageOf(newForgeSpec('wondrous').item), 'passive')
  assert.equal(newForgeSpec('feat', { featType: 'monster' }).featType, 'monster')
  // A new one of each kind already fits it.
  for (const k of FORGE_KINDS) assert.deepEqual(fitToKind(newForgeSpec(k.key)).changes, [], k.key)
})

test('the table: what each kind allows', () => {
  assert.ok(!kind('armor').uses.includes('stance'))
  assert.ok(!kind('armor').rolls.includes('attack'))
  assert.ok(!kind('consumable').uses.includes('passive'))
  assert.deepEqual(kind('consumable').events, [])
  assert.deepEqual(kind('spell').events, [])
  assert.ok(kind('weapon').rolls.includes('attack'))
  for (const k of FORGE_KINDS.filter((k) => k.gear)) assert.ok(!k.limits.includes('recharge'), k.key)
  assert.ok(allowedLimits(newForgeSpec('feat', { featType: 'monster' })).includes('recharge'))
  assert.ok(!allowedLimits(newForgeSpec('feat')).includes('recharge'))
})

test('target effects need a roll that lands them; stance bonuses need a stance', () => {
  const spec = newForgeSpec('wondrous')
  assert.deepEqual(allowedEffects(spec, spec.item), ['self'])
  const withRoll = { ...spec.item, activities: [emptyActivity('save')] }
  assert.deepEqual(allowedEffects(spec, withRoll), ['condition', 'debuff', 'self'])
  // A repeat-each-turn tick lands nothing.
  const withTick = { ...spec.item, activities: [{ ...emptyActivity('utility'), overTime: { turn: 'start' } }] }
  assert.deepEqual(allowedEffects(spec, withTick), ['self'])
  const stance = { ...spec.item, behavior: emptyBehavior('toggle') }
  assert.ok(allowedEffects(spec, stance).includes('stance'))
})

test('"Something every turn" is offered on always-on and stance items that allow it', () => {
  const ring = newForgeSpec('wondrous')
  assert.ok(canTickEachTurn(ring, ring.item))
  assert.ok(!canTickEachTurn(ring, { ...ring.item, section: 'action' }))
  const potion = newForgeSpec('consumable')
  assert.ok(!canTickEachTurn(potion, potion.item))
  const feat = newForgeSpec('feat')
  assert.ok(canTickEachTurn(feat, { ...feat.item, behavior: emptyBehavior('toggle') }))
})

test('rule events follow the kind', () => {
  const armor = kind('armor').events
  assert.equal(ruleEventFor('healSelf', 'attackRoll', armor), 'hurt')
  assert.equal(ruleEventFor('bonusDamage', 'damage', armor), null, 'armor never adds damage to a hit')
  assert.equal(ruleEventFor('stayUp', 'downed', armor), 'downed')
  assert.equal(ruleEventFor('healSelf', 'hit', kind('weapon').events), 'hit')
})

test('fitToKind: an old item keeps its choices until it is made to fit', () => {
  // Armor saved as a stance, with a d6 recharge, an attack and a "when I hit" rule.
  const spec = newForgeSpec('armor')
  const hit = { ...emptyBehaviorRule('healSelf'), event: 'hit' }
  spec.item = {
    ...spec.item,
    usesRecovery: 'recharge',
    behavior: { ...emptyBehavior('toggle'), rules: [hit] },
    effects: [{ ...emptyEffect(), stance: true, name: 'Guard' }],
    activities: [emptyActivity('attack'), emptyActivity('save')],
  }
  const { spec: fitted, changes } = fitToKind(spec)
  assert.deepEqual(changes.map((c) => c.step), ['use', 'use', 'rolls', 'reactions'])
  assert.equal(usageOf(fitted.item), 'passive')
  assert.equal(fitted.item.behavior, null, 'its only rule was a hit rule')
  assert.equal(fitted.item.effects[0].stance, false)
  assert.equal(fitted.item.effects[0].passive, true, 'the stance bonus is always on instead')
  assert.equal(fitted.item.usesRecovery, 'lr')
  assert.deepEqual(fitted.item.activities.map((a) => a.kind), ['save'])
  assert.deepEqual(fitToKind(fitted).changes, [])
  // Spells aren't touched.
  assert.deepEqual(fitToKind(newForgeSpec('spell')).changes, [])
})

test('a wondrous item turned into a weapon becomes something you use', () => {
  const spec = newForgeSpec('wondrous')
  const weapon = fitToKind({ ...spec, gear: { ...spec.gear, type: 'weapon' } })
  assert.equal(usageOf(weapon.spec.item), 'action')
  assert.equal(weapon.changes.length, 1)
})
