import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { useCampaignContext } from '../contexts/CampaignContext'
import { useImpersonation } from '../contexts/ImpersonationContext'

// Resolves "the character belonging to the current viewer" — the logged-in
// player's own character for the selected campaign, or (for a DM) whichever
// character they've started impersonating. Centralizes the lookup that used
// to be copy-pasted near-verbatim across MyCharacter.jsx and MySkillTree.jsx.
// Returns characterId: undefined while loading, null if none found.
export function useMyCharacter() {
  const { session } = useAuth()
  const { campaignId } = useCampaignContext()
  const { impersonating } = useImpersonation()
  const [characterId, setCharacterId] = useState(undefined)

  useEffect(() => {
    if (impersonating) {
      setCharacterId(impersonating.characterId)
      return
    }
    if (!session) {
      setCharacterId(null)
      return
    }
    let cancelled = false
    setCharacterId(undefined)
    let query = supabase.from('characters').select('id').eq('owner_id', session.user.id)
    query = campaignId ? query.eq('campaign_id', campaignId) : query.is('campaign_id', null)
    query.maybeSingle().then(({ data }) => {
      if (!cancelled) setCharacterId(data?.id ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [session, campaignId, impersonating])

  return { characterId, impersonating }
}
