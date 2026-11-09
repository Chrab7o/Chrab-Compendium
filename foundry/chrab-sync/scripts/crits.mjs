// House rule: a critical hit doubles the whole damage total. Roll the normal
// dice and modifiers once, add them up, then multiply by 2 (1d8 + 3 rolling
// 5 + 3 deals 16), instead of dnd5e's "roll the dice twice".
//
// dnd5e builds crits in DamageRoll#configureDamage, which runs for every
// damage roll: weapon and spell damage, a separate Sneak Attack card, midi's
// bonus damage. The constructor calls it, and the damage dialog calls it
// again when Normal/Critical is switched. The wrapper below lets dnd5e set
// up the roll with a multiplier of 1, so dice aren't doubled, but bonus crit
// dice and crit bonus damage are still added. Then the whole roll goes in
// brackets and is doubled once:
//   1d8 + 3 + 1d4            ->  (1d8 + 3 + 1d4) * 2[crit]
// dnd5e splits damage types on + and - (aggregate-damage-rolls.mjs), so a
// roll that mixes types gets one bracket per type, flavored with that type:
//   1d8[piercing] + 3 + 2d6[fire]  ->  (1d8[piercing] + 3)[piercing] * 2[crit] + (2d6[fire])[fire] * 2[crit]
// The "[crit]" flavor marks the doubling, so it's undone before any
// re-configure: switching Normal/Critical, or a roll rebuilt from its
// formula, never ends up doubled twice.
//
// Midi-QOL's own Critical Damage setting must stay on "DnD5e default".
// Otherwise midi rewrites the roll first and this doubles midi's version.

import { MODULE_ID } from './constants.mjs'

export const CRIT_FLAVOR = 'crit'

const terms = () => foundry.dice.terms
const isMarker = (t) => t instanceof terms().NumericTerm && t.flavor?.toLowerCase().trim() === CRIT_FLAVOR
const isSplit = (t) => t instanceof terms().OperatorTerm && ['+', '-'].includes(t.operator)
const isDamageType = (t) => !!t && (t in (CONFIG.DND5E?.damageTypes ?? {}) || t in (CONFIG.DND5E?.healingTypes ?? {}))

// Undoes the doubling: "(…) * 2[crit]" back to what's inside the brackets.
// `saved` holds the roll's own terms from before it was wrapped, which keep
// dnd5e's bookkeeping (each die's base count). A roll rebuilt from its
// formula doesn't have them, so the brackets are parsed instead.
export function stripCritDouble(list, { saved, data } = {}) {
  const { OperatorTerm, ParentheticalTerm } = terms()
  if (!list.some(isMarker)) return list
  if (saved) return saved
  const out = []
  for (let i = 0; i < list.length; i++) {
    const t = list[i]
    if (t instanceof ParentheticalTerm && list[i + 1]?.operator === '*' && isMarker(list[i + 2])) {
      out.push(...Roll.parse(t.term, data))
      i += 2
      continue
    }
    if (isMarker(t)) {
      if (out.at(-1) instanceof OperatorTerm && out.at(-1).operator === '*') out.pop()
      continue
    }
    out.push(t)
  }
  return out
}

// Splits on + and -, the way dnd5e does when it sorts damage by type.
function chunk(list, rollType) {
  const chunks = []
  let current = null
  let negative = false
  for (const t of list) {
    if (isSplit(t)) {
      if (current) {
        chunks.push(current)
        current = null
        negative = false
      }
      if (t.operator === '-') negative = !negative
      continue
    }
    current ??= { terms: [], negative, type: null }
    current.terms.push(t)
    const flavor = t.flavor?.toLowerCase().trim()
    if (!current.type && isDamageType(flavor)) current.type = flavor
  }
  if (current) chunks.push(current)
  for (const c of chunks) c.type ??= rollType ?? null
  return chunks
}

// "(…) * 2[crit]", one bracket per damage type in the roll.
export function addCritDouble(list, rollType) {
  const { NumericTerm, OperatorTerm, ParentheticalTerm } = terms()
  const groups = new Map()
  for (const c of chunk(list, rollType)) {
    if (!groups.has(c.type)) groups.set(c.type, [])
    groups.get(c.type).push(c)
  }
  const out = []
  for (const [type, chunks] of groups) {
    // The bracket takes the first part's sign; parts inside are relative to it.
    const lead = chunks[0].negative
    const inner = []
    chunks.forEach((c, i) => {
      if (i) inner.push(new OperatorTerm({ operator: c.negative === lead ? '+' : '-' }))
      inner.push(...c.terms)
    })
    if (out.length || lead) out.push(new OperatorTerm({ operator: lead ? '-' : '+' }))
    const flavor = groups.size > 1 && type ? type : undefined
    out.push(
      new ParentheticalTerm({ term: Roll.getFormula(inner), options: flavor ? { flavor } : {} }),
      new OperatorTerm({ operator: '*' }),
      new NumericTerm({ number: 2, options: { flavor: CRIT_FLAVOR } }),
    )
  }
  return out
}

const SAVED = Symbol('chrabCritTerms')

export function setupCrits() {
  const DamageRoll = CONFIG.Dice?.DamageRoll
  if (!DamageRoll?.prototype?.configureDamage) {
    console.warn(`${MODULE_ID} | dnd5e DamageRoll not found; crit doubling is off`)
    return
  }
  const original = DamageRoll.prototype.configureDamage
  if (original.chrabCritDouble) return

  function configureDamage(options = {}) {
    this.terms = stripCritDouble(this.terms, { saved: this[SAVED], data: this.data })
    delete this[SAVED]
    if (!this.isCritical || !game.settings.get(MODULE_ID, 'critDoubleTotal')) return original.call(this, options)

    // dnd5e's critical settings with the dice multiplier forced to 1, so
    // nothing is rolled twice or maximized. Bonus crit dice and crit bonus
    // damage (Brutal Critical and similar) stay, and get doubled with the rest.
    const saved = this.options.critical
    this.options.critical = { ...(saved ?? {}), multiplier: 1, multiplyNumeric: false, powerfulCritical: false }
    try {
      original.call(this, options)
    } finally {
      if (saved === undefined) delete this.options.critical
      else this.options.critical = saved
    }
    this[SAVED] = this.terms
    this.terms = addCritDouble(this.terms, this.options.type)
    this.resetFormula()
  }
  configureDamage.chrabCritDouble = true
  DamageRoll.prototype.configureDamage = configureDamage
}
