// House rule: a critical hit doubles the whole damage total. Roll the normal
// dice and modifiers once, then multiply by 2 (1d8 + 3 rolling 5 + 3 deals
// 16), instead of dnd5e's "roll the dice twice".
//
// dnd5e builds crits in DamageRoll#configureDamage, which runs for every
// damage roll: weapon and spell damage, a separate Sneak Attack card, midi's
// bonus damage. The constructor calls it, and the damage dialog calls it
// again when Normal/Critical is switched. The wrapper below lets dnd5e set
// up the roll with a multiplier of 1, so dice aren't doubled, but bonus crit
// dice and crit bonus damage are still added. Then every +/- part of the
// formula gets "* 2[crit]":
//   1d8[piercing] + 3 + 1d6[fire]  ->  1d8[piercing] * 2[crit] + 3 * 2[crit] + 1d6[fire] * 2[crit]
// dnd5e splits damage types on + and - only (aggregate-damage-rolls.mjs), so
// each part keeps its type and the dice stay plain dice in the tooltip. The
// "[crit]" flavor marks the added terms, so they're stripped again before
// any re-configure: switching Normal/Critical, or a roll rebuilt from its
// formula, never ends up doubled twice.
//
// Midi-QOL's own Critical Damage setting must stay on "DnD5e default".
// Otherwise midi rewrites the roll first and this doubles midi's version.

import { MODULE_ID } from './constants.mjs'

export const CRIT_FLAVOR = 'crit'

// Removes every "* 2[crit]" pair this added earlier.
export function stripCritDouble(terms) {
  const { NumericTerm, OperatorTerm } = foundry.dice.terms
  const out = []
  for (const term of terms) {
    if (term instanceof NumericTerm && term.flavor?.toLowerCase().trim() === CRIT_FLAVOR) {
      if (out.at(-1) instanceof OperatorTerm && out.at(-1).operator === '*') out.pop()
      continue
    }
    out.push(term)
  }
  return out
}

// Appends "* 2[crit]" to every top-level +/- part that has something in it.
export function addCritDouble(terms) {
  const { NumericTerm, OperatorTerm } = foundry.dice.terms
  const double = () => [
    new OperatorTerm({ operator: '*' }),
    new NumericTerm({ number: 2, options: { flavor: CRIT_FLAVOR } }),
  ]
  const out = []
  let open = false
  for (const term of terms) {
    if (term instanceof OperatorTerm && ['+', '-'].includes(term.operator)) {
      if (open) out.push(...double())
      open = false
      out.push(term)
      continue
    }
    out.push(term)
    open = true
  }
  if (open) out.push(...double())
  return out
}

export function setupCrits() {
  const DamageRoll = CONFIG.Dice?.DamageRoll
  if (!DamageRoll?.prototype?.configureDamage) {
    console.warn(`${MODULE_ID} | dnd5e DamageRoll not found; crit doubling is off`)
    return
  }
  const original = DamageRoll.prototype.configureDamage
  if (original.chrabCritDouble) return

  function configureDamage(options = {}) {
    this.terms = stripCritDouble(this.terms)
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
    this.terms = addCritDouble(this.terms)
    this.resetFormula()
  }
  configureDamage.chrabCritDouble = true
  DamageRoll.prototype.configureDamage = configureDamage
}
