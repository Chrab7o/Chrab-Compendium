import { MODULE_ID } from './constants.mjs'
import { isSignedIn, rpc } from './supabase.mjs'

// How many NPCs are waiting - shown on the Actors sidebar button.
export const state = { queued: 0 }

// Heartbeat (so the site's "Linked Foundry worlds" panel shows this world is
// alive) + pull this world's campaign queue. Returns the queue entries, or
// an empty list with a human-readable reason when sync isn't set up yet.
export async function checkQueue({ notify = false } = {}) {
  if (!isSignedIn()) return { entries: [], reason: 'Not signed in. Open "Account & campaign" to sign in with the sync account.' }
  const campaignId = game.settings.get(MODULE_ID, 'campaignId')
  if (!campaignId) return { entries: [], reason: 'No campaign picked for this world yet. Open "Account & campaign".' }

  await rpc('sync_heartbeat', {
    p_world_id: game.world.id,
    p_title: game.world.title,
    p_campaign_id: campaignId,
    p_version: game.modules.get(MODULE_ID)?.version ?? '',
  })
  const entries = (await rpc('sync_pull_npcs', { p_campaign_id: campaignId })) ?? []

  const changed = state.queued !== entries.length
  state.queued = entries.length
  if (changed) ui.actors?.render()
  if (notify && entries.length) {
    ui.notifications.info(`Chrab Sync: ${entries.length} NPC${entries.length === 1 ? '' : 's'} waiting from the Compendium. Open Chrab Sync in the Actors tab.`)
  }
  return { entries, reason: null }
}
