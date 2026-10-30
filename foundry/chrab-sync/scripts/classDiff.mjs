// What a class sync would change, before it runs: the incoming class pack
// against what's in the world compendium now (the last version synced), and
// what that means for the copies already on characters. Names only: which
// features are new, changed or removed, not what changed in them.
//
// Comparing the compendium's stored items field by field doesn't work: dnd5e
// and Foundry add to them on create, so everything looks changed. Instead
// each sync stamps every item with a fingerprint of the file's version of it
// (flags.chrab-sync.hash), and the next sync compares fingerprints. Items
// synced before 0.3 have none, so the first sync after updating can only tell
// what's new or removed.

import { CLASS_PACK_NAME, MODULE_ID } from './constants.mjs'

const packItemId = (item) => item.flags?.[MODULE_ID]?.packItem ?? null
const storedHash = (item) => item.flags?.[MODULE_ID]?.hash ?? null
const advancementList = (adv) => (Array.isArray(adv) ? adv : Object.values(adv ?? {}))

// JSON with sorted keys, so the same item always gives the same text.
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .filter((k) => value[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stableJson(value[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

// cyrb53: a fast 53-bit string hash. crypto.subtle isn't there when Foundry is
// served over plain http, and this only has to notice changes.
function hashText(text) {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

// A file item's fingerprint: everything but where it sits in the compendium.
export function fingerprint(item) {
  const { folder, sort, ...rest } = item
  const flags = { ...rest.flags, [MODULE_ID]: { ...rest.flags?.[MODULE_ID] } }
  delete flags[MODULE_ID].hash
  return hashText(stableJson({ ...rest, flags }))
}

// The file's items with their fingerprints, as syncClassPack writes them.
export function stampItems(items) {
  return items.map((item) => ({ ...item, flags: { ...item.flags, [MODULE_ID]: { ...item.flags?.[MODULE_ID], hash: fingerprint(item) } } }))
}

// The pack's features carry packKey "<owner id>|<level>|<name>".
function owner(item) {
  const [ownerId, level] = String(item.flags?.[MODULE_ID]?.packKey ?? '').split('|')
  return { ownerId, level: Number(level) || null }
}

// Pure comparison, testable without Foundry. oldItems need _id, name, type
// and flags; newItems are stamped file items. An old item without a
// fingerprint counts as unchanged: there's nothing to compare it with.
export function comparePacks(oldItems, newItems) {
  const oldById = new Map(oldItems.map((i) => [i._id, i]))
  const newById = new Map(newItems.map((i) => [i._id, i]))
  const counts = { added: 0, removed: 0, changed: 0 }
  const entries = new Map() // id -> { id, name, type, ownerId, level, status }
  for (const id of new Set([...oldById.keys(), ...newById.keys()])) {
    const was = oldById.get(id)
    const now = newById.get(id)
    const item = now ?? was
    const status = !was ? 'added' : !now ? 'removed' : storedHash(was) && storedHash(was) !== storedHash(now) ? 'changed' : 'same'
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
  const oldIds = new Set(oldItems.map((i) => i._id))
  const newIds = new Set(newItems.map((i) => i._id))
  // Features handed out by an ItemGrant (not offered in a choice).
  const granted = new Set(
    newItems.flatMap((i) =>
      advancementList(i.system?.advancement)
        .filter((a) => a.type === 'ItemGrant')
        .flatMap((a) => (a.configuration?.items ?? []).map((e) => String(e.uuid ?? e).split('.').pop())),
    ),
  )
  const report = []
  for (const actor of actors) {
    const copies = actor.items.filter((i) => oldIds.has(packItemId(i)) || newIds.has(packItemId(i)))
    if (!copies.length) continue
    const row = { actor: actor.name, id: actor.id, updated: [], unchanged: 0, orphaned: [], missed: [] }
    const have = new Set(copies.map(packItemId))
    for (const copy of copies) {
      const id = packItemId(copy)
      if (!newIds.has(id)) row.orphaned.push(copy.name)
      else if (entries.get(id)?.status === 'changed') row.updated.push(copy.name)
      else row.unchanged++
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

// Returns { firstSync, noBaseline, counts, groups, characters }.
export async function diffClassPack(data) {
  const pack = game.packs.get(`world.${CLASS_PACK_NAME}`)
  const current = pack ? [...(await pack.getIndex({ fields: ['flags'] }))] : []
  const incoming = stampItems(data.items)
  if (!current.length) return { firstSync: true, counts: { added: incoming.length, removed: 0, changed: 0 }, groups: [], characters: [] }
  const { groups, counts, entries } = comparePacks(current, incoming)
  const characters = characterImpact(game.actors, current, incoming, entries)
  return { firstSync: false, noBaseline: !current.some(storedHash), counts, groups, characters }
}
