// The Compendium's homebrew classes (and public backgrounds and feats) as a
// world compendium, "Chrab Corner Classes". The site publishes them as one
// public file of native dnd5e items
// (src/lib/foundryClassPack.js); syncing replaces the compendium's contents
// with that file. Players drag a class from the compendium onto their sheet
// and level up with the sheet's own level-up flow, which grants the features
// and offers the choices and the subclass from this compendium.
//
// The file's ids are stable across publishes, so the class advancements'
// UUIDs keep working and the copies already on characters can be refreshed
// in place wherever they are (copies.mjs: actors, unlinked tokens, the Items
// directory, opted-in compendiums): matched by flags.chrab-sync.packItem,
// keeping their play state and the choices made while levelling. Copies
// edited in Foundry are only replaced when the GM ticks them. See
// docs/foundry-classes.md in the lab.

import { CLASS_PACK_FILE, CLASS_PACK_FORMAT, CLASS_PACK_LABEL, CLASS_PACK_NAME, MODULE_ID } from './constants.mjs'
import { stampItems } from './classDiff.mjs'
import { findCompendiumCopies, findCopies, refreshCopy, splitEdited } from './copies.mjs'
import { ADVANCING_TYPES, keepChoices, packItemOf } from './copyRules.mjs'
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

// A class, subclass or background copy: the new advancements (so later
// level-ups use the current class), each keeping what this character already
// chose for it (a background's ability scores, skills and languages), plus a
// class's levels and spent hit dice.
async function refreshAdvancing(copy, next) {
  const system = foundry.utils.deepClone(next.system)
  system.advancement = keepChoices(copy._source.system.advancement, system.advancement)
  if (copy.type === 'class') {
    system.levels = copy._source.system.levels
    system.hd = { ...system.hd, spent: copy._source.system.hd?.spent ?? 0 }
  }
  await copy.update({ name: next.name, img: next.img, system }, { diff: false, recursive: false, chrabSync: true })
}

// Every copy of a pack item in the world: [{ item, where, owner, edited }].
export function findClassCopies(data) {
  const ids = new Set(data.items.map((i) => i._id))
  return findCopies((item) => ids.has(packItemOf(item)))
}

// Returns { items, copies, kept, failed }. Throws if the compendium can't be
// written. replaceEdited: uuids of copies edited in Foundry to replace anyway.
export async function syncClassPack(data, { updateCopies = true, replaceEdited = new Set() } = {}) {
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
  let kept = []
  if (updateCopies) {
    const byId = new Map(data.items.map((i) => [i._id, i]))
    const ids = new Set(byId.keys())
    const all = [...findClassCopies(data), ...(await findCompendiumCopies((item) => ids.has(packItemOf(item))))]
    const split = splitEdited(all, replaceEdited)
    kept = split.kept
    for (const { item: copy, owner } of split.refresh) {
      try {
        const next = byId.get(packItemOf(copy))
        if (ADVANCING_TYPES.has(copy.type)) await refreshAdvancing(copy, next)
        else await refreshCopy(copy, next)
        copies++
      } catch (err) {
        console.error(`${MODULE_ID} | failed to update ${copy.name} on ${owner}`, err)
        failed.push(`${owner}: ${copy.name}`)
      }
    }
  }
  return { items: data.items.length, copies, kept: kept.map((c) => `${c.owner}: ${c.item.name}`), failed }
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
