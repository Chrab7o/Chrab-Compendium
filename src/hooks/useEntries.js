import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

// Fetches entries for a view. RLS on the entries table already hides
// DM-only rows from anonymous visitors, so the filters here just narrow
// down what the current audience wants to see.
export function useEntries({ campaignId, includeGeneral = true, category } = {}) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      let query = supabase.from('entries').select('*').order('title', { ascending: true })

      if (category) {
        query = query.eq('category', category)
      }

      if (campaignId) {
        query = includeGeneral
          ? query.or(`campaign_id.eq.${campaignId},campaign_id.is.null`)
          : query.eq('campaign_id', campaignId)
      } else if (campaignId === null && !includeGeneral) {
        query = query.is('campaign_id', null)
      }

      const { data, error: fetchError } = await query
      if (cancelled) return

      if (fetchError) {
        setError(fetchError.message)
      } else {
        setEntries(data ?? [])
        setError(null)
      }
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [campaignId, includeGeneral, category])

  return { entries, loading, error }
}
