// The Compendium's homebrew classes as a world compendium, "Chrab Corner
// Classes". The site publishes them as one public file of native dnd5e items
// (src/lib/foundryClassPack.js); syncing replaces the compendium's contents
// with that file. Players drag a class from the compendium onto their sheet
// and level up with the sheet's own level-up flow, which grants the features
// and offers the choices and the subclass from this compendium.
//
// The file's ids are stable across publishes, so the class advancements'
// UUIDs keep working and the copies already on characters can be refreshed
// in place: matched by flags.chrab-sync.packItem, keeping their spent uses
// and the choices made while levelling. See docs/foundry-classes.md in the
// Chrab Compendium repo.

import { CLASS_PACK_FILE, CLASS_PACK_FORMAT, CLASS_PACK_LABEL, CLASS_PACK_NAME, MODULE_ID } from './constants.mjs'
import { stampItems } from './classDiff.mjs'
import { replaceSource } from './items.mjs'
import { loadConfig } from './supabase.mjs'

// The public file needs no sign-in: it holds only public classes.
export async function fetchClassPack() {
  const { supabaseUrl } = await loadConfig()
  const response = await fetch(`${supabaseUrl}/storage/v1/object/public/${CLASS_PACK_FILE}?t=${Date.now()}`, { cache: 'no-store' })
  if (response.status === 400 || response.status === 404) return null
  if (!response.ok) throw new Error(`Couldn't load the class pack (${response.status}).`)
  return readClassPack(await response.json())
}

export function readClassPack(data) {
  if (data?.format !== CLASS_PACK_FORMAT || !Array.isArray(data.items)) throw new Error('That isn’t a Chrab Corner class pack.')
  return data
}

export function lastSynced() {
  return game.settings.get(MODULE_ID, 'classPackSynced') || null
}

export function isNewer(data) {
  return !!data && data.generatedAt !== lastSynced()
}

async function classCompendium() {
  const existing = game.packs.get(`world.${CLASS_PACK_NAME}`)
  if (existing) return existing
  const Compendium = foundry.documents?.collections?.CompendiumCollection ?? globalThis.CompendiumCollection
  return Compendium.createCompendium({ name: CLASS_PACK_NAME, label: CLASS_PACK_LABEL, type: 'Item', package: 'world' })
}

const packItemId = (item) => item.flags?.[MODULE_ID]?.packItem ?? null

// A feature copy: the new item under the copy's own id, with its spent uses
// and dnd5e's record of which advancement granted it.
async function refreshFeature(copy, next) {
  const data = foundry.utils.deepClone(next)
  data._id = copy.id
  delete data.folder
  delete data.sort
  if (data.system?.uses && copy.system?.uses) data.system.uses.spent = copy.system.uses.spent ?? 0
  data.flags = { ...data.flags, dnd5e: copy._source.flags?.dnd5e ?? {} }
  data._stats = copy._source._stats
  await replaceSource(copy, data)
}

// dnd5e 5.3 keeps advancements keyed by id; the pack writes them as a list,
// which dnd5e converts on create. Either shape -> a list.
const advancementList = (adv) => (Array.isArray(adv) ? adv : Object.values(adv ?? {}))

// A class or subclass copy: the new advancements (so later level-ups use the
// current class), each keeping what this character already chose for it,
// plus the character's levels and spent hit dice.
async function refreshAdvancing(copy, next) {
  const current = copy._source.system.advancement
  const before = new Map(advancementList(current).map((a) => [a._id, a]))
  const system = foundry.utils.deepClone(next.system)
  const merged = advancementList(system.advancement).map((a) => (before.has(a._id) ? { ...a, value: before.get(a._id).value } : a))
  // Written back in the shape the copy already has.
  system.advancement = Array.isArray(current) ? merged : Object.fromEntries(merged.map((a) => [a._id, a]))
  if (copy.type === 'class') {
    system.levels = copy._source.system.levels
    system.hd = { ...system.hd, spent: copy._source.system.hd?.spent ?? 0 }
  }
  await copy.update({ name: next.name, img: next.img, system }, { diff: false, recursive: false })
}

export function findClassCopies(data) {
  const ids = new Set(data.items.map((i) => i._id))
  const copies = []
  for (const actor of game.actors) {
    for (const item of actor.items) if (ids.has(packItemId(item))) copies.push(item)
  }
  return copies
}

// Returns { items, copies, failed }. Throws if the compendium can't be written.
export async function syncClassPack(data, { updateCopies = true } = {}) {
  const pack = await classCompendium()
  const options = { pack: pack.collection }
  await pack.configure({ locked: false })
  try {
    const FolderClass = Folder.implementation
    const wanted = new Set(data.folders.map((f) => f._id))
    const missing = data.folders.filter((f) => !pack.folders.get(f._id))
    if (missing.length) await FolderClass.createDocuments(missing, { ...options, keepId: true })

    // Replace everything: the file is the whole truth, and the ids carry over.
    const index = await pack.getIndex()
    const old = index.map((e) => e._id)
    if (old.length) await Item.implementation.deleteDocuments(old, options)
    // Fingerprinted, so the next sync can tell what changed (classDiff.mjs).
    await Item.implementation.createDocuments(stampItems(data.items), { ...options, keepId: true })

    const stale = pack.folders.filter((f) => !wanted.has(f.id)).map((f) => f.id)
    if (stale.length) await FolderClass.deleteDocuments(stale, options)
  } finally {
    // Players browse it and drag from it; nobody but a GM edits it.
    await pack.configure({ locked: true, ownership: { PLAYER: 'OBSERVER', TRUSTED: 'OBSERVER', ASSISTANT: 'OWNER' } })
  }
  await game.settings.set(MODULE_ID, 'classPackSynced', data.generatedAt)

  let copies = 0
  const failed = []
  if (updateCopies) {
    const byId = new Map(data.items.map((i) => [i._id, i]))
    for (const copy of findClassCopies(data)) {
      try {
        const next = byId.get(packItemId(copy))
        if (copy.type === 'class' || copy.type === 'subclass') await refreshAdvancing(copy, next)
        else await refreshFeature(copy, next)
        copies++
      } catch (err) {
        console.error(`${MODULE_ID} | failed to update ${copy.name} on ${copy.parent?.name}`, err)
        failed.push(`${copy.parent?.name}: ${copy.name}`)
      }
    }
  }
  return { items: data.items.length, copies, failed }
}

// For the login check: tells the GM when the site has published classes this
// world hasn't synced yet.
export async function checkClassPack({ notify = false } = {}) {
  const data = await fetchClassPack()
  if (notify && isNewer(data)) {
    ui.notifications.info('Chrab Sync: the Compendium has class updates. Open Chrab Sync in the Items tab → Classes.')
  }
  return data
}
