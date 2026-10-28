// What the Item Forge can make, and which choices fit each one. The guided
// steps (components/dm/feature/FeatureWizard.jsx) only offer what's allowed
// here; a saved item that already has a choice outside it keeps that choice,
// and fitToKind() reports it. The "All fields" form isn't filtered.
import { emptyActivity } from './foundryActorBuilder.js'
import { BEHAVIOR_EVENTS, BEHAVIOR_OUTCOMES } from './foundryBehaviors.js'
import { emptyFeatureSpec, emptyGear } from './foundryFeatures.js'

const ALL_ROLLS = ['attack', 'save', 'damage', 'heal', 'utility', 'summon', 'transform']
const ALL_EVENTS = BEHAVIOR_EVENTS.map((e) => e.key)

// uses: how it's used (FeatureWizard USES keys). limits: '' (as often as they
// like), 'uses', 'recharge'. effects: EFFECT_STARTS keys. events: behavior
// rule events; none = no Reactions step. section: how a new one starts.
export const FORGE_KINDS = [
  {
    key: 'feat',
    label: 'A feature',
    help: 'A class feature, feat, species trait or monster ability.',
    article: 'a feature',
    uses: ['action', 'bonus', 'reaction', 'passive', 'stance'],
    limits: ['', 'uses', 'recharge'],
    rolls: ALL_ROLLS,
    effects: ['condition', 'debuff', 'self', 'stance'],
    events: ALL_EVENTS,
  },
  {
    key: 'spell',
    label: 'A spell',
    help: 'Cast with spell slots, or at will for a cantrip.',
    article: 'a spell',
    uses: [],
    limits: [],
    rolls: ALL_ROLLS,
    effects: ['condition', 'debuff', 'onUser'],
    events: [],
  },
  {
    key: 'weapon',
    label: 'A weapon',
    help: 'A sword, a bow, a staff you hit with. Swung with its attack.',
    article: 'a weapon',
    gear: true,
    section: 'action',
    uses: ['action', 'bonus', 'stance'],
    limits: ['', 'uses'],
    rolls: ['attack', 'save', 'damage', 'heal', 'utility'],
    effects: ['condition', 'debuff', 'self', 'stance'],
    events: ['attackRoll', 'hit', 'damage', 'dealt', 'failedSave', 'used', 'turnStart', 'turnEnd'],
  },
  {
    key: 'armor',
    label: 'Armor or a shield',
    help: 'Worn for AC, maybe with a power to activate.',
    article: 'armor or a shield',
    gear: true,
    section: 'trait',
    uses: ['passive', 'action', 'bonus', 'reaction'],
    limits: ['', 'uses'],
    rolls: ['save', 'heal', 'utility'],
    effects: ['condition', 'debuff', 'self'],
    events: ['hurt', 'downed', 'used', 'turnStart', 'turnEnd'],
  },
  {
    key: 'wondrous',
    label: 'A wondrous item',
    help: 'A ring, cloak, amulet, wand… worn or carried.',
    article: 'a wondrous item',
    gear: true,
    section: 'trait',
    uses: ['passive', 'action', 'bonus', 'reaction', 'stance'],
    limits: ['', 'uses'],
    rolls: ALL_ROLLS,
    effects: ['condition', 'debuff', 'self', 'stance'],
    events: ALL_EVENTS,
  },
  {
    key: 'consumable',
    label: 'A consumable',
    help: 'A potion, scroll, bomb or oil: used up when its charges run out.',
    article: 'a consumable',
    gear: true,
    section: 'action',
    uses: ['action', 'bonus'],
    limits: ['uses'],
    rolls: ['attack', 'save', 'damage', 'heal', 'utility'],
    effects: ['condition', 'debuff', 'onUser'],
    events: [],
  },
]

const KIND_BY_KEY = Object.fromEntries(FORGE_KINDS.map((k) => [k.key, k]))

// feat | spell | weapon | armor | wondrous | consumable
export function forgeKindOf(spec) {
  if (spec?.kind === 'spell') return 'spell'
  if (spec?.kind === 'gear') return KIND_BY_KEY[spec.gear?.type] ? spec.gear.type : 'wondrous'
  return 'feat'
}

export function forgeKind(spec) {
  return KIND_BY_KEY[forgeKindOf(spec)]
}

// A blank spec for a Start choice (or a ?kind= link; 'gear' = a wondrous item).
// A weapon starts with its attack, a consumable with one charge that's used up.
export function newForgeSpec(key, base = {}) {
  if (key === 'spell') return emptyFeatureSpec('spell')
  const kind = KIND_BY_KEY[key === 'gear' ? 'wondrous' : key]
  if (!kind?.gear) return { ...emptyFeatureSpec('feat'), ...base }
  const spec = emptyFeatureSpec('gear')
  const item = { ...spec.item, section: kind.section }
  if (kind.key === 'weapon') item.activities = [emptyActivity('attack')]
  if (kind.key === 'consumable') Object.assign(item, { usesMax: '1', usesRecovery: 'none' })
  return { ...spec, gear: emptyGear(kind.key), item }
}

export function usageOf(item) {
  if (item.behavior?.mode === 'toggle') return 'stance'
  if (item.section === 'trait') return 'passive'
  return ['action', 'bonus', 'reaction'].includes(item.section) ? item.section : 'action'
}

export const limitOf = (item) => (!item.usesRecovery ? '' : item.usesRecovery === 'recharge' ? 'recharge' : 'uses')

// A d6 recharge is a monster's.
export function allowedLimits(spec) {
  const kind = forgeKind(spec)
  if (kind.key === 'feat' && spec.featType !== 'monster') return kind.limits.filter((l) => l !== 'recharge')
  return kind.limits
}

// Rolls that put effects on whoever they hit (a repeat-each-turn tick doesn't).
export const landingRolls = (item) => (item.activities ?? []).filter((a) => !a.overTime)

// Effects that land on a target need a roll to land them; stance bonuses need a stance.
export function allowedEffects(spec, item) {
  return forgeKind(spec).effects.filter((key) => {
    if (['condition', 'debuff', 'onUser'].includes(key)) return landingRolls(item).length > 0
    if (key === 'stance') return item.behavior?.mode === 'toggle'
    return true
  })
}

// "Something every turn": a roll midi repeats while an effect on the owner lasts.
export function canTickEachTurn(spec, item) {
  const kind = forgeKind(spec)
  return kind.rolls.includes('utility') && ['passive', 'stance'].includes(usageOf(item)) && kind.uses.includes(usageOf(item))
}

// The first event in `allowed` an outcome can use (outcomes like bonus damage only fit one).
export function ruleEventFor(outcome, current, allowed) {
  const only = BEHAVIOR_OUTCOMES.find((o) => o.key === outcome)?.events
  const fits = (key) => {
    const ev = BEHAVIOR_EVENTS.find((e) => e.key === key)
    return allowed.includes(key) && (!only || only.includes(key)) && (!ev?.outcomes || ev.outcomes.includes(outcome)) && !ev?.bond
  }
  if (fits(current)) return current
  return allowed.find(fits) ?? null
}

// The spec with everything the kind doesn't allow taken out or changed, and a
// line per change: { step, text }. Used to warn about an old item's misfits
// and when a gear item's kind changes.
export function fitToKind(spec) {
  const kind = forgeKind(spec)
  if (kind.key === 'spell') return { spec, changes: [] }
  let item = spec.item
  const changes = []
  const usage = usageOf(item)
  if (!kind.uses.includes(usage)) {
    const next = kind.uses[0]
    const patch = { section: next === 'passive' ? 'trait' : next }
    if (usage === 'stance') {
      patch.behavior = item.behavior?.rules?.length ? { ...item.behavior, mode: 'passive' } : null
      patch.effects = item.effects.map((e) => (e.stance ? { ...e, stance: false, passive: kind.effects.includes('self') } : e))
    }
    item = { ...item, ...patch }
    changes.push({ step: 'use', text: `${USE_WORDS[usage]} doesn’t fit ${kind.article}: it becomes ${USE_WORDS[next].toLowerCase()}.` })
  }
  const limit = limitOf(item)
  if (!allowedLimits(spec).includes(limit)) {
    item = limit === 'recharge' && allowedLimits(spec).includes('uses') ? { ...item, usesRecovery: 'lr', usesMax: item.usesMax || '1' } : { ...item, usesRecovery: allowedLimits(spec).includes('') ? '' : 'none', usesMax: item.usesMax || '1' }
    changes.push({ step: 'use', text: limit === 'recharge' ? `A d6 recharge doesn’t fit ${kind.article}.` : `${cap(kind.article)} needs charges.` })
  }
  const badRolls = item.activities.filter((a) => !kind.rolls.includes(a.kind))
  if (badRolls.length) {
    item = { ...item, activities: item.activities.filter((a) => kind.rolls.includes(a.kind)) }
    for (const a of badRolls) changes.push({ step: 'rolls', text: `${a.name || 'A roll'} (${a.kind}) doesn’t fit ${kind.article}.` })
  }
  if (!kind.effects.includes('self') && item.effects.some((e) => e.passive)) {
    item = { ...item, effects: item.effects.map((e) => (e.passive ? { ...e, passive: false } : e)) }
    changes.push({ step: 'effects', text: `An always-on bonus doesn’t fit ${kind.article}: it lands on whoever it’s used on instead.` })
  }
  const rules = item.behavior?.rules ?? []
  const badRules = rules.filter((r) => !kind.events.includes(r.event))
  if (badRules.length) {
    const kept = rules.filter((r) => kind.events.includes(r.event))
    item = { ...item, behavior: !kept.length && item.behavior.mode === 'passive' ? null : { ...item.behavior, rules: kept } }
    changes.push({
      step: kind.events.length ? 'reactions' : 'use',
      text: kind.events.length
        ? `${plural(badRules.length, 'reaction')} on events that don’t fit ${kind.article} (${badRules.map((r) => BEHAVIOR_EVENTS.find((e) => e.key === r.event)?.label.toLowerCase() ?? r.event).join(', ')}).`
        : `Reactions don’t fit ${kind.article}.`,
    })
  }
  return { spec: item === spec.item ? spec : { ...spec, item }, changes }
}

const USE_WORDS = { action: 'An action', bonus: 'A bonus action', reaction: 'A reaction', passive: 'Always on', stance: 'A stance' }
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
