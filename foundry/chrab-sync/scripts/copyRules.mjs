// The rules for copies of built items (the site's class pack and Item Forge
// items), with no Foundry calls, so they can be tested in node
// (test/copyRules.test.mjs):
//   - which items are built ones, and by what they are matched;
//   - what a sync keeps when it refreshes a copy (the play state);
//   - which changes made in Foundry are play, and which are edits (an edit
//     marks the copy, so a sync asks before replacing it).
// Used by copies.mjs, classes.mjs and items.mjs.

import { MODULE_ID } from './constants.mjs'

export const LOCAL_EDIT_FLAG = 'localEdit'

const flagsOf = (doc) => doc?.flags?.[MODULE_ID] ?? {}
export const draftIdOf = (doc) => flagsOf(doc).featureDraftId ?? null
export const packItemOf = (doc) => flagsOf(doc).packItem ?? null
export const isBuilt = (doc) => !!(draftIdOf(doc) || packItemOf(doc))
export const isEditedLocally = (doc) => !!flagsOf(doc)[LOCAL_EDIT_FLAG]

function getPath(obj, path) {
  let v = obj
  for (const k of path.split('.')) {
    if (v == null || typeof v !== 'object') return undefined
    v = v[k]
  }
  return v
}
function parentOf(obj, path) {
  const keys = path.split('.')
  keys.pop()
  const parent = keys.length ? getPath(obj, keys.join('.')) : obj
  return parent && typeof parent === 'object' ? parent : null
}

// Play state: what using the item at the table changes. A refresh keeps the
// copy's; a change to only these isn't an edit.
export const PLAY_PATHS = [
  'system.uses.spent',
  'system.quantity',
  'system.equipped',
  'system.attuned',
  'system.identified',
  'system.container',
  'system.prepared', // a spell: prepared or not (dnd5e 5)
  'system.method', // a spell: how the character has it
]
const PLAY_CHANGES = [
  ...PLAY_PATHS.map((p) => new RegExp(`^${p.replace(/\./g, '\\.')}$`)),
  /^system\.activities\.[^.]+\.uses\.spent$/,
  /^system\.advancement\.[^.]+\.value(\.|$)/, // a choice made with it (a feat's ability scores)
  /^(sort|folder|ownership)(\.|$)/,
  /^_stats(\.|$)/,
  /^_id$/,
  // dnd5e's own records (advancement origin, …), the sheet, and ours.
  /^flags\.(dnd5e|core|chrab-sync)(\.|$)/,
]

// A class, subclass or background also changes as the character levels: its
// levels, spent hit dice and the choices in its advancements (dnd5e may
// rewrite the whole advancement list). A sync refreshes those keeping the
// choices anyway (classes.mjs), so none of it counts as an edit.
const ADVANCING_CHANGES = [/^system\.levels$/, /^system\.hd\.spent$/, /^system\.advancement(\.|$)/]
export const ADVANCING_TYPES = new Set(['class', 'subclass', 'background'])

// Flattened change keys ("system.uses.spent") -> only play? `type`: the item's.
export function isPlayChange(keys, type = '') {
  const rules = ADVANCING_TYPES.has(type) ? [...PLAY_CHANGES, ...ADVANCING_CHANGES] : PLAY_CHANGES
  return keys.every((k) => rules.some((re) => re.test(k.replace(/^-=|\.-=/g, '.').replace(/^\./, ''))))
}

// An item effect change that isn't an edit: switching it on or off.
export function isPlayEffectChange(keys) {
  return keys.every((k) => k === '_id' || k === 'disabled' || /^_stats(\.|$)/.test(k))
}

// dnd5e 5.3 keeps advancements keyed by id; the pack writes them as a list.
export const advancementList = (adv) => (Array.isArray(adv) ? adv : Object.values(adv ?? {}))

// The new advancements, each keeping what the copy already chose for it, in
// the shape the copy has.
export function keepChoices(current, next) {
  const before = new Map(advancementList(current).map((a) => [a._id, a]))
  const merged = advancementList(next).map((a) => (before.has(a._id) ? { ...a, value: before.get(a._id).value } : a))
  return Array.isArray(current) ? merged : Object.fromEntries(merged.map((a) => [a._id, a]))
}

// The site's version of an item (`next`, plain data) laid over a copy (its
// _source): the copy keeps its id, place (sort, folder), ownership, stats, play
// state, which effects are switched off, dnd5e's and the sheet's flags, and
// the choices made with its advancements. Returns new data; changes neither.
export function refreshedData(copy, next, { keepFolder = false } = {}) {
  const data = structuredClone(next)
  data._id = copy._id
  delete data.folder
  if (keepFolder && copy.folder !== undefined) data.folder = copy.folder
  if (copy.sort !== undefined) data.sort = copy.sort
  else delete data.sort
  if (copy.ownership) data.ownership = structuredClone(copy.ownership)
  else delete data.ownership
  if (copy._stats) data._stats = structuredClone(copy._stats)
  else delete data._stats

  for (const path of PLAY_PATHS) {
    const value = getPath(copy, path)
    const parent = parentOf(data, path)
    if (value !== undefined && parent) parent[path.split('.').pop()] = structuredClone(value)
  }
  // Each roll's own spent uses.
  const activities = data.system?.activities
  if (activities && typeof activities === 'object') {
    for (const [id, activity] of Object.entries(activities)) {
      const spent = getPath(copy, `system.activities.${id}.uses.spent`)
      if (spent !== undefined && activity?.uses && typeof activity.uses === 'object') activity.uses.spent = spent
    }
  }
  // Effects the player switched off stay off.
  const before = new Map((copy.effects ?? []).map((e) => [e._id, e]))
  data.effects = (data.effects ?? []).map((e) => (before.has(e._id) && before.get(e._id).disabled !== undefined ? { ...e, disabled: before.get(e._id).disabled } : e))

  if (data.system?.advancement && copy.system?.advancement) data.system.advancement = keepChoices(copy.system.advancement, data.system.advancement)

  const flags = { ...(data.flags ?? {}) }
  flags.dnd5e = structuredClone(copy.flags?.dnd5e ?? {})
  if (copy.flags?.core) flags.core = structuredClone(copy.flags.core)
  else delete flags.core
  if (flags[MODULE_ID]) {
    flags[MODULE_ID] = { ...flags[MODULE_ID] }
    delete flags[MODULE_ID][LOCAL_EDIT_FLAG]
  }
  data.flags = flags
  return data
}

// The site page that builds an item: the pack's own route (class, subclass,
// feat, background), else its Item Forge item. Null when there's none.
export function siteRoute(doc) {
  const f = flagsOf(doc)
  if (f.edit) return f.edit
  if (f.featureDraftId) return `/dm/item-forge/${f.featureDraftId}/edit`
  if (f.npcDraftId) return `/dm/npc-forge/${f.npcDraftId}/edit`
  return null
}

// "https://site/" + "/dm/…" -> "https://site/#/dm/…" (the site's hash router).
export function siteLink(base, route) {
  if (!base || !route) return null
  return `${String(base).replace(/[#/]+$/, '')}/#${route}`
}
