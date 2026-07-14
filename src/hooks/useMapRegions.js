import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export function useMapRegions(mapId) {
  const [regions, setRegions] = useState([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!mapId) {
      setRegions([])
      setLoading(false)
      return
    }
    setLoading(true)
    const { data } = await supabase.from('map_regions').select('*').eq('map_id', mapId)
    setRegions(data ?? [])
    setLoading(false)
  }, [mapId])

  useEffect(() => {
    reload()
  }, [reload])

  return { regions, loading, reload }
}
