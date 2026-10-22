// Pushing player character sheets to the Compendium - the automatic version
// of the party-export macro + site import. GM only, like everything here.
//
// - On load: every player character whose sheet changed since this browser
//   last pushed it.
// - While playing: a character is pushed PUSH_DELAY after its first change
//   (not after the last one, so constant HP ticks in combat can't postpone
//   it forever).
// - Sync & settle (SyncApp): the DM has applied pending shop trades in
//   Foundry; push that character and mark exactly those trades settled.
//
// Automatic pushes never settle trades: they can't know whether a trade was
// applied in Foundry yet, and settling an unapplied one would lose it.
//
// Matching is by actor id on the server. Characters the site doesn't have yet
// come back 'unmatched' - import those once through the site's importer.

import { MODULE_ID } from './constants.mjs'
import { isSignedIn, rpc } from './supabase.mjs'

const PUSH_DELAY = 30_000
const HASH_KEY = `${MODULE_ID}.pushed`

// Last run, for the SyncApp: { at, counts: { updated, unchanged, unmatched, failed }, unmatched: [names] }
export const characterState = { last: null }

export function partyActors() {
  return game.actors.filter((a) => a.type === 'character' && a.hasPlayerOwner)
}

// actor id -> hash of what this browser last pushed, so a reload doesn't
// re-upload every unchanged sheet (they're several hundred KB each).
function readHashes() {
  try {
    return JSON.parse(localStorage.getItem(HASH_KEY)) ?? {}
  } catch {
    return {}
  }
}

function writeHash(actorId, hash) {
  try {
    localStorage.setItem(HASH_KEY, JSON.stringify({ ...readHashes(), [actorId]: hash }))
  } catch {
    // Only an optimisation - the server skips identical sheets anyway.
  }
}

async function hashOf(text) {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Pushes one actor. Returns 'updated' | 'unchanged' | 'unmatched' | 'skipped'.
export async function pushCharacter(actor, { force = false, settleTradeIds = [] } = {}) {
  const data = actor.toObject()
  const hash = await hashOf(JSON.stringify(data))
  if (!force && !settleTradeIds.length && readHashes()[actor.id] === hash) return 'skipped'
  const result = await rpc('sync_push_character', { p_actor: data, p_settle_trade_ids: settleTradeIds })
  // An unmatched sheet isn't stored anywhere, so it's retried next time.
  if (result !== 'unmatched') writeHash(actor.id, hash)
  return result
}

// One at a time, to keep each request to a single sheet.
export async function pushCharacters(actors = partyActors(), { force = false } = {}) {
  const counts = { updated: 0, unchanged: 0, unmatched: 0, failed: 0 }
  const unmatched = []
  for (const actor of actors) {
    try {
      const result = await pushCharacter(actor, { force })
      counts[result === 'skipped' ? 'unchanged' : result]++
      if (result === 'unmatched') unmatched.push(actor.name)
    } catch (err) {
      counts.failed++
      console.warn(`${MODULE_ID} | couldn't push ${actor.name}`, err)
    }
  }
  characterState.last = { at: new Date(), counts, unmatched }
  return characterState.last
}

export function pendingTrades() {
  return rpc('sync_pending_trades')
}

function autoSyncOn() {
  return game.user.isGM && game.settings.get(MODULE_ID, 'syncCharacters') && isSignedIn()
}

export async function syncOnLoad() {
  if (!autoSyncOn()) return
  const { counts } = await pushCharacters()
  if (counts.failed) ui.notifications.warn(`Chrab Sync: ${counts.failed} character sheet${counts.failed === 1 ? '' : 's'} failed to sync. See the console (F12).`)
}

const dirty = new Set()
let timer = null

async function flush() {
  timer = null
  const actors = [...dirty].map((id) => game.actors.get(id)).filter(Boolean)
  dirty.clear()
  if (!autoSyncOn() || !actors.length) return
  await pushCharacters(actors)
}

function actorOf(doc) {
  if (doc instanceof Actor) return doc
  return doc?.actor ?? (doc?.parent instanceof Actor ? doc.parent : doc?.parent?.actor) ?? null
}

function markDirty(doc) {
  const actor = actorOf(doc)
  if (!actor || actor.type !== 'character' || !actor.hasPlayerOwner || !autoSyncOn()) return
  dirty.add(actor.id)
  timer ??= setTimeout(() => flush().catch((err) => console.warn(`${MODULE_ID} |`, err)), PUSH_DELAY)
}

// Sheet changes arrive as changes to the actor or to its embedded items and
// effects (an effect may sit on an item, hence actorOf's second hop).
export function watchCharacters() {
  for (const hook of ['updateActor', 'createItem', 'updateItem', 'deleteItem', 'createActiveEffect', 'updateActiveEffect', 'deleteActiveEffect']) {
    Hooks.on(hook, markDirty)
  }
}
