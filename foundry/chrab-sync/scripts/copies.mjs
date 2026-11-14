// Copies of built items (the class pack's and the Item Forge's) wherever they
// are in this world, refreshing them from the site's version, and noticing
// when one is edited in Foundry. The rules themselves are in copyRules.mjs.
//
// Where copies live:
//   - on actors in the Actors directory (characters and NPCs, their inventory
//     included);
//   - on unlinked tokens. An unlinked token is its actor plus its own changes
//     (its delta): an item the token never changed follows the actor, so only
//     the items in the delta (the token spent a use, say) are separate copies;
//   - in the Items directory;
//   - in unlocked world compendiums, when the "updateCompendiumCopies" setting
//     is on (the class compendium and the backups never count).

import { BACKUP_PACK_NAME, CLASS_PACK_NAME, ITEM_BACKUP_PACK_NAME, MODULE_ID } from './constants.mjs'
import { isBuilt, isEditedLocally, isPlayChange, isPlayEffectChange, LOCAL_EDIT_FLAG, refreshedData, siteLink, siteRoute } from './copyRules.mjs'

// -> [{ item, where: 'actor' | 'token' | 'directory', owner, edited }], each once.
export function findCopies(match) {
  const out = []
  const seen = new Set()
  const add = (item, where, owner) => {
    if (!item || seen.has(item.uuid)) return
    seen.add(item.uuid)
    out.push({ item, where, owner, edited: isEditedLocally(item) })
  }
  for (const actor of game.actors) for (const item of actor.items) if (match(item)) add(item, 'actor', actor.name)
  for (const scene of game.scenes) {
    for (const token of scene.tokens) {
      if (token.actorLink || !token.actor) continue
      for (const own of token.delta?.items ?? []) {
        if (match(own)) add(token.actor.items.get(own.id), 'token', `${token.name} (${scene.name})`)
      }
    }
  }
  for (const item of game.items) if (match(item)) add(item, 'directory', 'Items')
  return out
}

// The same, in unlocked world compendiums, when the setting is on.
export async function findCompendiumCopies(match) {
  if (!game.settings.get(MODULE_ID, 'updateCompendiumCopies')) return []
  const skip = new Set([CLASS_PACK_NAME, BACKUP_PACK_NAME, ITEM_BACKUP_PACK_NAME])
  const out = []
  for (const pack of game.packs) {
    if (pack.metadata.packageType !== 'world' || pack.locked || skip.has(pack.metadata.name)) continue
    if (pack.documentName === 'Item') {
      for (const item of await pack.getDocuments()) if (match(item)) out.push({ item, where: 'compendium', owner: pack.title, edited: isEditedLocally(item) })
    } else if (pack.documentName === 'Actor') {
      for (const actor of await pack.getDocuments()) {
        for (const item of actor.items) if (match(item)) out.push({ item, where: 'compendium', owner: `${actor.name} (${pack.title})`, edited: isEditedLocally(item) })
      }
    }
  }
  return out
}

// "3 characters, 1 token, 1 in Items" (actors count once each).
export function copySummary(copies) {
  const actors = new Set(copies.filter((c) => c.where === 'actor').map((c) => c.item.parent?.id)).size
  const count = (where) => copies.filter((c) => c.where === where).length
  const parts = []
  if (actors) parts.push(`${actors} actor${actors === 1 ? '' : 's'}`)
  if (count('token')) parts.push(`${count('token')} token${count('token') === 1 ? '' : 's'}`)
  if (count('directory')) parts.push(`${count('directory')} in Items`)
  if (count('compendium')) parts.push(`${count('compendium')} in compendiums`)
  return parts.join(', ')
}

// A copy replaced by the site's version (`next`, plain item data), keeping its
// play state (copyRules.refreshedData). Marked as a sync, so it isn't taken
// for an edit.
export async function refreshCopy(copy, next) {
  const data = refreshedData(copy.toObject(), next, { keepFolder: !copy.parent })
  await copy.update(data, { diff: false, recursive: false, chrabSync: true })
}

// Copies to refresh: all, except those edited in Foundry that the GM didn't
// tick (replaceEdited: a Set of uuids). -> { refresh, kept }
export function splitEdited(copies, replaceEdited = new Set()) {
  const refresh = []
  const kept = []
  for (const c of copies) (c.edited && !replaceEdited.has(c.item.uuid) ? kept : refresh).push(c)
  return { refresh, kept }
}

const markEdited = (item) => {
  if (isEditedLocally(item)) return
  item.update({ [`flags.${MODULE_ID}.${LOCAL_EDIT_FLAG}`]: true }, { chrabSync: true }).catch((err) => console.warn(`${MODULE_ID} | couldn't mark ${item.name} as edited`, err))
}
const keysOf = (changes) => Object.keys(foundry.utils.flattenObject(changes ?? {}))

// Every client: a change to a built item that isn't play (copyRules) marks it
// as edited in Foundry, in the same update. Its effects too (enchantments are
// play: dnd5e puts them on items).
export function watchLocalEdits() {
  Hooks.on('preUpdateItem', (item, changes, options) => {
    if (options?.chrabSync || !isBuilt(item)) return
    const keys = keysOf(changes)
    if (!keys.length || isPlayChange(keys, item.type)) return
    foundry.utils.setProperty(changes, `flags.${MODULE_ID}.${LOCAL_EDIT_FLAG}`, true)
  })
  const builtParent = (effect) => (effect.parent instanceof Item && isBuilt(effect.parent) && effect.type !== 'enchantment' ? effect.parent : null)
  Hooks.on('updateActiveEffect', (effect, changes, options, userId) => {
    if (userId !== game.user.id || options?.chrabSync) return
    const item = builtParent(effect)
    if (item && !isPlayEffectChange(keysOf(changes))) markEdited(item)
  })
  for (const hook of ['createActiveEffect', 'deleteActiveEffect']) {
    Hooks.on(hook, (effect, options, userId) => {
      if (userId !== game.user.id || options?.chrabSync) return
      const item = builtParent(effect)
      if (item) markEdited(item)
    })
  }
}

// GM only: an "Edit on the site" button in the header of a built item's (or a
// Compendium NPC's) sheet, opening the page on the site that builds it.
export function addSiteButtons() {
  const base = () => game.settings.get(MODULE_ID, 'siteUrl') || game.modules.get(MODULE_ID)?.url || ''
  Hooks.on('renderDocumentSheetV2', (app) => {
    if (!game.user.isGM) return
    const doc = app.document
    if (!doc || !['Item', 'Actor'].includes(doc.documentName)) return
    const link = siteLink(base(), siteRoute(doc))
    const header = app.element?.querySelector('.window-header')
    if (!link || !header || header.querySelector('.chrab-sync-site')) return
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'header-control icon fa-solid fa-arrow-up-right-from-square chrab-sync-site'
    button.dataset.tooltip = 'Edit on the site'
    button.setAttribute('aria-label', 'Edit on the site')
    button.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      window.open(link, '_blank', 'noopener')
    })
    header.insertBefore(button, header.querySelector('[data-action="close"]'))
  })
}
