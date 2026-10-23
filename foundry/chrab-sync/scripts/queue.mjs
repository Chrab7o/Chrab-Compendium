import { MODULE_ID } from './constants.mjs'
import { isSignedIn, rpc } from './supabase.mjs'

// How many NPCs / Feature Forge items are waiting - shown on the Actors and
// Items sidebar buttons.
export const state = { queued: 0, queuedItems: 0 }

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

// Heartbeat (so the site's "Linked Foundry worlds" panel shows this world is
// alive) + pull this world's campaign queues. Returns the queue entries, or
// empty lists with a human-readable reason when sync isn't set up yet.
export async function checkQueue({ notify = false } = {}) {
  if (!isSignedIn()) return { entries: [], features: [], reason: 'Not signed in. Open "Account & campaign" to sign in with the sync account.' }
  const campaignId = game.settings.get(MODULE_ID, 'campaignId')
  if (!campaignId) return { entries: [], features: [], reason: 'No campaign picked for this world yet. Open "Account & campaign".' }

  await rpc('sync_heartbeat', {
    p_world_id: game.world.id,
    p_title: game.world.title,
    p_campaign_id: campaignId,
    p_version: game.modules.get(MODULE_ID)?.version ?? '',
  })
  const entries = (await rpc('sync_pull_npcs', { p_campaign_id: campaignId })) ?? []
  // Older databases don't have the Feature Forge yet; NPCs keep working.
  let features = []
  try {
    features = (await rpc('sync_pull_features', { p_campaign_id: campaignId })) ?? []
  } catch (err) {
    console.warn(`${MODULE_ID} | feature queue unavailable`, err)
  }

  const changed = state.queued !== entries.length || state.queuedItems !== features.length
  state.queued = entries.length
  state.queuedItems = features.length
  if (changed) {
    ui.actors?.render()
    ui.items?.render()
  }
  if (notify && (entries.length || features.length)) {
    const parts = [entries.length && plural(entries.length, 'NPC'), features.length && plural(features.length, 'feature')].filter(Boolean)
    ui.notifications.info(`Chrab Sync: ${parts.join(' and ')} waiting from the Compendium. Open Chrab Sync in the Actors or Items tab.`)
  }
  return { entries, features, reason: null }
}
