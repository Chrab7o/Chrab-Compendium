// Feature behaviors: "while this is on, when I do X, Y happens" automation
// that reacts to the owner's OTHER items (any melee weapon, any spell), which
// a plain activity macro can't - those only run when their own item is used.
//
// How it works in Foundry (midi-qol 14; citations in the sandbox repo's
// probes/midi-qol-v14-reference.md and probes/feature-behaviors.md):
//   - The item's first activity carries one generated macro (macroData), the
//     "hook". Everything below runs that same code.
//   - An effect on the owner carries flags.midi-qol.onUseMacroName changes,
//     "ActivityMacro, <pass>". Midi resolves the bare "ActivityMacro" to the
//     first activity of the effect's item (transfer) or origin item (applied),
//     and then runs the hook for every item the owner uses, at that pass.
//   - passive: that effect is a transfer effect, always on.
//     toggle:  using the item runs the hook from the item's own onUseMacroName
//     ([postActiveEffects]ActivityMacro-<hook id>), which copies the item's
//     stance effects onto the owner (origin = the item) or removes them. While
//     they're on, the hooks fire. A visual (Sequencer if installed, else a
//     token light) follows the stance.
//
// The code is self-contained in the item - no Macro documents, no DAE, and no
// dependency on the Chrab Sync module at play time.

import { conditionText } from './foundryAutomation.js'

export const BEHAVIOR_MODES = [
  { key: 'passive', label: 'Always on' },
  { key: 'toggle', label: 'Toggle on / off (a stance)' },
]

// When a rule fires. pass: the midi-qol workflow pass the hook listens on.
// attack: only attack rolls can fire it; hit: at least one target was hit.
// downed: a TARGET pass - it runs when someone else's damage is about to land
// on the owner, before it's applied, so the damage can still be changed. The
// owner's own costs (hurtMe in the macro) check it too.
// outcomes: the only outcomes that make sense on it.
export const BEHAVIOR_EVENTS = [
  { key: 'attackRoll', label: 'I make an attack roll', pass: 'postAttackRoll', attack: true },
  { key: 'hit', label: 'I hit with an attack', pass: 'postAttackRoll', attack: true, hit: true },
  { key: 'damage', label: 'I roll damage on a hit (or any damage roll)', pass: 'damageBonus' },
  { key: 'dealt', label: 'My damage has landed', pass: 'postActiveEffects', dealt: true },
  { key: 'downed', label: 'I would drop to 0 hit points', pass: 'preTargetDamageApplication', outcomes: ['stayUp'] },
  // bond: hooked from the item's bond effects (Defend the Weak's tether on an
  // ally), not from the owner - the same target pass, run for the bonded creature.
  { key: 'bondedHurt', label: 'A creature bonded to me is about to take damage', pass: 'preTargetDamageApplication', bond: true, outcomes: ['shareDamage'] },
  // Same hook: the linked creature (a Mark, a Curse) drops to 0 from a hit.
  { key: 'bondedDowned', label: 'A creature I’ve marked drops to 0 hit points', pass: 'preTargetDamageApplication', bond: true, outcomes: ['refund'] },
  // target: a target pass on the owner, inside someone else's roll (no prompt,
  // no cost). @damageTaken is the damage about to land.
  { key: 'hurt', label: 'I take damage', pass: 'preTargetDamageApplication', target: true },
  { key: 'failedSave', label: 'A target fails my saving throw', pass: 'postSave', failedSave: true },
  // self: this item's own use (its own onUseMacroName), not the owner's other items.
  { key: 'used', label: 'I use this feature', pass: 'postActiveEffects', self: true },
  // turn: a hidden "tick" activity midi runs at the start / end of the owner's
  // turn (ActivityOverTime on the stance or carrier effect), so only while the
  // feature is active. Runs on the GM: no prompt, no cost.
  { key: 'turnStart', label: 'My turn starts', pass: 'postActiveEffects', turn: 'start' },
  { key: 'turnEnd', label: 'My turn ends', pass: 'postActiveEffects', turn: 'end' },
]

// A rule's own extra steps, after its main outcome (or instead of one, with
// outcome 'nothing'). type: applyEffect | resource | store | message.
export const BEHAVIOR_ACTIONS = [
  { key: 'applyEffect', label: 'Apply one of this item’s effects' },
  { key: 'resource', label: 'Gain or spend a resource' },
  { key: 'store', label: 'Store a value (for later formulas)' },
  { key: 'message', label: 'Show a message' },
]

export function emptyBehaviorAction(type = 'message') {
  return { key: newId(), type, effectKey: '', to: 'self', pool: '', amount: '1', mode: type === 'resource' ? 'gain' : 'set', name: '', formula: '1', text: '', style: 'chat' }
}

// Guided checks on the owner, compiled to JavaScript over c.actor.
export const SELF_CONDITIONS = [
  { id: 'hpBelowHalf', label: 'My HP is below half' },
  { id: 'hpAtMost', label: 'My HP is at most', value: '10' },
  { id: 'hasStatus', label: 'I have the condition', status: 'prone' },
  { id: 'lacksStatus', label: 'I don’t have the condition', status: 'prone' },
  { id: 'resourceAtLeast', label: 'I have at least … of a resource', pool: 'darkness', value: '1' },
  { id: 'inCombat', label: 'I’m in combat' },
]

export function emptySelfCondition(id = 'hpBelowHalf') {
  const def = SELF_CONDITIONS.find((c) => c.id === id) ?? SELF_CONDITIONS[0]
  return { key: newId(), id: def.id, value: def.value ?? '', status: def.status ?? '', pool: def.pool ?? '' }
}

export function selfConditionText(rows) {
  const n = (v) => Number(v) || 0
  const parts = (rows ?? []).map((r) => {
    const hp = 'c.actor.system.attributes.hp'
    switch (r.id) {
      case 'hpBelowHalf':
        return `${hp}.value < ${hp}.max / 2`
      case 'hpAtMost':
        return `${hp}.value <= ${n(r.value)}`
      case 'hasStatus':
        return `!!c.actor.statuses?.has(${js(r.status)})`
      case 'lacksStatus':
        return `!c.actor.statuses?.has(${js(r.status)})`
      case 'resourceAtLeast':
        return `(Number(c.actor.items.find((i) => i.system?.identifier === ${js(poolId(r.pool))})?.system?.uses?.value) || 0) >= ${n(r.value)}`
      case 'inCombat':
        return '!!game.combat?.started'
      default:
        return ''
    }
  })
  return parts.filter(Boolean).map((p) => `(${p})`).join(' && ')
}

function selfConditionWords(rows) {
  return (rows ?? [])
    .map((r) => {
      switch (r.id) {
        case 'hpBelowHalf':
          return 'you are below half your hit points'
        case 'hpAtMost':
          return `you have ${Number(r.value) || 0} hit points or fewer`
        case 'hasStatus':
          return `you are ${r.status}`
        case 'lacksStatus':
          return `you aren't ${r.status}`
        case 'resourceAtLeast':
          return `you have at least ${Number(r.value) || 0} ${poolId(r.pool).replace(/-/g, ' ')}`
        case 'inCombat':
          return 'you are in combat'
        default:
          return ''
      }
    })
    .filter(Boolean)
}

const DICE_COMPARES = { gte: 'or higher', lte: 'or lower', eq: 'exactly' }

// What happens. events: the only events it makes sense on (bonus damage has
// to be returned from the damageBonus pass).
export const BEHAVIOR_OUTCOMES = [
  { key: 'healSelf', label: 'I regain hit points' },
  { key: 'tempHpSelf', label: 'I gain temporary hit points' },
  { key: 'damageSelf', label: 'I take damage' },
  { key: 'bonusDamage', label: 'The target takes extra damage', events: ['damage'] },
  { key: 'stayUp', label: 'I stay up instead', events: ['downed'] },
  { key: 'shareDamage', label: 'I take part of it instead', events: ['bondedHurt'] },
  // Midi ignores resistances per activity (midiProperties.ignoreTraits); this
  // adds them to the roll being made and takes them off when it completes.
  { key: 'ignoreResistance', label: 'My damage ignores resistance', events: ['damage'] },
  // "If the cursed creature dies you can reapply the curse for free."
  { key: 'refund', label: 'I get its cost back (to use again)', events: ['bondedDowned'] },
  { key: 'nothing', label: 'Only the actions below' },
]

// The event an outcome has to use, if it only fits one.
export function eventForOutcome(outcome, current) {
  const only = BEHAVIOR_OUTCOMES.find((o) => o.key === outcome)?.events
  if (only && !only.includes(current)) return only[0]
  const ev = BEHAVIOR_EVENTS.find((e) => e.key === current)
  return ev?.outcomes && !ev.outcomes.includes(outcome) ? 'attackRoll' : current
}

// The persistent visual while a toggle is on. files: Sequencer database
// entries tried in order (the first that exists plays, attached under the
// token). They're best guesses at free JB2A names - a path picked in
// Sequencer's Database Viewer (toggle.sequencerFile) always wins. With no
// Sequencer or no match, the token gets a pulsing light of `color` instead.
export const TOGGLE_VISUALS = [
  { key: 'none', label: 'Just the effect icon' },
  {
    key: 'necrotic',
    label: 'Necrotic (blood red)',
    color: '#c4102f',
    files: ['jb2a.energy_strands.overlay.dark_red', 'jb2a.static_electricity.03.dark_red', 'jb2a.markers.02.dark_red', 'jb2a.energy_field.02.below.purple'],
  },
  { key: 'radiant', label: 'Radiant (gold)', color: '#ffc928', files: ['jb2a.markers.light.loop.yellow', 'jb2a.energy_field.02.below.yellow', 'jb2a.static_electricity.03.yellow'] },
  { key: 'fire', label: 'Fire (orange)', color: '#ff5a00', files: ['jb2a.flames.02.orange', 'jb2a.energy_field.02.below.orange', 'jb2a.static_electricity.03.orange'] },
  { key: 'frost', label: 'Frost (ice blue)', color: '#38c8ff', files: ['jb2a.energy_field.02.below.blue', 'jb2a.static_electricity.03.blue', 'jb2a.markers.02.blue'] },
  { key: 'arcane', label: 'Arcane (violet)', color: '#9b30ff', files: ['jb2a.energy_field.02.below.purple', 'jb2a.static_electricity.03.purple', 'jb2a.markers.02.purple'] },
  { key: 'nature', label: 'Nature (green)', color: '#2fd25b', files: ['jb2a.energy_field.02.below.green', 'jb2a.static_electricity.03.green', 'jb2a.markers.02.green'] },
]

const ABILITY_NAMES = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' }

const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
function newId() {
  let id = ''
  for (let i = 0; i < 16; i++) id += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)]
  return id
}

const js = (value) => JSON.stringify(value)

// ---------------------------------------------------------------------------
// Empty shapes for the editor

// key doubles as the hook activity's Foundry id, so it stays stable across
// re-sends (effects on characters point at it through their origin item).
export function emptyBehavior(mode = 'toggle') {
  return {
    key: newId(),
    mode,
    // Rules' level tiers count this class's levels (its dnd5e identifier, e.g.
    // "the-dark-knight"); blank, or a class the owner doesn't have, = character level.
    levelClass: '',
    toggle: {
      label: '', // the activity's name on the sheet; blank = "Toggle"
      activation: 'bonus', // an ACTIVATION_TYPES key
      duration: '', // minutes the stance lasts; blank = until turned off
      freeOff: true, // turning it off gives back the use it spent
      visual: 'necrotic',
      sequencerFile: '',
      announce: true, // a chat line when it turns on or off
    },
    rules: [],
  }
}

const DEFAULT_FORMULAS = { bonusDamage: '1d6', stayUp: '@hitDie + @abilities.con.mod' }

export function emptyBehaviorRule(outcome = 'healSelf') {
  return {
    key: newId(),
    label: '', // shown in chat and in the "use it?" prompt
    event: eventForOutcome(outcome, 'attackRoll'),
    attackRange: 'any', // 'any' | 'melee' | 'ranged'
    attackSource: 'any', // 'any' | 'weapon' | 'spell'
    naturalMin: '', // natural d20 at least this (attack events)
    critOnly: false,
    minLevel: '', // only from this level (see behavior.levelClass)
    maxLevel: '', // only up to this level
    oncePerTurn: false,
    oncePerStance: false, // toggles: once each time the stance is turned on
    ask: false, // "Use <label>?" before it happens
    targetConditions: [], // foundryAutomation condition rows, against the first target
    when: '', // extra JavaScript condition, advanced
    outcome,
    formula: DEFAULT_FORMULAS[outcome] ?? '1d10',
    damageType: outcome === 'bonusDamage' || outcome === 'damageSelf' ? 'necrotic' : '',
    selfCost: 'none', // bonusDamage: 'same' = I take the same amount
    critDoubles: true, // bonusDamage: dice double on a critical hit
    spendHitDie: outcome === 'stayUp', // stayUp: costs one of the owner's hit dice (@hitDie is its die)
    share: '50', // shareDamage: the percent of the bonded creature's damage the owner takes
    ignoreTypes: outcome === 'ignoreResistance' ? ['bludgeoning', 'piercing', 'slashing'] : [], // ignoreResistance: which
    refundPool: '', // refund: '' = a use of this feature, else a resource's identifier
    refundAmount: '1', // refund: how much of that resource
    selfConditions: [], // emptySelfCondition() rows: checks on the owner
    dice: { formula: '', compare: 'gte', value: '' }, // "roll 2d6: go on if 7 or higher"
    actions: [], // emptyBehaviorAction() rows, after the outcome
    // A cost from a resource pool (a feature's uses, found by its identifier,
    // e.g. darkness). costExtra: the player may spend more, +1 die each.
    costPool: '',
    costAmount: '1',
    costExtra: false,
  }
}

const poolId = (text) =>
  String(text ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

// An item's behavior, or null when there's nothing to build (a passive one
// with no rules does nothing).
export function activeBehavior(item) {
  const b = item?.behavior
  if (!b || !b.key) return null
  if (b.mode !== 'toggle' && !(b.rules ?? []).length) return null
  return b
}

export function ruleEvent(rule) {
  return BEHAVIOR_EVENTS.find((e) => e.key === rule.event) ?? BEHAVIOR_EVENTS[0]
}

// Bonus damage only works from the damageBonus pass, and staying up only from
// the downed one; anything else keeps its event.
export function ruleOutcomeFits(rule) {
  const outcome = BEHAVIOR_OUTCOMES.find((o) => o.key === rule.outcome)
  const ev = BEHAVIOR_EVENTS.find((e) => e.key === rule.event)
  return (!outcome?.events || outcome.events.includes(rule.event)) && (!ev?.outcomes || ev.outcomes.includes(rule.outcome))
}

// The midi passes the hook has to listen on, one onUseMacroName change each:
// the owner's (on the stance or carrier effect), and the bonded creatures'
// (on the item's bond effects).
export function behaviorPasses(behavior) {
  return [
    ...new Set(
      (behavior?.rules ?? [])
        .filter(ruleOutcomeFits)
        .filter((r) => !ruleEvent(r).bond && !ruleEvent(r).self && !ruleEvent(r).turn)
        .map((r) => ruleEvent(r).pass),
    ),
  ]
}

// "I use this feature" and turn rules run from the item's own
// onUseMacroName (a turn tick is a use of the item), like a toggle.
export function hasSelfUseRules(behavior) {
  return (behavior?.rules ?? []).filter(ruleOutcomeFits).some((r) => ruleEvent(r).self || ruleEvent(r).turn)
}

// The hidden turn-tick activities a behavior needs: [{ id, turn }]. Ids come
// from the behavior key, so re-sends keep them.
export function turnTicks(behavior) {
  const turns = new Set((behavior?.rules ?? []).filter(ruleOutcomeFits).map((r) => ruleEvent(r).turn).filter(Boolean))
  return ['start', 'end'].filter((t) => turns.has(t)).map((turn) => ({ turn, id: `${String(behavior.key).slice(0, 12)}Tk${turn === 'start' ? 'St' : 'En'}` }))
}

export function bondPasses(behavior) {
  return [...new Set((behavior?.rules ?? []).filter(ruleOutcomeFits).filter((r) => ruleEvent(r).bond).map((r) => ruleEvent(r).pass))]
}

const hookChange = (pass) => ({ key: 'flags.midi-qol.onUseMacroName', value: `ActivityMacro, ${pass}`, type: 'custom', phase: 'initial' })

export function behaviorChanges(behavior) {
  return behaviorPasses(behavior).map(hookChange)
}

export function bondChanges(behavior) {
  return bondPasses(behavior).map(hookChange)
}

// ---------------------------------------------------------------------------
// Text for the item description and the editor preview

// "1d10 + @abilities.con.mod" -> "1d10 + your Constitution modifier"
export function formulaWords(formula) {
  return String(formula ?? '')
    .trim()
    .replace(/@abilities\.(\w+)\.mod/g, (_, a) => `your ${ABILITY_NAMES[a] ?? a.toUpperCase()} modifier`)
    .replace(/@prof\b/g, 'your proficiency bonus')
    .replace(/@details\.level\b/g, 'your level')
    .replace(/@classes\.(\w+)\.levels/g, (_, c) => `your ${c} level`)
    .replace(/@dealt\b/g, 'the damage dealt')
    .replace(/@hitDie\b/g, 'a roll of that hit die')
    .replace(/\s+/g, ' ')
}

// "From level 7, " / "At levels 3-6, " - a rule's tier, as a lead-in.
function levelWords(rule) {
  const min = Number(rule.minLevel) || 0
  const max = Number(rule.maxLevel) || 0
  if (min && max) return min === max ? `At level ${min}, ` : `At levels ${min}-${max}, `
  if (min) return `From level ${min}, `
  if (max) return `Before level ${max + 1}, `
  return ''
}

const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1)

function attackWords(rule) {
  const range = { melee: 'melee ', ranged: 'ranged ' }[rule.attackRange] ?? ''
  const source = { weapon: 'weapon ', spell: 'spell ' }[rule.attackSource] ?? ''
  return `${range}${source}attack`
}

export function ruleSummary(rule) {
  const ev = ruleEvent(rule)
  const attack = attackWords(rule)
  let when
  if (ev.key === 'attackRoll') when = `When you make a ${attack} roll`
  else if (ev.key === 'hit') when = `When you hit with a ${attack}`
  else if (ev.key === 'damage') when = rule.attackRange !== 'any' || rule.attackSource !== 'any' ? `When you hit with a ${attack}` : 'When you hit or deal damage'
  else if (ev.key === 'downed') when = 'When you would drop to 0 hit points'
  else if (ev.key === 'bondedHurt') when = 'When a creature bonded to you would take damage'
  else if (ev.key === 'bondedDowned') when = 'When a creature you’ve marked drops to 0 hit points'
  else if (ev.key === 'hurt') when = 'When you take damage'
  else if (ev.key === 'failedSave') when = 'When a creature fails a saving throw against you'
  else if (ev.key === 'used') when = 'When you use this feature'
  else if (ev.key === 'turnStart') when = 'At the start of each of your turns'
  else if (ev.key === 'turnEnd') when = 'At the end of each of your turns'
  else when = rule.attackRange !== 'any' || rule.attackSource !== 'any' ? `After your ${attack} deals damage` : 'After you deal damage'
  const extra = []
  const n = Number(rule.naturalMin)
  for (const words of selfConditionWords(rule.selfConditions)) extra.push(`and ${words}`)
  const dice = rule.dice ?? {}
  if (String(dice.formula ?? '').trim()) extra.push(`and roll ${String(dice.formula).trim()} for ${Number(dice.value) || 0} ${DICE_COMPARES[dice.compare] ?? 'or higher'}`)
  if (!ev.outcomes && !ev.target && !ev.self && !ev.failedSave && !ev.turn) {
    if (n > 1) extra.push(n >= 20 ? 'and roll a 20 on the d20' : `and roll a ${n === 19 ? '19 or 20' : `${n} or higher`} on the d20`)
    if (rule.critOnly) extra.push('and score a critical hit')
  }
  const tier = levelWords(rule)
  const lead = tier + (tier ? lowerFirst([when, ...extra].join(' ')) : [when, ...extra].join(' '))
  const amount = formulaWords(rule.formula) || '0'
  const type = rule.damageType ? ` ${rule.damageType}` : ''
  const can = rule.ask ? 'can ' : ''
  let what
  switch (rule.outcome) {
    case 'healSelf':
      what = `you ${can}regain ${amount} hit points`
      break
    case 'tempHpSelf':
      what = `you ${can}gain ${amount} temporary hit points`
      break
    case 'damageSelf':
      what = `you take ${amount}${type} damage`
      break
    case 'bonusDamage':
      what = `you ${can}deal an extra ${amount}${type} damage${rule.selfCost === 'same' ? ', and you take the same amount of damage' : ''}`
      break
    case 'nothing':
      what = ''
      break
    case 'refund': {
      const pool = poolId(rule.refundPool)
      what = pool ? `you regain ${Number(rule.refundAmount) || 1} ${pool.replace(/-/g, ' ')}, so you can use it again` : 'you regain a use of this feature, so you can use it again'
      break
    }
    case 'ignoreResistance': {
      const types = (rule.ignoreTypes ?? []).filter(Boolean)
      what = `your damage ignores ${types.length ? `resistance to ${types.length > 1 ? `${types.slice(0, -1).join(', ')} and ${types.at(-1)}` : types[0]}` : 'nothing yet'}`
      break
    }
    case 'shareDamage':
      what = Number(rule.share) >= 100 ? 'you take all of it instead' : `you take ${Number(rule.share) || 50}% of it instead (rounded down)`
      break
    case 'stayUp':
      what = rule.spendHitDie
        ? `you can spend one of your hit dice to stay up with ${amount} hit points instead`
        : `you stay up with ${amount} hit points instead`
      break
    default:
      what = 'nothing happens'
  }
  const once = [rule.oncePerTurn && ' This can happen only once per turn.', rule.oncePerStance && ' This can happen only once each time you enter the stance.']
    .filter(Boolean)
    .join('')
  const pool = poolId(rule.costPool)
  const cost = pool && !ev.outcomes && !ev.target && !ev.turn
    ? ` It costs ${Number(rule.costAmount) || 1} ${pool.replace(/-/g, ' ')}${rule.costExtra ? ', and you can spend more for an extra die each' : ''}.`
    : ''
  const steps = (rule.actions ?? []).map(actionWords).filter(Boolean)
  const all = [what, ...steps].filter(Boolean)
  const body = all.length ? all.join(', and ') : 'nothing happens'
  return `${lead}, ${body}.${cost}${once}`
}

function actionWords(a) {
  switch (a.type) {
    case 'applyEffect':
      return a.effectKey ? `${a.to === 'target' ? 'the target gains' : 'you gain'} ${a.name ? `“${a.name}”` : 'an effect'}` : ''
    case 'resource': {
      const pool = poolId(a.pool)
      return pool ? `you ${a.mode === 'spend' ? 'spend' : 'regain'} ${formulaWords(a.amount) || 1} ${pool.replace(/-/g, ' ')}` : ''
    }
    case 'store': {
      const key = poolId(a.name)
      return key ? `${a.mode === 'add' ? `${formulaWords(a.formula)} is added to` : `${formulaWords(a.formula)} is stored as`} “${key}” (@flags.chrab-sync.stored.${key})` : ''
    }
    case 'message':
      return String(a.text ?? '').trim() ? `a ${a.style === 'popup' ? 'popup' : 'chat message'} says “${String(a.text).trim()}”` : ''
    default:
      return ''
  }
}

const ACTIVATION_WORDS = { action: 'As an action', bonus: 'As a bonus action', reaction: 'As a reaction', special: 'At any time' }

// "1 minute", "10 minutes", "1 hour"
function minutesWords(minutes) {
  if (minutes % 60 === 0) return minutes === 60 ? '1 hour' : `${minutes / 60} hours`
  return minutes === 1 ? '1 minute' : `${minutes} minutes`
}

export function behaviorSummary(behavior, itemName = '') {
  if (!behavior) return ''
  const rules = (behavior.rules ?? []).filter(ruleOutcomeFits).map(ruleSummary)
  if (behavior.mode !== 'toggle') return rules.join(' ')
  const how = ACTIVATION_WORDS[behavior.toggle?.activation] ?? 'As a bonus action'
  const name = itemName || 'this stance'
  const minutes = Number(behavior.toggle?.duration) || 0
  const intro = minutes > 0 ? `${how}, you can enter ${name} for ${minutesWords(minutes)}, or leave it early.` : `${how}, you can enter or leave ${name}.`
  return rules.length ? `${intro} While it's active: ${rules.join(' ')}` : intro
}

// ---------------------------------------------------------------------------
// The hook macro

// Only what the runtime reads, with defaults resolved here so the macro
// doesn't have to.
function runtimeRule(rule, toggle) {
  const ev = ruleEvent(rule)
  // Target-pass events (downed, bonded, I take damage) and turn ticks: no
  // attack filters, no prompt, no cost - they run inside someone else's roll,
  // or on the GM's client.
  const downed = !!ev.outcomes || !!ev.target || !!ev.turn
  const attacky = !downed && !ev.self && !ev.failedSave
  const dice = rule.dice ?? {}
  return {
    key: rule.key,
    event: ev.key,
    label: String(rule.label ?? '').trim(),
    pass: ev.pass,
    dice: String(dice.formula ?? '').trim() ? { formula: String(dice.formula).trim(), compare: dice.compare || 'gte', value: Number(dice.value) || 0 } : null,
    actions: (rule.actions ?? []).map(runtimeAction).filter(Boolean),
    attackOnly: attacky && (!!ev.attack || rule.attackRange !== 'any' || rule.attackSource !== 'any'),
    range: !attacky || rule.attackRange === 'any' ? '' : rule.attackRange,
    source: !attacky || rule.attackSource === 'any' ? '' : rule.attackSource,
    needsHit: !!ev.hit,
    needsDamage: !!ev.dealt,
    needsFailedSave: !!ev.failedSave,
    naturalMin: attacky && Number(rule.naturalMin) > 1 ? Number(rule.naturalMin) : 0,
    critOnly: attacky && !!rule.critOnly,
    minLevel: Number(rule.minLevel) || 0,
    maxLevel: Number(rule.maxLevel) || 0,
    oncePerTurn: !!rule.oncePerTurn,
    oncePerStance: toggle && !!rule.oncePerStance,
    // Staying up happens inside someone else's attack, on their client: a
    // prompt would go to whoever is attacking, so it never asks.
    ask: !downed && !!rule.ask,
    outcome: rule.outcome,
    formula: String(rule.formula ?? '').trim() || '0',
    type: rule.damageType || '',
    selfCost: rule.outcome === 'bonusDamage' && rule.selfCost === 'same',
    critDoubles: rule.outcome === 'bonusDamage' && rule.critDoubles !== false,
    spendHitDie: rule.outcome === 'stayUp' && !!rule.spendHitDie,
    share: rule.outcome === 'shareDamage' ? Math.min(100, Math.max(1, Number(rule.share) || 50)) : 0,
    ignore: rule.outcome === 'ignoreResistance' ? (rule.ignoreTypes ?? []).filter(Boolean) : [],
    refund: rule.outcome === 'refund' ? { pool: poolId(rule.refundPool), amount: Math.max(1, Number(rule.refundAmount) || 1) } : null,
    cost: !downed && poolId(rule.costPool) ? { pool: poolId(rule.costPool), amount: Math.max(1, Number(rule.costAmount) || 1), extra: !!rule.costExtra } : null,
  }
}

// A rule's action as the macro reads it.
function runtimeAction(a) {
  switch (a.type) {
    case 'applyEffect':
      return a.effectKey ? { type: a.type, effectKey: a.effectKey, to: a.to === 'target' ? 'target' : 'self' } : null
    case 'resource':
      return poolId(a.pool) ? { type: a.type, pool: poolId(a.pool), amount: String(a.amount ?? '').trim() || '1', mode: a.mode === 'spend' ? 'spend' : 'gain' } : null
    case 'store':
      return poolId(a.name) ? { type: a.type, name: poolId(a.name), formula: String(a.formula ?? '').trim() || '0', mode: a.mode === 'add' ? 'add' : 'set' } : null
    case 'message':
      return String(a.text ?? '').trim() ? { type: a.type, text: String(a.text).trim(), style: a.style === 'popup' ? 'popup' : 'chat' } : null
    default:
      return null
  }
}

// The value keys a behavior's "store" actions write, for the item's floor
// effect (they must exist before any formula reads them).
export function storedKeys(behavior) {
  return [...new Set((behavior?.rules ?? []).flatMap((r) => (r.actions ?? []).filter((a) => a.type === 'store').map((a) => poolId(a.name))).filter(Boolean))]
}

// A rule's extra condition as code: the guided target rows (midi condition
// syntax, evaluated by MidiQOL against the first target), the guided rows on
// the owner, and/or a raw expression over the hook's own variables.
function whenCode(rule) {
  const parts = []
  const target = conditionText(rule.targetConditions)
  if (target) parts.push(`await targetPasses(${js(target)})`)
  const self = selfConditionText(rule.selfConditions)
  if (self) parts.push(`(${self})`)
  const raw = String(rule.when ?? '').trim()
  if (raw) parts.push(`(${raw})`)
  return parts.length ? parts.join(' && ') : ''
}

function visualFor(behavior) {
  const t = behavior.toggle ?? {}
  const preset = TOGGLE_VISUALS.find((v) => v.key === t.visual)
  if (!preset || preset.key === 'none') return t.sequencerFile ? { files: [t.sequencerFile], color: '' } : null
  return { files: [t.sequencerFile, ...(preset.files ?? [])].filter(Boolean), color: preset.color }
}

const HEADER = (name) => `// ${name} - Chrab Corner feature behavior, generated by the Feature Forge.
// One midi-qol activity macro: it runs when this item is used (the toggle) and,
// through flags.midi-qol.onUseMacroName on its effect, whenever the owner uses
// any other item. Edit it on the Compendium site, not here - a re-send replaces it.
`

// The macro's whole code. It's the body of an async function midi calls with
// workflow, args, actor, token, rolledItem, rolledActivity and macroItem in
// scope (src/module/workflow.ts executeMacroWithScope).
export function behaviorMacro(item, behavior) {
  const rules = (behavior.rules ?? []).filter(ruleOutcomeFits)
  const toggle = behavior.mode === 'toggle'
  const setup = {
    name: String(item?.name ?? '').trim() || 'Feature',
    levelClass: String(behavior.levelClass ?? '').trim(),
    toggle: toggle ? { freeOff: behavior.toggle?.freeOff !== false, announce: behavior.toggle?.announce !== false, visual: visualFor(behavior) } : null,
    rules: rules.map((r) => runtimeRule(r, toggle)),
    // turn tick activity id -> "start" | "end"
    ticks: Object.fromEntries(turnTicks(behavior).map((t) => [t.id, t.turn])),
  }
  const whens = rules
    .map((r) => [r.key, whenCode(r)])
    .filter(([, code]) => code)
    .map(([key, code]) => `  ${js(key)}: async (c) => ${code},`)
    .join('\n')

  return `${HEADER(setup.name)}const SETUP = ${JSON.stringify(setup, null, 2)};
const WHEN = {
${whens}
};
const FLAG = "chrab-sync";
const pass = String(args?.[0]?.macroPass ?? "");
const feature = macroItem;
const me = actor;
if (!feature || !me) return;
const speaker = ChatMessage.getSpeaker({ actor: me });
const say = (html) => ChatMessage.implementation.create({ speaker, content: html });
const esc = (s) => foundry.utils.escapeHTML ? foundry.utils.escapeHTML(String(s)) : String(s);
const isStance = (e) => e.origin === feature.uuid && !!e.flags?.[FLAG]?.stance;
const myToken = () => {
  const t = token ?? me.getActiveTokens?.()[0];
  return t ? { object: t.document ? t : t.object, doc: t.document ?? t } : null;
};

// --- A creature bonded by this item (it carries one of the item's bond
// effects) is about to take damage: a target pass where actor is that
// creature, not the item's owner. Its share comes off the hit and lands on
// the owner. Runs on the attacker's client, which can update both (the GM).
const owner = feature.actor ?? feature.parent;
if (pass.toLowerCase() === "pretargetdamageapplication" && owner && me.uuid !== owner.uuid) {
  const d = workflow?.damageItem;
  if (!d || (d.actorUuid && d.actorUuid !== me.uuid)) return;
  if (owner.isOwner === false) {
    console.warn("chrab-sync | " + SETUP.name + ": this user can't update " + owner.name + ", so " + me.name + "'s link does nothing here.");
    return;
  }
  const hurt = (d.damageDetail ?? []).filter((x) => !["temphp", "healing", "midi-none"].includes(x.type));
  const total = hurt.reduce((sum, x) => sum + (Number(x.value) || 0), 0);
  if (total <= 0) return;
  // Bonded: the owner's share comes off the hit first.
  const sharing = SETUP.rules.find((r) => r.outcome === "shareDamage");
  if (sharing) {
    const share = Math.min(total, Math.floor((total * sharing.share) / 100));
    if (share > 0) {
      // midi applies damageDetail: take the share off its entries in order.
      let left = share;
      for (const x of hurt) {
        const cut = Math.min(left, Number(x.value) || 0);
        x.value -= cut;
        left -= cut;
        if (!left) break;
      }
      d.hpDamage = Math.max(0, (Number(d.hpDamage) || 0) - share);
      d.newHP = Math.max(0, (Number(d.oldHP) || 0) - d.hpDamage);
      await owner.applyDamage([{ value: share, type: hurt[0].type }]);
      await ChatMessage.implementation.create({
        speaker: ChatMessage.getSpeaker({ actor: owner }),
        content: "<p><strong>" + esc(sharing.label || SETUP.name) + "</strong>: " + esc(owner.name) + " takes " + share + " of the damage meant for " + esc(me.name) + ".</p>",
      });
    }
  }
  // Marked: dropping to 0 gives the owner the cost back (once per creature per workflow).
  const refunding = SETUP.rules.find((r) => r.outcome === "refund");
  const dropped = (Number(d.oldHP) || 0) > 0 && (Number(d.newHP) || 0) <= 0;
  if (refunding && dropped && !(workflow.chrabRefunds ??= new Set()).has(me.uuid)) {
    workflow.chrabRefunds.add(me.uuid);
    const r = refunding.refund;
    const from = r.pool ? owner.items.find((i) => i.system?.identifier === r.pool) : feature;
    const spent = Number(from?.system?.uses?.spent) || 0;
    const back = r.pool ? Math.min(r.amount, spent) : Math.min(1, spent);
    if (from && back > 0) {
      await from.update({ "system.uses.spent": spent - back });
      await ChatMessage.implementation.create({
        speaker: ChatMessage.getSpeaker({ actor: owner }),
        content: "<p><strong>" + esc(refunding.label || SETUP.name) + "</strong>: " + esc(me.name) + " falls; " + esc(owner.name) + " regains " +
          (r.pool ? back + " " + esc(r.pool) : "a use of " + esc(SETUP.name)) + ".</p>",
      });
    }
  }
  return;
}

// --- Visual: a Sequencer effect tied to the stance effect, else a token light.
async function visualOn(effect) {
  const v = SETUP.toggle?.visual;
  const t = myToken();
  if (!v || !t?.doc) return;
  const S = globalThis.Sequencer;
  const file = S ? v.files.find((f) => f.includes("/") || S.Database?.entryExists?.(f)) : null;
  if (file && globalThis.Sequence) {
    await new Sequence()
      .effect()
      .file(file)
      .attachTo(t.object ?? t.doc)
      .scaleToObject(1.8)
      .belowTokens()
      .fadeIn(400)
      .fadeOut(400)
      .persist()
      .name("chrab-" + feature.id)
      .tieToDocuments(effect)
      .play();
    return;
  }
  if (!v.color) return;
  const before = t.doc.light?.toObject?.() ?? foundry.utils.deepClone(t.doc._source.light);
  await t.doc.update({
    light: { dim: 10, bright: 0, color: v.color, alpha: 0.6, animation: { type: "pulse", speed: 3, intensity: 5 } },
    ["flags." + FLAG + ".light." + feature.id]: before,
  });
}

async function visualOff() {
  const t = myToken();
  if (!t?.doc) return;
  globalThis.Sequencer?.EffectManager?.endEffects?.({ name: "chrab-" + feature.id, object: t.object ?? t.doc });
  const before = t.doc.flags?.[FLAG]?.light?.[feature.id];
  if (before) await t.doc.update({ light: before, ["flags." + FLAG + ".light.-=" + feature.id]: null });
}

// --- The toggle: this item's own use. Both the item's onUse flag and (when a
// rule listens on postActiveEffects) the actor hook land here, so only the
// first call per workflow does anything. "I use this feature" rules run
// further down, once the rule helpers exist.
const ownUse = rolledItem?.uuid === feature.uuid;
// A turn tick: midi using one of this item's hidden tick activities at the start / end of the owner's turn.
const tick = ownUse ? SETUP.ticks?.[rolledActivity?.id] ?? null : null;
if (ownUse && !tick && SETUP.toggle && pass.toLowerCase() === "postactiveeffects" && !workflow?.chrabToggled?.has(feature.uuid)) {
  (workflow.chrabToggled ??= new Set()).add(feature.uuid);
  const active = me.effects.filter(isStance);
  if (active.length) {
    await visualOff();
    await me.deleteEmbeddedDocuments("ActiveEffect", active.map((e) => e.id));
    const uses = feature.system?.uses;
    if (SETUP.toggle.freeOff && uses?.max && Number(uses.spent) > 0) await feature.update({ "system.uses.spent": Number(uses.spent) - 1 });
    if (SETUP.toggle.announce) await say("<p><strong>" + esc(SETUP.name) + "</strong> ends.</p>");
  } else {
    // A stance that ran out on its own leaves the fallback light behind.
    await visualOff();
    const data = feature.effects.filter((e) => e.flags?.[FLAG]?.stance).map((e) => {
      const d = e.toObject();
      delete d._id;
      // The duration counts from now: Foundry stamps the start on creation.
      delete d.start;
      if (d.duration) for (const k of ["startTime", "startRound", "startTurn", "combat"]) delete d.duration[k];
      return foundry.utils.mergeObject(d, { origin: feature.uuid, transfer: false, disabled: false });
    });
    if (!data.length) return ui.notifications.warn(SETUP.name + ": this item has no stance effect to turn on.");
    const created = await me.createEmbeddedDocuments("ActiveEffect", data);
    await visualOn(created[0]);
    if (SETUP.toggle.announce) await say("<p><strong>" + esc(SETUP.name) + "</strong> is active.</p>");
  }
}

// --- Rules: what the roll being made looks like.
const activity = rolledActivity;
const isAttack = activity?.type === "attack";
const range = activity?.attack?.type?.value ?? "";
const source = activity?.attack?.type?.classification ?? "";
const natural = Number(workflow?.diceRoll) || 0;
const hits = workflow?.hitTargets?.size ?? 0;
const dealt = (workflow?.damageList ?? []).reduce((sum, d) => sum + (Number(d.hpDamage) || 0) + (Number(d.tempDamage) || 0), 0);
const target = workflow?.hitTargets?.first?.() ?? workflow?.failedSaves?.first?.() ?? workflow?.targets?.first?.();
const rollData = { ...(feature.getRollData?.() ?? me.getRollData()), natural, hits, dealt };

async function targetPasses(expression) {
  if (!target || !globalThis.MidiQOL?.evalCondition) return false;
  const data = MidiQOL.createConditionData({ workflow, target, actor: me, item: rolledItem, activity });
  return !!(await MidiQOL.evalCondition(expression, data, { async: true }));
}

const turnKey = () => (game.combat?.started ? game.combat.id + ":" + game.combat.round + ":" + game.combat.turn : "");
const usedThisTurn = (rule) => !!turnKey() && feature.flags?.[FLAG]?.turns?.[rule.key] === turnKey();
const markTurn = (rule) => (turnKey() ? feature.update({ ["flags." + FLAG + ".turns." + rule.key]: turnKey() }) : null);
// Once per stance: marked on the stance effect itself, so turning the stance
// on again (a new effect) starts fresh.
const stanceEffect = () => me.effects.find(isStance);
const usedThisStance = (rule) => !!stanceEffect()?.flags?.[FLAG]?.spent?.[rule.key];
const markStance = (rule) => stanceEffect()?.update({ ["flags." + FLAG + ".spent." + rule.key]: true });

// Level tiers count the class named in SETUP.levelClass, else character
// level. Owners with no level at all (NPCs) ignore tiers.
const cls = SETUP.levelClass ? me.classes?.[SETUP.levelClass] : null;
const level = Number(cls?.system?.levels ?? me.system?.details?.level) || 0;
const inTier = (rule) => !level || ((!rule.minLevel || level >= rule.minLevel) && (!rule.maxLevel || level <= rule.maxLevel));

async function whenPasses(rule, extra = {}) {
  if (!WHEN[rule.key]) return true;
  try {
    return !!(await WHEN[rule.key]({ workflow, actor: me, item: feature, activity, natural, hits, dealt, target, level, ...extra }));
  } catch (err) {
    console.warn("chrab-sync | " + SETUP.name + ": condition failed", err);
    return false;
  }
}

async function ask(rule) {
  const text = rule.label || SETUP.name;
  const DialogV2 = foundry.applications?.api?.DialogV2;
  if (!DialogV2) return true;
  return !!(await DialogV2.confirm({
    window: { title: SETUP.name },
    content: "<p>Use <strong>" + esc(text) + "</strong>?</p>",
    rejectClose: false,
    modal: true,
  }));
}

// --- Costs from a resource pool: the owner's feature whose identifier is the
// pool's (darkness), spending its uses.
const poolItem = (id) => me.items.find((i) => i.system?.identifier === id) ?? null;
function usesLeft(item) {
  const u = item?.system?.uses;
  if (!u) return 0;
  const left = Number(u.value);
  return Number.isFinite(left) ? left : Math.max(0, (Number(u.max) || 0) - (Number(u.spent) || 0));
}
// How much to spend: the fixed amount, or what the player picks (at least
// the amount) when it can be more. 0 = declined.
async function askSpend(rule, left, c = rule.cost) {
  const text = esc(rule.label || SETUP.name);
  const DialogV2 = foundry.applications?.api?.DialogV2;
  if (!c.extra) return !rule.ask || (await ask(rule)) ? c.amount : 0;
  if (!DialogV2) return c.amount;
  const picked = await DialogV2.prompt({
    window: { title: SETUP.name },
    content: "<p>Use <strong>" + text + "</strong>? Spend how much " + esc(c.pool) + " (" + left + " left)? Each point over " + c.amount + " adds a die.</p>" +
      '<input type="number" name="spend" value="' + c.amount + '" min="' + c.amount + '" max="' + left + '" autofocus>',
    ok: { label: "Use", callback: (event, button) => Number(button.form.elements.spend.value) },
    rejectClose: false,
    modal: true,
  });
  const n = Math.floor(Number(picked) || 0);
  return n >= c.amount ? Math.min(n, left) : 0;
}
async function spendPool(item, n) {
  await item.update({ "system.uses.spent": (Number(item.system.uses.spent) || 0) + n });
}
// Extra points add that many of the formula's first die: "2d10" + 2 -> "2d10 + 2d10".
function withExtraDice(formula, extra) {
  if (!extra) return formula;
  const die = String(formula).match(/d(\\d+)/i);
  return die ? formula + " + " + extra + "d" + die[1] : formula;
}

async function roll(rule, options = {}) {
  const r = new CONFIG.Dice.DamageRoll(rule.formula, rollData, { type: rule.type || undefined, ...options });
  await r.evaluate();
  return r;
}

// The owner's class with the biggest hit die left, for "spend a hit die".
function hitDieClass() {
  const left = (c) => Number(c.system?.hd?.value ?? (Number(c.system?.levels) || 0) - (Number(c.system?.hd?.spent) || 0));
  const faces = (c) => Number(String(c.system?.hd?.denomination ?? "").replace(/\\D/g, "")) || 0;
  return me.items.filter((i) => i.type === "class" && left(i) > 0).sort((a, b) => faces(b) - faces(a))[0] ?? null;
}

// "I would drop to 0": the first stay-up rule that applies decides the hit
// points I'm left with. 0 = none applies, I go down.
async function stayUp(incoming) {
  if (me.isOwner === false) {
    console.warn("chrab-sync | " + SETUP.name + ": this user can't update " + me.name + ", so it can't stay up.");
    return 0;
  }
  for (const rule of SETUP.rules) {
    if (rule.outcome !== "stayUp" || !inTier(rule)) continue;
    if (rule.oncePerTurn && usedThisTurn(rule)) continue;
    if (rule.oncePerStance && usedThisStance(rule)) continue;
    if (!(await whenPasses(rule, { incoming }))) continue;
    let formula = rule.formula;
    const die = rule.spendHitDie || /@hitDie\\b/.test(formula) ? hitDieClass() : null;
    if (rule.spendHitDie && !die) continue; // no hit dice left: I fall
    formula = formula.replace(/@hitDie\\b/g, "1" + (die?.system?.hd?.denomination || "d8"));
    if (rule.oncePerTurn) await markTurn(rule);
    if (rule.oncePerStance) await markStance(rule);
    if (rule.spendHitDie) await die.update({ "system.hd.spent": (Number(die.system.hd.spent) || 0) + 1 });
    const r = await roll({ ...rule, formula }, { type: "healing" });
    const hp = Math.max(1, Math.floor(r.total));
    const label = rule.label || SETUP.name;
    await r.toMessage({ speaker, flavor: esc(label) + ": " + esc(me.name) + " stays up with " + hp + " HP" + (rule.spendHitDie ? " (spent a " + die.system.hd.denomination + " hit die)" : "") });
    return hp;
  }
  return 0;
}

// --- A rule's own dice check: "roll 2d6, go on if 7 or higher".
async function diceCheck(rule) {
  const r = await new Roll(rule.dice.formula, rollData).evaluate();
  const c = rule.dice;
  const ok = c.compare === "lte" ? r.total <= c.value : c.compare === "eq" ? r.total === c.value : r.total >= c.value;
  rollData.check = r.total;
  const needs = c.compare === "lte" ? c.value + " or lower" : c.compare === "eq" ? "exactly " + c.value : c.value + " or higher";
  await r.toMessage?.({ speaker, flavor: esc(rule.label || SETUP.name) + ": needs " + needs + (ok ? " - it happens" : " - nothing") });
  return ok;
}

// --- A rule's actions, after its outcome.
async function runActions(rule) {
  for (const a of rule.actions ?? []) {
    try {
      if (a.type === "applyEffect") {
        const src = feature.effects.find((e) => (e.id ?? e._id) === a.effectKey);
        const who = a.to === "target" ? target?.actor : me;
        if (!src || !who) continue;
        const data = src.toObject();
        delete data._id;
        delete data.start;
        Object.assign(data, { origin: feature.uuid, transfer: false, disabled: false });
        if (who.isOwner === false) await MidiQOL.socket().executeAsGM("createEffects", { actorUuid: who.uuid, effects: [data] });
        else await who.createEmbeddedDocuments("ActiveEffect", [data]);
      } else if (a.type === "resource") {
        const it = poolItem(a.pool);
        if (!it) continue;
        const n = Math.max(0, Math.floor((await new Roll(a.amount, rollData).evaluate()).total) || 0);
        const now = Number(it.system.uses.spent) || 0;
        const next = a.mode === "spend" ? now + Math.min(n, usesLeft(it)) : Math.max(0, now - n);
        if (next !== now) await it.update({ "system.uses.spent": next });
      } else if (a.type === "store") {
        // On the owner, so any formula can read it: @flags.chrab-sync.stored.<name>.
        const n = Number((await new Roll(a.formula, rollData).evaluate()).total) || 0;
        const path = "flags." + FLAG + ".stored." + a.name;
        const now = Number(foundry.utils.getProperty(me, path)) || 0;
        await me.update({ [path]: a.mode === "add" ? now + n : n });
      } else if (a.type === "message") {
        const text = a.text.replace(/@([\\w.-]+)/g, (m, p) => {
          const v = foundry.utils.getProperty(rollData, p);
          return v === undefined ? m : String(v);
        });
        // A popup doesn't hold up the roll.
        if (a.style === "popup") foundry.applications?.api?.DialogV2?.prompt({ window: { title: SETUP.name }, content: "<p>" + esc(text) + "</p>", rejectClose: false });
        else await say("<p><strong>" + esc(rule.label || SETUP.name) + "</strong>: " + esc(text) + "</p>");
      }
    } catch (err) {
      console.warn("chrab-sync | " + SETUP.name + ": action " + a.type + " failed", err);
    }
  }
}

async function hurtMe(amount, type, why) {
  if (amount <= 0) return;
  const words = "<p><strong>" + esc(why) + "</strong>: " + esc(me.name) + " takes " + amount + (type ? " " + esc(type) : "") + " damage.</p>";
  // My own cost can drop me too; ignore: true below means it's exactly amount.
  const hp = me.system?.attributes?.hp;
  if (hp && hp.value > 0 && hp.value + (Number(hp.temp) || 0) - amount <= 0) {
    const up = await stayUp(null);
    if (up) {
      await me.update({ "system.attributes.hp.value": up, "system.attributes.hp.temp": 0 });
      return say(words);
    }
  }
  // ignore: exactly this amount - the owner's resistances don't change a cost.
  await me.applyDamage([type ? { value: amount, type } : { value: amount }], { ignore: true });
  await say(words);
}

// --- Someone's damage is about to land on me (a target pass). Midi applies
// damageItem.damageDetail (hpDamage is only a summary while its "use damage
// detail" setting is on, the default), so staying up rewrites that list into
// one entry that leaves me at the rolled hit points.
// --- One rule whose trigger and roll filters already matched: the shared
// checks, its dice check, its cost or prompt, then its outcome and actions.
// vars join the formula data (@damageTaken). Returns any bonus damage rolls.
async function fire(rule, vars = {}) {
  Object.assign(rollData, vars);
  if (!inTier(rule)) return [];
  if (rule.oncePerTurn && usedThisTurn(rule)) return [];
  if (rule.oncePerStance && usedThisStance(rule)) return [];
  if (!(await whenPasses(rule, vars))) return [];
  if (rule.dice && !(await diceCheck(rule))) return [];
  // A cost: enough in the pool, then how much (asking when it can be more).
  let pool = null;
  let spent = 0;
  let cost = null;
  if (rule.cost) {
    // Discounts on the owner (Magus upgrades, The Final Art): never below 1.
    const discount = me.flags?.[FLAG]?.discount ?? {};
    const off = (Number(discount[rule.cost.pool]) || 0) + (Number(discount[feature.system?.identifier]) || 0);
    cost = { ...rule.cost, amount: Math.max(1, rule.cost.amount - off) };
    pool = poolItem(cost.pool);
    const left = usesLeft(pool);
    if (!pool || left < cost.amount) {
      if (rule.ask) ui.notifications?.info?.((rule.label || SETUP.name) + ": not enough " + cost.pool + " (" + left + " left).");
      return [];
    }
    spent = await askSpend(rule, left, cost);
    if (!spent) return [];
  } else if (rule.ask && !(await ask(rule))) return [];
  if (rule.oncePerTurn) await markTurn(rule);
  if (rule.oncePerStance) await markStance(rule);
  if (pool && spent) await spendPool(pool, spent);
  const out = [];
  await outcome(rule, { ...rule, formula: withExtraDice(rule.formula, spent ? spent - cost.amount : 0) }, out);
  await runActions(rule);
  return out;
}

// --- This feature's own use: "I use this feature" rules, or on a turn tick
// the turn rules - once per workflow.
if (ownUse) {
  if (pass.toLowerCase() === "postactiveeffects" && !(workflow.chrabUsed ??= new Set()).has(feature.uuid)) {
    workflow.chrabUsed.add(feature.uuid);
    const event = tick ? (tick === "end" ? "turnEnd" : "turnStart") : "used";
    for (const rule of SETUP.rules.filter((r) => r.event === event)) await fire(rule);
  }
  return;
}

// --- Someone's damage is about to land on me (a target pass). Staying up
// first: midi applies damageItem.damageDetail (hpDamage is only a summary
// while its "use damage detail" setting is on, the default), so it rewrites
// that list into one entry that leaves me at the rolled hit points. Then the
// "I take damage" rules, once per workflow.
if (pass.toLowerCase() === "pretargetdamageapplication") {
  const d = workflow?.damageItem;
  if (!d || (d.actorUuid && d.actorUuid !== me.uuid)) return;
  const oldHP = Number(d.oldHP) || 0;
  const oldTemp = Number(d.oldTempHP) || 0;
  const taken = Math.max(0, Number(d.hpDamage) || 0) + Math.max(0, Number(d.tempDamage) || 0);
  const first = (d.damageDetail ?? []).find((x) => !["temphp", "healing", "midi-none"].includes(x.type));
  if (oldHP > 0 && Number(d.newHP) <= 0 && first) {
    const hp = await stayUp(d);
    if (hp && hp <= oldHP) {
      d.damageDetail = [{ ...first, value: oldTemp + oldHP - hp }];
      Object.assign(d, { hpDamage: oldHP - hp, newHP: hp, tempDamage: oldTemp, newTempHP: 0 });
    } else if (hp) {
      // Back up above where I started: a heal (any temporary hit points stay).
      d.damageDetail = [{ type: "healing", value: oldHP - hp }];
      Object.assign(d, { hpDamage: oldHP - hp, newHP: hp, tempDamage: 0, newTempHP: oldTemp });
    }
  }
  const hurtRules = SETUP.rules.filter((r) => r.event === "hurt");
  if (taken > 0 && hurtRules.length && !(workflow.chrabHurt ??= new Set()).has(feature.uuid)) {
    workflow.chrabHurt.add(feature.uuid);
    if (me.isOwner === false) return;
    for (const rule of hurtRules) await fire(rule, { damageTaken: taken });
  }
  return;
}

const bonus = [];
for (const rule of SETUP.rules) {
  if (rule.pass.toLowerCase() !== pass.toLowerCase()) continue;
  if (["used", "hurt", "turnStart", "turnEnd"].includes(rule.event)) continue;
  if (rule.attackOnly && !isAttack) continue;
  if (rule.range && range !== rule.range) continue;
  if (rule.source && (rule.source === "weapon" ? !["weapon", "unarmed"].includes(source) : source !== rule.source)) continue;
  if ((rule.needsHit || (rule.pass === "damageBonus" && isAttack)) && !hits) continue;
  if (rule.needsFailedSave && !workflow?.failedSaves?.size) continue;
  if (rule.naturalMin && natural < rule.naturalMin) continue;
  if (rule.critOnly && !workflow?.isCritical) continue;
  if (rule.needsDamage && dealt <= 0) continue;
  bonus.push(...(await fire(rule)));
}
if (pass.toLowerCase() === "damagebonus") return bonus;

// --- A rule's main outcome. use: the rule with any extra dice added.
async function outcome(rule, use, bonus) {
  const label = rule.label || SETUP.name;
  if (rule.outcome === "bonusDamage") {
    const r = await roll(use, { flavor: label, isCritical: rule.critDoubles && !!workflow?.isCritical });
    bonus.push(r);
    if (rule.selfCost) await hurtMe(r.total, rule.type, label);
  } else if (rule.outcome === "healSelf") {
    const r = await roll(use, { type: "healing" });
    await r.toMessage({ speaker, flavor: label + " - healing" });
    await me.applyDamage([{ value: r.total, type: "healing" }]);
  } else if (rule.outcome === "tempHpSelf") {
    const r = await roll(use, { type: "temphp" });
    await r.toMessage({ speaker, flavor: label + " - temporary hit points" });
    await me.applyTempHP(r.total);
  } else if (rule.outcome === "damageSelf") {
    const r = await roll(use);
    await r.toMessage({ speaker, flavor: label });
    await hurtMe(r.total, rule.type, label);
  } else if (rule.outcome === "ignoreResistance") {
    // "idr.slashing": midi's per-activity ignore list, read when the damage is
    // worked out. Added for this roll only.
    const ignore = activity?.midiProperties?.ignoreTraits;
    if (ignore?.add) {
      const added = rule.ignore.map((t) => "idr." + t).filter((k) => !ignore.has(k));
      for (const k of added) ignore.add(k);
      if (added.length) Hooks.once("midi-qol.RollComplete", () => added.forEach((k) => ignore.delete(k)));
    }
  }
}
`
}

// ---------------------------------------------------------------------------
// Ready-made behaviors

// Death Stance, the Dark Knight's Harbinger of Darkness feature (level 3,
// upgraded at 7). A bonus-action stance for 1 minute with a blood-red aura:
//   - levels 3-6: a melee critical hit heals 1d10 + CON
//   - level 7+:   a natural 19-20 on a melee attack roll heals 2d10 + CON
//   - a melee hit may add 1d10 necrotic, and the attacker takes the same
//   - the first time it would drop to 0, spend a hit die and stay up instead
// Advantage on attacks and the uses (proficiency bonus per long rest) live on
// the item - see the deathStance template in foundryFeatures.js.
export function deathStanceBehavior() {
  const harvest = {
    ...emptyBehaviorRule('healSelf'),
    label: 'Death Stance: Blood Harvest',
    attackRange: 'melee',
    formula: '1d10 + @abilities.con.mod',
  }
  const early = { ...harvest, event: 'hit', critOnly: true, maxLevel: '6' }
  const upgraded = { ...harvest, key: newId(), event: 'attackRoll', naturalMin: '19', minLevel: '7', formula: '2d10 + @abilities.con.mod' }
  const strike = {
    ...emptyBehaviorRule('bonusDamage'),
    label: 'Death Stance: Necrotic Strike',
    event: 'damage',
    attackRange: 'melee',
    ask: true,
    formula: '1d10',
    damageType: 'necrotic',
    selfCost: 'same',
  }
  const undying = {
    ...emptyBehaviorRule('stayUp'),
    label: 'Death Stance: Refuse to Fall',
    oncePerStance: true,
  }
  const behavior = emptyBehavior('toggle')
  return {
    ...behavior,
    levelClass: 'the-dark-knight',
    // Uses are limited now, so leaving early doesn't give one back.
    toggle: { ...behavior.toggle, duration: '1', freeOff: false },
    rules: [early, upgraded, strike, undying],
  }
}
