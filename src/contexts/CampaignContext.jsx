import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const STORAGE_KEY = 'chrab-corner-campaign-id'
const CampaignContext = createContext(null)

export function CampaignProvider({ children }) {
  const [campaigns, setCampaigns] = useState([])
  const [campaignId, setCampaignIdState] = useState(() => localStorage.getItem(STORAGE_KEY) ?? '')

  useEffect(() => {
    supabase
      .from('campaigns')
      .select('*')
      .order('name', { ascending: true })
      .then(({ data }) => setCampaigns(data ?? []))
  }, [])

  function setCampaignId(id) {
    setCampaignIdState(id)
    if (id) localStorage.setItem(STORAGE_KEY, id)
    else localStorage.removeItem(STORAGE_KEY)
  }

  const campaign = useMemo(
    () => campaigns.find((c) => c.id === campaignId) ?? null,
    [campaigns, campaignId]
  )

  // Selected campaign may not exist yet on first load (still fetching) or may
  // have been deleted — fall back to "All" rather than filtering on a dead id.
  const effectiveCampaignId = campaign ? campaignId : ''

  return (
    <CampaignContext.Provider
      value={{ campaigns, campaignId: effectiveCampaignId, campaign, setCampaignId }}
    >
      {children}
    </CampaignContext.Provider>
  )
}

export function useCampaignContext() {
  return useContext(CampaignContext)
}
