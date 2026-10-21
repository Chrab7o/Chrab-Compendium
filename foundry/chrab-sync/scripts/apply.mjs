// Creating / updating one queued NPC in this world.
//
// Update semantics are deliberately the same as Foundry's own right-click
// "Import Data" (Actor#importFromJSON), which Phase 1 verified by hand: the
// actor keeps its id, folder and placed tokens; system data and items are
// replaced by the queued copy. Item ids are stable per draft (the site's
// builder mints them once), so references to them survive an update.
//
// Anything changed inside Foundry after the first sync is overwritten - which
// is why every update backs the old actor up into a world compendium first.

import {
  BACKUP_PACK_LABEL,
  BACKUP_PACK_NAME,
  DEFAULT_FOLDER,
  DRAFT_FLAG_KEY,
  LEGACY_FLAG_SCOPE,
  MODULE_ID,
} from './constants.mjs'

export function findDraftActor(draftId) {
  return game.actors.find(
    (a) => a.flags?.[MODULE_ID]?.[DRAFT_FLAG_KEY] === draftId || a.flags?.[LEGACY_FLAG_SCOPE]?.[DRAFT_FLAG_KEY] === draftId
  )
}

async function npcFolder() {
  const name = game.settings.get(MODULE_ID, 'folderName') || DEFAULT_FOLDER
  const existing = game.folders.find((f) => f.type === 'Actor' && f.name === name)
  if (existing) return existing
  return Folder.implementation.create({ name, type: 'Actor', color: '#7a1f2b' })
}

async function backupPack() {
  const existing = game.packs.get(`world.${BACKUP_PACK_NAME}`)
  if (existing) return existing
  const Compendium = foundry.documents?.collections?.CompendiumCollection ?? globalThis.CompendiumCollection
  return Compendium.createCompendium({ name: BACKUP_PACK_NAME, label: BACKUP_PACK_LABEL, type: 'Actor', package: 'world' })
}

async function backup(actor) {
  const pack = await backupPack()
  const copy = await pack.importDocument(actor)
  await copy.update({ name: `${actor.name} — ${new Date().toISOString().slice(0, 16).replace('T', ' ')}` })
}

// NPCs are GM-only, always: no default access and no per-player entries.
// GMs see everything regardless of ownership, so this locks out everyone else.
// recursive: false replaces the ownership object outright instead of merging
// into it, which drops any per-user entries without relying on the "-=key"
// deletion syntax.
async function lockDown(actor) {
  const ownership = { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE }
  const extra = Object.keys(actor.ownership ?? {}).filter((id) => id !== 'default' && !game.users.get(id)?.isGM)
  if (actor.ownership?.default === ownership.default && extra.length === 0) return
  for (const id of Object.keys(actor.ownership ?? {})) {
    if (id !== 'default' && game.users.get(id)?.isGM) ownership[id] = actor.ownership[id]
  }
  await actor.update({ ownership }, { recursive: false })
}

// Returns { actor, mode: 'created' | 'updated' }. Throws on failure.
export async function applyQueuedNpc(entry) {
  const data = foundry.utils.deepClone(entry.queued_actor)
  if (data?.type !== 'npc') throw new Error('Queued data is not an NPC actor.')
  data.flags = foundry.utils.mergeObject(data.flags ?? {}, { [MODULE_ID]: { [DRAFT_FLAG_KEY]: entry.id } })

  const existing = findDraftActor(entry.id)
  let actor
  let mode
  if (existing) {
    await backup(existing)
    await existing.importFromJSON(JSON.stringify(data))
    actor = existing
    mode = 'updated'
  } else {
    const folder = await npcFolder()
    actor = await Actor.implementation.create({ ...data, folder: folder.id })
    mode = 'created'
  }
  await lockDown(actor)
  return { actor, mode }
}
