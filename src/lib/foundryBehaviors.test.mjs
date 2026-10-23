// Run with: npm test
//
// Feature behaviors (foundryBehaviors.js) and the Feature Forge item builder
// (foundryFeatures.js). Besides the exported shapes, the generated hook macro
// is run here against stand-ins for the Foundry / dnd5e / midi-qol globals it
// touches, so the Death Stance rules are exercised end to end without a
// Foundry server. The real-world check is the sandbox's probes/death-stance.md.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildNpcActor, emptyChange, emptyEffect, emptyNpcItem, emptyNpcSpec, npcActorToSpec } from './foundryActorBuilder.js'
import { emptyCondition } from './foundryAutomation.js'
import {
  behaviorChanges,
  behaviorMacro,
  behaviorPasses,
  behaviorSummary,
  deathStanceBehavior,
  emptyBehavior,
  emptyBehaviorRule,
  ruleSummary,
} from './foundryBehaviors.js'
import { FEATURE_TEMPLATES, buildFeatureItem, emptyFeatureSpec, featureItemToSpec } from './foundryFeatures.js'

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor

function deathStanceSpec() {
  return FEATURE_TEMPLATES.find((t) => t.key === 'deathStance').build()
}

// ---------------------------------------------------------------------------
// Shapes

test('Death Stance builds as a toggle: hook first, stance effect, hooks on it', () => {
  const spec = deathStanceSpec()
  const item = buildFeatureItem(spec, { draftId: 'draft-1' })
  const behavior = spec.item.behavior

  assert.equal(item.type, 'feat')
  assert.deepEqual(item.system.type, { value: 'class', subtype: '' })
  assert.equal(item.flags['chrab-sync'].featureDraftId, 'draft-1')
  assert.equal(item.flags['chrab-sync'].behavior.key, behavior.key)

  // The hook is the first (and here only) activity, and it's the toggle.
  const acts = Object.values(item.system.activities)
  assert.equal(acts.length, 1)
  const hook = acts[0]
  assert.equal(Object.keys(item.system.activities)[0], behavior.key)
  assert.equal(hook._id, behavior.key)
  assert.equal(hook.type, 'utility')
  assert.equal(hook.name, 'Toggle')
  assert.equal(hook.activation.type, 'bonus')
  assert.equal(hook.target.affects.type, 'self')
  assert.equal(hook.midiProperties?.automationOnly, undefined, 'a toggle must stay usable')
  assert.match(hook.macroData.command, /const SETUP = /)
  assert.equal(item.flags['midi-qol'].onUseMacroName, `[postActiveEffects]ActivityMacro-${behavior.key}`)

  // One stance effect: not applied by any activity, icon always shown, and
  // carrying one onUseMacroName hook per pass the rules need.
  assert.equal(item.effects.length, 1)
  const stance = item.effects[0]
  assert.equal(stance.transfer, false)
  assert.equal(stance.showIcon, 2)
  assert.equal(stance.flags['chrab-sync'].stance, true)
  assert.deepEqual(hook.effects, [])
  assert.deepEqual(
    stance.system.changes.map((c) => [c.key, c.value, c.type]),
    [
      ['flags.midi-qol.onUseMacroName', 'ActivityMacro, postAttackRoll', 'custom'],
      ['flags.midi-qol.onUseMacroName', 'ActivityMacro, damageBonus', 'custom'],
    ],
  )
  assert.match(item.system.description.value, /As a bonus action, you can enter or leave Death Stance/)
  assert.match(item.system.description.value, /roll a 19 or 20 on the d20, you regain 1d10 \+ your Constitution modifier hit points/)
  assert.match(item.system.description.value, /extra 1d10 necrotic damage, and you take the same amount of damage/)
})

test('the generated macro is valid JavaScript for an async macro body', () => {
  const spec = deathStanceSpec()
  const command = buildFeatureItem(spec).system.activities[spec.item.behavior.key].macroData.command
  assert.doesNotThrow(() => new AsyncFunction('workflow', 'args', 'actor', 'token', 'rolledItem', 'rolledActivity', 'macroItem', command))
  assert.notEqual(deathStanceSpec().item.behavior.key, spec.item.behavior.key, 'each template use gets its own hook id')
})

test('a user stance effect is used (and kept) instead of a generated one', () => {
  const spec = deathStanceSpec()
  const shield = { ...emptyEffect(), name: 'Death Stance', stance: true, changes: [{ ...emptyChange('ac'), value: '1' }] }
  spec.item.effects = [shield]
  const item = buildFeatureItem(spec)
  assert.equal(item.effects.length, 1)
  assert.equal(item.effects[0]._id, shield.key)
  assert.equal(item.effects[0].flags['chrab-sync'].stance, true)
  assert.equal(item.effects[0].system.changes[0].key, 'system.attributes.ac.bonus')
  assert.equal(item.effects[0].system.changes.length, 3)
})

test('a passive behavior hooks through a transfer effect and hides its activity', () => {
  const rule = { ...emptyBehaviorRule('bonusDamage'), event: 'damage', attackRange: 'any', formula: '1d4', damageType: 'fire' }
  const npcItem = { ...emptyNpcItem('trait'), name: 'Burning Blood', behavior: { ...emptyBehavior('passive'), rules: [rule] } }
  const actor = buildNpcActor({ ...emptyNpcSpec(), name: 'Imp', items: [npcItem] })
  const item = actor.items[0]
  const hook = Object.values(item.system.activities)[0]
  assert.equal(hook.midiProperties.automationOnly, true)
  assert.equal(hook.activation.type, 'special')
  assert.equal(item.flags['midi-qol'], undefined, 'nothing to toggle, so no item-level macro')
  const carrier = item.effects.find((e) => e.flags['chrab-sync']?.synthetic)
  assert.equal(carrier.transfer, true)
  assert.deepEqual(carrier.system.changes.map((c) => c.value), ['ActivityMacro, damageBonus'])
})

test('a passive behavior with no rules builds nothing', () => {
  const item = buildNpcActor({ ...emptyNpcSpec(), items: [{ ...emptyNpcItem('trait'), name: 'Plain', behavior: emptyBehavior('passive') }] }).items[0]
  assert.deepEqual(item.system.activities, {})
  assert.deepEqual(item.effects, [])
})

test('rules only hook the passes they need; bonus damage only fits the damage event', () => {
  const heal = { ...emptyBehaviorRule('healSelf'), event: 'dealt' }
  const misplaced = { ...emptyBehaviorRule('bonusDamage'), event: 'hit' }
  const b = { ...emptyBehavior('toggle'), rules: [heal, misplaced] }
  assert.deepEqual(behaviorPasses(b), ['postActiveEffects'])
  assert.equal(behaviorChanges(b).length, 1)
  assert.doesNotMatch(behaviorSummary(b, 'X'), /extra/)
  assert.equal(ruleSummary({ ...emptyBehaviorRule('tempHpSelf'), event: 'hit', attackSource: 'spell', formula: '@prof' }), 'When you hit with a spell attack, you gain your proficiency bonus temporary hit points.')
})

test('behaviors survive a round trip through a Foundry export', () => {
  const spec = deathStanceSpec()
  spec.item.effects = [{ ...emptyEffect(), name: 'Death Stance', stance: true }]
  const back = featureItemToSpec(buildFeatureItem(spec))
  assert.deepEqual(back.item.behavior, spec.item.behavior)
  assert.deepEqual(back.item.activities, [], 'the hook activity is rebuilt, not read back')
  assert.equal(back.item.effects.length, 1)
  assert.equal(back.item.effects[0].stance, true)
  assert.deepEqual(back.item.effects[0].changes, [], 'hook changes are rebuilt, not read back')
  // and through an NPC actor
  const npc = { ...emptyNpcSpec(), name: 'Knight', items: [{ ...spec.item, section: 'bonus' }] }
  const again = npcActorToSpec(buildNpcActor(npc))
  assert.deepEqual(again.items[0].behavior, spec.item.behavior)
  assert.equal(again.items[0].activities.length, 0)
})

test('standalone spells are prepared-slot spells with the owner’s numbers', () => {
  const spec = emptyFeatureSpec('spell')
  spec.spell = { ...spec.spell, name: 'Grave Bolt', level: 2, description: '' }
  const item = buildFeatureItem(spec, { draftId: 'd2' })
  assert.equal(item.type, 'spell')
  assert.equal(item.system.method, 'spell')
  assert.equal(item.system.prepared, 0)
  assert.equal(item.system.description.value, '')
  const save = Object.values(item.system.activities)[0]
  assert.equal(save.save.dc.calculation, 'spellcasting')
  assert.equal(featureItemToSpec(item).spell.name, 'Grave Bolt')
})

// ---------------------------------------------------------------------------
// Running the hook macro against stand-ins for Foundry, dnd5e and midi-qol.

// Dice roll their average rounded up (1d10 -> 6), doubled on a critical.
class FakeDamageRoll {
  constructor(formula, data = {}, options = {}) {
    Object.assign(this, { formula, data, options })
  }
  async evaluate() {
    const crit = this.options.isCritical ? 2 : 1
    const expr = this.formula
      .replace(/@([\w.]+)/g, (_, path) => String(path.split('.').reduce((o, k) => o?.[k], this.data) ?? 0))
      .replace(/(\d+)d(\d+)/g, (_, n, d) => `(${Number(n) * crit}*${Math.ceil((Number(d) + 1) / 2)})`)
    this.total = Function(`return (${expr})`)()
    return this
  }
  async toMessage(data) {
    world.messages.push({ roll: this, ...data })
  }
}

let world

function setup({ confirm = true, combat = null } = {}) {
  world = { messages: [], dialogs: 0, damage: [], tempHp: [], created: [], deleted: [], tokenUpdates: [], itemUpdates: [] }
  globalThis.foundry = {
    utils: {
      escapeHTML: (s) => String(s),
      mergeObject: (a, b) => ({ ...a, ...b }),
      deepClone: (o) => structuredClone(o),
    },
    applications: {
      api: {
        DialogV2: {
          confirm: async () => {
            world.dialogs++
            return confirm
          },
        },
      },
    },
  }
  globalThis.ChatMessage = { getSpeaker: () => ({ alias: 'Bhern' }), implementation: { create: async (d) => world.messages.push(d) } }
  globalThis.CONFIG = { Dice: { DamageRoll: FakeDamageRoll } }
  globalThis.ui = { notifications: { warn: (m) => world.messages.push({ warn: m }) } }
  globalThis.game = { combat }
  delete globalThis.Sequencer
  delete globalThis.Sequence
}

function makeFeature(spec) {
  const built = buildFeatureItem(spec)
  const tokenDoc = {
    light: { toObject: () => ({ dim: 0, bright: 0, color: null }) },
    _source: { light: {} },
    flags: {},
    async update(data) {
      world.tokenUpdates.push(data)
      const backup = Object.entries(data).find(([k]) => k.startsWith('flags.chrab-sync.light.') && !k.includes('-='))
      if (backup) this.flags = { 'chrab-sync': { light: { [feature.id]: backup[1] } } }
      if (Object.keys(data).some((k) => k.includes('.-='))) this.flags = {}
    },
  }
  const actor = {
    name: 'Bhern',
    effects: [],
    getActiveTokens: () => [{ document: tokenDoc }],
    getRollData: () => ({ abilities: { con: { mod: 3 } } }),
    async applyDamage(damages, options) {
      world.damage.push({ damages, options })
    },
    async applyTempHP(n) {
      world.tempHp.push(n)
    },
    async createEmbeddedDocuments(type, data) {
      const docs = data.map((d, i) => ({ ...d, id: `fx${i}` }))
      world.created.push(...docs)
      this.effects.push(...docs)
      return docs
    },
    async deleteEmbeddedDocuments(type, ids) {
      world.deleted.push(...ids)
      this.effects = this.effects.filter((e) => !ids.includes(e.id))
    },
  }
  const feature = {
    id: built._id,
    uuid: `Actor.bhern.Item.${built._id}`,
    name: built.name,
    system: { uses: { max: '', spent: 0 } },
    flags: {},
    effects: built.effects.map((e) => ({ ...e, toObject: () => structuredClone(e) })),
    getRollData: () => actor.getRollData(),
    async update(data) {
      world.itemUpdates.push(data)
    },
  }
  const command = Object.values(built.system.activities)[0].macroData.command
  return { built, actor, feature, tokenDoc, run: new AsyncFunction('workflow', 'args', 'actor', 'token', 'rolledItem', 'rolledActivity', 'macroItem', command) }
}

const sword = { uuid: 'Actor.bhern.Item.sword', name: 'Longsword' }
const meleeAttack = { type: 'attack', attack: { type: { value: 'melee', classification: 'weapon' } } }
const rangedAttack = { type: 'attack', attack: { type: { value: 'ranged', classification: 'weapon' } } }
const setOf = (...xs) => Object.assign(new Set(xs), { first: () => xs[0] })

function attackWorkflow({ natural = 10, hit = true, crit = false } = {}) {
  return { diceRoll: natural, isCritical: crit, hitTargets: hit ? setOf({ name: 'Goblin' }) : setOf(), targets: setOf({ name: 'Goblin' }), damageList: [] }
}

async function use(f, { pass, workflow = {}, item = sword, activity = meleeAttack }) {
  return f.run(workflow, [{ macroPass: pass }], f.actor, undefined, item, activity, f.feature)
}

test('toggle on copies the stance onto the owner with a light, toggle off undoes it', async () => {
  setup()
  const f = makeFeature(deathStanceSpec())
  const wf = {}
  await use(f, { pass: 'postActiveEffects', workflow: wf, item: f.feature, activity: {} })
  assert.equal(world.created.length, 1)
  assert.equal(world.created[0].origin, f.feature.uuid)
  assert.equal(world.created[0].transfer, false)
  assert.equal(world.created[0].flags['chrab-sync'].stance, true)
  assert.equal(world.tokenUpdates[0].light.color, '#c4102f', 'no Sequencer: the necrotic light')
  assert.ok(world.messages.some((m) => /is active/.test(m.content ?? '')))

  // The actor hook on the same pass, same workflow: must not toggle back off.
  await use(f, { pass: 'postActiveEffects', workflow: wf, item: f.feature, activity: {} })
  assert.equal(f.actor.effects.length, 1)

  // A new use turns it off, restores the light and refunds the use.
  f.feature.system.uses = { max: '3', spent: 2 }
  await use(f, { pass: 'postActiveEffects', workflow: {}, item: f.feature, activity: {} })
  assert.deepEqual(world.deleted, ['fx0'])
  assert.equal(f.actor.effects.length, 0)
  assert.deepEqual(world.tokenUpdates.at(-1).light, { dim: 0, bright: 0, color: null })
  assert.deepEqual(world.itemUpdates.at(-1), { 'system.uses.spent': 1 })
})

test('Sequencer, when present, plays an effect tied to the stance instead of the light', async () => {
  setup()
  const played = []
  globalThis.Sequencer = { Database: { entryExists: (f) => f === 'jb2a.static_electricity.03.dark_red' } }
  // Records every chained call; play() ends the chain.
  globalThis.Sequence = function () {
    const calls = []
    const chain = new Proxy({}, { get: (_, k) => (k === 'play' ? async () => played.push(calls) : (...a) => (calls.push([k, ...a]), chain)) })
    return chain
  }
  const f = makeFeature(deathStanceSpec())
  await use(f, { pass: 'postActiveEffects', workflow: {}, item: f.feature, activity: {} })
  assert.equal(world.tokenUpdates.length, 0)
  const calls = Object.fromEntries(played[0].map(([k, ...a]) => [k, a]))
  assert.deepEqual(calls.file, ['jb2a.static_electricity.03.dark_red'])
  assert.equal(calls.tieToDocuments[0].id, 'fx0')
})

test('natural 19 or 20 on a melee attack roll heals 1d10 + CON', async () => {
  setup()
  const f = makeFeature(deathStanceSpec())
  await use(f, { pass: 'postAttackRoll', workflow: attackWorkflow({ natural: 19, hit: false }) })
  assert.deepEqual(world.damage, [{ damages: [{ value: 9, type: 'healing' }], options: undefined }], '6 (1d10) + 3 CON, hit or miss')
  assert.equal(world.dialogs, 0, 'the heal never asks')

  for (const [wf, activity, why] of [
    [attackWorkflow({ natural: 18 }), meleeAttack, 'natural 18'],
    [attackWorkflow({ natural: 20 }), rangedAttack, 'ranged attack'],
    [attackWorkflow({ natural: 20 }), { type: 'save' }, 'not an attack'],
  ]) {
    world.damage = []
    await use(f, { pass: 'postAttackRoll', workflow: wf, activity })
    assert.deepEqual(world.damage, [], why)
  }
})

test('a melee hit offers 1d10 necrotic and the attacker takes the same amount', async () => {
  setup({ confirm: true })
  const f = makeFeature(deathStanceSpec())
  const rolls = await use(f, { pass: 'damageBonus', workflow: attackWorkflow({ hit: true }) })
  assert.equal(world.dialogs, 1)
  assert.equal(rolls.length, 1)
  assert.equal(rolls[0].options.type, 'necrotic')
  assert.equal(rolls[0].total, 6)
  assert.deepEqual(world.damage, [{ damages: [{ value: 6, type: 'necrotic' }], options: { ignore: true } }])

  // A critical doubles the dice, and the cost matches what was dealt.
  world.damage = []
  const crit = await use(f, { pass: 'damageBonus', workflow: attackWorkflow({ hit: true, crit: true }) })
  assert.equal(crit[0].total, 12)
  assert.equal(world.damage[0].damages[0].value, 12)

  // Declined, missed, or ranged: nothing.
  setup({ confirm: false })
  assert.deepEqual(await use(f, { pass: 'damageBonus', workflow: attackWorkflow({ hit: true }) }), [])
  setup({ confirm: true })
  assert.deepEqual(await use(f, { pass: 'damageBonus', workflow: attackWorkflow({ hit: false }) }), [])
  assert.deepEqual(await use(f, { pass: 'damageBonus', workflow: attackWorkflow({ hit: true }), activity: rangedAttack }), [])
  assert.equal(world.dialogs, 0, 'no prompt unless the rule applies')
  assert.deepEqual(world.damage, [])
})

test('the toggle item itself never triggers its own rules', async () => {
  setup()
  const f = makeFeature(deathStanceSpec())
  assert.equal(await use(f, { pass: 'damageBonus', workflow: attackWorkflow({ natural: 20 }), item: f.feature }), undefined)
  assert.deepEqual(world.damage, [])
})

test('once per turn, target conditions and custom conditions gate a rule', async () => {
  const rule = {
    ...emptyBehaviorRule('tempHpSelf'),
    event: 'hit',
    formula: '5',
    oncePerTurn: true,
    targetConditions: [{ ...emptyCondition('typeIs'), types: ['undead'] }],
    when: 'c.natural >= 10',
  }
  const spec = emptyFeatureSpec('feat')
  spec.item = { ...spec.item, name: 'Grave Ward', behavior: { ...emptyBehavior('passive'), rules: [rule] } }
  setup({ combat: { started: true, id: 'c1', round: 2, turn: 0 } })
  let evaluated = null
  globalThis.MidiQOL = { createConditionData: (d) => d, evalCondition: async (expr) => ((evaluated = expr), true) }
  const f = makeFeature(spec)
  f.feature.update = async (data) => {
    world.itemUpdates.push(data)
    f.feature.flags = { 'chrab-sync': { turns: { [rule.key]: Object.values(data)[0] } } }
  }
  await use(f, { pass: 'postAttackRoll', workflow: attackWorkflow({ natural: 9 }) })
  assert.deepEqual(world.tempHp, [], 'custom condition fails on a 9')
  await use(f, { pass: 'postAttackRoll', workflow: attackWorkflow({ natural: 12 }) })
  assert.deepEqual(world.tempHp, [5])
  assert.equal(evaluated, '["undead"].includes(raceOrType)')
  await use(f, { pass: 'postAttackRoll', workflow: attackWorkflow({ natural: 15 }) })
  assert.deepEqual(world.tempHp, [5], 'already used this turn')
  game.combat.turn = 1
  await use(f, { pass: 'postAttackRoll', workflow: attackWorkflow({ natural: 15 }) })
  assert.deepEqual(world.tempHp, [5, 5])
  delete globalThis.MidiQOL
})

test('behaviorMacro escapes nothing it should not: names with quotes still compile', () => {
  const b = deathStanceBehavior()
  b.rules[0].label = 'Bhern\'s "Blood" </script>'
  const code = behaviorMacro({ name: 'It\'s "Death"' }, b)
  assert.doesNotThrow(() => new AsyncFunction('workflow', 'args', 'actor', 'token', 'rolledItem', 'rolledActivity', 'macroItem', code))
})
