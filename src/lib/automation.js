// One format for a feature's automation (forge overhaul Phase 3, in the lab's
// docs/forge-overhaul.md).
//
// Until now an item described what it does in three ways: behavior rules
// (item.behavior: "when I hit, I regain…", foundryBehaviors.js), Automation
// Builder flows (activity.flow: a script at points of one roll,
// automationFlow.js) and script recipes (activity.script: one fixed mechanic,
// foundryAutomation.js). Here they are one list of parts:
//
//   item automation = {
//     version: 3,
//     behavior: { key, mode, levelClass, toggle, flavor } | null   how the feature runs when it's always on or
//                                                                   a stance (item.behavior without its rules)
//     rolls: { [activity key]: { flow: { key, name, color, version } } }   a roll's chat card (its flow's settings)
//     parts: [ Part ]
//   }
//   Part = { key, on, lines, rule? }
//     on: { roll: <activity key>, at: <FLOW_TRIGGERS key> }   a point in one of the feature's rolls
//       | { event: <BEHAVIOR_EVENTS key> }                     something the owner does or has happen to them
//     lines: the Automation Builder's lines (if, and FLOW_STEPS), plus
//       { key, type: 'outcome', outcome, formula, … }          a rule's outcome (BEHAVIOR_OUTCOMES)
//       { key, type: 'action', action }                        a rule's extra step (BEHAVIOR_ACTIONS)
//       { key, type: 'recipe', script }                        a script recipe (SCRIPT_RECIPES)
//     rule: an event part's checks and cost: label, flavor, filters (melee, natural 19+, level tiers, once per
//       turn…), ask first, target and self conditions, a dice check, a raw `when`, the resource it costs.
//
// Storage hasn't changed yet: specs keep the three old fields, which today's
// macro generators read. automationOf() reads them into this format and
// withAutomation() writes it back, losslessly (tested on every live draft by
// the lab's scripts/check-automation.mjs). The editors move onto it in Phase 2c
// and Chrab Sync runs it in Phase 4.
import { BEHAVIOR_ACTIONS, BEHAVIOR_EVENTS, BEHAVIOR_OUTCOMES, emptyBehavior, ruleOutcomeFits, ruleSummary } from './foundryBehaviors.js'
import { FLOW_TRIGGERS, flowProblems, flowSummary, toScript } from './automationFlow.js'
import { SCRIPT_RECIPES } from './foundryAutomation.js'

export const AUTOMATION_VERSION = 3

// What a part can start from, in the order they're offered.
export const ROLL_POINTS = FLOW_TRIGGERS
export const OWNER_EVENTS = BEHAVIOR_EVENTS

// The fields of a rule that say what happens (its outcome line); everything
// else on a rule but key, event and actions is the part's `rule`.
const OUTCOME_FIELDS = ['outcome', 'formula', 'damageType', 'selfCost', 'critDoubles', 'spendHitDie', 'share', 'ignoreTypes', 'refundPool', 'refundAmount']

const recipeOf = (script) => SCRIPT_RECIPES.find((r) => r.id === script?.recipe) ?? null
// A recipe runs at its midi pass; the roll point that pass belongs to.
function recipePoint(script) {
  const recipe = recipeOf(script)
  const pass = recipe && recipe.id !== 'custom' ? recipe.pass : script?.pass || 'postActiveEffects'
  if (pass === 'damageBonus') return 'damage'
  return FLOW_TRIGGERS.find((t) => t.pass === pass)?.key ?? 'done'
}

// ---------------------------------------------------------------------------
// Reading the old fields

function ruleToPart(rule) {
  const { key, event, actions = [], ...rest } = rule
  const outcome = { key: `${key}.outcome`, type: 'outcome' }
  const settings = {}
  for (const [field, value] of Object.entries(rest)) (OUTCOME_FIELDS.includes(field) ? outcome : settings)[field] = value
  return { key, on: { event }, rule: settings, lines: [outcome, ...actions.map((action) => ({ key: `${key}.${action.key}`, type: 'action', action }))] }
}

// An item's (or an NPC item's) automation, read from behavior rules, flows
// and recipes. Old (version 1) flows are read as their script (toScript).
export function automationOf(item) {
  const parts = []
  const rolls = {}
  for (const activity of item?.activities ?? []) {
    if (activity.script) parts.push({ key: `${activity.key}.script`, on: { roll: activity.key, at: recipePoint(activity.script) }, lines: [{ key: `${activity.key}.recipe`, type: 'recipe', script: activity.script }] })
    if (activity.flow) {
      const { sections, ...meta } = toScript(activity.flow)
      rolls[activity.key] = { flow: meta }
      for (const section of sections) parts.push({ key: section.key, on: { roll: activity.key, at: section.trigger }, lines: section.lines ?? [] })
    }
  }
  const behavior = item?.behavior ?? null
  let meta = null
  if (behavior) {
    const { rules = [], ...rest } = behavior
    meta = rest
    parts.push(...rules.map(ruleToPart))
  }
  return { version: AUTOMATION_VERSION, behavior: meta, rolls, parts }
}

// ---------------------------------------------------------------------------
// Writing it back

// A part on an owner event, as the behavior rule today's generator runs. Only
// parts shaped like rules (one outcome, then actions) can be; anything else
// waits for Chrab Sync to run the format itself (Phase 4).
function partToRule(part) {
  const [outcome, ...actions] = part.lines ?? []
  if (outcome?.type !== 'outcome' || actions.some((l) => l.type !== 'action')) throw new Error(`“${part.rule?.label || part.on.event}” can’t run yet: an owner event takes one outcome and its actions.`)
  const { key: _key, type: _type, ...fields } = outcome
  return { key: part.key, event: part.on.event, ...(part.rule ?? {}), ...fields, actions: actions.map((l) => l.action) }
}

// The item with its automation written into behavior, flows and recipes.
// Activities named by no part lose their flow and script; the behavior goes
// when there's neither its settings nor a rule.
export function withAutomation(item, automation) {
  const parts = automation?.parts ?? []
  const byRoll = new Map()
  for (const part of parts) {
    if (!part.on?.roll) continue
    if (!byRoll.has(part.on.roll)) byRoll.set(part.on.roll, [])
    byRoll.get(part.on.roll).push(part)
  }
  const activities = (item.activities ?? []).map((activity) => {
    const { script: _script, flow: _flow, ...rest } = activity
    const own = byRoll.get(activity.key) ?? []
    const recipe = own.find((p) => p.lines?.[0]?.type === 'recipe')
    const sections = own.filter((p) => p !== recipe).map((p) => ({ key: p.key, trigger: p.on.at, lines: p.lines ?? [] }))
    const meta = automation?.rolls?.[activity.key]?.flow
    const out = { ...rest }
    if (recipe) out.script = recipe.lines[0].script
    if (meta || sections.length) out.flow = { ...(meta ?? { key: `${activity.key}.flow`, name: '', color: '', version: 2 }), sections }
    return out
  })
  const rules = parts.filter((p) => p.on?.event).map(partToRule)
  const meta = automation?.behavior
  const behavior = meta ? { ...meta, rules } : rules.length ? { ...emptyBehavior('passive'), rules } : null
  const { behavior: _old, ...rest } = item
  return { ...rest, activities, ...(behavior || 'behavior' in item ? { behavior } : {}) }
}

// An item as today's generators read it: one saved in this format
// (item.automation) is written back into the old fields; any other is as it is.
export function lowered(item) {
  if (!item?.automation) return item
  const { automation, ...rest } = item
  return withAutomation(rest, automation)
}

// ---------------------------------------------------------------------------
// Reading it as a whole

const eventLabel = (key) => OWNER_EVENTS.find((e) => e.key === key)?.label ?? key
const pointLabel = (key) => ROLL_POINTS.find((t) => t.key === key)?.short ?? key

// Everything the automation does, one line per part, in words.
// item: for roll names.
export function automationSummary(automation, item = {}) {
  const rollName = (key) => {
    const i = (item.activities ?? []).findIndex((a) => a.key === key)
    const a = item.activities?.[i]
    return a?.name || (i >= 0 ? `roll ${i + 1}` : 'a roll')
  }
  return (automation?.parts ?? []).map((part) => {
    if (part.on?.event) {
      try {
        return ruleSummary(partToRule(part))
      } catch {
        return `${eventLabel(part.on.event)}: ${(part.lines ?? []).length} lines`
      }
    }
    const first = part.lines?.[0]
    const what =
      first?.type === 'recipe'
        ? recipeOf(first.script)?.label ?? 'a script'
        : flowSummary({ version: 2, sections: [{ key: part.key, trigger: part.on?.at, lines: part.lines ?? [] }] })
            .slice(1)
            .map((l) => l.trim())
            .join('; ') || 'nothing yet'
    return `${rollName(part.on?.roll)}, ${pointLabel(part.on?.at).toLowerCase()}: ${what}`
  })
}

// What's wrong, each { key, text }: parts on a roll the item doesn't have,
// owner-event parts today's runtime can't run, rules whose outcome doesn't fit
// their event, and each flow's own problems.
export function automationProblems(automation, item = {}) {
  const out = []
  const kinds = new Map((item.activities ?? []).map((a) => [a.key, a.kind]))
  const outcomes = new Set(BEHAVIOR_OUTCOMES.map((o) => o.key))
  const actions = new Set(BEHAVIOR_ACTIONS.map((a) => a.key))
  for (const part of automation?.parts ?? []) {
    if (part.on?.roll) {
      if (!kinds.has(part.on.roll)) out.push({ key: part.key, text: 'It belongs to a roll this item no longer has.' })
      continue
    }
    if (!part.on?.event || !OWNER_EVENTS.some((e) => e.key === part.on.event)) {
      out.push({ key: part.key, text: 'It has no trigger.' })
      continue
    }
    try {
      const rule = partToRule(part)
      if (!outcomes.has(rule.outcome)) out.push({ key: part.key, text: `Unknown outcome “${rule.outcome}”.` })
      else if (!ruleOutcomeFits(rule)) out.push({ key: part.key, text: `“${BEHAVIOR_OUTCOMES.find((o) => o.key === rule.outcome).label}” doesn’t fit “${eventLabel(rule.event)}”.` })
      for (const a of rule.actions) if (!actions.has(a.type)) out.push({ key: part.key, text: `Unknown action “${a.type}”.` })
    } catch (err) {
      out.push({ key: part.key, text: err.message })
    }
  }
  for (const [rollKey, kind] of kinds) {
    const sections = (automation?.parts ?? []).filter((p) => p.on?.roll === rollKey && p.lines?.[0]?.type !== 'recipe').map((p) => ({ key: p.key, trigger: p.on.at, lines: p.lines }))
    if (sections.length) for (const p of flowProblems({ key: rollKey, version: 2, sections }, kind)) out.push({ key: p.key ?? rollKey, text: p.text })
  }
  return out
}

// How many parts start from owner events vs rolls, for a one-line summary.
export function automationCounts(automation) {
  const parts = automation?.parts ?? []
  return { events: parts.filter((p) => p.on?.event).length, rolls: parts.filter((p) => p.on?.roll).length }
}
