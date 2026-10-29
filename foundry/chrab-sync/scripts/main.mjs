// Chrab Sync: pulls NPCs built in the Chrab Compendium's NPC Forge, items
// from its Feature Forge and its homebrew classes (classes.mjs) into this
// world, and pushes player character sheets back (characters.mjs). Syncing
// runs for GMs only - players' browsers register the settings (Foundry
// requires it) and use the class compendium directly. The one thing players
// get is summon placement (summons.mjs).
// See docs/npc-forge-phase2.md in the Chrab Compendium repo.

import { relinkWorldActivityMacros } from './activityMacros.mjs'
import { ConfigApp, SyncApp } from './apps.mjs'
import { syncOnLoad, watchCharacters } from './characters.mjs'
import { checkClassPack } from './classes.mjs'
import { DEFAULT_FOLDER, DEFAULT_ITEM_FOLDER, MODULE_ID } from './constants.mjs'
import { checkQueue, state } from './queue.mjs'
import { setupSummons } from './summons.mjs'

Hooks.once('init', () => {
  // World-scoped settings are readable by every connected client, so nothing
  // secret goes here - just which campaign this world belongs to.
  game.settings.register(MODULE_ID, 'campaignId', {
    scope: 'world',
    config: false,
    type: String,
    default: '',
  })
  game.settings.register(MODULE_ID, 'folderName', {
    name: 'NPC folder',
    hint: 'Actors folder new NPCs from the Compendium are created in.',
    scope: 'world',
    config: true,
    type: String,
    default: DEFAULT_FOLDER,
  })
  game.settings.register(MODULE_ID, 'itemFolderName', {
    name: 'Feature folder',
    hint: 'Items folder new features and spells from the Compendium Feature Forge are created in.',
    scope: 'world',
    config: true,
    type: String,
    default: DEFAULT_ITEM_FOLDER,
  })
  // When the class compendium was last synced (the class pack's generatedAt).
  game.settings.register(MODULE_ID, 'classPackSynced', {
    scope: 'world',
    config: false,
    type: String,
    default: '',
  })
  game.settings.register(MODULE_ID, 'checkOnLogin', {
    name: 'Check for NPCs, features and class updates when a GM logs in',
    hint: 'Shows a notification when NPCs or features are waiting in the Compendium queue, or the Compendium has published class changes this world hasn’t synced.',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true,
  })
  game.settings.register(MODULE_ID, 'syncCharacters', {
    name: 'Sync player characters to the Compendium',
    hint: 'When a signed-in GM loads the world, and shortly after any change while playing, push player character sheets and gold to their Compendium pages. Only characters already imported on the site are updated. Shop trades are never settled automatically.',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true,
  })
  game.settings.registerMenu(MODULE_ID, 'account', {
    name: 'Chrab Sync account & campaign',
    label: 'Open',
    hint: 'Sign in with the sync account (kept in this browser only) and pick which Compendium campaign this world belongs to.',
    icon: 'fa-solid fa-link',
    type: ConfigApp,
    restricted: true,
  })
})

// Summon range ring and "one at a time" summons: every user, players included.
Hooks.once('ready', () => setupSummons())

Hooks.once('ready', () => {
  if (!game.user.isGM) return
  relinkWorldActivityMacros()
    .then((fixed) => fixed && ui.notifications.info(`Chrab Sync: reconnected the scripts on ${fixed} item${fixed === 1 ? '' : 's'}.`))
    .catch((err) => console.warn(`${MODULE_ID} | relink failed`, err))
  watchCharacters()
  syncOnLoad().catch((err) => {
    console.warn(`${MODULE_ID} |`, err)
    ui.notifications.warn(`Chrab Sync: ${err.message}`)
  })
  if (!game.settings.get(MODULE_ID, 'checkOnLogin')) return
  checkQueue({ notify: true }).catch((err) => {
    console.warn(`${MODULE_ID} |`, err)
    ui.notifications.warn(`Chrab Sync: ${err.message}`)
  })
  checkClassPack({ notify: true }).catch((err) => console.warn(`${MODULE_ID} | class pack check failed`, err))
})

// A "Chrab Sync" button in the Actors and Items sidebar headers, each opening
// its own tab. On v13+ the hook hands over a plain HTMLElement; older versions
// passed jQuery.
function addSyncButton(html, count, tab) {
  if (!game.user.isGM) return
  const root = html instanceof HTMLElement ? html : html?.[0]
  if (!root || root.querySelector('.chrab-sync-open')) return
  const host = root.querySelector('.header-actions') ?? root.querySelector('.directory-header')
  if (!host) return
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'chrab-sync-open'
  button.innerHTML = `<i class="fa-solid fa-cloud-arrow-down"></i> Chrab Sync${count ? ` (${count})` : ''}`
  button.addEventListener('click', () => SyncApp.open({ tab }))
  host.append(button)
}

// An automation's "Show a pop-up" step (the Compendium's Automation Builder):
// whoever rolled sees it right away; the character's players and the GM get a
// whisper flagged chrab-sync.popup, shown here as a pop-up too. Only for the
// users it's whispered to (a GM sees every whisper).
Hooks.on('createChatMessage', (message) => {
  const text = message.flags?.[MODULE_ID]?.popup
  if (!text || message.author?.id === game.user.id || !(message.whisper ?? []).includes(game.user.id)) return
  const who = message.speaker?.alias || message.author?.name || 'A player'
  ui.notifications.warn(`${who}: ${text}`)
})

Hooks.on('renderActorDirectory', (app, html) => addSyncButton(html, state.queued, 'npcs'))
Hooks.on('renderItemDirectory', (app, html) => addSyncButton(html, state.queuedItems, 'items'))
Hooks.on('renderCompendiumDirectory', (app, html) => addSyncButton(html, 0, 'classes'))
