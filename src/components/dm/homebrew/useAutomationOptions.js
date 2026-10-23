import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'

// Feature Forge features a class or subclass feature can be linked to, for
// RepeatableRows' "Foundry automation" picker. Spells are left out: a class
// feature's automation is a feature item.
export function useAutomationOptions() {
  const [options, setOptions] = useState([])
  useEffect(() => {
    let cancelled = false
    supabase
      .from('feature_drafts')
      .select('id, name')
      .eq('kind', 'feat')
      .order('name')
      .then(({ data }) => {
        if (!cancelled) setOptions(data ?? [])
      })
    return () => {
      cancelled = true
    }
  }, [])
  return options
}
