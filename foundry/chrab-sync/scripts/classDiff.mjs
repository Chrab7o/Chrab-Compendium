// What a class sync would change, before it runs: the incoming class pack
// against what's in the world compendium now (the last version synced), and
// what that means for the copies already on characters. Names only: which
// features are new, changed or removed, not what changed in them.
//
// Both sides go through the Item data model (toObject) before comparing, so
// defaults dnd5e fills in on create don't show up as changes. Lists of
// documents (effects, advancements) are compared by id, not by position.

import { CLASS_PACK_NAME, MODULE_ID } from './constants.mjs'

const packItemId = (item) => item.flags?.[MODULE_ID]?.packItem ?? null
const advancementList = (adv) => (Array.isArray(adv) ? adv : Object.values(adv ?? {}))
const byId = (list) => Object.fromEntries((list ?? []).map((d) => [d._id, d]))

// Paths that change on every sync or belong to the copy, never to the class.
function strip(obj, { copy = false } = {}) {
  delete obj._id
  delete obj._stats
  delete obj.folder
  delete obj.sort
  delete obj.ownership
  if (obj.flags) {
    delete obj.flags.dnd5e
    delete obj.flags.core
    if (obj.flags[MODULE_ID]) delete obj.flags[MODULE_ID].packKey
  }
  obj.effects = byId(obj.effects)
  for (const e of Object.values(obj.effects)) {
    delete e._stats
    if (copy) delete e.origin
  }
  if (obj.system?.advancement) {
    obj.system.advancement = byId(advancementList(obj.system.advancement))
    if (copy) for (const a of Object.values(obj.system.advancement)) delete a.value
  }
  if (copy && obj.system) {
    if (obj.system.uses) delete obj.system.uses.spent
    if (obj.type === 'class') {
      delete obj.system.levels
      if (obj.system.hd) delete obj.system.hd.spent
    }
  }
  return obj
}

// A pack item as it would be once created: through the data model when
// Foundry is here (tests pass plain objects through untouched).
function modelled(data) {
  const ItemClass = globalThis.Item?.implementation
  if (!ItemClass) return foundry.utils.deepClone(data)
  try {
    return new ItemClass(foundry.utils.deepClone(data)).toObject()
  } catch {
    return foundry.utils.deepClone(data)
  }
}

export function differs(a, b) {
  if (Object.is(a, b)) return false
  const objA = a !== null && typeof a === 'object'
  const objB = b !== null && typeof b === 'object'
  if (!objA || !objB || Array.isArray(a) !== Array.isArray(b)) return true
  if (Array.isArray(a) && a.length !== b.length) return true
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) if (differs(a[key], b[key])) return true
  return false
}

const changed = (before, after, options) => differs(strip(foundry.utils.deepClone(before), options), strip(foundry.utils.deepClone(after), options))

// Item ids an ItemGrant advancement hands out.
const grantedIds = (a) => (a?.configuration?.items ?? []).map((e) => String(e.uuid ?? e).split('.').pop())

// The pack's features carry packKey "<owner id>|<level>|<name>".
function owner(item) {
  const [ownerId, level] = String(item.flags?.[MODULE_ID]?.packKey ?? '').split('|')
  return { ownerId, level: Number(level) || null }
}

// The compendium's current items, or null when it doesn't exist yet.
async function currentPackItems() {
  const pack = game.packs.get(`world.${CLASS_PACK_NAME}`)
  if (!pack) return null
  const docs = await pack.getDocuments()
  return docs.map((d) => d.toObject())
}

// Pure comparison, testable without Foundry: old and new are lists of pack
// items (already modelled). Returns { groups, counts, entries }.
export function comparePacks(oldItems, newItems) {
  const oldById = new Map(oldItems.map((i) => [i._id, i]))
  const newById = new Map(newItems.map((i) => [i._id, i]))
  const counts = { added: 0, removed: 0, changed: 0 }
  const entries = new Map() // id -> { id, name, type, ownerId, level, status }
  for (const id of new Set([...oldById.keys(), ...newById.keys()])) {
    const was = oldById.get(id)
    const now = newById.get(id)
    const item = now ?? was
    const status = !was ? 'added' : !now ? 'removed' : changed(was, now) ? 'changed' : 'same'
    if (status !== 'same') counts[status]++
    entries.set(id, { id, name: item.name, type: item.type, ...owner(item), status })
  }

  // One group per class / subclass, its features under it.
  const groups = new Map()
  for (const e of entries.values()) if (e.type === 'class' || e.type === 'subclass') groups.set(e.id, { ...e, features: [] })
  const other = { id: '', name: 'Other features', type: 'other', status: 'same', features: [] }
  for (const e of entries.values()) {
    if (e.type === 'class' || e.type === 'subclass' || e.status === 'same') continue
    ;(groups.get(e.ownerId) ?? other).features.push(e)
  }
  const list = [...groups.values(), other]
  for (const g of list) g.features.sort((x, y) => (x.level ?? 0) - (y.level ?? 0) || x.name.localeCompare(y.name))
  return { groups: list.filter((g) => g.status !== 'same' || g.features.length), counts, entries }
}

// For each character with copies: what Sync classes (with Also update
// copies) does to them, and what it doesn't.
export function characterImpact(actors, oldItems, newItems, entries) {
  const oldById = new Map(oldItems.map((i) => [i._id, i]))
  const newById = new Map(newItems.map((i) => [i._id, i]))
  const granted = new Set(newItems.flatMap((i) => advancementList(i.system?.advancement).filter((a) => a.type === 'ItemGrant').flatMap(grantedIds)))
  const report = []
  for (const actor of actors) {
    const copies = actor.items.filter((i) => oldById.has(packItemId(i)) || newById.has(packItemId(i)))
    if (!copies.length) continue
    const row = { actor: actor.name, id: actor.id, updated: [], unchanged: 0, orphaned: [], edits: [], missed: [] }
    const have = new Set(copies.map(packItemId))
    for (const copy of copies) {
      const id = packItemId(copy)
      if (!newById.has(id)) {
        row.orphaned.push(copy.name)
        continue
      }
      if (entries.get(id)?.status === 'changed') row.updated.push(copy.name)
      else row.unchanged++
      // Edited in Foundry since the last sync: the refresh overwrites it.
      const base = oldById.get(id)
      const source = typeof copy.toObject === 'function' ? copy.toObject() : copy
      if (base && changed(base, source, { copy: true })) row.edits.push(copy.name)
    }
    // New grants at levels the character already has: not retroactive.
    for (const copy of copies.filter((c) => c.type === 'class' || c.type === 'subclass')) {
      const cls = copy.type === 'class' ? copy : actor.items.find((i) => i.type === 'class' && i.system?.identifier === copy.system?.classIdentifier)
      const level = cls?.system?.levels ?? 0
      for (const e of entries.values()) {
        if (e.ownerId === packItemId(copy) && e.status === 'added' && granted.has(e.id) && (e.level ?? 99) <= level && !have.has(e.id)) row.missed.push(e.name)
      }
    }
    report.push(row)
  }
  return report
}

// Returns { firstSync, counts, groups, characters }.
export async function diffClassPack(data) {
  const current = await currentPackItems()
  const incoming = data.items.map(modelled)
  if (!current?.length) return { firstSync: true, counts: { added: incoming.length, removed: 0, changed: 0 }, groups: [], characters: [] }
  const { groups, counts, entries } = comparePacks(current, incoming)
  const characters = characterImpact(game.actors, current, incoming, entries)
  return { firstSync: false, counts, groups, characters }
}
