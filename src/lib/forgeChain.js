// The chain builder's shape of an item (components/dm/feature/ChainBuilder.jsx,
// docs/item-forge-chain.md): which rolls the player picks between, what each
// roll leads to, and the effects no roll lands. Worked out from the spec on
// every draw; the spec stays the only thing saved.
import { toScript } from './automationFlow.js'

// choices: the rolls the player picks between (dnd5e asks which when there are
// several). A roll another one sets off (triggerKey) or adds damage to
// (otherKey) is drawn under that one instead; every-turn rolls (overTime) on
// their own. A roll nothing reaches (a trigger loop) stays a choice.
export function chainOf(item) {
  const acts = item.activities ?? []
  const byKey = new Map(acts.map((a) => [a.key, a]))
  const follows = (a) => (a.triggerKey && a.triggerKey !== a.key ? byKey.get(a.triggerKey) ?? null : null)
  const extraFor = (a) => (a.otherKey && a.otherKey !== a.key ? byKey.get(a.otherKey) ?? null : null)
  const nested = new Set(acts.flatMap((a) => [follows(a)?.key, extraFor(a)?.key]).filter(Boolean))
  const ticks = acts.filter((a) => a.overTime)
  const choices = acts.filter((a) => !a.overTime && !nested.has(a.key))
  const reached = new Set()
  const walk = (a) => {
    if (!a || reached.has(a.key)) return
    reached.add(a.key)
    walk(follows(a))
    walk(extraFor(a))
  }
  for (const a of [...choices, ...ticks]) walk(a)
  for (const a of acts) if (!reached.has(a.key) && !a.overTime) (choices.push(a), walk(a))
  return { choices: acts.filter((a) => choices.includes(a)), ticks, follows, extraFor }
}

const isStance = (item, e) => !!e.stance && item.behavior?.mode === 'toggle'

// Lands on whoever a roll hits (or fails its save, or is targeted).
export const lands = (item, e) => !e.passive && !isStance(item, e) && !e.byRule && !e.aura

export function landsFrom(item, roll) {
  if (roll.overTime) return []
  return (item.effects ?? []).filter((e) => lands(item, e) && (!e.appliedBy?.length || e.appliedBy.includes(roll.key)))
}

// The effects an "Apply one of this item's effects" line in any roll's flow puts on.
export function flowEffectKeys(item) {
  const keys = new Set()
  const walk = (lines) => {
    for (const l of lines ?? []) {
      if (l.type === 'effect' && l.effectKey) keys.add(l.effectKey)
      if (l.type === 'if') walk([...(l.then ?? []), ...(l.else ?? [])])
    }
  }
  for (const a of item.activities ?? []) if (a.flow) for (const s of toScript(a.flow).sections) walk(s.lines)
  return keys
}

// Effects not drawn under a roll or a line: grouped for the chain's
// "Effects not tied to a roll". unapplied: lands from no roll that exists.
export function looseEffects(item) {
  const rolls = new Set((item.activities ?? []).filter((a) => !a.overTime).map((a) => a.key))
  const applied = flowEffectKeys(item)
  const groups = { passive: [], stance: [], aura: [], byRule: [], unapplied: [] }
  for (const e of item.effects ?? []) {
    if (e.passive) groups.passive.push(e)
    else if (isStance(item, e)) groups.stance.push(e)
    else if (e.aura) groups.aura.push(e)
    else if (e.byRule) !applied.has(e.key) && groups.byRule.push(e)
    else if (!rolls.size || (e.appliedBy?.length && !e.appliedBy.some((k) => rolls.has(k)))) groups.unapplied.push(e)
  }
  return groups
}

// A new effect's name: the item's, then "(2)", "(3)"… if that's taken.
export function freeEffectName(item, base) {
  const taken = new Set((item.effects ?? []).map((e) => e.name))
  const name = String(base || item.name || 'Effect').trim() || 'Effect'
  if (!taken.has(name)) return name
  let n = 2
  while (taken.has(`${name} (${n})`)) n++
  return `${name} (${n})`
}
