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
  emptyBlock,
  emptyCheck,
  emptyFlow,
  emptyLine,
  emptySection,
  emptyStep,
  flowCode,
  flowPasses,
  flowProblems,
  flowSummary,
  mathFormula,
  scriptScopes,
  sortBlocks,
  toScript,
} from './automationFlow.js'
import { buildFeatureItem, emptyFeatureSpec, featureItemToSpec } from './foundryFeatures.js'

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor

const step = (type, patch = {}) => ({ ...emptyStep(type), ...patch })
const check = (type, patch = {}) => ({ ...emptyCheck(type), ...patch })
const block = (trigger, patch = {}) => ({ ...emptyBlock(trigger), ...patch })
// Version 2: sections of lines, ifs nested.
const line = (type, patch = {}) => ({ ...emptyLine(type), ...patch })
const ifLine = (checks, then = [], otherwise = [], patch = {}) => ({ ...emptyLine('if'), checks, then, else: otherwise, ...patch })
const section = (trigger, lines) => ({ ...emptySection(trigger), lines })
const script = (...sections) => ({ ...emptyFlow(), sections })

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

test('a line sees the variables set above it, in its section and earlier ones', () => {
  const hp = line('value', { source: 'targetHp', name: 'hp' })
  const inner = line('math', { name: 'half', expr: 'hp / 2' })
  const after = line('math', { name: 'later', expr: 'hp + half' })
  const nested = ifLine([check('compare', { left: 'hp', op: '>', right: '10' })], [inner])
  const flow = script(section('damage', [after]), section('preAttack', [hp, nested]))
  const scopes = scriptScopes(flow, 'attack')
  assert.equal(toScript(flow).sections[0].trigger, 'preAttack', 'sections sort into the order midi runs them')
  assert.deepEqual(scopes.get(nested.key).vars, ['hp'], 'an if’s checks see the lines above it')
  assert.deepEqual(scopes.get(inner.key).vars, ['hp'])
  assert.deepEqual(scopes.get(after.key).vars, ['hp', 'half'])
  assert.deepEqual(flowProblems(flow, 'attack'), [])
})

test('problems: wrong time, unknown names, empty ifs and sections', () => {
  const texts = flowProblems(
    script(section('preAttack', [ifLine([check('hit')], [line('damageRoll', { amount: 'x' })]), ifLine([])]), section('done', [])),
    'attack',
  ).map((p) => p.text)
  assert.ok(texts.some((t) => /“The attack hit” isn’t known yet at “Before the attack roll”/.test(t)))
  assert.ok(texts.some((t) => /can’t happen at “Before the attack roll”/.test(t)))
  assert.ok(texts.some((t) => /I don’t know “x”/.test(t)))
  assert.ok(texts.some((t) => /pick what it checks/.test(t)))
  assert.ok(texts.some((t) => /nothing happens inside it yet/.test(t)))
  assert.ok(texts.some((t) => /After it’s all done: nothing happens yet/.test(t)))
  assert.ok(flowProblems(script(section('attack', [line('flavor', { text: 'hi' })])), 'save').some((p) => /doesn’t happen on this kind of roll/.test(p.text)))
  assert.deepEqual(flowProblems(halfHpFlow(), 'attack'), [])
})

test('the summary reads like the script, indented', () => {
  assert.deepEqual(flowSummary(halfHpFlow()), [
    'When damage is rolled:',
    '  if the attack hit:',
    '    set hp = the target’s current HP',
    '    set dmg = floor(hp / 2)',
    '    say “The blade drinks half of {target}’s life ({dmg}).”',
    '    replace the rolled damage with dmg (rounded down)',
  ])
})

test('a version 1 flow becomes a script: checks wrap the steps, otherwise is the else', () => {
  const old = halfHpFlow()
  old.blocks[0].otherwise = [step('flavor', { text: 'Missed.' })]
  old.blocks.push(block('damage', { steps: [step('flavor', { text: 'Always.' })] }))
  const { sections } = toScript(old)
  assert.equal(sections.length, 1, 'blocks at the same point share a section')
  const [wrapped, always] = sections[0].lines
  assert.equal(wrapped.type, 'if')
  assert.equal(wrapped.key, old.blocks[0].key, 'the if keeps the block’s key (once-per-turn tracking)')
  assert.deepEqual(wrapped.then.map((l) => l.type), ['value', 'math', 'flavor', 'damageRoll'])
  assert.deepEqual(wrapped.else.map((l) => l.text), ['Missed.'])
  assert.equal(always.text, 'Always.')
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

function run(spec, { pass, workflow, item: kept = null, activity = {}, token }) {
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
    // Player p1 owns Bhern.
    testUserPermission: (u, level) => level === 'OWNER' && u.id === 'p1',
  }
  const item = kept ?? {
    name: built.name,
    uuid: 'Item.reap',
    img: 'reap.svg',
    flags: {},
    system: { uses: { max: 3, spent: 0, value: 3 } },
    effects: built.effects.map((e) => ({ ...e, id: e._id, toObject: () => structuredClone(e) })),
    update: async (d) => world.uses.push(d),
  }
  const fn = new AsyncFunction('workflow', 'args', 'actor', 'token', 'item', 'rolledActivity', act.macroData.command)
  return fn(workflow, [{ macroPass: pass }], actor, token, item, activity)
}

// An item whose flags keep what the macro writes, across runs.
function keptItem() {
  const item = {
    name: 'Ravanous Necrolight',
    uuid: 'Item.sword',
    img: 'sword.svg',
    flags: {},
    system: {},
    effects: [],
    async update(changes) {
      for (const [path, value] of Object.entries(changes)) {
        const keys = path.split('.')
        const last = keys.pop()
        const parent = keys.reduce((o, k) => (o[k] ??= {}), item)
        if (last.startsWith('-=')) delete parent[last.slice(2)]
        else parent[last] = value
      }
    },
  }
  return item
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

// ---------------------------------------------------------------------------
// Remembering between uses, crits and pop-ups

test('a remembered number is still there on the next attack, and forgotten after its time', async () => {
  setup()
  game.time = { worldTime: 0 }
  const flow = {
    ...emptyFlow(),
    blocks: [
      block('attack', {
        checks: [check('hit')],
        steps: [
          step('value', { source: 'remembered', memory: 'stacks', start: '0', name: 'stacks' }),
          step('math', { name: 'next', expr: 'stacks + 1', show: false }),
          step('remember', { memory: 'stacks', amount: 'next', forget: '1' }),
        ],
      }),
    ],
  }
  assert.deepEqual(flowProblems(flow, 'attack'), [])
  const sword = keptItem()
  const spec = featureWith(flow)
  for (const time of [0, 6, 12]) {
    game.time.worldTime = time
    await run(spec, { pass: 'postAttackRoll', workflow: attackWorkflow(), item: sword })
  }
  assert.deepEqual(sword.flags['chrab-sync'].memory.stacks, { value: 3, at: 12, forget: 60 })
  await run(spec, { pass: 'postAttackRoll', workflow: attackWorkflow({ hit: false }), item: sword })
  assert.equal(sword.flags['chrab-sync'].memory.stacks.value, 3, 'a miss changes nothing')

  game.time.worldTime = 12 + 61 // more than a minute without a new one
  await run(spec, { pass: 'postAttackRoll', workflow: attackWorkflow(), item: sword })
  assert.equal(sword.flags['chrab-sync'].memory.stacks.value, 1, 'forgotten, so it starts over')

  const reset = { ...emptyFlow(), blocks: [block('attack', { steps: [step('remember', { mode: 'forget', memory: 'stacks' })] })] }
  await run(featureWith(reset), { pass: 'postAttackRoll', workflow: attackWorkflow(), item: sword })
  assert.equal(sword.flags['chrab-sync'].memory.stacks, undefined)
})

test('an attack can be made a critical hit, with a pop-up for the player and the GM', async () => {
  setup()
  const notices = []
  globalThis.ui = { notifications: { warn: (t) => notices.push(t) } }
  globalThis.ChatMessage.create = async (d) => world.messages.push(d)
  game.user = { id: 'p1', isGM: false }
  game.users = [{ id: 'gm1', isGM: true, active: true }, { id: 'p1', isGM: false, active: true }, { id: 'p2', isGM: false, active: true }]
  // A check sees the variables of earlier blocks, so the values come first.
  const flow = {
    ...emptyFlow(),
    name: 'Ravenous',
    blocks: [
      block('attack', { steps: [step('value', { source: 'natural', name: 'natural' }), step('value', { source: 'critAt', name: 'critAt' })] }),
      block('attack', {
        checks: [check('hit'), check('notCrit'), check('compare', { left: 'natural', op: '>=', right: 'critAt - 2' })],
        steps: [step('makeCrit'), step('popup', { text: 'Crit on a {natural}!', gm: true })],
      }),
    ],
  }
  assert.deepEqual(flowProblems(flow, 'attack'), [])

  const wf = { ...attackWorkflow(), diceRoll: 18, isCritical: false }
  await run(featureWith(flow), { pass: 'postAttackRoll', workflow: wf, activity: { criticalThreshold: 20 } })
  assert.equal(wf.isCritical, true, '18 is within 20 - 2')
  assert.deepEqual(notices, ['Crit on a 18!'])
  const whisper = world.messages.find((m) => m.flags?.['chrab-sync']?.popup)
  assert.deepEqual(whisper.whisper, ['gm1'], 'the GM gets it, flagged for Chrab Sync to pop up')

  // The GM rolls for Bhern: the GM's own notice, and Bhern's player (not
  // another player) gets the whisper.
  game.user = { id: 'gm1', isGM: true }
  world.messages.length = 0
  notices.length = 0
  await run(featureWith(flow), { pass: 'postAttackRoll', workflow: { ...attackWorkflow(), diceRoll: 18, isCritical: false }, activity: { criticalThreshold: 20 } })
  assert.deepEqual(notices, ['Crit on a 18!'])
  assert.deepEqual(world.messages.find((m) => m.flags?.['chrab-sync']?.popup).whisper, ['p1'], 'the player sees it when the GM rolls')
  game.user = { id: 'p1', isGM: false }

  // A crit always hits, even a roll that missed the target's AC.
  const missed = { ...attackWorkflow({ hit: false }), diceRoll: 19, isCritical: false }
  const loose = { ...emptyFlow(), blocks: [block('attack', { steps: [step('makeCrit')] })] }
  await run(featureWith(loose), { pass: 'postAttackRoll', workflow: missed })
  assert.equal(missed.isCritical, true)
  assert.deepEqual([...missed.hitTargets].map((t) => t.name), ['Goblin'])

  const low = { ...attackWorkflow(), diceRoll: 12, isCritical: false }
  await run(featureWith(flow), { pass: 'postAttackRoll', workflow: low, activity: { criticalThreshold: 20 } })
  assert.equal(low.isCritical, false)
})

test('the new lines say what’s missing, and the crit step only fits after the attack roll', () => {
  const texts = flowProblems(
    script(section('damage', [line('makeCrit'), line('memory', { name: '' }), line('popup', { text: '' }), line('forget', { name: 'nope' }), line('memory', { name: 'n', forget: 'soon' })])),
    'attack',
  ).map((p) => p.text)
  assert.ok(texts.some((t) => /“Make this attack a critical hit” can’t happen at “When damage is rolled”/.test(t)))
  assert.ok(texts.some((t) => /remembered \?, starting at 0”: name the variable/.test(t)))
  assert.ok(texts.some((t) => /the pop-up is empty/.test(t)))
  assert.ok(texts.some((t) => /pick which remembered number/.test(t)))
  assert.ok(texts.some((t) => /“forget after” is a number of minutes/.test(t)))
})

// ---------------------------------------------------------------------------
// Scripts: the Ravanous Necrolight, written the way it reads

// remembered CritAt (starts at 20, forgotten after 1 minute)
// set natural = the natural d20
// if natural ≥ CritAt: make it a crit, pop up, set CritAt = 20
// otherwise: if hit and living and HP > 0: set CritAt = CritAt - 1
function ravenous() {
  return script(
    section('attack', [
      line('memory', { name: 'CritAt', start: '20', forget: '1' }),
      line('value', { source: 'natural', name: 'natural' }),
      ifLine(
        [check('compare', { left: 'natural', op: '>=', right: 'CritAt' })],
        [line('makeCrit'), line('popup', { text: 'Ravenous: roll critical damage!', gm: true }), line('math', { name: 'CritAt', expr: '20', show: false })],
        [
          ifLine(
            [check('hit'), check('target', { target: { ...check('target').target, id: 'typeIsNot', types: ['undead', 'construct'] } }), check('compare', { left: 'hp', op: '>', right: '0' })],
            [line('math', { name: 'CritAt', expr: 'CritAt - 1', show: false })],
          ),
        ],
      ),
    ]),
  )
}

test('the Ravanous Necrolight: the crit number drops a step a hit, a crit resets it, and it lapses after a minute', async () => {
  setup()
  game.time = { worldTime: 0 }
  game.user = { isGM: false }
  game.users = [{ id: 'gm1', isGM: true, active: true }]
  const notices = []
  globalThis.ui = { notifications: { warn: (t) => notices.push(t) } }
  globalThis.ChatMessage.create = async (d) => world.messages.push(d)
  // The target checks go through midi's evalCondition: a living goblin passes.
  globalThis.MidiQOL.createConditionData = () => ({})
  globalThis.MidiQOL.evalCondition = async () => true

  const flow = ravenous()
  // The HP compare needs hp: grab it first, right after the d20.
  flow.sections[0].lines.splice(2, 0, line('value', { source: 'targetHp', name: 'hp' }))
  assert.deepEqual(flowProblems(flow, 'attack'), [])
  const spec = featureWith(flow)
  const sword = keptItem()
  const attack = async (natural, { hit = true, time = 0 } = {}) => {
    game.time.worldTime = time
    const wf = { ...attackWorkflow({ hit }), diceRoll: natural, isCritical: natural === 20 }
    await run(spec, { pass: 'postAttackRoll', workflow: wf, item: sword })
    return wf
  }
  const critAt = () => sword.flags['chrab-sync']?.memory?.CritAt?.value

  await attack(12, { time: 0 })
  await attack(8, { time: 6 })
  await attack(15, { time: 12 })
  assert.equal(critAt(), 17, 'three hits: 20 → 17')
  await attack(16, { hit: false, time: 18 })
  assert.equal(critAt(), 17, 'a miss doesn’t stack')

  const crit = await attack(17, { time: 24 })
  assert.equal(crit.isCritical, true, '17 reaches CritAt 17')
  assert.deepEqual(notices, ['Ravenous: roll critical damage!'])
  assert.ok(world.messages.some((m) => m.flags?.['chrab-sync']?.popup), 'the GM gets it too')
  assert.equal(critAt(), 20, 'the crit resets it')

  await attack(10, { time: 30 })
  assert.equal(critAt(), 19)
  await attack(10, { time: 30 + 61 })
  assert.equal(critAt(), 19, 'more than a minute later it had lapsed to 20, so this hit makes 19 again')
})

test('ifs nest, and "any of" needs only one check', async () => {
  setup()
  const flow = script(
    section('attack', [
      ifLine(
        [check('miss'), check('natural', { value: '18' })],
        [line('flavor', { text: 'either', style: 'plain' }), ifLine([check('crit')], [line('flavor', { text: 'crit', style: 'plain' })], [line('flavor', { text: 'no crit', style: 'plain' })])],
        [],
        { join: 'any' },
      ),
    ]),
  )
  assert.deepEqual(flowProblems(flow, 'attack'), [])
  const wf = { ...attackWorkflow(), diceRoll: 18, isCritical: false }
  await run(featureWith(flow), { pass: 'postAttackRoll', workflow: wf })
  await run(featureWith(flow), { pass: 'postActiveEffects', workflow: wf })
  assert.match(world.messages[0].content, /<li>either<\/li><li>no crit<\/li>/)
  assert.deepEqual(flowSummary(flow), ['After the attack roll:', '  if the attack missed or the natural d20 is 18 or higher:', '    say “either”', '    if it’s a critical hit:', '      say “crit”', '    otherwise:', '      say “no crit”'])
})

// ---------------------------------------------------------------------------
// Picking targets on the map

// A stand-in map: squares of 100 px = 5 ft. clicks are fed to the picker one
// at a time; keys go to its keydown listener.
function mapWith(tokens, { clicks = [], keys = [] } = {}) {
  const drawn = []
  const g = () => ({ lineStyle() { return this }, beginFill() { return this }, endFill() { return this }, moveTo() { return this }, lineTo() { return this }, clear() {}, drawCircle(x, y, r) { this.circle ??= { x, y, r }; return this } })
  globalThis.PIXI = {
    Graphics: class { constructor() { Object.assign(this, g()); drawn.push(this) } },
    Container: class { addChild() {} destroy() { this.destroyed = true } },
    Text: class { constructor() { this.anchor = { set() {} }; this.position = { set() {} } } destroy() {} },
  }
  const map = { drawn, targeted: null }
  globalThis.canvas = {
    ready: true,
    dimensions: { distance: 5, size: 100 },
    grid: { distance: 5, size: 100, measurePath: ([a, b]) => ({ distance: (Math.hypot(b.x - a.x, b.y - a.y) / 100) * 5 }) },
    tokens: { placeables: tokens, setTargets: (ids) => (map.targeted = ids) },
    interface: { addChild: () => {} },
    stage: {
      // The pickers listen in the capture phase, ahead of the token under the cursor.
      addEventListener: (event, fn, options) => {
        assert.equal(options?.capture, true)
        const next = () => {
          const c = clicks.shift()
          if (!c) return
          fn({ button: 0, shiftKey: false, getLocalPosition: () => c.at.center, stopPropagation() {}, ...c })
          queueMicrotask(next)
        }
        queueMicrotask(next)
      },
      removeEventListener: () => {},
    },
  }
  globalThis.document = { addEventListener: (type, fn) => keys.length && queueMicrotask(() => fn({ key: keys.shift(), stopPropagation() {}, preventDefault() {} })), removeEventListener() {} }
  globalThis.ui = { notifications: { info: () => {}, warn: () => {} } }
  return map
}

function onMap(name, x, { side = -1, size = 1 } = {}) {
  return {
    id: name.toLowerCase(),
    name,
    actor: { name, uuid: `Actor.${name}`, isOwner: false, system: { attributes: { hp: { value: 30, max: 30 } } } },
    center: { x, y: 500 },
    x: x - 50 * size,
    y: 500 - 50 * size,
    w: 100 * size,
    h: 100 * size,
    document: { width: size, height: size, disposition: side, uuid: `Token.${name}` },
    bounds: { contains: (px, py) => Math.abs(px - x) <= 50 * size && Math.abs(py - 500) <= 50 * size },
  }
}

const offMap = () => {
  for (const k of ['PIXI', 'canvas', 'document', 'ui']) delete globalThis[k]
}

test('missiles in the builder: pick 3 + upcast enemies in range, stacking, then each takes its picks’ damage', async () => {
  setup()
  const flow = script(
    section('done', [
      line('value', { source: 'upcast', name: 'upcast' }),
      line('pickTargets', { amount: '3 + upcast', range: '120', who: 'enemies', stack: true }),
      line('damageTarget', { to: 'each', amount: 'picks * (1d6 + 1)', damageType: 'radiant' }),
    ]),
  )
  assert.deepEqual(flowProblems(flow, 'utility'), [])
  assert.deepEqual(flowSummary(flow), [
    'After it’s all done:',
    '  set upcast = slot levels above the spell’s (upcast)',
    '  pick 3 + upcast enemies within 120 ft on the map, picks can stack',
    '  every picked creature takes picks * (1d6 + 1) radiant damage',
  ])
  const me = onMap('Lyra', 500, { side: 1 })
  const goblin = onMap('Goblin', 1500)
  const ogre = onMap('Ogre', 2950, { size: 2 })
  const friend = onMap('Friend', 1000, { side: 1 })
  // Goblin, the ally (not an enemy: ignored), goblin again, then the rest on the ogre.
  const map = mapWith([me, goblin, ogre, friend], { clicks: [{ at: goblin }, { at: friend }, { at: goblin }, { at: ogre, shiftKey: true }] })
  const wf = { targets: setOf(), hitTargets: setOf(), chatCard: { system: { scaling: 1 } } }
  await run(featureWith(flow, 'utility'), { pass: 'postActiveEffects', workflow: wf, token: me })
  assert.deepEqual(map.drawn[0].circle, { x: 500, y: 500, r: 2400 }, 'a 120 ft ring around the caster')
  // 1d6 + 1 is 5 a missile in the stand-in.
  assert.deepEqual(world.tokenDamage.map((d) => [d.target, d.total, d.detail[0].type]), [['Goblin', 10, 'radiant'], ['Ogre', 10, 'radiant']])
  assert.equal(map.targeted, null, 'after the roll, the roll’s own targets stay as they were')
  const html = world.messages[0].content
  assert.match(html, /Picks Goblin ×2, Ogre ×2/)
  assert.match(html, /Goblin takes 10 radiant damage/)
  offMap()
})

test('picking when it’s used makes them the roll’s targets; Esc cancels the use', async () => {
  setup()
  const flow = script(section('use', [line('pickTargets', { amount: '2', range: '30' })]))
  const me = onMap('Lyra', 500, { side: 1 })
  const goblin = onMap('Goblin', 800)
  const wolf = onMap('Wolf', 600)
  let map = mapWith([me, goblin, wolf], { clicks: [{ at: goblin }, { at: wolf }] })
  const wf = { targets: setOf(), setTargets(set) { this.targets = set } }
  assert.notEqual(await run(featureWith(flow, 'save'), { pass: 'preItemRoll', workflow: wf, token: me }), false)
  assert.deepEqual([...wf.targets].map((t) => t.name), ['Goblin', 'Wolf'])
  assert.deepEqual(map.targeted, ['goblin', 'wolf'], 'the player’s targets show them too')
  offMap()

  map = mapWith([me, goblin, wolf], { keys: ['Escape'] })
  assert.equal(await run(featureWith(flow, 'save'), { pass: 'preItemRoll', workflow: { targets: setOf() }, token: me }), false)
  assert.equal(map.targeted, null)
  offMap()
})

test('a blank range is the spell’s own, whatever it is: in the scene’s units, touch is 5 ft, self has no limit', async () => {
  const flow = script(section('use', [line('pickTargets', { amount: '1' })]))
  assert.deepEqual(flowSummary(flow), ['When it’s used:', '  pick 1 creatures within its own range on the map'])
  const me = onMap('Lyra', 500, { side: 1 })
  const goblin = onMap('Goblin', 800) // 3 squares
  const pick = async (range, sceneUnits = 'ft', clicks = [{ at: goblin }]) => {
    setup()
    const map = mapWith([me, goblin], { clicks })
    if (sceneUnits === 'm') {
      Object.assign(canvas, {
        dimensions: { distance: 1.5, size: 100 },
        grid: { distance: 1.5, size: 100, measurePath: ([a, b]) => ({ distance: (Math.hypot(b.x - a.x, b.y - a.y) / 100) * 1.5 }) },
        scene: { grid: { units: 'm' } },
      })
    }
    const wf = { targets: setOf(), setTargets(set) { this.targets = set } }
    const out = await run(featureWith(flow, 'save'), { pass: 'preItemRoll', workflow: wf, token: me, activity: { range } })
    offMap()
    return { ring: map.drawn[0]?.circle?.r ?? 0, picked: [...wf.targets].map((t) => t.name), out }
  }
  // 30 ft is 9 m: 6 squares of 1.5 m.
  assert.deepEqual(await pick({ value: 30, units: 'ft' }, 'm'), { ring: 600, picked: ['Goblin'], out: undefined })
  // 1 mile is far more than the map: a big ring.
  assert.equal((await pick({ value: 1, units: 'mi' })).ring, 105600)
  // Touch: 5 ft, so the goblin 15 ft away can't be picked and the picker is never opened.
  const touch = await pick({ value: null, units: 'touch' }, 'ft', [])
  assert.deepEqual([touch.picked, touch.out], [[], false])
  // Self: no ring and no limit.
  assert.deepEqual(await pick({ value: null, units: 'self' }), { ring: 0, picked: ['Goblin'], out: undefined })
})

test('picking: where it fits, and picks is known only on “every picked creature” lines', () => {
  const late = script(section('damage', [line('pickTargets')]))
  assert.match(flowProblems(late, 'attack')[0].text, /can’t happen at “When damage is rolled”/)
  const early = script(section('use', [line('value', { source: 'upcast', name: 'upcast' })]))
  assert.match(flowProblems(early, 'save')[0].text, /isn’t known yet at “When it’s used”/)
  const loose = script(section('done', [line('pickTargets'), line('damageTarget', { amount: 'picks * 2' })]))
  assert.match(flowProblems(loose, 'utility')[0].text, /I don’t know “picks”/)
  const badRange = script(section('done', [line('pickTargets', { range: 'far' })]))
  assert.match(flowProblems(badRange, 'utility')[0].text, /range is a number of feet/)
})
