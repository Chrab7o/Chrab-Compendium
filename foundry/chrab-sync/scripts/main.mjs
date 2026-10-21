// Chrab Sync: pulls NPCs built in the Chrab Compendium's NPC Forge into this
// world. Everything here runs for GMs only - players' browsers register the
// settings (Foundry requires it) and then do nothing.
// See docs/npc-forge-phase2.md in the Chrab Compendium repo.

import { ConfigApp, SyncApp } from './apps.mjs'
import { DEFAULT_FOLDER, MODULE_ID } from './constants.mjs'
import { checkQueue, state } from './queue.mjs'

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
  game.settings.register(MODULE_ID, 'checkOnLogin', {
    name: 'Check for NPCs when a GM logs in',
    hint: 'Shows a notification when NPCs are waiting in the Compendium queue.',
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

Hooks.once('ready', () => {
  if (!game.user.isGM) return
  if (!game.settings.get(MODULE_ID, 'checkOnLogin')) return
  checkQueue({ notify: true }).catch((err) => {
    console.warn(`${MODULE_ID} |`, err)
    ui.notifications.warn(`Chrab Sync: ${err.message}`)
  })
})

// A "Chrab Sync" button in the Actors sidebar header. On v13+ the hook hands
// over a plain HTMLElement; older versions passed jQuery.
Hooks.on('renderActorDirectory', (app, html) => {
  if (!game.user.isGM) return
  const root = html instanceof HTMLElement ? html : html?.[0]
  if (!root || root.querySelector('.chrab-sync-open')) return
  const host = root.querySelector('.header-actions') ?? root.querySelector('.directory-header')
  if (!host) return
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'chrab-sync-open'
  button.innerHTML = `<i class="fa-solid fa-cloud-arrow-down"></i> Chrab Sync${state.queued ? ` (${state.queued})` : ''}`
  button.addEventListener('click', () => SyncApp.open())
  host.append(button)
})
