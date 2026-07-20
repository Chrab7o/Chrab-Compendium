import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

// Maps are scoped to a world only now — a map is shared by every
// campaign/era in its world, with campaign-specific content living on the
// individual markers/regions instead (see MapWithRegions.jsx).
export function useMaps({ worldId } = {}) {
  const [maps, setMaps] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      let query = supabase.from('maps').select('*').order('name', { ascending: true })
      if (worldId) query = query.eq('world_id', worldId)

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
  }, [worldId])

  return { maps, loading }
}
