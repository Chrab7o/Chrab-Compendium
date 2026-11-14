// Creating / updating one queued Feature Forge item (a class feature, feat,
// spell or piece of gear) in this world's Items directory, and optionally its
// copies everywhere else (copies.mjs: actors, unlinked tokens, other items in
// the Items directory, opted-in compendiums).
//
// The world item keeps its id and folder, and is backed up into a world
// compendium first. Copies keep their own id, so effects that point at them
// (an active stance's origin) stay valid, and keep their play state (spent
// uses, quantity, equipped, attuned, a spell's preparation…: copyRules.mjs).
// Copies edited in Foundry are only replaced when the GM ticks them.
// Copies a class granted (they carry the class pack's packItem too) are left
// to Sync classes, which knows their class wording and choices.

import {
  DEFAULT_ITEM_FOLDER,
  FEATURE_FLAG_KEY,
  ITEM_BACKUP_PACK_LABEL,
  ITEM_BACKUP_PACK_NAME,
  MODULE_ID,
} from './constants.mjs'
import { findCompendiumCopies, findCopies, refreshCopy, splitEdited } from './copies.mjs'
import { draftIdOf, packItemOf } from './copyRules.mjs'

export function findDraftItem(draftId) {
  return game.items.find((i) => draftIdOf(i) === draftId && !packItemOf(i))
}

const isCopyOf = (draftId) => (item) => draftIdOf(item) === draftId && !packItemOf(item)

// Every copy but the Items directory's own: [{ item, where, owner, edited }].
export function findDraftCopies(draftId) {
  const own = findDraftItem(draftId)
  return findCopies(isCopyOf(draftId)).filter((c) => c.item !== own)
}

async function itemFolder() {
  const name = game.settings.get(MODULE_ID, 'itemFolderName') || DEFAULT_ITEM_FOLDER
  const existing = game.folders.find((f) => f.type === 'Item' && f.name === name)
  if (existing) return existing
  return Folder.implementation.create({ name, type: 'Item', color: '#c4102f' })
}

async function backup(item) {
  const Compendium = foundry.documents?.collections?.CompendiumCollection ?? globalThis.CompendiumCollection
  const pack =
    game.packs.get(`world.${ITEM_BACKUP_PACK_NAME}`) ??
    (await Compendium.createCompendium({ name: ITEM_BACKUP_PACK_NAME, label: ITEM_BACKUP_PACK_LABEL, type: 'Item', package: 'world' }))
  const copy = await pack.importDocument(item)
  await copy.update({ name: `${item.name} — ${new Date().toISOString().slice(0, 16).replace('T', ' ')}` })
}

// Returns { item, mode: 'created' | 'updated', copies, kept, failed }. Throws
// if the Items directory's item can't be written.
// replaceEdited: uuids of copies edited in Foundry to replace anyway.
export async function applyQueuedFeature(entry, { updateCopies = true, replaceEdited = new Set() } = {}) {
  const data = foundry.utils.deepClone(entry.queued_item)
  // Item Forge drafts: features, spells and gear (weapons, armor, wondrous items, consumables).
  if (!['feat', 'spell', 'weapon', 'equipment', 'consumable', 'loot'].includes(data?.type)) throw new Error('Queued data is not a feature, spell or item.')
  data.flags = foundry.utils.mergeObject(data.flags ?? {}, { [MODULE_ID]: { [FEATURE_FLAG_KEY]: entry.id } })

  // The Items directory's own copy: always the site's version (backed up first,
  // so an edit made to it in Foundry is in the backups).
  const existing = findDraftItem(entry.id)
  let item
  let mode
  if (existing) {
    await backup(existing)
    await refreshCopy(existing, data)
    item = existing
    mode = 'updated'
  } else {
    const folder = await itemFolder()
    const { _id, ...rest } = data
    item = await Item.implementation.create({ ...rest, folder: folder.id })
    mode = 'created'
  }

  let copies = 0
  let kept = []
  const failed = []
  if (updateCopies) {
    const all = [...findDraftCopies(entry.id).filter((c) => c.item !== item), ...(await findCompendiumCopies(isCopyOf(entry.id)))]
    const split = splitEdited(all, replaceEdited)
    kept = split.kept.map((c) => c.owner)
    for (const { item: copy, owner } of split.refresh) {
      try {
        await refreshCopy(copy, data)
        copies++
      } catch (err) {
        console.error(`${MODULE_ID} | failed to update ${copy.name} on ${owner}`, err)
        failed.push(owner)
      }
    }
  }
  return { item, mode, copies, kept, failed }
}
