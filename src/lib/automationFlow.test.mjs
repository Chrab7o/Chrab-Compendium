// Run with: npm test
//
// The Automation Builder's flows (automationFlow.js): the math parser, the
// checks on what each point of the workflow knows, the words, the item it
// builds, and the generated macro run against stand-ins for Foundry, dnd5e
// and midi-qol. The real-world check is docs/automation-builder.md's list.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptyActivity, emptyEffect } from './foundryActorBuilder.js'
import {
  blockSummary,
  emptyBlock,
  emptyCheck,
  emptyFlow,
  emptyStep,
  flowCode,
  flowPasses,
  flowProblems,
  mathFormula,
  sortBlocks,
  varsBefore,
} from './automationFlow.js'
import { buildFeatureItem, emptyFeatureSpec, featureItemToSpec } from './foundryFeatures.js'

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor

const step = (type, patch = {}) => ({ ...emptyStep(type), ...patch })
const check = (type, patch = {}) => ({ ...emptyCheck(type), ...patch })
const block = (trigger, patch = {}) => ({ ...emptyBlock(trigger), ...patch })

// The example from the brief: on a hit, grab the target's HP, halve it,
// a flavor line, then that number replaces the rolled damage.
function halfHpFlow() {
  return {
    ...emptyFlow(),
    blocks: [
      block('damage', {
        checks: [check('hit')],
        steps: [
          step('value', { source: 'targetHp', name: 'hp' }),
          step('math', { name: 'dmg', expr: 'floor(hp / 2)', show: false }),
          step('flavor', { text: 'The blade drinks half of {target}’s life ({dmg}).' }),
          step('damageRoll', { mode: 'replace', amount: 'dmg' }),
        ],
      }),
    ],
  }
}

function featureWith(flow, kind = 'attack', effects = []) {
  const spec = emptyFeatureSpec('feat')
  spec.item = { ...spec.item, name: 'Soul Reap', activities: [{ ...emptyActivity(kind), damage: [{ formula: '1d8', types: ['necrotic'] }], flow }], effects }
  return spec
}

// ---------------------------------------------------------------------------
// Math

test('math: variable names get an @, functions, dice and @references pass through', () => {
  assert.deepEqual(mathFormula('floor(hp / 2) + 2d6', ['hp']), { formula: 'floor(@hp / 2) + 2d6', error: '' })
  assert.equal(mathFormula('hp + @abilities.con.mod + 4d6kh3', ['hp']).formula, '@hp + @abilities.con.mod + 4d6kh3')
  assert.equal(mathFormula('max(1, dmg - ac)', ['dmg', 'ac']).formula, 'max(1, @dmg - @ac)')
  assert.match(mathFormula('hpp / 2', ['hp']).error, /“hpp”/)
  assert.match(mathFormula('floor(hp / 2', ['hp']).error, /brackets/)
  assert.match(mathFormula('hp; alert(1)', ['hp']).error, /Only numbers/)
  assert.match(mathFormula('', []).error, /Write some math/)
})

test('variables are visible from earlier blocks and earlier steps only', () => {
  const flow = {
    blocks: sortBlocks([
      block('damage', { steps: [step('math', { name: 'later', expr: 'early + 1' })] }),
      block('preAttack', { steps: [step('value', { name: 'early' }), step('math', { name: 'mid', expr: 'early' })] }),
    ]),
  }
  assert.equal(flow.blocks[0].trigger, 'preAttack', 'blocks sort into the order midi runs them')
  assert.deepEqual(varsBefore(flow, { block: 0, branch: 'steps', step: 1 }), ['early'])
  assert.deepEqual(varsBefore(flow, { block: 1, branch: 'checks' }), ['early', 'mid'])
  assert.deepEqual(flowProblems(flow, 'attack'), [])
})

test('problems: wrong time, unknown names, empty blocks', () => {
  const flow = {
    blocks: [
      block('preAttack', { checks: [check('hit')], steps: [step('damageRoll', { amount: 'x' })] }),
      block('done'),
    ],
  }
  const texts = flowProblems(flow, 'attack').map((p) => p.text)
  assert.ok(texts.some((t) => /“The attack hit” isn’t known yet at “Before the attack roll”/.test(t)))
  assert.ok(texts.some((t) => /can’t happen at “Before the attack roll”/.test(t)))
  assert.ok(texts.some((t) => /I don’t know “x”/.test(t)))
  assert.ok(texts.some((t) => /Block 2: nothing happens yet/.test(t)))
  assert.ok(flowProblems({ blocks: [block('attack', { steps: [step('flavor', { text: 'hi' })] })] }, 'save').some((p) => /doesn’t happen on this kind of roll/.test(p.text)))
  assert.deepEqual(flowProblems(halfHpFlow(), 'attack'), [])
})

test('the summary reads like the steps', () => {
  assert.equal(
    blockSummary(halfHpFlow().blocks[0]),
    'When damage is rolled, if the attack hit: grab the target’s current HP as hp, work out dmg = floor(hp / 2), say “The blade drinks half of {target}’s life ({dmg}).”, then replace the rolled damage with dmg (rounded down).',
  )
})

// ---------------------------------------------------------------------------
// The item

test('a flow becomes the roll’s macro, listed at each pass it needs, and reads back', () => {
  const flow = halfHpFlow()
  flow.blocks.unshift(block('preAttack', { steps: [step('advantage')] }))
  const spec = featureWith(flow)
  const item = buildFeatureItem(spec)
  const id = Object.keys(item.system.activities)[0]
  const act = item.system.activities[id]
  assert.match(act.macroData.command, /const FLOW = /)
  assert.deepEqual(flowPasses(flow), ['preAttackRollConfig', 'postDamageRoll', 'postActiveEffects'])
  assert.equal(
    item.flags['midi-qol'].onUseMacroName,
    `[preAttackRollConfig]ActivityMacro-${id},[postDamageRoll]ActivityMacro-${id},[postActiveEffects]ActivityMacro-${id}`,
  )
  assert.deepEqual(item.flags['chrab-sync'].flows[id], flow)
  const back = featureItemToSpec(item)
  assert.deepEqual(back.item.activities[0].flow, flow)
  assert.equal(back.item.activities[0].script, null, 'a flow reads back as a flow, not a hand-edited script')
  assert.doesNotThrow(() => new AsyncFunction('workflow', 'args', 'actor', 'token', 'item', 'rolledActivity', act.macroData.command))
})

// ---------------------------------------------------------------------------
// Running the macro

class FakeRoll {
  constructor(formula, data = {}, options = {}) {
    Object.assign(this, { formula, data, options, dice: /\dd\d/.test(formula) ? [{}] : [] })
  }
  async evaluate() {
    const expr = this.formula
      .replace(/@([\w.]+)/g, (_, path) => String(path.split('.').reduce((o, k) => o?.[k], this.data) ?? 0))
      .replace(/(\d+)d(\d+)/g, (_, n, d) => `(${Number(n)}*${Math.ceil((Number(d) + 1) / 2)})`)
      .replace(/\b(floor|ceil|round|min|max|abs)\(/g, 'Math.$1(')
    this.total = Function(`return (${expr})`)()
    return this
  }
}

let world

const setOf = (...xs) => Object.assign(new Set(xs), { first: () => xs[0] })

function setup({ confirm = true } = {}) {
  world = { messages: [], damage: [], tokenDamage: [], effects: [], uses: [], prompts: 0 }
  globalThis.foundry = {
    utils: { escapeHTML: (s) => String(s), getProperty: (o, path) => path.split('.').reduce((x, k) => x?.[k], o) },
    applications: { api: { DialogV2: { confirm: async () => (world.prompts++, confirm), input: async () => ({ n: '7' }) } } },
  }
  globalThis.ChatMessage = { getSpeaker: () => ({}), implementation: { create: async (d) => world.messages.push(d) } }
  globalThis.CONFIG = { Dice: { DamageRoll: FakeRoll }, statusEffects: [{ id: 'prone', name: 'Prone', img: 'prone.svg' }] }
  globalThis.Roll = FakeRoll
  globalThis.game = { combat: null }
  globalThis.MidiQOL = {
    applyTokenDamage: async (detail, total, targets) => world.tokenDamage.push({ detail, total, target: [...targets][0].name }),
    socket: () => ({ executeAsGM: async (what, data) => world.effects.push({ what, ...data }) }),
  }
}

function run(spec, { pass, workflow }) {
  const built = buildFeatureItem(spec)
  const act = Object.values(built.system.activities)[0]
  const actor = {
    name: 'Bhern',
    uuid: 'Actor.bhern',
    items: [],
    system: { details: { level: 5 }, attributes: { hp: { value: 20, max: 40 }, prof: 3 }, abilities: { con: { mod: 3 } } },
    getRollData: () => ({ abilities: { con: { mod: 3 } }, prof: 3 }),
    applyDamage: async (d, o) => world.damage.push({ d, o }),
    applyTempHP: async () => {},
  }
  const item = {
    name: built.name,
    uuid: 'Item.reap',
    img: 'reap.svg',
    flags: {},
    system: { uses: { max: 3, spent: 0, value: 3 } },
    effects: built.effects.map((e) => ({ ...e, id: e._id, toObject: () => structuredClone(e) })),
    update: async (d) => world.uses.push(d),
  }
  const fn = new AsyncFunction('workflow', 'args', 'actor', 'token', 'item', 'rolledActivity', act.macroData.command)
  return fn(workflow, [{ macroPass: pass }], actor, undefined, item, {})
}

function goblin({ hp = 31 } = {}) {
  return { name: 'Goblin', document: { uuid: 'Token.gob' }, actor: { name: 'Goblin', uuid: 'Actor.gob', isOwner: false, system: { attributes: { hp: { value: hp, max: 40 }, ac: { value: 13 } } } } }
}

function attackWorkflow({ hit = true } = {}) {
  const g = goblin()
  return {
    targets: setOf(g),
    hitTargets: hit ? setOf(g) : setOf(),
    damageRolls: [{ options: { type: 'necrotic', properties: ['mgc'] } }],
    async setDamageRolls(rolls) {
      this.damageRolls = rolls
    },
  }
}

test('half the target’s HP replaces the damage, with a flavored card after the roll', async () => {
  setup()
  const spec = featureWith(halfHpFlow())
  const wf = attackWorkflow()
  await run(spec, { pass: 'postDamageRoll', workflow: wf })
  assert.equal(wf.damageRolls.length, 1)
  assert.equal(wf.damageRolls[0].total, 15, 'floor(31 / 2)')
  assert.equal(wf.damageRolls[0].options.type, 'necrotic', 'keeps the roll’s own damage type')
  assert.deepEqual(wf.damageRolls[0].options.properties, ['mgc'])
  assert.equal(world.messages.length, 0, 'the card waits for the end of the roll')

  await run(spec, { pass: 'postActiveEffects', workflow: wf })
  assert.equal(world.messages.length, 1)
  const html = world.messages[0].content
  assert.match(html, /<em>The blade drinks half of Goblin’s life \(15\)\.<\/em>/)
  assert.match(html, /The damage becomes 15 necrotic/)
  await run(spec, { pass: 'postActiveEffects', workflow: wf })
  assert.equal(world.messages.length, 1, 'posts once')
})

test('a failed check skips the block, and runs its otherwise steps', async () => {
  setup()
  const flow = halfHpFlow()
  flow.blocks[0].otherwise = [step('flavor', { text: 'Missed, the hunger grows.', style: 'plain' })]
  const wf = attackWorkflow({ hit: false })
  await run(featureWith(flow), { pass: 'postDamageRoll', workflow: wf })
  await run(featureWith(flow), { pass: 'postActiveEffects', workflow: wf })
  assert.equal(wf.damageRolls[0].total, undefined, 'the damage is untouched')
  assert.match(world.messages[0].content, /<li>Missed, the hunger grows\.<\/li>/)
})

test('variables carry across passes: grabbed before the attack, used when damage lands', async () => {
  setup()
  const flow = {
    ...emptyFlow(),
    blocks: [
      block('preAttack', { steps: [step('value', { source: 'targetAc', name: 'ac' }), step('advantage', { mode: 'disadvantage' })] }),
      block('done', {
        checks: [check('compare', { left: 'ac', op: '>=', right: '13' }), check('ask')],
        steps: [step('math', { name: 'heal', expr: 'ac + @prof' }), step('healMe', { amount: 'heal' }), step('damageTarget', { amount: '2d6', damageType: 'fire' }), step('condition', { status: 'prone' })],
      }),
    ],
  }
  const wf = { ...attackWorkflow(), attackRollModifierTracker: { advantage: { add: () => (world.adv = 'adv') }, disadvantage: { add: (src) => (world.adv = `dis:${src}`) } } }
  const spec = featureWith(flow)
  await run(spec, { pass: 'preAttackRollConfig', workflow: wf })
  assert.equal(world.adv, 'dis:chrab-flow')
  await run(spec, { pass: 'postActiveEffects', workflow: wf })
  assert.equal(world.prompts, 1, 'asked the player')
  assert.deepEqual(world.damage[0].d, [{ value: 16, type: 'healing' }], 'AC 13 + prof 3')
  assert.deepEqual(world.tokenDamage[0], { detail: [{ value: 8, type: 'fire' }], total: 8, target: 'Goblin' })
  assert.equal(world.effects[0].what, 'createEffects', 'a creature the user doesn’t own gets it through the GM')
  assert.deepEqual(world.effects[0].effects[0].statuses, ['prone'])
  assert.match(world.messages[0].content, /The attack has disadvantage[\s\S]*Bhern regains 16 HP[\s\S]*Goblin takes 8 fire damage[\s\S]*Goblin is <strong>Prone/)
})

test('saying no to the prompt skips the block', async () => {
  setup({ confirm: false })
  const flow = { ...emptyFlow(), blocks: [block('done', { checks: [check('ask')], steps: [step('healMe', { amount: '5' })] })] }
  await run(featureWith(flow), { pass: 'postActiveEffects', workflow: attackWorkflow() })
  assert.equal(world.damage.length, 0)
})

test('cancel stops the use before anything rolls', async () => {
  setup()
  const flow = {
    ...emptyFlow(),
    blocks: [block('use', { checks: [check('compare', { left: '@attributes.hp.value', op: '<', right: '1' })], steps: [step('flavor', { text: 'Too weak.' }), step('cancel')] })],
  }
  setup()
  const wf = attackWorkflow()
  // The stand-in actor's roll data has no hp, so @attributes.hp.value is 0: cancelled.
  assert.equal(await run(featureWith(flow), { pass: 'preItemRoll', workflow: wf }), false)
  assert.match(world.messages[0].content, /Too weak/)
})

test('effects and uses: the item’s own effect lands on the target, uses are spent', async () => {
  setup()
  const effect = { ...emptyEffect(), name: 'Reaped' }
  const flow = { ...emptyFlow(), blocks: [block('done', { steps: [step('effect', { effectKey: effect.key }), step('featureUses', { mode: 'spend', amount: '1' }), step('code', { code: 'say("custom " + V.x);' })] })] }
  await run(featureWith(flow, 'attack', [effect]), { pass: 'postActiveEffects', workflow: attackWorkflow() })
  assert.equal(world.effects[0].effects[0].name, 'Reaped')
  assert.equal(world.effects[0].effects[0].origin, 'Item.reap')
  assert.deepEqual(world.uses, [{ 'system.uses.spent': 1 }])
  assert.match(world.messages[0].content, /Goblin gains <strong>Reaped[\s\S]*Spends 1 uses of Soul Reap[\s\S]*custom undefined/)
})

test('flowCode is valid JavaScript for an empty flow too', () => {
  assert.doesNotThrow(() => new AsyncFunction('workflow', 'args', 'actor', 'token', 'item', 'rolledActivity', flowCode(emptyFlow(), { itemName: 'X' })))
})
