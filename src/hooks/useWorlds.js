import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export function useWorlds() {
  const [worlds, setWorlds] = useState([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('worlds').select('*').order('name', { ascending: true })
    setWorlds(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  return { worlds, loading, reload }
}
