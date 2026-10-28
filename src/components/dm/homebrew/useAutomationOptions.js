import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'

// Feature Forge features a class or subclass feature can be linked to, for
// FeatureMechanics' "Use an Item Forge item" picker. Spells are left out: a
// class feature's automation is a feature item. `reload` refetches (the
// picker calls it when focused, so a feature made in another tab shows up).
export function useAutomationOptions() {
  const [options, setOptions] = useState([])
  const reload = useCallback(() => {
    supabase
      .from('feature_drafts')
      .select('id, name')
      .eq('kind', 'feat')
      .order('name')
      .then(({ data }) => setOptions(data ?? []))
  }, [])
  useEffect(() => {
    reload()
  }, [reload])
  return { options, reload }
}
