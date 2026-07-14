import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export function useMaps({ campaignId, includeGeneral = true, worldId } = {}) {
  const [maps, setMaps] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      let query = supabase.from('maps').select('*').order('name', { ascending: true })

      if (campaignId) {
        query = includeGeneral
          ? query.or(`campaign_id.eq.${campaignId},campaign_id.is.null`)
          : query.eq('campaign_id', campaignId)
      }
      if (worldId) {
        query = query.eq('world_id', worldId)
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
  }, [campaignId, includeGeneral, worldId])

  return { maps, loading }
}
