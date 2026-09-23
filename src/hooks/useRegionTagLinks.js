import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

// Per-timeline tag-query overrides for a set of regions (see the tag_groups
// migration) - unfiltered fetch, same pattern as useMapMarkers/useMapRegions;
// resolving which override applies for the active timeline happens in the
// consuming component via effectiveRegionTagQuery().
export function useRegionTagLinks(regionIds) {
  const [links, setLinks] = useState([])
  const key = regionIds.join(',')

  const reload = useCallback(async () => {
    if (regionIds.length === 0) {
      setLinks([])
      return
    }
    const { data } = await supabase.from('region_tag_links').select('*').in('region_id', regionIds)
    setLinks(data ?? [])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => {
    reload()
  }, [reload])

  return { links, reload }
}
