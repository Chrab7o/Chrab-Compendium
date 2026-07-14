import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from './AuthContext'

const STORAGE_KEY = 'chrab-corner-campaign-id'
const CampaignContext = createContext(null)

export function CampaignProvider({ children }) {
  const { session, isPlayer } = useAuth()
  const [campaigns, setCampaigns] = useState([])
  const [campaignId, setCampaignIdState] = useState(() => localStorage.getItem(STORAGE_KEY) ?? '')
  const autoApplyTried = useRef(false)

  const reload = useCallback(async () => {
    const { data } = await supabase.from('campaigns').select('*').order('name', { ascending: true })
    setCampaigns(data ?? [])
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  function setCampaignId(id) {
    setCampaignIdState(id)
    if (id) localStorage.setItem(STORAGE_KEY, id)
    else localStorage.removeItem(STORAGE_KEY)
  }

  // The site-wide filter (the nav's campaign picker) doubles as "which
  // campaign am I playing" for a logged-in player — auto-apply theirs once,
  // the first time we see them with nothing already selected. If they own
  // characters in more than one campaign (or none), leave it on "All" and
  // let them pick via the filter instead of guessing.
  useEffect(() => {
    if (!isPlayer || !session || campaignId || autoApplyTried.current) return
    autoApplyTried.current = true
    supabase
      .from('characters')
      .select('campaign_id')
      .eq('owner_id', session.user.id)
      .then(({ data }) => {
        const distinct = [...new Set((data ?? []).map((c) => c.campaign_id).filter(Boolean))]
        if (distinct.length === 1) setCampaignId(distinct[0])
      })
  }, [isPlayer, session, campaignId])

  const campaign = useMemo(
    () => campaigns.find((c) => c.id === campaignId) ?? null,
    [campaigns, campaignId]
  )

  // Selected campaign may not exist yet on first load (still fetching) or may
  // have been deleted — fall back to "All" rather than filtering on a dead id.
  const effectiveCampaignId = campaign ? campaignId : ''

  return (
    <CampaignContext.Provider
      value={{ campaigns, campaignId: effectiveCampaignId, campaign, setCampaignId, reload }}
    >
      {children}
    </CampaignContext.Provider>
  )
}

export function useCampaignContext() {
  return useContext(CampaignContext)
}
