// Creating / updating one queued Feature Forge item (a class feature, feat or
// spell) in this world's Items directory, and optionally the copies of it
// already on characters.
//
// Same update semantics as NPCs (apply.mjs): Document#importFromJSON, the
// same thing as right-click -> Import Data. The world item keeps its id and
// folder, and is backed up into a world compendium first. Copies on actors
// keep their own id, so effects that point at them (an active stance's
// origin) stay valid, and keep their spent uses.

import {
  DEFAULT_ITEM_FOLDER,
  FEATURE_FLAG_KEY,
  ITEM_BACKUP_PACK_LABEL,
  ITEM_BACKUP_PACK_NAME,
  MODULE_ID,
} from './constants.mjs'

const isDraft = (item, draftId) => item.flags?.[MODULE_ID]?.[FEATURE_FLAG_KEY] === draftId

export function findDraftItem(draftId) {
  return game.items.find((i) => isDraft(i, draftId))
}

// Every owned copy, on any actor in the world (not unlinked token copies).
export function findDraftCopies(draftId) {
  const copies = []
  for (const actor of game.actors) {
    for (const item of actor.items) if (isDraft(item, draftId)) copies.push(item)
  }
  return copies
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

// importFromJSON replaces the document's source wholesale, so the incoming
// data has to carry the target's own id (and for a character's copy, the
// uses they've already spent).
async function replaceWith(target, data, { keepSpent = false } = {}) {
  const next = foundry.utils.deepClone(data)
  next._id = target.id
  if (keepSpent && next.system?.uses && target.system?.uses) next.system.uses.spent = target.system.uses.spent ?? 0
  await target.importFromJSON(JSON.stringify(next))
}

// Returns { item, mode: 'created' | 'updated', copies }. Throws on failure.
export async function applyQueuedFeature(entry, { updateCopies = true } = {}) {
  const data = foundry.utils.deepClone(entry.queued_item)
  // Item Forge drafts: features, spells and gear (weapons, armor, wondrous items, consumables).
  if (!['feat', 'spell', 'weapon', 'equipment', 'consumable', 'loot'].includes(data?.type)) throw new Error('Queued data is not a feature, spell or item.')
  data.flags = foundry.utils.mergeObject(data.flags ?? {}, { [MODULE_ID]: { [FEATURE_FLAG_KEY]: entry.id } })

  const existing = findDraftItem(entry.id)
  let item
  let mode
  if (existing) {
    await backup(existing)
    await replaceWith(existing, data)
    item = existing
    mode = 'updated'
  } else {
    const folder = await itemFolder()
    const { _id, ...rest } = data
    item = await Item.implementation.create({ ...rest, folder: folder.id })
    mode = 'created'
  }

  let copies = 0
  if (updateCopies) {
    for (const copy of findDraftCopies(entry.id)) {
      await replaceWith(copy, data, { keepSpent: true })
      copies++
    }
  }
  return { item, mode, copies }
}
