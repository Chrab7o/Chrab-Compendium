// Built automation: a roll's own midi-qol macro, assembled step by step in
// the Automation Builder (components/dm/feature/AutomationWizard.jsx) instead
// of picked from a fixed recipe.
//
// A flow is a list of blocks. Each block is
//   when   - a trigger: a point in this roll's midi workflow (FLOW_TRIGGERS)
//   if     - checks, all of which must hold (FLOW_CHECKS); none = always
//   then   - steps, run in order (FLOW_STEPS): grab a value into a variable,
//            do math on variables, add a line to the chat card, use a number
//            as damage, heal, apply an effect, spend a resource, raw code...
//   else   - steps run when a check fails (optional)
//
// Variables live on the workflow, so a value grabbed before the attack can
// be used when damage is rolled. Math is a Foundry roll formula: `hp / 2`
// becomes `@hp / 2` against the owner's roll data plus the variables, so dice
// (`2d6 + hp`), @abilities.con.mod and floor()/max() all work.
//
// It compiles to ONE activity macro, listed once per pass it needs in the
// item's onUseMacroName, that switches on args[0].macroPass. The chat card
// collects every step across passes and posts after the roll is done.
// Midi calls are from the midi-qol 14 source (the sandbox's
// probes/midi-qol-v14-reference.md and vendor/midi-qol); docs/automation-builder.md
// lists which ones still need a run in Foundry.

import { conditionText, emptyCondition } from './foundryAutomation.js'
import { CHAT_RUNTIME, cardColor } from './foundryChat.js'
import { SELF_CONDITIONS, emptySelfCondition, selfConditionText } from './foundryBehaviors.js'

const js = (value) => JSON.stringify(value)

function newKey() {
  return Math.random().toString(36).slice(2, 12)
}

const ABILITY_NAMES = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' }

// ---------------------------------------------------------------------------
// When

// order: the order midi runs them in. kinds: the roll kinds that have it
// (null = every kind).
export const FLOW_TRIGGERS = [
  { key: 'use', label: 'When it’s used, before anything rolls', short: 'When it’s used', help: 'Targets are picked, nothing is rolled yet. The only point where the use can still be cancelled.', pass: 'preItemRoll', kinds: null },
  { key: 'preAttack', label: 'Before the attack roll', short: 'Before the attack roll', help: 'Can give the attack advantage or disadvantage.', pass: 'preAttackRollConfig', kinds: ['attack'] },
  { key: 'attack', label: 'After the attack roll', short: 'After the attack roll', help: 'Hit or miss, critical and the natural d20 are known. Damage isn’t rolled yet.', pass: 'postAttackRoll', kinds: ['attack'] },
  { key: 'save', label: 'After the targets roll their saves', short: 'After the saves', help: 'Who failed and who succeeded is known.', pass: 'postSave', kinds: ['save'] },
  { key: 'damage', label: 'When damage is rolled, before it lands', short: 'When damage is rolled', help: 'The damage total is known and can be replaced or added to.', pass: 'postDamageRoll', kinds: ['attack', 'save', 'damage', 'heal'] },
  { key: 'done', label: 'After it’s all done', short: 'After it’s all done', help: 'Damage has landed and effects are applied. “Damage dealt” is known.', pass: 'postActiveEffects', kinds: null },
]

const ORDER = Object.fromEntries(FLOW_TRIGGERS.map((t, i) => [t.key, i]))
const at = (trigger, key) => (ORDER[trigger] ?? 0) >= ORDER[key]

export function triggersFor(kind) {
  return FLOW_TRIGGERS.filter((t) => !t.kinds || t.kinds.includes(kind))
}

export function flowTrigger(key) {
  return FLOW_TRIGGERS.find((t) => t.key === key) ?? FLOW_TRIGGERS[0]
}

// What a point in the workflow knows, for filtering checks, values and steps.
// ctx: { trigger, kind }
const knows = {
  attack: ({ trigger, kind }) => kind === 'attack' && at(trigger, 'attack'),
  save: ({ trigger, kind }) => kind === 'save' && at(trigger, 'save'),
  damage: ({ trigger, kind }) => ['attack', 'save', 'damage', 'heal'].includes(kind) && at(trigger, 'damage'),
  dealt: ({ trigger }) => trigger === 'done',
}

// ---------------------------------------------------------------------------
// Values ("grab a value" steps). code: a JS expression in the macro, using
// the helpers it defines (target(), tA(), usesLeft()...). param: the extra
// field it needs.

export const FLOW_VALUES = [
  { key: 'targetHp', group: 'The target', label: 'Its current HP', name: 'hp', code: () => 'tA()?.system?.attributes?.hp?.value' },
  { key: 'targetHpMax', group: 'The target', label: 'Its max HP', name: 'maxHp', code: () => 'tA()?.system?.attributes?.hp?.max' },
  { key: 'targetHpMissing', group: 'The target', label: 'The HP it’s missing', name: 'missing', code: () => '(tA()?.system?.attributes?.hp?.max ?? 0) - (tA()?.system?.attributes?.hp?.value ?? 0)' },
  { key: 'targetTempHp', group: 'The target', label: 'Its temporary HP', name: 'tempHp', code: () => 'tA()?.system?.attributes?.hp?.temp' },
  { key: 'targetAc', group: 'The target', label: 'Its AC', name: 'ac', code: () => 'tA()?.system?.attributes?.ac?.value' },
  { key: 'targetMod', group: 'The target', label: 'Its ability modifier', name: 'mod', param: 'ability', code: (s) => `tA()?.system?.abilities?.[${js(s.ability || 'con')}]?.mod` },
  { key: 'targetScore', group: 'The target', label: 'Its ability score', name: 'score', param: 'ability', code: (s) => `tA()?.system?.abilities?.[${js(s.ability || 'con')}]?.value` },
  { key: 'targetLevel', group: 'The target', label: 'Its level (or CR)', name: 'level', code: () => '(tA()?.system?.details?.level ?? tA()?.system?.details?.cr)' },
  { key: 'targetSize', group: 'The target', label: 'Its size (Tiny 0 … Gargantuan 5)', name: 'size', code: () => '["tiny", "sm", "med", "lg", "huge", "grg"].indexOf(tA()?.system?.traits?.size)' },
  { key: 'targetStat', group: 'The target', label: 'Any of its stats (a path)', name: 'stat', param: 'path', code: (s) => `foundry.utils.getProperty(tA()?.getRollData?.() ?? {}, ${js(cleanPath(s.path))})` },
  { key: 'myHp', group: 'You', label: 'Your current HP', name: 'myHp', code: () => 'actor.system?.attributes?.hp?.value' },
  { key: 'myHpMax', group: 'You', label: 'Your max HP', name: 'myMaxHp', code: () => 'actor.system?.attributes?.hp?.max' },
  { key: 'myHpMissing', group: 'You', label: 'The HP you’re missing', name: 'myMissing', code: () => '(actor.system?.attributes?.hp?.max ?? 0) - (actor.system?.attributes?.hp?.value ?? 0)' },
  { key: 'myMod', group: 'You', label: 'Your ability modifier', name: 'myMod', param: 'ability', code: (s) => `actor.system?.abilities?.[${js(s.ability || 'con')}]?.mod` },
  { key: 'myLevel', group: 'You', label: 'Your level', name: 'myLevel', code: () => '(actor.system?.details?.level ?? actor.system?.details?.cr)' },
  { key: 'myProf', group: 'You', label: 'Your proficiency bonus', name: 'prof', code: () => 'actor.system?.attributes?.prof' },
  { key: 'myResource', group: 'You', label: 'What’s left of a resource', name: 'left', param: 'pool', code: (s) => `usesLeft(poolItem(${js(poolId(s.pool))}))` },
  { key: 'featureUses', group: 'You', label: 'Uses left on this feature', name: 'uses', code: () => 'usesLeft(item)' },
  { key: 'myStat', group: 'You', label: 'Any of your stats (a path)', name: 'stat', param: 'path', code: (s) => `foundry.utils.getProperty(actor.getRollData?.() ?? {}, ${js(cleanPath(s.path))})` },
  { key: 'natural', group: 'This roll', label: 'The natural d20 of the attack', name: 'natural', needs: 'attack', code: () => 'workflow?.diceRoll' },
  { key: 'attackTotal', group: 'This roll', label: 'The attack roll’s total', name: 'attack', needs: 'attack', code: () => 'workflow?.attackTotal' },
  { key: 'hitCount', group: 'This roll', label: 'How many targets were hit', name: 'hits', needs: 'attack', code: () => 'workflow?.hitTargets?.size' },
  { key: 'saveDc', group: 'This roll', label: 'The save DC', name: 'dc', kinds: ['save'], code: () => 'workflow?.saveDC' },
  { key: 'targetSave', group: 'This roll', label: 'The target’s save total', name: 'saveTotal', needs: 'save', code: () => 'workflow?.tokenSaves?.[target()?.document?.uuid]?.total' },
  { key: 'failedCount', group: 'This roll', label: 'How many failed the save', name: 'failed', needs: 'save', code: () => 'workflow?.failedSaves?.size' },
  { key: 'targetCount', group: 'This roll', label: 'How many targets there are', name: 'targets', code: () => 'workflow?.targets?.size' },
  { key: 'damageTotal', group: 'This roll', label: 'The damage rolled', name: 'rolled', needs: 'damage', code: () => 'workflow?.damageTotal' },
  { key: 'damageDealt', group: 'This roll', label: 'The damage that landed (HP lost)', name: 'dealt', needs: 'dealt', code: () => '(workflow?.damageList ?? []).reduce((sum, d) => sum + (Number(d.hpDamage) || 0) + (Number(d.tempDamage) || 0), 0)' },
  { key: 'dice', group: 'Roll or ask', label: 'Roll some dice', name: 'roll', param: 'formula' },
  { key: 'ask', group: 'Roll or ask', label: 'Ask the player for a number', name: 'answer', param: 'question' },
]

export function valuesFor(ctx) {
  return FLOW_VALUES.filter((v) => (!v.needs || knows[v.needs](ctx)) && (!v.kinds || v.kinds.includes(ctx.kind)))
}

// ---------------------------------------------------------------------------
// If

export const FLOW_CHECKS = [
  { key: 'hit', label: 'The attack hit', needs: 'attack' },
  { key: 'miss', label: 'The attack missed', needs: 'attack' },
  { key: 'crit', label: 'It’s a critical hit', needs: 'attack' },
  { key: 'natural', label: 'The natural d20 is at least…', needs: 'attack' },
  { key: 'failedSave', label: 'A target failed its save', needs: 'save' },
  { key: 'madeSave', label: 'Every target made its save', needs: 'save' },
  { key: 'compare', label: 'Compare two numbers (math)' },
  { key: 'target', label: 'The target… (type, HP, size, condition)' },
  { key: 'self', label: 'You… (HP, a condition, a resource)' },
  { key: 'level', label: 'You’re at least level…' },
  { key: 'ask', label: 'The player says yes' },
  { key: 'oncePerTurn', label: 'It hasn’t happened yet this turn' },
  { key: 'code', label: 'Custom JavaScript (advanced)' },
]

export const COMPARE_OPS = [
  ['>=', 'at least'],
  ['>', 'more than'],
  ['==', 'exactly'],
  ['!=', 'not'],
  ['<', 'less than'],
  ['<=', 'at most'],
]

export function checksFor(ctx) {
  return FLOW_CHECKS.filter((c) => !c.needs || knows[c.needs](ctx))
}

export function emptyCheck(type = 'compare') {
  return {
    key: newKey(),
    type,
    value: type === 'level' ? '5' : '19', // natural / level
    left: '', // compare: math
    op: '>=',
    right: '',
    target: emptyCondition('hpAtMost'), // target: a foundryAutomation condition row
    self: emptySelfCondition('hpBelowHalf'), // self: a foundryBehaviors self row
    question: '', // ask: blank = "Use <name>?"
    code: '', // code: a JS expression
  }
}

// ---------------------------------------------------------------------------
// Then

// needs: what the trigger must know; only: the triggers it works at.
export const FLOW_STEPS = [
  { key: 'value', group: 'Values and math', label: 'Grab a value', help: 'Puts a number in a variable: the target’s HP, your level, a dice roll, an answer from the player…' },
  { key: 'math', group: 'Values and math', label: 'Do some math', help: 'Works out a new variable from the ones you have, e.g. floor(hp / 2) + prof.' },
  { key: 'flavor', group: 'Chat card', label: 'Flavor text', help: 'A line on the chat card. {name} fills in a variable, {target} the target’s name, {me} yours.' },
  { key: 'damageRoll', group: 'Damage and healing', label: 'Use a number as this roll’s damage', help: 'Replaces the rolled damage with your number, or adds it on top.', needs: 'damage', only: ['damage'] },
  { key: 'damageTarget', group: 'Damage and healing', label: 'The target takes damage', help: 'Separate from this roll’s damage. Resistances apply.' },
  { key: 'healTarget', group: 'Damage and healing', label: 'The target regains HP' },
  { key: 'healMe', group: 'Damage and healing', label: 'You regain HP' },
  { key: 'tempMe', group: 'Damage and healing', label: 'You gain temporary HP' },
  { key: 'hurtMe', group: 'Damage and healing', label: 'You take damage', help: 'Exactly this amount: your resistances don’t change it.' },
  { key: 'advantage', group: 'The roll', label: 'Give the attack advantage or disadvantage', only: ['preAttack'] },
  { key: 'cancel', group: 'The roll', label: 'Cancel the use', help: 'Stops here; nothing rolls.', only: ['use'] },
  { key: 'condition', group: 'Effects', label: 'Apply a condition', help: 'Prone, frightened… on the target or you.' },
  { key: 'effect', group: 'Effects', label: 'Apply one of this item’s effects' },
  { key: 'resource', group: 'Resources', label: 'Spend or regain a resource' },
  { key: 'featureUses', group: 'Resources', label: 'Spend or regain this feature’s uses' },
  { key: 'code', group: 'Advanced', label: 'Custom code', help: 'JavaScript run right here. V.name is a variable; say(html) adds a card line; await calc("2d6 + @hp") rolls math.' },
]

export function stepsFor(ctx) {
  return FLOW_STEPS.filter((s) => (!s.needs || knows[s.needs](ctx)) && (!s.only || s.only.includes(ctx.trigger)))
}

export function emptyStep(type = 'value', { suggestName = '' } = {}) {
  const value = FLOW_VALUES[0]
  return {
    key: newKey(),
    type,
    // value
    source: value.key,
    name: suggestName || (type === 'math' ? 'total' : value.name), // value / math: the variable it sets
    ability: 'con',
    path: '',
    pool: '',
    formula: '1d6', // value "dice"
    question: '', // value "ask"
    show: type === 'math', // value / math: a card line "name: 12"
    showLabel: '',
    // math, and the amount of every apply step
    expr: '',
    amount: '',
    // flavor
    text: '',
    style: 'flavor', // 'flavor' (italic) | 'plain'
    // damage
    mode: type === 'damageRoll' ? 'replace' : type === 'resource' || type === 'featureUses' ? 'spend' : 'advantage',
    damageType: '', // '' = the roll's own (damageRoll) / untyped
    // effects
    to: 'target', // 'target' | 'self'
    status: 'prone',
    rounds: '', // condition: '' = until removed
    effectKey: '',
    // code
    code: '',
  }
}

export function emptyBlock(trigger = 'damage') {
  return { key: newKey(), trigger, checks: [], steps: [], otherwise: [] }
}

export function emptyFlow() {
  return { key: newKey(), name: '', color: '', blocks: [] }
}

// Blocks run in workflow order, so they're kept in it (stable within a trigger).
export function sortBlocks(blocks) {
  return [...blocks].map((b, i) => [b, i]).sort((a, b) => (ORDER[a[0].trigger] ?? 0) - (ORDER[b[0].trigger] ?? 0) || a[1] - b[1]).map(([b]) => b)
}

export function hasFlow(activity) {
  return !!activity?.flow?.blocks?.some((b) => b.steps?.length || b.otherwise?.length)
}

// ---------------------------------------------------------------------------
// Variables and math

const MATH_FUNCS = ['floor', 'ceil', 'round', 'min', 'max', 'abs', 'sqrt', 'pow', 'sign', 'trunc']
const RESERVED = new Set([...MATH_FUNCS, 'd', 'target', 'me', 'V', 'say', 'calc'])

export function validVarName(name) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(String(name ?? '')) && !RESERVED.has(name) && !/^d\d+$/.test(name)
}

function setsVar(step) {
  return (step.type === 'value' || step.type === 'math') && validVarName(step.name) ? step.name : null
}

// Every variable the flow sets, for initializing them (a block that didn't
// run leaves its variables at 0 rather than breaking later math).
export function flowVars(flow) {
  return [...new Set((flow?.blocks ?? []).flatMap((b) => [...(b.steps ?? []), ...(b.otherwise ?? [])].map(setsVar)).filter(Boolean))]
}

// The variables a spot can use: everything set by blocks that run before it,
// and by earlier steps of its own branch. at: { block, branch, step } where
// branch is 'checks' | 'steps' | 'otherwise'. Blocks must be in run order.
export function varsBefore(flow, { block, branch = 'steps', step = Infinity }) {
  const blocks = flow?.blocks ?? []
  const out = []
  blocks.slice(0, block).forEach((b) => [...(b.steps ?? []), ...(b.otherwise ?? [])].forEach((s) => out.push(setsVar(s))))
  if (branch !== 'checks') (blocks[block]?.[branch] ?? []).slice(0, step).forEach((s) => out.push(setsVar(s)))
  return [...new Set(out.filter(Boolean))]
}

// Math as the user types it -> a Foundry roll formula. Known variable names
// get an @; functions, dice and @references pass through.
//   "floor(hp / 2) + 2d6" -> "floor(@hp / 2) + 2d6"
export function mathFormula(expr, vars = []) {
  const text = String(expr ?? '').trim()
  if (!text) return { formula: '', error: 'Write some math.' }
  if (/[^\w@.\s+\-*/%(),]/.test(text)) return { formula: text, error: 'Only numbers, variable names, dice, @references and + - * / % ( ) , can go in the math.' }
  const unknown = []
  const formula = text.replace(/@[\w.-]+|\b[A-Za-z_]\w*/g, (m, offset) => {
    if (m.startsWith('@')) return m
    if (MATH_FUNCS.includes(m) && /^\s*\(/.test(text.slice(offset + m.length))) return m
    if (/^d\d+$/.test(m)) return m // d20 on its own
    if (vars.includes(m)) return `@${m}`
    unknown.push(m)
    return m
  })
  if (unknown.length) return { formula, error: `I don’t know ${[...new Set(unknown)].map((u) => `“${u}”`).join(', ')}. Grab it as a value first, or check the spelling.` }
  let depth = 0
  for (const ch of text) {
    depth += ch === '(' ? 1 : ch === ')' ? -1 : 0
    if (depth < 0) break
  }
  if (depth !== 0) return { formula, error: 'The brackets don’t match.' }
  return { formula, error: '' }
}

const cleanPath = (p) => String(p ?? '').trim().replace(/^@/, '')

const poolId = (text) =>
  String(text ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

// ---------------------------------------------------------------------------
// Problems: everything that would make the macro wrong, worded for the builder.

export function flowProblems(flow, kind) {
  const problems = []
  const blocks = flow?.blocks ?? []
  blocks.forEach((b, bi) => {
    const where = `Block ${bi + 1}`
    const trig = flowTrigger(b.trigger)
    if (trig.kinds && !trig.kinds.includes(kind)) problems.push({ block: bi, text: `${where}: “${trig.short}” doesn’t happen on this kind of roll.` })
    const ctx = { trigger: b.trigger, kind }
    const okChecks = new Set(checksFor(ctx).map((c) => c.key))
    for (const c of b.checks ?? []) {
      const def = FLOW_CHECKS.find((x) => x.key === c.type)
      if (!okChecks.has(c.type)) problems.push({ block: bi, text: `${where}: “${def?.label ?? c.type}” isn’t known yet at “${trig.short}”.` })
      if (c.type === 'compare') {
        const vars = varsBefore(flow, { block: bi, branch: 'checks' })
        for (const side of [c.left, c.right]) {
          const { error } = mathFormula(side, vars)
          if (error) problems.push({ block: bi, text: `${where}, condition: ${error}` })
        }
      }
      if (c.type === 'code' && !String(c.code ?? '').trim()) problems.push({ block: bi, text: `${where}: the custom condition is empty.` })
    }
    if (!(b.steps ?? []).length && !(b.otherwise ?? []).length) problems.push({ block: bi, text: `${where}: nothing happens yet. Add a step.` })
    for (const branch of ['steps', 'otherwise']) {
      ;(b[branch] ?? []).forEach((s, si) => {
        const def = FLOW_STEPS.find((x) => x.key === s.type)
        const label = `${where}${branch === 'otherwise' ? ', otherwise' : ''}, step ${si + 1}`
        if (!stepsFor(ctx).some((x) => x.key === s.type)) problems.push({ block: bi, text: `${label}: “${def?.label ?? s.type}” can’t happen at “${trig.short}”.` })
        const vars = varsBefore(flow, { block: bi, branch, step: si })
        if (s.type === 'value' || s.type === 'math') {
          if (!validVarName(s.name)) problems.push({ block: bi, text: `${label}: “${s.name}” can’t be a variable name. Use letters, digits and _ (no spaces), not starting with a digit.` })
        }
        if (s.type === 'value') {
          const v = FLOW_VALUES.find((x) => x.key === s.source)
          if (!v || !valuesFor(ctx).includes(v)) problems.push({ block: bi, text: `${label}: “${v?.label ?? s.source}” isn’t known yet at “${trig.short}”.` })
          if (v?.param === 'path' && !cleanPath(s.path)) problems.push({ block: bi, text: `${label}: pick which stat.` })
          if (v?.param === 'pool' && !poolId(s.pool)) problems.push({ block: bi, text: `${label}: name the resource (its identifier).` })
          if (v?.param === 'formula') {
            const { error } = mathFormula(s.formula, vars)
            if (error) problems.push({ block: bi, text: `${label}: ${error}` })
          }
        }
        const math = s.type === 'math' ? s.expr : AMOUNT_STEPS.includes(s.type) ? s.amount : null
        if (math != null) {
          const { error } = mathFormula(math, vars)
          if (error) problems.push({ block: bi, text: `${label}: ${error}` })
        }
        if (s.type === 'flavor' && !String(s.text ?? '').trim()) problems.push({ block: bi, text: `${label}: the flavor text is empty.` })
        if (s.type === 'resource' && !poolId(s.pool)) problems.push({ block: bi, text: `${label}: name the resource (its identifier).` })
        if (s.type === 'effect' && !s.effectKey) problems.push({ block: bi, text: `${label}: pick which effect.` })
        if (s.type === 'code' && !String(s.code ?? '').trim()) problems.push({ block: bi, text: `${label}: the custom code is empty.` })
      })
    }
  })
  return problems
}

// Steps whose `amount` is math.
const AMOUNT_STEPS = ['damageRoll', 'damageTarget', 'healTarget', 'healMe', 'tempMe', 'hurtMe', 'resource', 'featureUses']

// ---------------------------------------------------------------------------
// Words: the builder's review and the preview pane.

const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1)

export function valueWords(s) {
  const v = FLOW_VALUES.find((x) => x.key === s.source)
  if (!v) return 'a value'
  if (v.key === 'dice') return `a roll of ${String(s.formula || '').trim() || 'dice'}`
  if (v.key === 'ask') return `a number the player picks${s.question ? ` (“${s.question}”)` : ''}`
  const ab = ABILITY_NAMES[s.ability] ?? s.ability
  const words = {
    targetMod: `the target’s ${ab} modifier`,
    targetScore: `the target’s ${ab} score`,
    targetStat: `the target’s ${cleanPath(s.path) || 'stat'}`,
    myMod: `your ${ab} modifier`,
    myStat: `your ${cleanPath(s.path) || 'stat'}`,
    myResource: `what’s left of your ${poolId(s.pool).replace(/-/g, ' ') || 'resource'}`,
  }[v.key]
  if (words) return words
  return v.group === 'The target' ? `the target’s ${lowerFirst(v.label).replace(/^its /, '')}` : lowerFirst(v.label)
}

export function checkWords(c) {
  switch (c.type) {
    case 'hit':
      return 'the attack hit'
    case 'miss':
      return 'the attack missed'
    case 'crit':
      return 'it’s a critical hit'
    case 'natural':
      return `the natural d20 is ${Number(c.value) || 20} or higher`
    case 'failedSave':
      return 'a target failed its save'
    case 'madeSave':
      return 'every target made its save'
    case 'compare': {
      const op = COMPARE_OPS.find(([k]) => k === c.op)?.[1] ?? c.op
      return `${String(c.left || '?').trim()} is ${op} ${String(c.right || '?').trim()}`
    }
    case 'target': {
      const preset = c.target?.id
      const row = c.target ?? {}
      const words = {
        typeIs: `the target is ${(row.types ?? []).join(' or ') || 'a type'}`,
        typeIsNot: `the target isn’t ${(row.types ?? []).join(' or ') || 'a type'}`,
        hpAtMost: `the target has ${Number(row.value) || 0} HP or fewer`,
        bloodied: 'the target is below half HP',
        hurt: 'the target is missing HP',
        sizeAtLeast: `the target is ${row.size} or bigger`,
        sizeAtMost: `the target is ${row.size} or smaller`,
        hasStatus: `the target is ${row.status}`,
        lacksStatus: `the target isn’t ${row.status}`,
        failedBy: `the target failed its save by ${Number(row.value) || 0} or more`,
        raw: `the target passes “${row.text}”`,
      }[preset]
      return words ?? 'the target passes a check'
    }
    case 'self': {
      const r = c.self ?? {}
      return (
        {
          hpBelowHalf: 'you’re below half HP',
          hpAtMost: `you have ${Number(r.value) || 0} HP or fewer`,
          hasStatus: `you’re ${r.status}`,
          lacksStatus: `you aren’t ${r.status}`,
          resourceAtLeast: `you have at least ${Number(r.value) || 0} ${poolId(r.pool).replace(/-/g, ' ')}`,
          inCombat: 'you’re in combat',
        }[r.id] ?? 'you pass a check'
      )
    }
    case 'level':
      return `you’re level ${Number(c.value) || 1} or higher`
    case 'ask':
      return `the player says yes${c.question ? ` to “${c.question}”` : ''}`
    case 'oncePerTurn':
      return 'it hasn’t happened yet this turn'
    case 'code':
      return `custom: ${String(c.code ?? '').trim() || '…'}`
    default:
      return c.type
  }
}

const typeWords = (t) => (t ? ` ${t}` : '')

export function stepWords(s) {
  const amount = String(s.amount ?? '').trim() || '?'
  switch (s.type) {
    case 'value':
      return `grab ${valueWords(s)} as ${s.name || '?'}`
    case 'math':
      return `work out ${s.name || '?'} = ${String(s.expr ?? '').trim() || '?'}`
    case 'flavor':
      return `say “${String(s.text ?? '').trim()}”`
    case 'damageRoll':
      return s.mode === 'add' ? `add ${amount}${typeWords(s.damageType)} damage to the roll` : `replace the rolled damage with ${amount}${typeWords(s.damageType || '')} (rounded down)`
    case 'damageTarget':
      return `the target takes ${amount}${typeWords(s.damageType)} damage`
    case 'healTarget':
      return `the target regains ${amount} HP`
    case 'healMe':
      return `you regain ${amount} HP`
    case 'tempMe':
      return `you gain ${amount} temporary HP`
    case 'hurtMe':
      return `you take ${amount}${typeWords(s.damageType)} damage`
    case 'advantage':
      return `the attack has ${s.mode === 'disadvantage' ? 'disadvantage' : 'advantage'}`
    case 'cancel':
      return 'cancel the use'
    case 'condition':
      return `${s.to === 'self' ? 'you become' : 'the target becomes'} ${s.status}${Number(s.rounds) ? ` for ${Number(s.rounds)} round${Number(s.rounds) === 1 ? '' : 's'}` : ''}`
    case 'effect':
      return `${s.to === 'self' ? 'you gain' : 'the target gains'} one of this item’s effects`
    case 'resource':
      return `${s.mode === 'gain' ? 'regain' : 'spend'} ${amount} ${poolId(s.pool).replace(/-/g, ' ') || 'resource'}`
    case 'featureUses':
      return `${s.mode === 'gain' ? 'regain' : 'spend'} ${amount} use${amount === '1' ? '' : 's'} of this feature`
    case 'code':
      return 'run custom code'
    default:
      return s.type
  }
}

// One sentence per block: "When damage is rolled, if the attack hit: grab …, then …. Otherwise, …."
export function blockSummary(block) {
  const trig = flowTrigger(block.trigger)
  const checks = (block.checks ?? []).map(checkWords)
  const steps = (block.steps ?? []).map(stepWords)
  const otherwise = (block.otherwise ?? []).map(stepWords)
  const join = (list) => (list.length > 1 ? `${list.slice(0, -1).join(', ')}, then ${list.at(-1)}` : list[0] ?? 'nothing happens')
  let text = `${trig.short}${checks.length ? `, if ${checks.join(' and ')}` : ''}: ${join(steps)}.`
  if (otherwise.length) text += ` Otherwise: ${join(otherwise)}.`
  return text
}

export function flowSummary(flow) {
  return (flow?.blocks ?? []).map(blockSummary)
}

// ---------------------------------------------------------------------------
// The macro

// The midi passes the macro has to be listed at. postActiveEffects is always
// there: it posts the chat card the steps built up.
export function flowPasses(flow) {
  const used = new Set((flow?.blocks ?? []).map((b) => flowTrigger(b.trigger).pass))
  used.add('postActiveEffects')
  return FLOW_TRIGGERS.map((t) => t.pass).filter((p) => used.has(p))
}

const indent = (code, n = 2) =>
  code
    .split('\n')
    .map((l) => (l ? ' '.repeat(n) + l : l))
    .join('\n')

function mathCode(expr, vars) {
  return `await calc(${js(mathFormula(expr, vars).formula || '0')})`
}

function checkCode(c, vars, blockKey) {
  switch (c.type) {
    case 'hit':
      return '(workflow?.hitTargets?.size ?? 0) > 0'
    case 'miss':
      return '(workflow?.hitTargets?.size ?? 0) === 0'
    case 'crit':
      return '!!workflow?.isCritical'
    case 'natural':
      return `(Number(workflow?.diceRoll) || 0) >= ${Number(c.value) || 20}`
    case 'failedSave':
      return '(workflow?.failedSaves?.size ?? 0) > 0'
    case 'madeSave':
      return '(workflow?.targets?.size ?? 0) > 0 && (workflow?.failedSaves?.size ?? 0) === 0'
    case 'compare': {
      const op = COMPARE_OPS.some(([k]) => k === c.op) ? (c.op === '==' ? '===' : c.op === '!=' ? '!==' : c.op) : '>='
      return `(${mathCode(c.left, vars)}) ${op} (${mathCode(c.right, vars)})`
    }
    case 'target': {
      const expr = conditionText([c.target])
      return expr ? `await targetPasses(${js(expr)})` : 'true'
    }
    case 'self': {
      const expr = selfConditionText([c.self])
      return expr ? `((c) => ${expr})({ actor })` : 'true'
    }
    case 'level':
      return `(Number(actor.system?.details?.level ?? actor.system?.details?.cr) || 0) >= ${Number(c.value) || 1}`
    case 'ask':
      return `await chrabConfirm(actor, card, chrabEsc(${String(c.question ?? '').trim() ? `fill(${js(String(c.question).trim())})` : '"Use " + FLOW.name + "?"'}))`
    case 'oncePerTurn':
      return `!usedThisTurn(${js(blockKey)})`
    case 'code':
      return `await (async () => (${String(c.code ?? '').trim() || 'true'}))()`
    default:
      return 'true'
  }
}

function amountCode(s, vars) {
  return `whole(${mathCode(s.amount, vars)})`
}

// One step's code. vars: the variables it can see; ids: editor effect key -> built id.
function stepCode(s, vars, ids) {
  const line = (expr) => `say(${expr});`
  switch (s.type) {
    case 'value': {
      const v = FLOW_VALUES.find((x) => x.key === s.source) ?? FLOW_VALUES[0]
      let get
      if (v.key === 'dice') get = mathCode(s.formula, vars)
      else if (v.key === 'ask') get = `await askNumber(${js(String(s.question ?? '').trim() || `How much for ${s.name}?`)})`
      else get = `Number(${v.code(s)}) || 0`
      const show = s.show ? `\n${line(`chrabEsc(${js(String(s.showLabel ?? '').trim() || valueWords(s))}) + ": " + V[${js(s.name)}]`)}` : ''
      return `V[${js(s.name)}] = ${get};${show}`
    }
    case 'math': {
      const show = s.show ? `\n${line(`chrabEsc(${js(String(s.showLabel ?? '').trim() || s.name)}) + ": <strong>" + V[${js(s.name)}] + "</strong>"`)}` : ''
      return `V[${js(s.name)}] = ${mathCode(s.expr, vars)};${show}`
    }
    case 'flavor':
      return s.style === 'plain' ? line(`chrabEsc(fill(${js(String(s.text ?? ''))}))`) : line(`"<em>" + chrabEsc(fill(${js(String(s.text ?? ''))})) + "</em>"`)
    case 'damageRoll':
      return `{
  const n = ${amountCode(s, vars)};
  const base = workflow.damageRolls?.[0];
  const type = ${js(s.damageType || '')} || base?.options?.type || "";
  const roll = await new CONFIG.Dice.DamageRoll(String(n), {}, { type: type || undefined, properties: Array.from(base?.options?.properties ?? []) }).evaluate();
  await workflow.setDamageRolls(${s.mode === 'add' ? '[...(workflow.damageRolls ?? []), roll]' : '[roll]'});
  ${line(s.mode === 'add' ? `"<strong>+" + n + (type ? " " + chrabEsc(type) : "") + " damage</strong>"` : `"<strong>The damage becomes " + n + (type ? " " + chrabEsc(type) : "") + "</strong>"`)}
}`
    case 'damageTarget':
    case 'healTarget': {
      const heal = s.type === 'healTarget'
      return `{
  const n = ${amountCode(s, vars)};
  const t = target();
  if (t?.actor && n > 0) {
    await hitCreature(t, n, ${heal ? '"healing"' : js(s.damageType || '')});
    ${line(heal ? `chrabEsc(tName()) + " regains " + n + " HP"` : `chrabEsc(tName()) + " takes " + n + ${js(typeWords(s.damageType))} + " damage"`)}
  }
}`
    }
    case 'healMe':
      return `{
  const n = ${amountCode(s, vars)};
  if (n > 0) {
    await actor.applyDamage([{ value: n, type: "healing" }]);
    ${line(`"<strong>" + chrabEsc(actor.name) + " regains " + n + " HP</strong>"`)}
  }
}`
    case 'tempMe':
      return `{
  const n = ${amountCode(s, vars)};
  if (n > 0) {
    await actor.applyTempHP(n);
    ${line(`"<strong>" + chrabEsc(actor.name) + " gains " + n + " temporary HP</strong>"`)}
  }
}`
    case 'hurtMe':
      return `{
  const n = ${amountCode(s, vars)};
  if (n > 0) {
    await actor.applyDamage([${s.damageType ? `{ value: n, type: ${js(s.damageType)} }` : '{ value: n }'}], { ignore: true });
    ${line(`chrabEsc(actor.name) + " takes " + n + ${js(typeWords(s.damageType))} + " damage"`)}
  }
}`
    case 'advantage': {
      const which = s.mode === 'disadvantage' ? 'disadvantage' : 'advantage'
      return `workflow.attackRollModifierTracker?.${which}?.add?.("chrab-flow", FLOW.name);
${line(js(`The attack has ${which}`))}`
    }
    case 'cancel':
      return 'return false;'
    case 'condition':
      return `await giveStatus(${s.to === 'self' ? 'actor' : 'tA()'}, ${js(s.status || 'prone')}, ${Number(s.rounds) || 0});`
    case 'effect': {
      const id = ids[s.effectKey] ?? s.effectKey
      return `await giveEffect(${s.to === 'self' ? 'actor' : 'tA()'}, ${js(id)});`
    }
    case 'resource':
      return `await changeUses(poolItem(${js(poolId(s.pool))}), ${amountCode(s, vars)}, ${js(s.mode === 'gain' ? 'gain' : 'spend')}, ${js(poolId(s.pool).replace(/-/g, ' '))});`
    case 'featureUses':
      return `await changeUses(item, ${amountCode(s, vars)}, ${js(s.mode === 'gain' ? 'gain' : 'spend')}, "uses of " + FLOW.name);`
    case 'code':
      return `{\n${indent(String(s.code ?? '').trim())}\n}`
    default:
      return ''
  }
}

function branchCode(flow, bi, branch, ids) {
  const steps = flow.blocks[bi][branch] ?? []
  return steps.map((s, si) => `// ${stepWords(s)}\n${stepCode(s, varsBefore(flow, { block: bi, branch, step: si }), ids)}`).join('\n')
}

function blockCode(flow, bi, ids) {
  const b = flow.blocks[bi]
  const vars = varsBefore(flow, { block: bi, branch: 'checks' })
  const checks = (b.checks ?? []).map((c) => `ok = ok && (${checkCode(c, vars, b.key)}); // ${checkWords(c)}`)
  const once = (b.checks ?? []).some((c) => c.type === 'oncePerTurn') ? `await markTurn(${js(b.key)});\n` : ''
  const then = once + branchCode(flow, bi, 'steps', ids)
  const otherwise = branchCode(flow, bi, 'otherwise', ids)
  const body = checks.length
    ? `let ok = true;\n${checks.join('\n')}\nif (ok) {\n${indent(then)}\n}${otherwise ? ` else {\n${indent(otherwise)}\n}` : ''}`
    : then
  return `{ pass: ${js(flowTrigger(b.trigger).pass.toLowerCase())}, run: async () => {\n${indent(`// ${blockSummary(b)}\n${body}`)}\n} }`
}

// The activity macro: the body of the async function midi calls with
// workflow, args, actor, token, item (src/module/workflow.ts executeMacroWithScope).
// itemName: the card's title when the flow has no name of its own.
export function flowCode(flow, { ids = {}, itemName = '' } = {}) {
  const blocks = sortBlocks(flow?.blocks ?? [])
  const sorted = { ...flow, blocks }
  const setup = {
    key: String(flow?.key ?? 'flow'),
    name: String(flow?.name ?? '').trim() || String(itemName ?? '').trim() || 'Feature',
    color: cardColor(flow?.color),
    vars: flowVars(sorted),
  }
  return `// ${setup.name} - Chrab Corner automation, built step by step in the Automation Builder.
// One midi-qol activity macro, listed at each pass it needs. Edit it on the site, not here: a re-send replaces it.
const FLOW = ${JSON.stringify(setup)};
const pass = String(args?.[0]?.macroPass ?? "").toLowerCase();
if (!actor || !item) return;
${CHAT_RUNTIME}
// Variables and the chat card last for the whole roll (every pass of this workflow).
const state = ((workflow.chrabFlow ??= {})[FLOW.key] ??= { vars: {}, posted: false, card: { title: FLOW.name, img: item.img, color: FLOW.color, flavor: "", steps: [], rolls: [] } });
const V = state.vars;
for (const n of FLOW.vars) V[n] ??= 0;
const card = state.card;
const say = (html) => card.steps.push(html);
const target = () => workflow?.hitTargets?.first?.() ?? workflow?.failedSaves?.first?.() ?? workflow?.targets?.first?.() ?? null;
const tA = () => target()?.actor ?? null;
const tName = () => target()?.name ?? tA()?.name ?? "the target";
// {name} in text: a variable, {target} the target's name, {me} the user's.
const fill = (text) => String(text ?? "").replace(/\\{(\\w+)\\}/g, (m, k) => (k in V ? String(V[k]) : k === "target" ? tName() : k === "me" ? actor.name : m));
const whole = (n) => Math.max(0, Math.floor(Number(n) || 0));
// Math: a roll formula against the user's roll data plus the variables. Dice show on the card.
async function calc(formula) {
  const roll = await new Roll(String(formula || "0"), { ...(actor.getRollData?.() ?? {}), ...V }).evaluate();
  if (roll.dice?.length) card.rolls.push(roll);
  return Number(roll.total) || 0;
}
async function askNumber(question) {
  const answer = await chrabDialog(actor, "input", {
    window: { title: FLOW.name },
    content: chrabCardHtml(card) + "<p><strong>" + chrabEsc(fill(question)) + "</strong></p><input type=\\"number\\" name=\\"n\\" value=\\"0\\" autofocus>",
    ok: { label: "OK" },
  });
  return Number(answer?.n) || 0;
}
async function targetPasses(expression) {
  const t = target();
  if (!t || !globalThis.MidiQOL?.evalCondition) return false;
  const activity = typeof rolledActivity === "undefined" ? undefined : rolledActivity;
  const data = MidiQOL.createConditionData({ workflow, target: t, actor, item, activity });
  return !!(await MidiQOL.evalCondition(expression, data, { async: true }));
}
// Damage or healing on another creature, through midi so the GM applies it.
async function hitCreature(t, n, type) {
  await MidiQOL.applyTokenDamage([{ value: n, type: type || "none" }], n, new Set([t]), item, new Set(), { existingDamage: [], superSavers: new Set(), semiSuperSavers: new Set(), workflow, forceApply: false });
}
async function addEffect(who, data) {
  if (who.isOwner === false) await MidiQOL.socket().executeAsGM("createEffects", { actorUuid: who.uuid, effects: [data] });
  else await who.createEmbeddedDocuments("ActiveEffect", [data]);
}
async function giveStatus(who, status, rounds) {
  if (!who) return say("No target for " + chrabEsc(status));
  const def = CONFIG.statusEffects?.find?.((e) => e.id === status);
  const name = def?.name ? game.i18n?.localize?.(def.name) ?? def.name : status;
  await addEffect(who, { name, img: def?.img ?? def?.icon, statuses: [status], origin: item.uuid, transfer: false, duration: rounds ? { rounds } : {} });
  say(chrabEsc(who.name) + " is <strong>" + chrabEsc(name) + "</strong>" + (rounds ? " for " + rounds + (rounds === 1 ? " round" : " rounds") : ""));
}
async function giveEffect(who, id) {
  const src = item.effects?.find?.((e) => (e.id ?? e._id) === id);
  if (!src) return;
  if (!who) return say("No target for " + chrabEsc(src.name));
  const data = src.toObject();
  delete data._id;
  delete data.start;
  Object.assign(data, { origin: item.uuid, transfer: false, disabled: false });
  await addEffect(who, data);
  say(chrabEsc(who.name) + " gains <strong>" + chrabEsc(data.name) + "</strong>");
}
const poolItem = (id) => actor.items?.find?.((i) => i.system?.identifier === id) ?? null;
function usesLeft(it) {
  const u = it?.system?.uses;
  if (!u) return 0;
  const left = Number(u.value);
  return Number.isFinite(left) ? left : Math.max(0, (Number(u.max) || 0) - (Number(u.spent) || 0));
}
async function changeUses(it, n, mode, what) {
  if (!it || n <= 0) return;
  const spent = Number(it.system?.uses?.spent) || 0;
  const next = mode === "gain" ? Math.max(0, spent - n) : spent + Math.min(n, usesLeft(it));
  if (next !== spent) await it.update({ "system.uses.spent": next });
  say((mode === "gain" ? "Regains " : "Spends ") + Math.abs(next - spent) + " " + chrabEsc(what));
}
const turnKey = () => (game.combat?.started ? game.combat.id + ":" + game.combat.round + ":" + game.combat.turn : "");
const usedThisTurn = (k) => !!turnKey() && item.flags?.["chrab-sync"]?.turns?.[k] === turnKey();
const markTurn = (k) => (turnKey() ? item.update({ ["flags.chrab-sync.turns." + k]: turnKey() }) : null);
async function post() {
  if (state.posted || !card.steps.length) return;
  state.posted = true;
  await chrabPost(card, actor);
}

const BLOCKS = [
${blocks.map((_, bi) => indent(blockCode(sorted, bi, ids))).join(',\n')}
];
for (const block of BLOCKS) {
  if (block.pass !== pass) continue;
  if ((await block.run()) === false) {
    await post();
    return false;
  }
}
if (pass === "postactiveeffects") await post();
`
}

export { SELF_CONDITIONS }
