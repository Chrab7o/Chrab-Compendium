// Built automation: a roll's own midi-qol macro, assembled step by step in
// the Automation Builder (components/dm/feature/AutomationWizard.jsx) instead
// of picked from a fixed recipe.
//
// A flow reads like a short script (version 2). It has sections, one per
// point in this roll's midi workflow (FLOW_TRIGGERS, e.g. "After the attack
// roll"), and each section is lines run top to bottom:
//   - steps (FLOW_STEPS): set a variable to a value or to math, add a line to
//     the chat card, use a number as damage, heal, apply an effect, spend a
//     resource, raw code...
//   - remembered numbers: a variable kept on the item between uses; every
//     "set" to it is saved for next time
//   - if: checks (FLOW_CHECKS, all or any of them), with lines to run when they
//     hold and "otherwise" lines when they don't. Ifs nest.
// A line can use every variable set above it, in its own section or an
// earlier one. Flows saved before version 2 (blocks of when/if/then/otherwise)
// are converted on read (toScript).
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

import { PICK_RUNTIME, conditionText, emptyCondition } from './foundryAutomation.js'
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
  // The spell slot is picked after "When it's used" (midi's preItemRoll runs before dnd5e's usage dialog).
  cast: ({ trigger }) => trigger !== 'use',
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
  { key: 'removedCount', group: 'This roll', label: 'How many effects it removed (so far)', name: 'removed', code: () => '(state.removed ?? 0)' },
  { key: 'upcast', group: 'This roll', label: 'Slot levels above the spell’s (upcast)', name: 'upcast', needs: 'cast', code: () => '(workflow?.chatCard?.system?.scaling ?? item.flags?.dnd5e?.scaling)' },
  { key: 'damageTotal', group: 'This roll', label: 'The damage rolled', name: 'rolled', needs: 'damage', code: () => 'workflow?.damageTotal' },
  { key: 'damageDealt', group: 'This roll', label: 'The damage that landed (HP lost)', name: 'dealt', needs: 'dealt', code: () => '(workflow?.damageList ?? []).reduce((sum, d) => sum + (Number(d.hpDamage) || 0) + (Number(d.tempDamage) || 0), 0)' },
  { key: 'critAt', group: 'This roll', label: 'The roll it normally crits on', name: 'critAt', kinds: ['attack'], code: () => '(rolled()?.criticalThreshold ?? 20)' },
  // Version 1 only: a remembered number is now a variable of its own (the "memory" line).
  { key: 'remembered', group: 'Remembered', label: 'A number you remembered', name: 'saved', param: 'memory', legacy: true },
  { key: 'dice', group: 'Roll or ask', label: 'Roll some dice', name: 'roll', param: 'formula' },
  { key: 'ask', group: 'Roll or ask', label: 'Ask the player for a number', name: 'answer', param: 'question' },
  // 1 for the first choice, 2 for the second…; the words are kept for "The player picked…" and damage types.
  { key: 'choose', group: 'Roll or ask', label: 'Ask the player to pick one', name: 'pick', param: 'choices' },
]

export function valuesFor(ctx) {
  return FLOW_VALUES.filter((v) => !v.legacy && (!v.needs || knows[v.needs](ctx)) && (!v.kinds || v.kinds.includes(ctx.kind)))
}

// ---------------------------------------------------------------------------
// If

export const FLOW_CHECKS = [
  { key: 'hit', label: 'The attack hit', needs: 'attack' },
  { key: 'miss', label: 'The attack missed', needs: 'attack' },
  { key: 'crit', label: 'It’s a critical hit', needs: 'attack' },
  { key: 'notCrit', label: 'It’s not a critical hit', needs: 'attack' },
  { key: 'natural', label: 'The natural d20 is at least…', needs: 'attack' },
  { key: 'failedSave', label: 'A target failed its save', needs: 'save' },
  { key: 'madeSave', label: 'Every target made its save', needs: 'save' },
  { key: 'compare', label: 'Compare two numbers (math)' },
  { key: 'target', label: 'The target… (type, HP, size, condition)' },
  { key: 'self', label: 'You… (HP, a condition, a resource)' },
  { key: 'level', label: 'You’re at least level…' },
  { key: 'ask', label: 'The player says yes' },
  { key: 'picked', label: 'The player picked…' },
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
    value: type === 'level' ? '5' : type === 'picked' ? '' : '19', // natural / level / picked: the choice
    left: '', // compare: math
    op: '>=',
    right: '',
    target: emptyCondition('hpAtMost'), // target: a foundryAutomation condition row
    self: emptySelfCondition('hpBelowHalf'), // self: a foundryBehaviors self row
    question: '', // ask: blank = "Use <name>?"
    pick: '', // picked: the variable an "Ask the player to pick one" set; value is the choice
    code: '', // code: a JS expression
  }
}

// ---------------------------------------------------------------------------
// Then

// needs: what the trigger must know; only: the triggers it works at.
export const FLOW_STEPS = [
  { key: 'value', group: 'Variables', label: 'Set a variable to a value', help: 'From the game: the target’s HP, your level, the natural d20, a dice roll, an answer from the player…' },
  { key: 'math', group: 'Variables', label: 'Set a variable to some math', help: 'From the variables above it, e.g. CritAt - 1, or floor(hp / 2) + @prof.' },
  { key: 'memory', group: 'Variables', label: 'A remembered number', help: 'A variable kept on this item between uses. It starts at its starting value; every “set” to it is saved for next time.' },
  { key: 'forget', group: 'Variables', label: 'Forget a remembered number', help: 'Back to its starting value, here and next time.' },
  { key: 'flavor', group: 'Chat card', label: 'Flavor text', help: 'A line on the chat card. {name} fills in a variable, {target} the target’s name, {me} yours.' },
  { key: 'popup', group: 'Chat card', label: 'Show a pop-up', help: 'A notice on the screen of whoever made the roll, and the GM’s too if you like. {name} fills in a variable.' },
  // Version 1 only: converted to setting a remembered number.
  { key: 'remember', group: 'Variables', label: 'Remember a number', legacy: true },
  { key: 'pickTargets', group: 'Targets', label: 'Pick targets on the map', help: 'A blue ring shows the range and the player clicks the creatures. When it’s used, they become this roll’s targets. Picks can stack on one creature (missiles); “every picked creature” lines below then run once per creature, with picks = how many times it was picked.', only: ['use', 'done'] },
  { key: 'damageRoll', group: 'Damage and healing', label: 'Use a number as this roll’s damage', help: 'Replaces the rolled damage with your number, or adds it on top.', needs: 'damage', only: ['damage'] },
  { key: 'retype', group: 'Damage and healing', label: 'Change this roll’s damage type', help: 'To a type, or to what the player picked (“Ask the player to pick one” with damage types as the choices).', needs: 'damage', only: ['damage'] },
  { key: 'damageTarget', group: 'Damage and healing', label: 'The target takes damage', help: 'Separate from this roll’s damage. Resistances apply.' },
  { key: 'healTarget', group: 'Damage and healing', label: 'The target regains HP' },
  { key: 'healMe', group: 'Damage and healing', label: 'You regain HP' },
  { key: 'tempMe', group: 'Damage and healing', label: 'You gain temporary HP' },
  { key: 'hurtMe', group: 'Damage and healing', label: 'You take damage', help: 'Exactly this amount: your resistances don’t change it.' },
  { key: 'advantage', group: 'The roll', label: 'Give the attack advantage or disadvantage', only: ['preAttack'] },
  { key: 'makeCrit', group: 'The roll', label: 'Make this attack a critical hit', help: 'It hits (a crit always does), and its damage is rolled once, as a critical hit.', needs: 'attack', only: ['attack'] },
  { key: 'cancel', group: 'The roll', label: 'Cancel the use', help: 'Stops here; nothing rolls.', only: ['use'] },
  { key: 'condition', group: 'Effects', label: 'Apply a condition', help: 'Prone, frightened… on the target or you.' },
  { key: 'effect', group: 'Effects', label: 'Apply one of this item’s effects' },
  { key: 'removeEffect', group: 'Effects', label: 'Remove one of this item’s effects', help: 'Takes it off the target, every picked creature, you, or every creature on the map. Only what this item put there; “How many it removed” counts them.' },
  { key: 'resource', group: 'Resources', label: 'Spend or regain a resource' },
  { key: 'featureUses', group: 'Resources', label: 'Spend or regain this feature’s uses' },
  { key: 'code', group: 'Advanced', label: 'Custom code', help: 'JavaScript run right here. V.name is a variable; say(html) adds a card line; await calc("2d6 + @hp") rolls math.' },
]

export function stepsFor(ctx) {
  return FLOW_STEPS.filter((s) => !s.legacy && (!s.needs || knows[s.needs](ctx)) && (!s.only || s.only.includes(ctx.trigger)))
}

export function emptyStep(type = 'value', { suggestName = '' } = {}) {
  const value = FLOW_VALUES[0]
  return {
    key: newKey(),
    type,
    // value
    source: value.key,
    name: suggestName || (type === 'math' ? 'total' : type === 'memory' || type === 'forget' ? '' : value.name), // value / math / memory: the variable it sets; forget: the remembered number
    ability: 'con',
    path: '',
    pool: '',
    formula: '1d6', // value "dice"
    question: '', // value "ask" / "choose"
    choices: '', // value "choose": "Fire, Cold, Lightning"
    pick: '', // retype: the "choose" variable whose answer is the type ('' = damageType)
    show: type === 'math', // value / math: a card line "name: 12"
    showLabel: '',
    // math, and the amount of every apply step
    expr: '',
    amount: type === 'pickTargets' ? '1' : '',
    // pickTargets
    range: '', // ft; '' = the roll's own range
    who: 'any', // 'any' | 'enemies' | 'allies'
    stack: false, // one creature can be picked more than once
    // flavor
    text: '',
    style: 'flavor', // 'flavor' (italic) | 'plain'
    // damage
    mode: type === 'damageRoll' ? 'replace' : type === 'resource' || type === 'featureUses' ? 'spend' : type === 'remember' ? 'set' : 'advantage',
    damageType: '', // '' = the roll's own (damageRoll) / untyped
    // effects
    to: 'target', // 'target' | 'self' | 'each' (every picked creature, else every target)
    status: 'prone',
    rounds: '', // condition: '' = until removed
    effectKey: '',
    // code
    code: '',
    // remembered numbers ("memory" lines; name is the variable and its name on the item)
    memory: '', // version 1 only: the remembered value / remember step's name
    start: '0', // math for when nothing is remembered (or it was forgotten)
    forget: '', // minutes of game time without a change before it's forgotten; '' = never
    gm: true, // popup: the GM sees it too
  }
}

export function emptyBlock(trigger = 'damage') {
  return { key: newKey(), trigger, checks: [], steps: [], otherwise: [] }
}

export function emptyFlow() {
  return { key: newKey(), name: '', color: '', version: 2, sections: [] }
}

export function emptySection(trigger = 'damage') {
  return { key: newKey(), trigger, lines: [] }
}

// A new line of any kind: 'if', or a FLOW_STEPS key.
export function emptyLine(type, opts) {
  if (type === 'if') return { key: newKey(), type: 'if', join: 'all', checks: [], then: [], else: [] }
  return emptyStep(type, opts)
}

// Blocks run in workflow order, so they're kept in it (stable within a trigger).
export function sortBlocks(blocks) {
  return [...blocks].map((b, i) => [b, i]).sort((a, b) => (ORDER[a[0].trigger] ?? 0) - (ORDER[b[0].trigger] ?? 0) || a[1] - b[1]).map(([b]) => b)
}

export function hasFlow(activity) {
  return !!activity?.flow && toScript(activity.flow).sections.some((s) => s.lines.length)
}

const sortSections = (sections) =>
  [...sections].map((x, i) => [x, i]).sort((a, b) => (ORDER[a[0].trigger] ?? 0) - (ORDER[b[0].trigger] ?? 0) || a[1] - b[1]).map(([x]) => x)

// A version 1 flow (blocks) as a script. A block's checks become an if around
// its steps, with its "otherwise" steps as the if's otherwise; blocks at the
// same point share a section. Remembered numbers become memory lines: the
// value that read one declares it, and a "remember" step sets it. Version 2
// flows come back as they are, with their sections in the order midi runs.
export function toScript(flow) {
  if (!flow) return emptyFlow()
  if (flow.sections?.length || !flow.blocks?.length) {
    const { blocks: _old, ...rest } = flow
    return { ...rest, version: 2, sections: sortSections(flow.sections ?? []) }
  }
  const forgetAfter = {}
  for (const b of flow.blocks) {
    for (const st of [...(b.steps ?? []), ...(b.otherwise ?? [])]) if (st.type === 'remember' && st.mode !== 'forget' && st.forget) forgetAfter[st.memory] = st.forget
  }
  const declared = new Set()
  const early = []
  const memoryLine = (name, start = '0') => ({ ...emptyStep('memory'), name, start: start || '0', forget: forgetAfter[name] ?? '' })
  const convert = (steps) =>
    steps.flatMap((st) => {
      if (st.type === 'value' && st.source === 'remembered') {
        const out = []
        if (!declared.has(st.memory)) {
          declared.add(st.memory)
          out.push({ ...memoryLine(st.memory, st.start), key: st.key })
        }
        if (st.name !== st.memory) out.push({ ...emptyStep('math'), name: st.name, expr: st.memory, show: !!st.show, showLabel: st.showLabel ?? '' })
        return out
      }
      if (st.type === 'remember') {
        if (!declared.has(st.memory)) {
          declared.add(st.memory)
          early.push(memoryLine(st.memory))
        }
        if (st.mode === 'forget') return [{ ...emptyStep('forget'), key: st.key, name: st.memory }]
        return [{ ...emptyStep('math'), key: st.key, name: st.memory, expr: st.amount, show: false }]
      }
      return [st]
    })
  const sections = []
  for (const b of sortBlocks(flow.blocks)) {
    let section = sections.at(-1)
    if (!section || section.trigger !== b.trigger) sections.push((section = { key: newKey(), trigger: b.trigger, lines: [] }))
    const steps = convert(b.steps ?? [])
    const otherwise = convert(b.otherwise ?? [])
    // The if keeps the block's key: "once per turn" is tracked by it.
    if (b.checks?.length) section.lines.push({ key: b.key, type: 'if', join: 'all', checks: b.checks, then: steps, else: otherwise })
    else section.lines.push(...steps)
  }
  if (early.length && sections.length) sections[0].lines.unshift(...early)
  const { blocks: _old, ...rest } = flow
  return { ...rest, version: 2, sections }
}

// ---------------------------------------------------------------------------
// Variables and math

const MATH_FUNCS = ['floor', 'ceil', 'round', 'min', 'max', 'abs', 'sqrt', 'pow', 'sign', 'trunc']
const RESERVED = new Set([...MATH_FUNCS, 'd', 'target', 'me', 'V', 'say', 'calc'])

export function validVarName(name) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(String(name ?? '')) && !RESERVED.has(name) && !/^d\d+$/.test(name)
}

function setsVar(line) {
  return ['value', 'math', 'memory'].includes(line.type) && validVarName(line.name) ? line.name : null
}

// Every line of a list, depth first, in the order they're written.
function eachLine(lines, fn) {
  for (const line of lines ?? []) {
    fn(line)
    if (line.type === 'if') {
      eachLine(line.then, fn)
      eachLine(line.else, fn)
    }
  }
}

// Every variable the flow sets, for initializing them (a line that didn't
// run leaves its variable at 0 rather than breaking later math).
export function flowVars(flow) {
  const out = new Set()
  for (const section of toScript(flow).sections) eachLine(section.lines, (l) => setsVar(l) && out.add(setsVar(l)))
  return [...out]
}

// The remembered numbers: name -> the memory line that declares it (the first).
export function scriptMemories(flow) {
  const out = new Map()
  for (const section of toScript(flow).sections) eachLine(section.lines, (l) => l.type === 'memory' && l.name && !out.has(l.name) && out.set(l.name, l))
  return out
}

// A "pick one" line's choices: "Fire, Cold, Lightning" (or one per line).
export const choiceList = (s) => [...new Set(String(s?.choices ?? '').split(/[,\n]/).map((c) => c.trim()).filter(Boolean))]

// The "pick one" variables: name -> its choices (the last line that sets it wins).
export function scriptChoices(flow) {
  const out = new Map()
  for (const section of toScript(flow).sections) eachLine(section.lines, (l) => l.type === 'value' && l.source === 'choose' && validVarName(l.name) && out.set(l.name, choiceList(l)))
  return out
}

// Does any roll's flow put one of the item's effects on someone?
export function flowAppliesEffects(flow) {
  let found = false
  if (flow) for (const section of toScript(flow).sections) eachLine(section.lines, (l) => l.type === 'effect' && (found = true))
  return found
}

// What each spot can see: key -> { vars, ctx }. vars are the variables set by
// the lines written above it (earlier sections included). Keys are line keys,
// plus "<owner>:end" for the end of a list, where a new line would go: the
// owner is the section's key, or "<if key>:then" / "<if key>:else".
export function scriptScopes(flow, kind) {
  const scopes = new Map()
  const vars = []
  for (const section of toScript(flow).sections) {
    const ctx = { trigger: section.trigger, kind }
    const walk = (lines, owner) => {
      for (const line of lines ?? []) {
        scopes.set(line.key, { vars: [...vars], ctx })
        if (line.type === 'if') {
          walk(line.then, `${line.key}:then`)
          walk(line.else, `${line.key}:else`)
        } else {
          const v = setsVar(line)
          if (v && !vars.includes(v)) vars.push(v)
        }
      }
      scopes.set(`${owner}:end`, { vars: [...vars], ctx })
    }
    walk(section.lines, section.key)
  }
  return scopes
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
  if (unknown.length) return { formula, error: `I don’t know ${[...new Set(unknown)].map((u) => `“${u}”`).join(', ')}. Set it on a line above first, or check the spelling.` }
  let depth = 0
  for (const ch of text) {
    depth += ch === '(' ? 1 : ch === ')' ? -1 : 0
    if (depth < 0) break
  }
  if (depth !== 0) return { formula, error: 'The brackets don’t match.' }
  return { formula, error: '' }
}

const cleanPath = (p) => String(p ?? '').trim().replace(/^@/, '')

// A remembered number's name on the item (flags.chrab-sync.memory.<name>).
export const validMemoryName = (name) => /^[A-Za-z][A-Za-z0-9_]*$/.test(String(name ?? ''))

const poolId = (text) =>
  String(text ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

// ---------------------------------------------------------------------------
// Problems: everything that would make the macro wrong, worded for the builder.
// Each is { key, text }: key is the line (or section) it's about.

const shorten = (text, n = 48) => (text.length > n ? `${text.slice(0, n - 1)}…` : text)

function checkProblems(c, ctx, vars) {
  const out = []
  const def = FLOW_CHECKS.find((x) => x.key === c.type)
  if (!checksFor(ctx).some((x) => x.key === c.type)) out.push(`“${def?.label ?? c.type}” isn’t known yet at “${flowTrigger(ctx.trigger).short}”.`)
  if (c.type === 'compare') {
    for (const side of [c.left, c.right]) {
      const { error } = mathFormula(side, vars)
      if (error) out.push(error)
    }
  }
  if (c.type === 'code' && !String(c.code ?? '').trim()) out.push('the custom condition is empty.')
  if (c.type === 'picked' && (!c.pick || !String(c.value ?? '').trim())) out.push('pick which answer.')
  else if (c.type === 'picked' && !vars.includes(c.pick)) out.push(`no line above sets ${c.pick}.`)
  return out
}

function lineProblems(s, ctx, vars, memories) {
  const out = []
  const def = FLOW_STEPS.find((x) => x.key === s.type)
  if (!stepsFor(ctx).some((x) => x.key === s.type)) out.push(`“${def?.label ?? s.type}” can’t happen at “${flowTrigger(ctx.trigger).short}”.`)
  if (['value', 'math', 'memory'].includes(s.type) && !validVarName(s.name)) {
    out.push(s.name ? `“${s.name}” can’t be a variable name. Use letters, digits and _ (no spaces), not starting with a digit.` : 'name the variable.')
  }
  if (s.type === 'value') {
    const v = FLOW_VALUES.find((x) => x.key === s.source)
    if (!v || !valuesFor(ctx).includes(v)) out.push(`“${v?.label ?? s.source}” isn’t known yet at “${flowTrigger(ctx.trigger).short}”.`)
    if (v?.param === 'path' && !cleanPath(s.path)) out.push('pick which stat.')
    if (v?.param === 'pool' && !poolId(s.pool)) out.push('name the resource (its identifier).')
    if (v?.param === 'choices' && choiceList(s).length < 2) out.push('give the player at least two choices, separated by commas.')
    if (v?.param === 'formula') {
      const { error } = mathFormula(s.formula, vars)
      if (error) out.push(error)
    }
  }
  if (s.type === 'memory') {
    if (s.name && !validMemoryName(s.name)) out.push('a remembered number’s name starts with a letter.')
    if (String(s.start ?? '').trim()) {
      const { error } = mathFormula(s.start, vars)
      if (error) out.push(`starting value: ${error}`)
    }
    if (String(s.forget ?? '').trim() && !(Number(s.forget) > 0)) out.push('“forget after” is a number of minutes, or blank for never.')
  }
  if (s.type === 'forget' && !memories.has(s.name)) out.push('pick which remembered number.')
  const math = s.type === 'math' ? s.expr : AMOUNT_STEPS.includes(s.type) ? s.amount : null
  if (math != null) {
    const { error } = mathFormula(math, stepVars(s, vars))
    if (error) out.push(error)
  }
  if (s.type === 'pickTargets' && String(s.range ?? '').trim() && !(Number(s.range) > 0)) out.push('the range is a number of feet, or blank for the roll’s own.')
  if (s.type === 'flavor' && !String(s.text ?? '').trim()) out.push('the flavor text is empty.')
  if (s.type === 'popup' && !String(s.text ?? '').trim()) out.push('the pop-up is empty.')
  if (s.type === 'resource' && !poolId(s.pool)) out.push('name the resource (its identifier).')
  if (s.type === 'effect' && !s.effectKey) out.push('pick which effect.')
  if (s.type === 'retype' && !s.pick && !s.damageType) out.push('pick the damage type.')
  if (s.type === 'retype' && s.pick && !vars.includes(s.pick)) out.push(`no line above sets ${s.pick}.`)
  if (s.type === 'code' && !String(s.code ?? '').trim()) out.push('the custom code is empty.')
  return out
}

export function flowProblems(flow, kind) {
  const script = toScript(flow)
  const scopes = scriptScopes(script, kind)
  const memories = scriptMemories(script)
  const problems = []
  for (const section of script.sections) {
    const trig = flowTrigger(section.trigger)
    if (trig.kinds && !trig.kinds.includes(kind)) problems.push({ key: section.key, text: `“${trig.short}” doesn’t happen on this kind of roll.` })
    if (!section.lines.length) problems.push({ key: section.key, text: `${trig.short}: nothing happens yet. Add a line.` })
    eachLine(section.lines, (line) => {
      const { vars, ctx } = scopes.get(line.key)
      const at = `${trig.short}, “${shorten(lineWords(line))}”`
      const texts =
        line.type === 'if'
          ? [
              ...(line.checks?.length ? [] : ['pick what it checks.']),
              ...(line.checks ?? []).flatMap((c) => checkProblems(c, ctx, vars)),
              ...(line.then?.length || line.else?.length ? [] : ['nothing happens inside it yet.']),
            ]
          : lineProblems(line, ctx, vars, memories)
      for (const text of texts) problems.push({ key: line.key, text: `${at}: ${text}` })
    })
  }
  return problems
}

// Steps that can run once per picked creature (to: 'each'), where picks is
// how many times that creature was picked.
const EACH_STEPS = ['damageTarget', 'healTarget', 'condition', 'effect', 'removeEffect']
const eachOne = (s) => s.to === 'each' && EACH_STEPS.includes(s.type)
const stepVars = (s, vars) => (eachOne(s) ? [...vars, 'picks'] : vars)

// Steps whose `amount` is math.
const AMOUNT_STEPS = ['pickTargets', 'damageRoll', 'damageTarget', 'healTarget', 'healMe', 'tempMe', 'hurtMe', 'resource', 'featureUses']

// ---------------------------------------------------------------------------
// Words: the builder's review and the preview pane.

const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1)

export function valueWords(s) {
  const v = FLOW_VALUES.find((x) => x.key === s.source)
  if (!v) return 'a value'
  if (v.key === 'dice') return `a roll of ${String(s.formula || '').trim() || 'dice'}`
  if (v.key === 'ask') return `a number the player picks${s.question ? ` (“${s.question}”)` : ''}`
  if (v.key === 'choose') return `the player’s pick of ${orList(choiceList(s)) || '…'}`
  if (v.key === 'remembered') return `the remembered ${s.memory || '?'} (${String(s.start ?? '').trim() || '0'} if there isn’t one)`
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
    case 'notCrit':
      return 'it’s not a critical hit'
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
    case 'picked':
      return `${c.pick || '?'} is ${String(c.value ?? '').trim() || '?'}`
    case 'oncePerTurn':
      return 'it hasn’t happened yet this turn'
    case 'code':
      return `custom: ${String(c.code ?? '').trim() || '…'}`
    default:
      return c.type
  }
}

const typeWords = (t) => (t ? ` ${t}` : '')
const orList = (list) => (list.length > 1 ? `${list.slice(0, -1).join(', ')} or ${list.at(-1)}` : list.join(''))

export function stepWords(s) {
  const amount = String(s.amount ?? '').trim() || '?'
  switch (s.type) {
    case 'value':
      return `grab ${valueWords(s)} as ${s.name || '?'}`
    case 'math':
      return `work out ${s.name || '?'} = ${String(s.expr ?? '').trim() || '?'}`
    case 'flavor':
      return `say “${String(s.text ?? '').trim()}”`
    case 'popup':
      return `pop up “${String(s.text ?? '').trim()}”${s.gm ? ' for the player and the GM' : ''}`
    case 'remember': {
      if (s.mode === 'forget') return `forget ${s.memory || '?'}`
      const forget = Number(s.forget) > 0 ? ` (forgotten after ${Number(s.forget)} minute${Number(s.forget) === 1 ? '' : 's'} without a change)` : ''
      return `remember ${String(s.amount ?? '').trim() || '?'} as ${s.memory || '?'}${forget}`
    }
    case 'makeCrit':
      return 'make it a critical hit'
    case 'damageRoll':
      return s.mode === 'add' ? `add ${amount}${typeWords(s.damageType)} damage to the roll` : `replace the rolled damage with ${amount}${typeWords(s.damageType || '')} (rounded down)`
    case 'pickTargets': {
      const who = { enemies: 'enemies', allies: 'allies' }[s.who] ?? 'creatures'
      const range = Number(s.range) > 0 ? `within ${Number(s.range)} ft` : 'within its own range'
      return `pick ${amount} ${who} ${range} on the map${s.stack ? ', picks can stack' : ''}`
    }
    case 'damageTarget':
      return `${eachOne(s) ? 'every picked creature takes' : 'the target takes'} ${amount}${typeWords(s.damageType)} damage`
    case 'healTarget':
      return `${eachOne(s) ? 'every picked creature regains' : 'the target regains'} ${amount} HP`
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
      return `${s.to === 'self' ? 'you become' : eachOne(s) ? 'every picked creature becomes' : 'the target becomes'} ${s.status}${Number(s.rounds) ? ` for ${Number(s.rounds)} round${Number(s.rounds) === 1 ? '' : 's'}` : ''}`
    case 'effect':
      return `${s.to === 'self' ? 'you gain' : eachOne(s) ? 'every picked creature gains' : 'the target gains'} one of this item’s effects`
    case 'retype':
      return `the damage becomes ${s.pick ? `the type in ${s.pick}` : s.damageType || '?'}`
    case 'removeEffect':
      return `${s.effectKey ? 'one of this item’s effects' : 'this item’s effects'} come off ${{ self: 'you', each: 'every picked creature', scene: 'every creature on the map' }[s.to] ?? 'the target'}`
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

const minutes = (n) => `${n} minute${n === 1 ? '' : 's'}`

// One line in words, the way the editor shows it folded up:
// "set total = CritAt - 1", "if natural ≥ CritAt", "remembered CritAt, starting at 20".
export function lineWords(line) {
  switch (line.type) {
    case 'if': {
      const checks = (line.checks ?? []).map(checkWords)
      return `if ${checks.join(line.join === 'any' ? ' or ' : ' and ') || '…'}`
    }
    case 'value':
      return `set ${line.name || '?'} = ${valueWords(line)}`
    case 'math':
      return `set ${line.name || '?'} = ${String(line.expr ?? '').trim() || '?'}`
    case 'memory': {
      const forget = Number(line.forget) > 0 ? `, forgotten after ${minutes(Number(line.forget))} without a change` : ''
      return `remembered ${line.name || '?'}, starting at ${String(line.start ?? '').trim() || '0'}${forget}`
    }
    case 'forget':
      return `forget ${line.name || '?'} (back to its starting value)`
    default:
      return stepWords(line)
  }
}

// The script as text lines, indented two spaces a level:
//   After the attack roll:
//     if natural ≥ CritAt:
//       make it a critical hit
//     otherwise:
//       …
export function flowSummary(flow) {
  const out = []
  const write = (lines, depth) => {
    for (const line of lines ?? []) {
      const pad = '  '.repeat(depth)
      if (line.type !== 'if') {
        out.push(pad + lineWords(line))
        continue
      }
      out.push(`${pad}${lineWords(line)}:`)
      write(line.then, depth + 1)
      if (line.else?.length) {
        out.push(`${pad}otherwise:`)
        write(line.else, depth + 1)
      }
    }
  }
  for (const section of toScript(flow).sections) {
    out.push(`${flowTrigger(section.trigger).short}:`)
    write(section.lines, 1)
  }
  return out
}

// ---------------------------------------------------------------------------
// The macro

// The midi passes the macro has to be listed at. postActiveEffects is always
// there: it posts the chat card the steps built up.
export function flowPasses(flow) {
  const used = new Set(toScript(flow).sections.map((x) => flowTrigger(x.trigger).pass))
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
    case 'notCrit':
      return '!workflow?.isCritical'
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
    case 'picked':
      return `(state.chosen?.[${js(c.pick)}] === ${js(String(c.value ?? '').trim())})`
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
  const code = oneStepCode(s, stepVars(s, vars), ids)
  return eachOne(s) ? `await forEach(async () => {\n${indent(code)}\n});` : code
}

function oneStepCode(s, vars, ids) {
  const line = (expr) => `say(${expr});`
  switch (s.type) {
    case 'value': {
      const v = FLOW_VALUES.find((x) => x.key === s.source) ?? FLOW_VALUES[0]
      let get
      if (v.key === 'dice') get = mathCode(s.formula, vars)
      else if (v.key === 'ask') get = `await askNumber(${js(String(s.question ?? '').trim() || `How much for ${s.name}?`)})`
      else if (v.key === 'choose') get = `await askChoice(${js(String(s.question ?? '').trim())}, ${js(choiceList(s))}, ${js(s.name)})`
      else if (v.key === 'remembered') get = `recall(${js(s.memory)}, ${String(s.start ?? '').trim() ? mathCode(s.start, vars) : '0'})`
      else get = `Number(${v.code(s)}) || 0`
      const shown = v.key === 'choose' ? `chrabEsc(state.chosen?.[${js(s.name)}] ?? "")` : `V[${js(s.name)}]`
      const show = s.show ? `\n${line(`chrabEsc(${js(String(s.showLabel ?? '').trim() || (v.key === 'choose' ? s.name : valueWords(s)))}) + ": " + ${shown}`)}` : ''
      return `V[${js(s.name)}] = ${get};${show}`
    }
    case 'math': {
      const show = s.show ? `\n${line(`chrabEsc(${js(String(s.showLabel ?? '').trim() || s.name)}) + ": <strong>" + V[${js(s.name)}] + "</strong>"`)}` : ''
      return `V[${js(s.name)}] = ${mathCode(s.expr, vars)};${show}`
    }
    case 'flavor':
      return s.style === 'plain' ? line(`chrabEsc(fill(${js(String(s.text ?? ''))}))`) : line(`"<em>" + chrabEsc(fill(${js(String(s.text ?? ''))})) + "</em>"`)
    case 'popup':
      return `await popup(fill(${js(String(s.text ?? ''))}), ${s.gm ? 'true' : 'false'});`
    case 'remember':
      return s.mode === 'forget' ? `await forget(${js(s.memory)});` : `await remember(${js(s.memory)}, ${mathCode(s.amount, vars)}, ${Number(s.forget) > 0 ? Number(s.forget) : 0});`
    case 'makeCrit':
      // A crit always hits: midi has already sorted hits from misses by now,
      // so every target becomes a hit too.
      return `if (!workflow.isCritical) {
  workflow.isCritical = true;
  if (workflow.targets?.size) workflow.hitTargets = new Set(workflow.targets);
  ${line('"<strong>Critical hit!</strong>"')}
}`
    case 'damageRoll':
      return `{
  const n = ${amountCode(s, vars)};
  const base = workflow.damageRolls?.[0];
  const type = ${js(s.damageType || '')} || base?.options?.type || "";
  const roll = await new CONFIG.Dice.DamageRoll(String(n), {}, { type: type || undefined, properties: Array.from(base?.options?.properties ?? []) }).evaluate();
  await workflow.setDamageRolls(${s.mode === 'add' ? '[...(workflow.damageRolls ?? []), roll]' : '[roll]'});
  ${line(s.mode === 'add' ? `"<strong>+" + n + (type ? " " + chrabEsc(type) : "") + " damage</strong>"` : `"<strong>The damage becomes " + n + (type ? " " + chrabEsc(type) : "") + "</strong>"`)}
}`
    case 'retype':
      return `{
  const type = damageTypeOf(${s.pick ? `state.chosen?.[${js(s.pick)}]` : js(s.damageType || '')});
  if (!type) say("No damage type to change to");
  else {
    // midi applies each roll as its options.type; a typed die (1d8[fire]) shows its own.
    for (const r of workflow.damageRolls ?? []) {
      if (["healing", "temphp"].includes(r.options?.type)) continue;
      r.options.type = type;
      for (const t of r.terms ?? []) if (t.options?.flavor) t.options.flavor = type;
    }
    await workflow.setDamageRolls(workflow.damageRolls ?? []);
    ${line(`"The damage is <strong>" + chrabEsc(damageLabel(type)) + "</strong>"`)}
  }
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
    case 'pickTargets': {
      // Blank: the range of what's being used, whatever it is (the activity's follows its item unless overridden).
      const range = Number(s.range) > 0 ? `chrabRange({ value: ${Number(s.range)}, units: "ft" })` : 'chrabRange(rolled()?.range ?? item.system?.range)'
      return `{
  const picks = await chrabPickTargets(token ?? actor.getActiveTokens?.()[0], { range: ${range}, count: ${amountCode(s, vars)}, who: ${js(s.who || 'any')}, stack: ${s.stack ? 'true' : 'false'}, title: FLOW.name });
  if (!picks) return false;
  state.picks = [...picks];
  // When it's used: they're the roll's targets from here on.
  state.picksLate = pass !== "preitemroll";
  if (!state.picksLate) {
    workflow.setTargets?.(new Set(picks.keys()));
    canvas.tokens?.setTargets?.([...picks.keys()].map((t) => t.id));
  }
  ${line(`"Picks " + state.picks.map(([t, n]) => chrabEsc(t.name) + (n > 1 ? " ×" + n : "")).join(", ")`)}
}`
    }
    case 'condition':
      return `await giveStatus(${s.to === 'self' ? 'actor' : 'tA()'}, ${js(s.status || 'prone')}, ${Number(s.rounds) || 0});`
    case 'effect': {
      const id = ids[s.effectKey] ?? s.effectKey
      return `await giveEffect(${s.to === 'self' ? 'actor' : 'tA()'}, ${js(id)});`
    }
    case 'removeEffect': {
      const id = s.effectKey ? (ids[s.effectKey] ?? s.effectKey) : ''
      if (s.to === 'scene') return `for (const who of new Set((globalThis.canvas?.tokens?.placeables ?? []).map((t) => t.actor).filter(Boolean))) await takeEffect(who, ${js(id)}, true);`
      return `await takeEffect(${s.to === 'self' ? 'actor' : 'tA()'}, ${js(id)});`
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

// The start of a remembered number: its starting value's math, seen from where it's declared.
function startCode(decl, scopes) {
  return String(decl?.start ?? '').trim() ? mathCode(decl.start, scopes.get(decl.key)?.vars ?? []) : '0'
}

// One line's code. scopes: scriptScopes; memories: scriptMemories; ids: editor effect key -> built id.
function lineCode(line, scopes, memories, ids) {
  const vars = scopes.get(line.key)?.vars ?? []
  switch (line.type) {
    case 'if': {
      const any = line.join === 'any'
      const checks = (line.checks ?? []).map((c) => `ok = ok ${any ? '||' : '&&'} (${checkCode(c, vars, line.key)}); // ${checkWords(c)}`)
      const once = (line.checks ?? []).some((c) => c.type === 'oncePerTurn') ? `await markTurn(${js(line.key)});\n` : ''
      const then = once + linesCode(line.then, scopes, memories, ids)
      const otherwise = linesCode(line.else, scopes, memories, ids)
      return `{
  let ok = ${checks.length ? (any ? 'false' : 'true') : 'false'};
${indent(checks.join('\n'))}
  if (ok) {
${indent(then, 4)}
  }${otherwise ? ` else {\n${indent(otherwise, 4)}\n  }` : ''}
}`
    }
    case 'memory':
      return `V[${js(line.name)}] = recall(${js(line.name)}, ${startCode(line, scopes)});`
    case 'forget': {
      const decl = memories.get(line.name)
      return `await forget(${js(line.name)});\nV[${js(line.name)}] = ${startCode(decl, scopes)};`
    }
    case 'value':
    case 'math': {
      const code = stepCode(line, vars, ids)
      const decl = memories.get(line.name)
      // A remembered number: every set is saved for next time.
      return decl ? `${code}\nawait remember(${js(line.name)}, V[${js(line.name)}], ${Number(decl.forget) > 0 ? Number(decl.forget) : 0});` : code
    }
    default:
      return stepCode(line, vars, ids)
  }
}

function linesCode(lines, scopes, memories, ids) {
  return (lines ?? []).map((l) => `// ${lineWords(l).replace(/\n/g, ' ')}\n${lineCode(l, scopes, memories, ids)}`).join('\n')
}

function sectionCode(section, scopes, memories, ids) {
  return `{ pass: ${js(flowTrigger(section.trigger).pass.toLowerCase())}, run: async () => {\n${indent(linesCode(section.lines, scopes, memories, ids))}\n} }`
}

// The activity macro: the body of the async function midi calls with
// workflow, args, actor, token, item (src/module/workflow.ts executeMacroWithScope).
// itemName: the card's title when the flow has no name of its own.
export function flowCode(flow, { ids = {}, itemName = '' } = {}) {
  const script = toScript(flow)
  const scopes = scriptScopes(script)
  const memories = scriptMemories(script)
  const setup = {
    key: String(script.key ?? 'flow'),
    name: String(script.name ?? '').trim() || String(itemName ?? '').trim() || 'Feature',
    color: cardColor(script.color),
    vars: flowVars(script),
  }
  return `// ${setup.name} - Chrab Corner automation, built step by step in the Automation Builder.
// One midi-qol activity macro, listed at each pass it needs. Edit it on the site, not here: a re-send replaces it.
const FLOW = ${JSON.stringify(setup)};
const pass = String(args?.[0]?.macroPass ?? "").toLowerCase();
if (!actor || !item) return;
${CHAT_RUNTIME}
${PICK_RUNTIME}
// Variables and the chat card last for the whole roll (every pass of this workflow).
const state = ((workflow.chrabFlow ??= {})[FLOW.key] ??= { vars: {}, posted: false, card: { title: FLOW.name, img: item.img, color: FLOW.color, flavor: "", steps: [], rolls: [] } });
const V = state.vars;
for (const n of FLOW.vars) V[n] ??= 0;
const card = state.card;
const say = (html) => card.steps.push(html);
// "The target": the creature an "every picked creature" line is on, one picked after the roll, else the roll's.
let current = null;
const target = () => current ?? (state.picksLate ? state.picks?.[0]?.[0] : null) ?? workflow?.hitTargets?.first?.() ?? workflow?.failedSaves?.first?.() ?? workflow?.targets?.first?.() ?? null;
const tA = () => target()?.actor ?? null;
const tName = () => target()?.name ?? tA()?.name ?? "the target";
// {name} in text: a variable, {target} the target's name, {me} the user's.
const fill = (text) => String(text ?? "").replace(/\\{(\\w+)\\}/g, (m, k) => (k in V ? String(V[k]) : k === "target" ? tName() : k === "me" ? actor.name : m));
const whole = (n) => Math.max(0, Math.floor(Number(n) || 0));
// Once per picked creature (picks = how many times), else once per target of the roll.
async function forEach(fn) {
  const list = state.picks?.length ? state.picks : [...(workflow?.targets ?? [])].map((t) => [t, 1]);
  if (!list.length) return say("No targets");
  const before = [current, V.picks];
  try {
    for (const [t, n] of list) {
      if (!t?.actor) continue;
      current = t;
      V.picks = n;
      await fn();
    }
  } finally {
    [current, V.picks] = before;
  }
}
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
// One button per choice. 1 for the first…; closing the window picks the first.
async function askChoice(question, choices, name) {
  const answer = await chrabDialog(actor, "wait", {
    window: { title: FLOW.name },
    content: chrabCardHtml(card) + "<p><strong>" + chrabEsc(fill(question) || "Pick one") + "</strong></p>",
    buttons: choices.map((c, i) => ({ action: String(i + 1), label: c, default: i === 0 })),
  });
  const n = Math.min(choices.length, Math.max(1, Math.floor(Number(answer)) || 1));
  (state.chosen ??= {})[name] = choices[n - 1];
  return n;
}
// "Fire", "fire" or dnd5e's own label -> its damage type key ("" if it isn't one).
function damageTypeOf(text) {
  const want = String(text ?? "").trim().toLowerCase();
  const types = CONFIG.DND5E?.damageTypes;
  if (!want || !types) return want;
  const label = (v) => String(game.i18n?.localize?.(v?.label ?? "") ?? v?.label ?? "").toLowerCase();
  return Object.entries(types).find(([k, v]) => k === want || label(v) === want)?.[0] ?? "";
}
function damageLabel(type) {
  const label = CONFIG.DND5E?.damageTypes?.[type]?.label;
  return label ? game.i18n?.localize?.(label) ?? label : type;
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
// Takes off what this item put on a creature: copies of one of its effects (by
// name), or with no id anything it applied except concentration. dnd5e and midi
// set the origin to the item or to its effect/activity, both under item.uuid.
async function takeEffect(who, id, quiet = false) {
  if (!who) return say("No target to remove it from");
  const src = id ? item.effects?.find?.((e) => (e.id ?? e._id) === id) : null;
  if (id && !src) return;
  const mine = (o) => typeof o === "string" && (o === item.uuid || o.startsWith(item.uuid + "."));
  const gone = (who.effects ?? []).filter((e) => mine(e.origin) && (src ? e.name === src.name : ![...(e.statuses ?? [])].includes("concentrating")));
  if (!gone.length) return quiet ? undefined : say(chrabEsc(who.name) + " has nothing of it to remove");
  const ids = gone.map((e) => e.id);
  if (who.isOwner === false) await MidiQOL.socket().executeAsGM("removeEffects", { actorUuid: who.uuid, effects: ids });
  else await who.deleteEmbeddedDocuments("ActiveEffect", ids);
  state.removed = (state.removed ?? 0) + ids.length;
  say(chrabEsc(who.name) + " loses <strong>" + [...new Set(gone.map((e) => chrabEsc(e.name)))].join(", ") + "</strong>");
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
// The activity being rolled (midi passes it as rolledActivity too).
const rolled = () => workflow?.activity ?? (typeof rolledActivity === "undefined" ? null : rolledActivity);
// Numbers remembered between uses, on this item: flags.chrab-sync.memory.<name>
// = { value, at: game time in seconds, forget: seconds without a change, 0 = never }.
function recall(name, start) {
  const m = item.flags?.["chrab-sync"]?.memory?.[name];
  if (!m) return start;
  if (m.forget > 0 && (Number(game.time?.worldTime) || 0) - (Number(m.at) || 0) > m.forget) return start;
  return Number(m.value) || 0;
}
async function remember(name, n, minutes) {
  await item.update({ ["flags.chrab-sync.memory." + name]: { value: Number(n) || 0, at: Number(game.time?.worldTime) || 0, forget: Math.max(0, Number(minutes) || 0) * 60 } });
}
async function forget(name) {
  await item.update({ ["flags.chrab-sync.memory.-=" + name]: null });
}
// A pop-up for whoever rolled, here. Everyone else who should see it - the
// character's players (when the GM rolls for them) and, if asked, the GMs -
// gets a whisper flagged chrab-sync.popup, which Chrab Sync shows as a pop-up
// on their screen (without it, it's still a whisper).
async function popup(text, gm) {
  ui.notifications?.warn?.(text);
  const me = game.user?.id;
  const owns = (u) => !u.isGM && !!actor?.testUserPermission?.(u, "OWNER");
  const to = (game.users?.filter?.((u) => u.active && u.id !== me && ((gm && u.isGM) || owns(u))) ?? []).map((u) => u.id);
  if (!to.length) return;
  await ChatMessage.create({ content: "<p><strong>" + chrabEsc(FLOW.name) + ":</strong> " + chrabEsc(text) + "</p>", whisper: to, speaker: ChatMessage.getSpeaker({ actor }), flags: { "chrab-sync": { popup: text } } });
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
${script.sections.map((x) => indent(sectionCode(x, scopes, memories, ids))).join(',\n')}
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
