import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from './AuthContext'

const STORAGE_KEY = 'chrab-corner-campaign-id'
const WORLD_STORAGE_KEY = 'chrab-corner-world-id'
const CampaignContext = createContext(null)

// Tracks the visitor's whole browsing session scope, not just campaign —
// world and campaign together, since every campaign now belongs to exactly
// one world. Entering a world (WorldMapPage) or picking a specific campaign
// (there, or the nav toggle) both funnel through here, and Locations/
// People/Search read the result to auto-filter without a page-specific
// picker of their own.
export function CampaignProvider({ children }) {
  const { session, isPlayer } = useAuth()
  const [campaigns, setCampaigns] = useState([])
  const [worlds, setWorlds] = useState([])
  const [campaignId, setCampaignIdState] = useState(() => localStorage.getItem(STORAGE_KEY) ?? '')
  const [worldId, setWorldIdState] = useState(() => localStorage.getItem(WORLD_STORAGE_KEY) ?? '')
  const autoApplyTried = useRef(false)

  const reload = useCallback(async () => {
    const { data } = await supabase.from('campaigns').select('*').order('name', { ascending: true })
    setCampaigns(data ?? [])
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  useEffect(() => {
    supabase
      .from('worlds')
      .select('*')
      .order('name', { ascending: true })
      .then(({ data }) => setWorlds(data ?? []))
  }, [])

  // Entering a different world invalidates a campaign selection that
  // belonged to the old one — otherwise the two could point at unrelated
  // worlds, and the "world-wide, no campaign picked" fallback filter
  // (scopedCampaignIds in lib/folders.js) would be filtering by a campaign
  // that isn't even in the newly-selected world.
  function setWorldId(id) {
    setWorldIdState(id)
    if (id) localStorage.setItem(WORLD_STORAGE_KEY, id)
    else localStorage.removeItem(WORLD_STORAGE_KEY)
    setCampaignIdState((prevCampaignId) => {
      const prevCampaign = campaigns.find((c) => c.id === prevCampaignId)
      if (prevCampaign && prevCampaign.world_id !== id) {
        localStorage.removeItem(STORAGE_KEY)
        return ''
      }
      return prevCampaignId
    })
  }

  // Picking a specific campaign also enters its world, so the two never
  // disagree — the nav toggle and WorldMapPage's own picker both just call
  // this, they don't need to set world and campaign separately.
  function setCampaignId(id) {
    setCampaignIdState(id)
    if (id) localStorage.setItem(STORAGE_KEY, id)
    else localStorage.removeItem(STORAGE_KEY)
    if (id) {
      const campaign = campaigns.find((c) => c.id === id)
      if (campaign) setWorldId(campaign.world_id)
    }
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
  const world = useMemo(() => worlds.find((w) => w.id === worldId) ?? null, [worlds, worldId])

  // Selected campaign/world may not exist yet on first load (still
  // fetching) or may have been deleted — fall back to "All"/none rather
  // than filtering on a dead id.
  const effectiveCampaignId = campaign ? campaignId : ''
  const effectiveWorldId = world ? worldId : ''

  return (
    <CampaignContext.Provider
      value={{
        campaigns,
        campaignId: effectiveCampaignId,
        campaign,
        setCampaignId,
        worlds,
        worldId: effectiveWorldId,
        world,
        setWorldId,
        reload,
      }}
    >
      {children}
    </CampaignContext.Provider>
  )
}

export function useCampaignContext() {
  return useContext(CampaignContext)
}
