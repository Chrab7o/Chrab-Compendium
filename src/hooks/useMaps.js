import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

// `campaigns` is optional (only needed for the worldId-without-campaignId
// case below) — pass the already-loaded list from useCampaignContext()
// rather than fetching it again here.
export function useMaps({ campaignId, includeGeneral = true, worldId, campaigns = [] } = {}) {
  const [maps, setMaps] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      let query = supabase.from('maps').select('*').order('name', { ascending: true })

      if (campaignId) {
        // A specific campaign always matches on its own — regardless of
        // the map's own world_id column, in case a map's world and
        // campaign were set inconsistently — plus, if includeGeneral,
        // maps with no campaign that belong to the same world.
        if (includeGeneral && worldId) {
          query = query.or(`campaign_id.eq.${campaignId},and(campaign_id.is.null,world_id.eq.${worldId})`)
        } else if (includeGeneral) {
          query = query.or(`campaign_id.eq.${campaignId},campaign_id.is.null`)
        } else {
          query = query.eq('campaign_id', campaignId)
        }
      } else if (worldId) {
        // No specific campaign chosen — "every campaign in this world":
        // maps whose own world_id matches, OR whose campaign belongs to
        // one of this world's campaigns (a map's world_id and its
        // campaign's world_id aren't enforced to agree, so check both).
        const worldCampaignIds = campaigns.filter((c) => c.world_id === worldId).map((c) => c.id)
        query =
          worldCampaignIds.length > 0
            ? query.or(`world_id.eq.${worldId},campaign_id.in.(${worldCampaignIds.join(',')})`)
            : query.eq('world_id', worldId)
      }

      const { data } = await query
      if (!cancelled) {
        setMaps(data ?? [])
        setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [campaignId, includeGeneral, worldId, campaigns])

  return { maps, loading }
}
