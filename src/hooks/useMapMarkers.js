import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export function useMapMarkers(mapId) {
  const [markers, setMarkers] = useState([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!mapId) {
      setMarkers([])
      setLoading(false)
      return
    }
    setLoading(true)
    const { data } = await supabase.from('map_markers').select('*').eq('map_id', mapId)
    setMarkers(data ?? [])
    setLoading(false)
  }, [mapId])

  useEffect(() => {
    reload()
  }, [reload])

  return { markers, loading, reload }
}
