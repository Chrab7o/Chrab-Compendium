import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptyActivity, emptyEffect } from './foundryActorBuilder.js'
import { emptyFlow, emptyLine, emptySection } from './automationFlow.js'
import { chainOf, flowEffectKeys, freeEffectName, landsFrom, looseEffects } from './forgeChain.js'

const roll = (kind, patch = {}) => ({ ...emptyActivity(kind), ...patch })
const effect = (patch = {}) => ({ ...emptyEffect(), ...patch })
const keys = (list) => list.map((a) => a.name)

test('choices: every roll the player picks; triggered, extra-damage and every-turn rolls go elsewhere', () => {
  const stun = roll('save', { name: 'Stun' })
  const extra = roll('damage', { name: 'Extra' })
  const hit = roll('attack', { name: 'Hit', triggerKey: stun.key, otherKey: extra.key })
  const dismiss = roll('utility', { name: 'Dismiss' })
  const tick = roll('utility', { name: 'Each turn', overTime: { turn: 'start', effectKey: '' } })
  const c = chainOf({ activities: [hit, stun, extra, dismiss, tick] })
  assert.deepEqual(keys(c.choices), ['Hit', 'Dismiss'])
  assert.deepEqual(keys(c.ticks), ['Each turn'])
  assert.equal(c.follows(hit), stun)
  assert.equal(c.extraFor(hit), extra)
  assert.equal(c.follows(dismiss), null)
})

test('a trigger loop still shows: the first roll of it becomes a choice', () => {
  const a = roll('attack', { name: 'A' })
  const b = roll('save', { name: 'B', triggerKey: a.key })
  a.triggerKey = b.key
  assert.deepEqual(keys(chainOf({ activities: [a, b] }).choices), ['A'])
  const self = roll('attack', { name: 'Self' })
  self.triggerKey = self.key
  assert.deepEqual(keys(chainOf({ activities: [self] }).choices), ['Self'])
})

test('landsFrom: effects for every roll or this roll, never always-on, stance, aura or automation-only ones', () => {
  const apply = roll('attack', { name: 'Apply' })
  const dismiss = roll('utility', { name: 'Dismiss' })
  const everyRoll = effect({ name: 'Every' })
  const onlyApply = effect({ name: 'Scar', appliedBy: [apply.key] })
  const item = {
    activities: [apply, dismiss],
    effects: [everyRoll, onlyApply, effect({ name: 'Ring', passive: true }), effect({ name: 'Aura', aura: true }), effect({ name: 'Flow', byRule: true })],
  }
  assert.deepEqual(keys(landsFrom(item, apply)), ['Every', 'Scar'])
  assert.deepEqual(keys(landsFrom(item, dismiss)), ['Every'])
  assert.deepEqual(landsFrom(item, roll('utility', { overTime: {} })), [])
})

test('looseEffects: grouped, and automation-only effects a line applies are left to that line', () => {
  const used = effect({ name: 'Used', byRule: true })
  const spare = effect({ name: 'Spare', byRule: true })
  const flow = { ...emptyFlow(), sections: [{ ...emptySection('done'), lines: [{ ...emptyLine('if'), then: [{ ...emptyLine('effect'), effectKey: used.key }] }] }] }
  const r = roll('attack', { flow })
  const item = {
    activities: [r],
    behavior: null,
    effects: [used, spare, effect({ name: 'Ring', passive: true }), effect({ name: 'Old stance', stance: true }), effect({ name: 'Gone', appliedBy: ['missing'] })],
  }
  assert.deepEqual([...flowEffectKeys(item)], [used.key])
  const g = looseEffects(item)
  assert.deepEqual(keys(g.byRule), ['Spare'])
  assert.deepEqual(keys(g.passive), ['Ring'])
  // A stance effect without a stance lands like any other.
  assert.deepEqual(keys(g.unapplied), ['Gone'])
  assert.deepEqual(keys(landsFrom(item, r)), ['Old stance'])
})

test('freeEffectName counts up past taken names', () => {
  const item = { name: 'Bleeding Scar', effects: [effect({ name: 'Bleeding Scar' }), effect({ name: 'Bleeding Scar (2)' })] }
  assert.equal(freeEffectName(item), 'Bleeding Scar (3)')
  assert.equal(freeEffectName(item, 'Lingering Scar'), 'Lingering Scar')
})
