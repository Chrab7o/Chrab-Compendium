// Run with: npm test
//
// Feature behaviors (foundryBehaviors.js) and the Feature Forge item builder
// (foundryFeatures.js). Besides the exported shapes, the generated hook macro
// is run here against stand-ins for the Foundry / dnd5e / midi-qol globals it
// touches, so the Death Stance rules are exercised end to end without a
// Foundry server. The real-world check is the sandbox's probes/death-stance.md.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildNpcActor, emptyActivity, emptyChange, emptyEffect, emptyNpcItem, emptyNpcSpec, npcActorToSpec } from './foundryActorBuilder.js'
import { emptyCondition } from './foundryAutomation.js'
import {
  behaviorChanges,
  behaviorMacro,
  behaviorPasses,
  behaviorSummary,
  deathStanceBehavior,
  emptyBehavior,
  emptyBehaviorAction,
  emptyBehaviorRule,
  emptySelfCondition,
  eventForOutcome,
  ruleOutcomeFits,
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
  assert.equal(item.system.requirements, 'Dark Knight 3 (Harbinger of Darkness)')
  assert.deepEqual(item.system.uses, { max: '@prof', spent: 0, recovery: [{ period: 'lr', type: 'recoverAll' }] })
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
  // The dot form runs the hook whichever of the item's rolls is used (midi
  // only runs ActivityMacro-<id> for that roll itself).
  assert.equal(item.flags['midi-qol'].onUseMacroName, `[postActiveEffects]ActivityMacro.${behavior.key}`)

  // One stance effect (the template's own, with advantage on attacks): not
  // applied by any activity, icon always shown, lasting 1 minute, and carrying
  // one onUseMacroName hook per pass the rules need.
  assert.equal(item.effects.length, 1)
  const stance = item.effects[0]
  assert.equal(stance._id, spec.item.effects[0].key)
  assert.equal(stance.transfer, false)
  assert.equal(stance.showIcon, 2)
  assert.equal(stance.duration.value, 60)
  assert.equal(stance.duration.units, 'seconds')
  assert.equal(stance.flags['chrab-sync'].stance, true)
  assert.deepEqual(hook.effects, [])
  assert.deepEqual(
    stance.system.changes.map((c) => [c.key, c.value, c.type]),
    [
      ['flags.midi-qol.advantage.attack.all', '1', 'custom'],
      ['flags.midi-qol.onUseMacroName', 'ActivityMacro, postAttackRoll', 'custom'],
      ['flags.midi-qol.onUseMacroName', 'ActivityMacro, damageBonus', 'custom'],
      ['flags.midi-qol.onUseMacroName', 'ActivityMacro, preTargetDamageApplication', 'custom'],
    ],
  )
  // The sheet carries the class's own wording.
  assert.match(item.system.description.value, /^<p>As a bonus action, let the darkness consume you/)
  assert.match(item.system.description.value, /<p>Death Archetype Upgrade \(level 7\)/)
})

test('Death Stance rules text follows the class, tier by tier', () => {
  const text = behaviorSummary(deathStanceBehavior(), 'Death Stance')
  assert.match(text, /^As a bonus action, you can enter Death Stance for 1 minute, or leave it early\. While it's active:/)
  assert.match(text, /Before level 7, when you hit with a melee attack and score a critical hit, you regain 1d10 \+ your Constitution modifier hit points\./)
  assert.match(text, /From level 7, when you make a melee attack roll and roll a 19 or 20 on the d20, you regain 2d10 \+ your Constitution modifier hit points\./)
  assert.match(text, /you can deal an extra 1d10 necrotic damage, and you take the same amount of damage\./)
  assert.match(
    text,
    /When you would drop to 0 hit points, you can spend one of your hit dice to stay up with a roll of that hit die \+ your Constitution modifier hit points instead\. This can happen only once each time you enter the stance\./,
  )
})

test('staying up only fits "would drop to 0", and picking either one moves the other', () => {
  assert.equal(emptyBehaviorRule('stayUp').event, 'downed')
  assert.equal(eventForOutcome('stayUp', 'hit'), 'downed')
  assert.equal(eventForOutcome('healSelf', 'downed'), 'attackRoll')
  assert.equal(eventForOutcome('healSelf', 'dealt'), 'dealt')
  assert.equal(ruleOutcomeFits({ ...emptyBehaviorRule('healSelf'), event: 'downed' }), false)
  assert.equal(ruleOutcomeFits({ ...emptyBehaviorRule('stayUp'), event: 'hit' }), false)
  const b = { ...emptyBehavior('passive'), rules: [emptyBehaviorRule('stayUp')] }
  assert.deepEqual(behaviorPasses(b), ['preTargetDamageApplication'])
  assert.match(ruleSummary({ ...emptyBehaviorRule('stayUp'), spendHitDie: false, formula: '1' }), /you stay up with 1 hit points instead\.$/)
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
  assert.equal(item.effects[0].system.changes.length, 4)
  assert.equal(item.effects[0].duration.value, 60)
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

function setup({ confirm = true, combat = null, spend = null, pick = null } = {}) {
  world = { messages: [], prompts: [], popups: [], dialogs: 0, damage: [], tempHp: [], created: [], deleted: [], tokenUpdates: [], itemUpdates: [], actorUpdates: [], classUpdates: [], effectUpdates: [] }
  globalThis.foundry = {
    utils: {
      escapeHTML: (s) => String(s),
      mergeObject: (a, b) => ({ ...a, ...b }),
      deepClone: (o) => structuredClone(o),
      getProperty: (o, path) => path.split('.').reduce((x, k) => x?.[k], o),
    },
    applications: {
      api: {
        DialogV2: {
          confirm: async (config) => {
            world.dialogs++
            world.prompts.push(config.content)
            return confirm
          },
          // "Spend how much?" / "Which ability?": the form's values, null when
          // closed, or an extra button's action ('no' = "Not now").
          input: async (config) => {
            world.dialogs++
            world.prompts.push(config.content)
            world.buttons = config.buttons ?? []
            if (/name="ability"/.test(config.content)) return pick == null ? null : { ability: pick }
            if (spend == null) return null
            if (spend === 'no') return 'no'
            return { spend: String(spend) }
          },
          prompt: async (config) => {
            world.popups.push(config.content)
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

// Sets a dotted update key ("flags.chrab-sync.spent.x") on a plain object.
function applyUpdate(doc, data) {
  for (const [path, value] of Object.entries(data)) {
    const keys = path.split('.')
    const last = keys.pop()
    let o = doc
    for (const k of keys) o = o[k] ??= {}
    o[last] = value
  }
}

// level: the owner's Dark Knight level (their only class, d10 hit dice).
function makeFeature(spec, { level = 7, hp = 30, hitDiceLeft = level } = {}) {
  const built = buildFeatureItem(spec)
  const darkKnight = {
    type: 'class',
    system: { levels: level, hd: { denomination: 'd10', spent: level - hitDiceLeft, value: hitDiceLeft } },
    async update(data) {
      world.classUpdates.push(data)
      this.system.hd.spent = data['system.hd.spent']
      this.system.hd.value = level - this.system.hd.spent
    },
  }
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
    uuid: 'Actor.bhern',
    effects: [],
    items: [darkKnight],
    classes: { 'the-dark-knight': darkKnight },
    system: { details: { level }, attributes: { hp: { value: hp, max: 60, temp: 0 } } },
    getActiveTokens: () => [{ document: tokenDoc }],
    getRollData: () => ({ abilities: { con: { mod: 3 } } }),
    async applyDamage(damages, options) {
      world.damage.push({ damages, options })
    },
    async applyTempHP(n) {
      world.tempHp.push(n)
    },
    async update(data) {
      world.actorUpdates.push(data)
    },
    async createEmbeddedDocuments(type, data) {
      const docs = data.map((d, i) => ({
        ...structuredClone(d),
        id: `fx${i}`,
        async update(change) {
          world.effectUpdates.push(change)
          applyUpdate(this, change)
        },
      }))
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
  const spec = deathStanceSpec()
  spec.item.behavior.toggle.freeOff = true
  const f = makeFeature(spec)
  // As if Foundry had stamped a start on the item's own copy of the effect.
  f.built.effects[0].duration = { ...f.built.effects[0].duration, startTime: 100, combat: 'old' }
  f.built.effects[0].start = { time: 100 }
  const wf = {}
  await use(f, { pass: 'postActiveEffects', workflow: wf, item: f.feature, activity: {} })
  assert.equal(world.created.length, 1)
  assert.equal(world.created[0].origin, f.feature.uuid)
  assert.equal(world.created[0].transfer, false)
  assert.equal(world.created[0].flags['chrab-sync'].stance, true)
  assert.equal(world.created[0].duration.value, 60, 'lasts 1 minute')
  assert.equal(world.created[0].duration.startTime, undefined, 'counts from now')
  assert.equal(world.created[0].start, undefined)
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

test('from level 7, a natural 19 or 20 on a melee attack roll heals 2d10 + CON', async () => {
  setup()
  const f = makeFeature(deathStanceSpec(), { level: 7 })
  await use(f, { pass: 'postAttackRoll', workflow: attackWorkflow({ natural: 19, hit: false }) })
  assert.deepEqual(world.damage, [{ damages: [{ value: 15, type: 'healing' }], options: undefined }], '12 (2d10) + 3 CON, hit or miss')
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

test('before level 7, only a melee critical hit heals, 1d10 + CON', async () => {
  setup()
  const f = makeFeature(deathStanceSpec(), { level: 5 })
  await use(f, { pass: 'postAttackRoll', workflow: attackWorkflow({ natural: 19, hit: true }) })
  assert.deepEqual(world.damage, [], 'a 19 is not a crit yet')
  await use(f, { pass: 'postAttackRoll', workflow: attackWorkflow({ natural: 20, hit: true, crit: true }) })
  assert.deepEqual(world.damage, [{ damages: [{ value: 9, type: 'healing' }], options: undefined }], 'once, from the level 3 rule only')

  // The class's levels count, not the character's: a Dark Knight 5 / Fighter 4.
  setup()
  const multi = makeFeature(deathStanceSpec(), { level: 5 })
  multi.actor.system.details.level = 9
  await use(multi, { pass: 'postAttackRoll', workflow: attackWorkflow({ natural: 19, hit: true }) })
  assert.deepEqual(world.damage, [])
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

// A goblin's hit about to land on the owner (midi's damage item for them).
function incoming({ oldHP = 12, damage = 20, temp = 0, type = 'slashing' } = {}) {
  const left = Math.max(0, oldHP - Math.max(0, damage - temp))
  return {
    damageItem: {
      actorUuid: 'Actor.bhern',
      oldHP,
      newHP: left,
      oldTempHP: temp,
      newTempHP: Math.max(0, temp - damage),
      hpDamage: oldHP - left,
      damageDetail: [{ type, value: damage, properties: ['mgc'] }],
    },
  }
}
const scimitar = { uuid: 'Actor.goblin.Item.scimitar', name: 'Scimitar' }

async function stanceOn(f) {
  await use(f, { pass: 'postActiveEffects', workflow: {}, item: f.feature, activity: {} })
}

test('the first time a hit would drop me, a hit die keeps me up instead', async () => {
  setup()
  const f = makeFeature(deathStanceSpec(), { level: 7 })
  await stanceOn(f)

  const wf = incoming({ oldHP: 12, damage: 20 })
  await use(f, { pass: 'preTargetDamageApplication', workflow: wf, item: scimitar })
  // 1d10 hit die (6) + 3 CON = 9: the 20 slashing becomes exactly 3.
  assert.deepEqual(wf.damageItem.damageDetail, [{ type: 'slashing', value: 3, properties: ['mgc'] }])
  assert.equal(wf.damageItem.newHP, 9)
  assert.equal(wf.damageItem.hpDamage, 3)
  assert.deepEqual(world.classUpdates, [{ 'system.hd.spent': 1 }], 'one d10 hit die spent')
  const upCard = world.messages.find((m) => /stays up with 9 HP/.test(m.content ?? ''))
  assert.ok(upCard, 'a Refuse to Fall card')
  assert.match(upCard.content, /Spends a d10 hit die/)
  assert.match(upCard.content, /Death reaches for you/, 'with its flavor')
  assert.equal(world.dialogs, 1, 'the player was asked first')
  assert.match(world.prompts[0], /Costs a d10 hit die \(7 left\)/)
  assert.equal(f.actor.effects[0].flags['chrab-sync'].spent[deathStanceRuleKey(f)], true, 'marked on the stance effect')

  // Only once per stance.
  const again = incoming({ oldHP: 9, damage: 15 })
  await use(f, { pass: 'preTargetDamageApplication', workflow: again, item: scimitar })
  assert.equal(again.damageItem.newHP, 0, 'second time: I go down')
  assert.equal(world.classUpdates.length, 1)

  // Turning the stance off and on again resets it.
  await stanceOn(f)
  await stanceOn(f)
  const fresh = incoming({ oldHP: 9, damage: 15 })
  await use(f, { pass: 'preTargetDamageApplication', workflow: fresh, item: scimitar })
  assert.equal(fresh.damageItem.newHP, 9)
})

function deathStanceRuleKey(f) {
  return f.built.flags['chrab-sync'].behavior.rules.find((r) => r.outcome === 'stayUp').key
}

test('staying up: temporary HP, healing above where I was, and when it does nothing', async () => {
  setup()
  let f = makeFeature(deathStanceSpec())
  await stanceOn(f)
  // Only 4 HP: staying up at 9 is a 5-point heal, and the temp HP stays.
  const low = incoming({ oldHP: 4, damage: 30, temp: 5 })
  await use(f, { pass: 'preTargetDamageApplication', workflow: low, item: scimitar })
  assert.deepEqual(low.damageItem.damageDetail, [{ type: 'healing', value: -5 }])
  assert.equal(low.damageItem.newHP, 9)

  // With temp HP and room above 9: temp is used up, HP lands on 9.
  setup()
  f = makeFeature(deathStanceSpec())
  await stanceOn(f)
  const tempWf = incoming({ oldHP: 12, damage: 30, temp: 5 })
  await use(f, { pass: 'preTargetDamageApplication', workflow: tempWf, item: scimitar })
  assert.deepEqual(tempWf.damageItem.damageDetail.map((d) => d.value), [8], '5 temp + 3 HP')
  assert.equal(tempWf.damageItem.newTempHP, 0)

  for (const [why, wf, opts] of [
    ['not dropping', incoming({ oldHP: 30, damage: 5 }), {}],
    ['already at 0', incoming({ oldHP: 0, damage: 5 }), {}],
    ['someone else', { damageItem: { ...incoming().damageItem, actorUuid: 'Actor.goblin' } }, {}],
    ['no hit dice left', incoming(), { hitDiceLeft: 0 }],
    ['not my actor to update', incoming(), { notOwner: true }],
  ]) {
    setup()
    const g = makeFeature(deathStanceSpec(), opts)
    if (opts.notOwner) g.actor.isOwner = false
    await stanceOn(g)
    const before = structuredClone(wf.damageItem)
    await use(g, { pass: 'preTargetDamageApplication', workflow: wf, item: scimitar })
    assert.deepEqual(wf.damageItem, before, why)
    assert.deepEqual(world.classUpdates, [], why)
  }
})

test('the strike’s own cost can’t drop me either: the hit die catches it', async () => {
  setup({ confirm: true })
  const f = makeFeature(deathStanceSpec(), { hp: 4 })
  await stanceOn(f)
  await use(f, { pass: 'damageBonus', workflow: attackWorkflow({ hit: true }) })
  assert.deepEqual(world.damage, [], 'the 6 necrotic is not applied')
  assert.deepEqual(world.actorUpdates, [{ 'system.attributes.hp.value': 9, 'system.attributes.hp.temp': 0 }])
  assert.deepEqual(world.classUpdates, [{ 'system.hd.spent': 1 }])
})

// A Darkness pool on the owner: the feature whose identifier the rule names.
function addPool(f, { left = 12, max = 12 } = {}) {
  const pool = {
    type: 'feat',
    name: 'Dark Arts',
    system: { identifier: 'darkness', uses: { max, spent: max - left, value: left } },
    async update(data) {
      world.poolUpdates = [...(world.poolUpdates ?? []), data]
      this.system.uses.spent = data['system.uses.spent']
      this.system.uses.value = max - this.system.uses.spent
    },
  }
  f.actor.items.push(pool)
  return pool
}

function smiteSpec({ extra = true, ask = true } = {}) {
  const rule = { ...emptyBehaviorRule('bonusDamage'), label: 'Shadow Smite', event: 'damage', formula: '2d10', damageType: 'necrotic', ask, costPool: 'Darkness', costAmount: '3', costExtra: extra }
  const spec = emptyFeatureSpec('feat')
  spec.item = { ...spec.item, name: 'Shadow Smite', behavior: { ...emptyBehavior('passive'), rules: [rule] } }
  return spec
}

test('Shadow Smite on a hit: asks how much Darkness, spends it, +1d10 per extra point', async () => {
  setup({ spend: 5 })
  const f = makeFeature(smiteSpec())
  const pool = addPool(f, { left: 12 })
  const rolls = await use(f, { pass: 'damageBonus', workflow: attackWorkflow({ hit: true }) })
  assert.equal(world.dialogs, 1)
  assert.equal(rolls[0].formula, '2d10 + 2d10', '2 points over the cost: 2 more dice')
  assert.equal(rolls[0].total, 24)
  assert.equal(pool.system.uses.spent, 5)
  assert.match(ruleSummary(smiteSpec().item.behavior.rules[0]), /It costs 3 darkness, and you can spend more for an extra die each\./)
})

test('rule costs read the owner’s discounts too, never below 1', async () => {
  setup()
  const f = makeFeature(smiteSpec({ extra: false, ask: false }))
  f.feature.system.identifier = 'shadow-smite'
  f.actor.flags = { 'chrab-sync': { discount: { darkness: 2, 'shadow-smite': 4 } } }
  const pool = addPool(f, { left: 12 })
  await use(f, { pass: 'damageBonus', workflow: attackWorkflow({ hit: true }) })
  assert.equal(pool.system.uses.spent, 1, '3 - 6 -> at least 1')
})

test('a cost the pool can’t cover, or a declined prompt, does nothing', async () => {
  setup({ spend: 5 })
  let f = makeFeature(smiteSpec())
  addPool(f, { left: 2 })
  assert.deepEqual(await use(f, { pass: 'damageBonus', workflow: attackWorkflow({ hit: true }) }), [])
  assert.equal(world.dialogs, 0, 'not even asked')

  setup({ spend: null })
  f = makeFeature(smiteSpec())
  const pool = addPool(f, { left: 12 })
  assert.deepEqual(await use(f, { pass: 'damageBonus', workflow: attackWorkflow({ hit: true }) }), [])
  assert.equal(pool.system.uses.spent, 0)

  // "Spend how much?" has its own "Not now" button, which spends nothing.
  setup({ spend: 'no' })
  f = makeFeature(smiteSpec())
  const declined = addPool(f, { left: 12 })
  assert.deepEqual(await use(f, { pass: 'damageBonus', workflow: attackWorkflow({ hit: true }) }), [])
  assert.deepEqual(world.buttons.map((b) => [b.action, b.label]), [['no', 'Not now']])
  assert.equal(declined.system.uses.spent, 0)

  // A fixed cost with no prompt just spends it.
  setup()
  f = makeFeature(smiteSpec({ extra: false, ask: false }))
  const quiet = addPool(f, { left: 12 })
  const rolls = await use(f, { pass: 'damageBonus', workflow: attackWorkflow({ hit: true }) })
  assert.equal(rolls[0].formula, '2d10')
  assert.equal(quiet.system.uses.spent, 3)
  assert.equal(world.dialogs, 0)
})

test('a bonded ally’s hit: half comes off it and lands on the owner', async () => {
  setup()
  const spec = emptyFeatureSpec('feat')
  spec.item = { ...spec.item, name: 'Defend the Weak', behavior: { ...emptyBehavior('passive'), rules: [{ ...emptyBehaviorRule('shareDamage'), share: '50' }] } }
  const f = makeFeature(spec)
  f.feature.actor = f.actor // the item lives on the Dark Knight
  const ally = { name: 'Mira', uuid: 'Actor.mira' }
  const wf = { damageItem: { actorUuid: 'Actor.mira', oldHP: 20, newHP: 5, hpDamage: 15, damageDetail: [{ type: 'slashing', value: 15 }] } }
  await f.run(wf, [{ macroPass: 'preTargetDamageApplication' }], ally, undefined, scimitar, meleeAttack, f.feature)
  assert.deepEqual(wf.damageItem.damageDetail, [{ type: 'slashing', value: 8 }], '15 -> the ally keeps 8')
  assert.equal(wf.damageItem.hpDamage, 8)
  assert.deepEqual(world.damage, [{ damages: [{ value: 7, type: 'slashing' }], options: undefined }], 'the owner takes 7')
  assert.ok(world.messages.some((m) => /takes 7 of the damage meant for Mira/.test(m.content ?? '')))

  // The owner's own damage passes don't touch the bond path.
  world.damage = []
  const own = incoming({ oldHP: 30, damage: 5 })
  await use(f, { pass: 'preTargetDamageApplication', workflow: own, item: scimitar })
  assert.deepEqual(world.damage, [])
  assert.equal(own.damageItem.hpDamage, 5)
})

function markSpec(refundPool = '') {
  const spec = emptyFeatureSpec('feat')
  spec.item = {
    ...spec.item,
    name: 'Mark of Darkness',
    behavior: { ...emptyBehavior('passive'), rules: [{ ...emptyBehaviorRule('refund'), event: 'bondedDowned', refundPool, refundAmount: '2' }] },
  }
  return spec
}

test('a marked creature dropping to 0 gives back a use, once', async () => {
  setup()
  const f = makeFeature(markSpec())
  f.feature.actor = f.actor
  f.feature.system.uses = { max: '3', spent: 2 }
  const goblin = { name: 'Goblin', uuid: 'Actor.goblin' }
  const wf = { damageItem: { actorUuid: 'Actor.goblin', oldHP: 4, newHP: 0, hpDamage: 4, damageDetail: [{ type: 'slashing', value: 9 }] } }
  const hit = () => f.run(wf, [{ macroPass: 'preTargetDamageApplication' }], goblin, undefined, sword, meleeAttack, f.feature)
  await hit()
  assert.deepEqual(world.itemUpdates, [{ 'system.uses.spent': 1 }])
  f.feature.system.uses.spent = 1
  await hit()
  assert.equal(world.itemUpdates.length, 1, 'the same workflow only refunds once')
  // Not dropping: nothing.
  const scratch = { damageItem: { ...wf.damageItem, newHP: 2, hpDamage: 2 } }
  await f.run(scratch, [{ macroPass: 'preTargetDamageApplication' }], goblin, undefined, sword, meleeAttack, f.feature)
  assert.equal(world.itemUpdates.length, 1)
})

test('a cursed creature dropping gives back the Darkness it cost', async () => {
  setup()
  const f = makeFeature(markSpec('darkness'))
  f.feature.actor = f.actor
  const pool = addPool(f, { left: 7 }) // 5 spent
  const wf = { damageItem: { actorUuid: 'Actor.goblin', oldHP: 3, newHP: 0, hpDamage: 3, damageDetail: [{ type: 'necrotic', value: 6 }] } }
  await f.run(wf, [{ macroPass: 'preTargetDamageApplication' }], { name: 'Goblin', uuid: 'Actor.goblin' }, undefined, sword, meleeAttack, f.feature)
  assert.equal(pool.system.uses.spent, 3)
  assert.ok(world.messages.some((m) => /Goblin falls.*Bhern regains 2 darkness/.test(m.content ?? '')))
})

test('Unstoppable: a damage roll ignores B/P/S resistance until the roll completes', async () => {
  setup()
  const spec = emptyFeatureSpec('feat')
  spec.item = { ...spec.item, name: 'Unstoppable', behavior: { ...emptyBehavior('passive'), rules: [{ ...emptyBehaviorRule('ignoreResistance'), event: 'damage' }] } }
  const f = makeFeature(spec)
  let cleanup = null
  globalThis.Hooks = { once: (name, fn) => name === 'midi-qol.RollComplete' && (cleanup = fn) }
  const ignore = new Set(['idi.fire'])
  const activity = { ...meleeAttack, midiProperties: { ignoreTraits: ignore } }
  const rolls = await use(f, { pass: 'damageBonus', workflow: attackWorkflow({ hit: true }), activity })
  assert.deepEqual(rolls, [])
  assert.deepEqual([...ignore], ['idi.fire', 'idr.bludgeoning', 'idr.piercing', 'idr.slashing'])
  cleanup()
  assert.deepEqual([...ignore], ['idi.fire'], 'only what it added comes off')
  assert.match(ruleSummary(spec.item.behavior.rules[0]), /your damage ignores resistance to bludgeoning, piercing and slashing\./)
  delete globalThis.Hooks
})

// ---------------------------------------------------------------------------
// Triggers, checks and actions (the building blocks)

// Foundry's Roll for dice checks and action amounts: average rounded up, like FakeDamageRoll.
function withRoll(fn) {
  globalThis.Roll = FakeDamageRoll
  return fn().finally(() => delete globalThis.Roll)
}

function ruleFeature(rule, extra = {}) {
  const spec = emptyFeatureSpec('feat')
  spec.item = { ...spec.item, name: 'Grave Pact', ...extra, behavior: { ...emptyBehavior('passive'), rules: [rule] } }
  return spec
}

test('I take damage: gain Darkness and say so, once per hit, inside the attacker’s roll', () =>
  withRoll(async () => {
    setup()
    const rule = {
      ...emptyBehaviorRule('nothing'),
      event: 'hurt',
      actions: [
        { ...emptyBehaviorAction('resource'), pool: 'darkness', amount: '1', mode: 'gain' },
        { ...emptyBehaviorAction('message'), text: 'The darkness feeds on @damageTaken damage.' },
      ],
    }
    const f = makeFeature(ruleFeature(rule))
    const pool = addPool(f, { left: 5 }) // 7 spent
    const wf = incoming({ oldHP: 30, damage: 8 })
    await use(f, { pass: 'preTargetDamageApplication', workflow: wf, item: scimitar })
    await use(f, { pass: 'preTargetDamageApplication', workflow: wf, item: scimitar })
    assert.equal(pool.system.uses.spent, 6, 'one Darkness back, once')
    assert.ok(world.messages.some((m) => /feeds on 8 damage/.test(m.content ?? '')))
    assert.match(ruleSummary(rule), /^When you take damage, you regain 1 darkness, and a chat message says/)
  }))

test('checks on me and a dice check gate a rule', () =>
  withRoll(async () => {
    setup()
    const rule = {
      ...emptyBehaviorRule('tempHpSelf'),
      event: 'hit',
      formula: '5',
      selfConditions: [{ ...emptySelfCondition('hpBelowHalf') }],
      dice: { formula: '1d6', compare: 'gte', value: '4' },
    }
    let f = makeFeature(ruleFeature(rule), { hp: 40 })
    await use(f, { pass: 'postAttackRoll', workflow: attackWorkflow() })
    assert.deepEqual(world.tempHp, [], 'not below half (40 of 60)')
    f = makeFeature(ruleFeature(rule), { hp: 20 })
    await use(f, { pass: 'postAttackRoll', workflow: attackWorkflow() })
    assert.deepEqual(world.tempHp, [5], 'below half, and 1d6 averages 4: it happens')
    assert.ok(world.messages.some((m) => /needs 4 or higher - it happens/.test(m.content ?? '')))
    const miss = makeFeature(ruleFeature({ ...rule, dice: { formula: '1d6', compare: 'gte', value: '5' } }), { hp: 20 })
    world.tempHp = []
    await use(miss, { pass: 'postAttackRoll', workflow: attackWorkflow() })
    assert.deepEqual(world.tempHp, [], 'the check failed')
    assert.match(ruleSummary(rule), /and you are below half your hit points and roll 1d6 for 4 or higher/)
  }))

test('I use this feature: store a value, apply an effect to the target', () =>
  withRoll(async () => {
    setup()
    const mark = { ...emptyEffect(), name: 'Soul Mark', byRule: true }
    const rule = {
      ...emptyBehaviorRule('nothing'),
      event: 'used',
      actions: [
        { ...emptyBehaviorAction('store'), name: 'Souls', mode: 'add', formula: '2' },
        { ...emptyBehaviorAction('applyEffect'), effectKey: mark.key, to: 'target', name: 'Soul Mark' },
      ],
    }
    const spec = ruleFeature(rule, { effects: [mark], activities: [{ ...emptyActivity('utility'), name: 'Reap' }] })
    const f = makeFeature(spec)
    f.actor.flags = { 'chrab-sync': { stored: { souls: 3 } } }
    f.feature.effects = f.feature.effects.map((e) => ({ ...e, id: e._id }))
    const goblinEffects = []
    const goblin = { name: 'Goblin', actor: { uuid: 'Actor.goblin', createEmbeddedDocuments: async (_, data) => goblinEffects.push(...data) } }
    const wf = { targets: Object.assign(new Set([goblin]), { first: () => goblin }), hitTargets: Object.assign(new Set(), { first: () => undefined }) }
    await use(f, { pass: 'postActiveEffects', workflow: wf, item: f.feature, activity: {} })
    assert.deepEqual(world.actorUpdates, [{ 'flags.chrab-sync.stored.souls': 5 }])
    assert.equal(goblinEffects[0].name, 'Soul Mark')
    assert.equal(goblinEffects[0].origin, f.feature.uuid)
    // ...and the item is wired for it: its own use runs the hook, the rule
    // effect isn't on any roll, and the stored value is always defined.
    const built = f.built
    assert.match(built.flags['midi-qol'].onUseMacroName, /^\[postActiveEffects\]ActivityMacro\./)
    const reap = Object.values(built.system.activities).find((a) => a.name === 'Reap')
    assert.deepEqual(reap.effects, [])
    const floor = built.effects.find((e) => e.flags['chrab-sync']?.synthetic && e.system.changes.some((c) => c.key === 'flags.chrab-sync.stored.souls'))
    assert.ok(floor, 'stored value floor')
    // Other items' rolls don't run "I use this feature" rules.
    world.actorUpdates = []
    await use(f, { pass: 'postActiveEffects', workflow: wf })
    assert.deepEqual(world.actorUpdates, [])
  }))

// The Curse: a bonus action that costs Darkness and places a mark whose save
// penalty is for an ability the player picks, and which adds 1d6 to attacks
// that hit the marked creature.
function curseSpec() {
  const cursed = {
    ...emptyEffect(),
    name: 'Cursed by Darkness',
    byRule: true,
    extraDamage: '1d6',
    changes: [{ ...emptyChange('custom'), path: 'system.abilities.{ability}.bonuses.save', value: '-2', type: 'add' }],
  }
  const rule = {
    ...emptyBehaviorRule('nothing'),
    event: 'used',
    ask: false,
    actions: [{ ...emptyBehaviorAction('applyEffect'), effectKey: cursed.key, to: 'target', unique: true, pickAbility: true }],
  }
  return ruleFeature(rule, { name: 'Curse', effects: [cursed], activities: [{ ...emptyActivity('utility'), name: 'Curse', activation: 'bonus' }] })
}

test('the Curse asks for the ability before its cost is paid; backing out cancels the use', () =>
  withRoll(async () => {
    const goblinEffects = []
    const goblin = { name: 'Goblin', actor: { uuid: 'Actor.goblin', createEmbeddedDocuments: async (_, data) => goblinEffects.push(...data) } }
    const workflow = () => ({ targets: setOf(goblin), hitTargets: setOf() })

    // Wired to run for the bonus action too, and to ask first (preItemRoll).
    const built = makeFeature(curseSpec()).built
    const hookId = Object.keys(built.system.activities)[0]
    assert.deepEqual(built.flags['midi-qol'].onUseMacroName.split(','), [`[preItemRoll]ActivityMacro.${hookId}`, `[postActiveEffects]ActivityMacro.${hookId}`])

    // Cancelled: midi gets false and stops before dnd5e spends the Darkness.
    setup({ pick: null })
    let f = makeFeature(curseSpec())
    f.feature.effects = f.feature.effects.map((e) => ({ ...e, id: e._id }))
    const cancelled = workflow()
    assert.equal(await use(f, { pass: 'preItemRoll', workflow: cancelled, item: f.feature, activity: {} }), false)
    assert.equal(world.dialogs, 1)
    assert.deepEqual(world.buttons.map((b) => b.label), ['Cancel'], 'a way to say no besides the X')

    // Picked: remembered on the workflow and used once the cost is paid, with no second prompt.
    setup({ pick: 'wis' })
    f = makeFeature(curseSpec())
    f.feature.effects = f.feature.effects.map((e) => ({ ...e, id: e._id }))
    const wf = workflow()
    assert.equal(await use(f, { pass: 'preItemRoll', workflow: wf, item: f.feature, activity: {} }), undefined)
    assert.deepEqual(wf.chrabPicks, { [f.built.effects[0]._id]: 'wis' })
    await use(f, { pass: 'postActiveEffects', workflow: wf, item: f.feature, activity: {} })
    assert.equal(world.dialogs, 1)
    assert.equal(goblinEffects[0].name, 'Cursed by Darkness (Wisdom)')
    assert.deepEqual(goblinEffects[0].system.changes.map((c) => c.key), ['system.abilities.wis.bonuses.save', 'flags.midi-qol.onUseMacroName'])
  }))

test('a cursed creature takes the extra 1d6 from attacks that hit it, not from anything else', () =>
  withRoll(async () => {
    setup()
    const f = makeFeature(curseSpec())
    const effect = f.built.effects[0]
    assert.equal(effect.flags['chrab-sync'].extraDamage, '1d6')
    assert.ok(!effect.system.changes.some((c) => c.key.startsWith('system.traits.dm')), 'no midi damage reduction')
    f.feature.actor = f.actor
    // The goblin carries the curse; the hook runs as a target pass on it.
    const goblin = { name: 'Goblin', uuid: 'Actor.goblin', effects: [{ ...structuredClone(effect), id: 'fx0', origin: f.feature.uuid, disabled: false }] }
    const hit = (activity) => ({
      activity,
      damageItem: { actorUuid: 'Actor.goblin', oldHP: 10, oldTempHP: 2, tempDamage: 0, newTempHP: 2, hpDamage: 5, newHP: 5, damageDetail: [{ type: 'slashing', value: 5 }] },
    })
    const run = (wf) => f.run(wf, [{ macroPass: 'preTargetDamageApplication' }], goblin, undefined, sword, wf.activity, f.feature)

    // 1d6 rolls 4 here: 2 of it into the temporary hit points, 2 more off the 5 left.
    const wf = hit(meleeAttack)
    await run(wf)
    assert.deepEqual(wf.damageItem.damageDetail, [{ type: 'slashing', value: 5 }, { type: 'slashing', value: 4 }])
    assert.deepEqual([wf.damageItem.tempDamage, wf.damageItem.newTempHP, wf.damageItem.hpDamage, wf.damageItem.newHP], [2, 0, 7, 3])
    assert.match(world.messages.at(-1).content, /\+4 damage<\/strong> to Goblin from Cursed by Darkness/)
    // Once per attack, however many times midi calls the pass.
    await run(wf)
    assert.equal(wf.damageItem.damageDetail.length, 2)

    // A spell's save, a fall: no extra.
    const save = hit({ type: 'save' })
    await run(save)
    assert.deepEqual(save.damageItem.damageDetail, [{ type: 'slashing', value: 5 }])
  }))

test('a target failing my save triggers a rule', () =>
  withRoll(async () => {
    setup()
    const rule = { ...emptyBehaviorRule('tempHpSelf'), event: 'failedSave', formula: '3' }
    const f = makeFeature(ruleFeature(rule))
    const goblin = { name: 'Goblin' }
    await use(f, { pass: 'postSave', workflow: { failedSaves: setOf(goblin), hitTargets: setOf(), targets: setOf(goblin) }, activity: { type: 'save' } })
    assert.deepEqual(world.tempHp, [3])
    world.tempHp = []
    await use(f, { pass: 'postSave', workflow: { failedSaves: setOf(), hitTargets: setOf(), targets: setOf(goblin) }, activity: { type: 'save' } })
    assert.deepEqual(world.tempHp, [], 'everyone saved')
  }))

test('turn rules: hidden tick rolls on the stance, run as the item’s own use', () =>
  withRoll(async () => {
    setup()
    const rule = { ...emptyBehaviorRule('healSelf'), event: 'turnStart', formula: '4' }
    const spec = emptyFeatureSpec('feat')
    spec.item = { ...spec.item, name: 'Grim Vigil', behavior: { ...emptyBehavior('toggle'), rules: [rule] } }
    const f = makeFeature(spec)
    const behavior = spec.item.behavior
    const tickId = `${behavior.key.slice(0, 12)}TkSt`
    const tick = f.built.system.activities[tickId]
    assert.equal(tick.isOverTimeFlag, true)
    assert.equal(tick.overTimeProperties.turnChoice, 'start')
    assert.equal(tick.midiProperties.automationOnly, true)
    assert.deepEqual(tick.consumption.targets, [], 'a tick never costs anything')
    const stance = f.built.effects.find((e) => e.flags['chrab-sync']?.stance)
    assert.ok(stance.system.changes.some((c) => c.key === 'flags.midi-qol.ActivityOverTime' && c.value === tick.midiProperties.identifier))
    assert.match(f.built.flags['midi-qol'].onUseMacroName, /^\[postActiveEffects\]ActivityMacro\./)
    // The tick's use heals, and doesn't toggle the stance.
    await use(f, { pass: 'postActiveEffects', workflow: {}, item: f.feature, activity: { id: tickId, isOverTimeFlag: true } })
    assert.deepEqual(world.damage, [{ damages: [{ value: 4, type: 'healing' }], options: undefined }])
    assert.deepEqual(world.created, [], 'not toggled')
    assert.match(ruleSummary(rule), /^At the start of each of your turns, you regain 4 hit points\./)
    // Reads back without the tick.
    assert.deepEqual(featureItemToSpec(f.built).item.activities, [])
  }))

test('behaviorMacro escapes nothing it should not: names with quotes still compile', () => {
  const b = deathStanceBehavior()
  b.rules[0].label = 'Bhern\'s "Blood" </script>'
  const code = behaviorMacro({ name: 'It\'s "Death"' }, b)
  assert.doesNotThrow(() => new AsyncFunction('workflow', 'args', 'actor', 'token', 'rolledItem', 'rolledActivity', 'macroItem', code))
})

// --- Chat cards and prompts (foundryChat.js runtime)

test('a necrotic strike posts one flavored card with every step', async () => {
  setup({ confirm: true })
  const f = makeFeature(deathStanceSpec())
  f.feature.img = 'icons/death-stance.webp'
  await use(f, { pass: 'damageBonus', workflow: attackWorkflow({ hit: true }) })
  const strike = world.messages.find((m) => /Necrotic Strike/.test(m.content ?? ''))
  assert.ok(strike)
  for (const words of [/chrab-card/, /icons\/death-stance\.webp/, /#c4102f/, /bite through your blade/, /Hit on Goblin/, /\+6 necrotic damage<\/strong> added to the hit/, /Bhern takes 6 necrotic damage/]) {
    assert.match(strike.content, words)
  }
  // The prompt showed the same card, with what it will do.
  assert.match(world.prompts[0], /Hit on Goblin/)
  assert.match(world.prompts[0], /you can deal an extra 1d10 necrotic damage/)
})

test('toggling the stance on and off posts its flavor', async () => {
  setup()
  const f = makeFeature(deathStanceSpec())
  await stanceOn(f)
  assert.match(world.messages.at(-1).content, /Darkness floods your veins/)
  assert.match(world.messages.at(-1).content, /is active for 1 minute/)
  await stanceOn(f)
  assert.match(world.messages.at(-1).content, /ebbs back into the shadows/)
})

test('declining Refuse to Fall: I drop', async () => {
  setup({ confirm: false })
  const f = makeFeature(deathStanceSpec(), { level: 7 })
  await stanceOn(f)
  const wf = incoming({ oldHP: 12, damage: 20 })
  await use(f, { pass: 'preTargetDamageApplication', workflow: wf, item: scimitar })
  assert.equal(wf.damageItem.newHP, 0)
  assert.deepEqual(world.classUpdates, [], 'no hit die spent')
})

test('the prompt goes to the owning player when the GM’s client runs the attack', async () => {
  setup()
  const asked = []
  const gm = { id: 'gm', name: 'GM', isGM: true, active: true, isSelf: true, hasPermission: () => true }
  const player = {
    id: 'p1',
    name: 'Sam',
    isGM: false,
    active: true,
    async query(name, data, options) {
      asked.push({ name, data, options })
      return true
    },
  }
  globalThis.game = { combat: null, user: gm, users: Object.assign([gm, player], { activeGM: gm }) }
  const f = makeFeature(deathStanceSpec(), { level: 7 })
  f.actor.testUserPermission = (user, level) => user.id === 'p1' && level === 'OWNER'
  await stanceOn(f)
  const wf = incoming({ oldHP: 12, damage: 20 })
  await use(f, { pass: 'preTargetDamageApplication', workflow: wf, item: scimitar })
  assert.equal(world.dialogs, 0, 'nothing pops up on the GM')
  assert.equal(asked.length, 1)
  assert.equal(asked[0].name, 'dialog')
  assert.equal(asked[0].data.type, 'confirm')
  assert.match(asked[0].data.config.content, /Bhern would drop to 0 hit points/)
  assert.equal(asked[0].options.timeout, 120000)
  assert.equal(wf.damageItem.newHP, 9, 'Sam said yes')

  // No answer (the query fails or times out): no.
  player.query = async () => {
    throw new Error('timed out')
  }
  const f2 = makeFeature(deathStanceSpec(), { level: 7 })
  f2.actor.testUserPermission = (user) => user.id === 'p1'
  await stanceOn(f2)
  const wf2 = incoming({ oldHP: 12, damage: 20 })
  await use(f2, { pass: 'preTargetDamageApplication', workflow: wf2, item: scimitar })
  assert.equal(wf2.damageItem.newHP, 0)
})

// A creature in the scene that effects can land on.
function creature(name) {
  return {
    name,
    uuid: `Actor.${name.toLowerCase()}`,
    isOwner: true,
    effects: [],
    async createEmbeddedDocuments(type, data) {
      const docs = data.map((d, i) => ({ ...structuredClone(d), id: `${name}${this.effects.length + i}` }))
      this.effects.push(...docs)
      return docs
    },
    async deleteEmbeddedDocuments(type, ids) {
      this.effects = this.effects.filter((e) => !ids.includes(e.id))
    },
  }
}

test('Mark of Darkness on a hit: asks, spends a use, moves the mark, and remembers who marked', async () => {
  const mark = {
    ...emptyEffect(),
    name: 'Marked by Darkness',
    byRule: true,
    changes: [{ ...emptyChange('custom'), path: 'flags.midi-qol.grants.advantage.attack.all', type: 'custom', value: 'workflow?.actor?.uuid === "{owner}"' }],
  }
  const rule = {
    ...emptyBehaviorRule('nothing'),
    event: 'hit',
    label: 'Mark of Darkness',
    costOwnUses: true,
    actions: [{ ...emptyBehaviorAction('applyEffect'), effectKey: mark.key, to: 'target', unique: true, name: mark.name }],
  }
  assert.equal(rule.ask, true, 'a choice: asks by default')
  setup({ confirm: true })
  const f = makeFeature(ruleFeature(rule, { effects: [mark] }))
  f.feature.system.uses = { max: '3', spent: 1, value: 2 }
  const goblin = creature('Goblin')
  const orc = creature('Orc')
  orc.effects.push({ id: 'old', name: 'Marked by Darkness', origin: f.feature.uuid, flags: { 'chrab-sync': { copyOf: mark.key } } })
  globalThis.canvas = { tokens: { placeables: [{ actor: orc }, { actor: goblin }] } }
  const wf = { ...attackWorkflow({ hit: true }), hitTargets: setOf({ name: 'Goblin', actor: goblin }) }
  await use(f, { pass: 'postAttackRoll', workflow: wf })
  delete globalThis.canvas

  assert.equal(world.dialogs, 1)
  assert.match(world.prompts[0], /Costs 1 use of Grave Pact\. You have 2 uses of Grave Pact\./)
  assert.deepEqual(world.itemUpdates, [{ 'system.uses.spent': 2 }])
  assert.deepEqual(orc.effects, [], 'the old mark is gone')
  assert.equal(goblin.effects.length, 1)
  const placed = goblin.effects[0]
  assert.equal(placed.origin, f.feature.uuid)
  assert.equal(placed.flags['chrab-sync'].appliedBy, 'Actor.bhern')
  const changes = placed.system?.changes ?? placed.changes
  assert.equal(changes[0].value, 'workflow?.actor?.uuid === "Actor.bhern"')
  const posted = world.messages.at(-1).content
  for (const words of [/Spends 1 use of Grave Pact \(1 left\)/, /Marked by Darkness leaves Orc/, /Goblin gains <strong>Marked by Darkness/]) assert.match(posted, words)

  // Out of uses: nothing, not even a prompt.
  setup({ confirm: true })
  f.feature.system.uses = { max: '3', spent: 3, value: 0 }
  await use(f, { pass: 'postAttackRoll', workflow: wf })
  assert.equal(world.dialogs, 0)
})

test('Curse: the player picks the ability its save penalty applies to', async () => {
  const penalty = {
    ...emptyEffect(),
    name: 'Cursed Saves',
    byRule: true,
    changes: [{ ...emptyChange('custom'), path: 'system.abilities.{ability}.bonuses.save', type: 'add', value: '-2' }],
  }
  const rule = {
    ...emptyBehaviorRule('nothing'),
    event: 'used',
    ask: false,
    actions: [{ ...emptyBehaviorAction('applyEffect'), effectKey: penalty.key, to: 'target', pickAbility: true }],
  }
  setup({ pick: 'wis' })
  const f = makeFeature(ruleFeature(rule, { name: 'Curse', effects: [penalty] }))
  const goblin = creature('Goblin')
  await use(f, { pass: 'postActiveEffects', workflow: { targets: setOf({ name: 'Goblin', actor: goblin }) }, item: f.feature, activity: {} })
  assert.match(world.prompts[0], /Which ability\?/)
  const placed = goblin.effects[0]
  assert.equal(placed.name, 'Cursed Saves (Wisdom)')
  assert.equal((placed.system?.changes ?? placed.changes)[0].key, 'system.abilities.wis.bonuses.save')

  // Closing the picker: no curse.
  setup({ pick: null })
  const g = creature('Goblin')
  await use(f, { pass: 'postActiveEffects', workflow: { targets: setOf({ name: 'Goblin', actor: g }) }, item: f.feature, activity: {} })
  assert.deepEqual(g.effects, [])
})
