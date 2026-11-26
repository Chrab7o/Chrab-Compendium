import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { campaignTagValue } from '../lib/tags'

// The tag that makes an entry a campaign's home page: the quick-start page the
// world page shows for that campaign. Which campaign is the entry's own
// (campaign_id) or any campaign whose mirror tag it carries. Seeded by the
// campaign_home_tag migration.
export const HOME_PAGE_TAG = 'home-page'

// Home-page entries for the given campaigns, as a Map of campaign id -> entry.
// If a campaign has more than one, the most recently updated wins. RLS
// already hides DM-only entries from players, so a DM-only home page simply
// doesn't show for them.
export function useCampaignHomes(campaigns) {
  const [homes, setHomes] = useState(() => new Map())
  const key = campaigns.map((c) => c.id).join(',')

  useEffect(() => {
    if (!key) {
      setHomes(new Map())
      return
    }
    let cancelled = false
    supabase
      .from('entries')
      .select('*')
      .contains('tags', [HOME_PAGE_TAG])
      .is('parent_entry_id', null)
      .order('updated_at', { ascending: false })
      .then(({ data }) => {
        if (cancelled) return
        const found = new Map()
        for (const id of key.split(',')) {
          const entry = (data ?? []).find(
            (e) => e.campaign_id === id || (e.tags ?? []).includes(campaignTagValue(id))
          )
          if (entry) found.set(id, entry)
        }
        setHomes(found)
      })
    return () => {
      cancelled = true
    }
  }, [key])

  return homes
}
