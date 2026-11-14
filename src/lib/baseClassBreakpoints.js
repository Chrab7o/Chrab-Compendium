// Break points borrowed from a base D&D class (2024 rules): the levels its
// Ability Score Improvements and subclass features come at. The class editor's
// Basics step fills a homebrew class's rows from one of these (ClassWizard,
// "Break points from a base class").
//
// Every subclass starts at 3, ASIs at 4/8/12/16 (Fighter and Rogue get extras)
// and an Epic Boon at 19.
import { addFeature } from './levelRows.js'

const ASI = [4, 8, 12, 16]
const EPIC_BOON = 19

// ASI and subclass feature levels.
export const BASE_CLASSES = [
  { key: 'artificer', name: 'Artificer', asi: ASI, subclass: [3, 5, 9, 15] },
  { key: 'barbarian', name: 'Barbarian', asi: ASI, subclass: [3, 6, 10, 14] },
  { key: 'bard', name: 'Bard', asi: ASI, subclass: [3, 6, 14] },
  { key: 'cleric', name: 'Cleric', asi: ASI, subclass: [3, 6, 17] },
  { key: 'druid', name: 'Druid', asi: ASI, subclass: [3, 6, 10, 14] },
  { key: 'fighter', name: 'Fighter', asi: [4, 6, 8, 12, 14, 16], subclass: [3, 7, 10, 15, 18] },
  { key: 'monk', name: 'Monk', asi: ASI, subclass: [3, 6, 11, 17] },
  { key: 'paladin', name: 'Paladin', asi: ASI, subclass: [3, 7, 15, 20] },
  { key: 'ranger', name: 'Ranger', asi: ASI, subclass: [3, 7, 11, 15] },
  { key: 'rogue', name: 'Rogue', asi: [4, 8, 10, 12, 16], subclass: [3, 9, 13, 17] },
  { key: 'sorcerer', name: 'Sorcerer', asi: ASI, subclass: [3, 6, 14, 18] },
  { key: 'warlock', name: 'Warlock', asi: ASI, subclass: [3, 6, 10, 14] },
  { key: 'wizard', name: 'Wizard', asi: ASI, subclass: [3, 6, 10, 14] },
]

// The class pack turns these rows into dnd5e's ASI step (foundryClassPack's isAsiRow).
export const isAsiName = (name) => /^ability score (improvement|increase)/i.test(String(name ?? '').trim())
const isBoonName = (name) => /^epic boon/i.test(String(name ?? '').trim())

const ASI_TEXT = 'You gain the Ability Score Improvement feat or another feat of your choice for which you qualify.'
const BOON_TEXT = 'You gain an Epic Boon feat or another feat of your choice for which you qualify.'

// What a base class brings: { asi, boon, subclass } (levels).
export function breakpointsOf(key) {
  const base = BASE_CLASSES.find((c) => c.key === key)
  if (!base) return null
  return { asi: [...base.asi], boon: EPIC_BOON, subclass: [...base.subclass] }
}

// The class form with a base class's break points filled in. Adds only what's
// missing: an ASI row where the level has none, an Epic Boon row at 19 unless
// one's there, and the subclass levels (keeping any level the subclasses
// already have features at). `parts` picks which: { asi, boon, subclass }.
// Returns { form, added: { asi: [levels], boon: level|null, subclass: [levels] } }.
export function applyBreakpoints(form, key, parts = { asi: true, boon: true, subclass: true }) {
  const bp = breakpointsOf(key)
  if (!bp) return { form, added: { asi: [], boon: null, subclass: [] } }
  const top = (form.features ?? []).filter((r) => !r.choice_group)
  const hasAt = (level, test) => top.some((r) => Number(r.level) === level && test(r.name))

  let rows = form.features ?? []
  const added = { asi: [], boon: null, subclass: [] }
  if (parts.asi) {
    for (const level of bp.asi) {
      if (hasAt(level, isAsiName)) continue
      rows = addFeature(rows, { level, name: 'Ability Score Improvement', description: ASI_TEXT }).rows
      added.asi.push(level)
    }
  }
  if (parts.boon && !hasAt(bp.boon, isBoonName)) {
    rows = addFeature(rows, { level: bp.boon, name: 'Epic Boon', description: BOON_TEXT }).rows
    added.boon = bp.boon
  }

  let subclassLevels = form.subclass_levels ?? []
  if (parts.subclass) {
    const used = (form.subclasses ?? []).flatMap((s) => (s.features ?? []).map((f) => Number(f.level))).filter(Boolean)
    const next = [...new Set([...bp.subclass, ...used])].sort((a, b) => a - b)
    added.subclass = next.filter((l) => !subclassLevels.includes(l))
    subclassLevels = next
  }

  return { form: { ...form, features: rows, subclass_levels: subclassLevels }, added }
}
