import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { useCampaignContext } from '../contexts/CampaignContext'

export default function MyCharacter() {
  const { session } = useAuth()
  const { campaignId } = useCampaignContext()
  const [characterId, setCharacterId] = useState(undefined) // undefined = loading, null = none found

  useEffect(() => {
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
  }, [session.user.id, campaignId])

  if (characterId === undefined)
    return (
      <p className="page status-message">Loading...</p>
    )
  if (characterId) return <Navigate to={`/character/${characterId}`} replace />

  return (
    <p className="page status-message">
      No character found for{' '}
      {campaignId ? 'the selected campaign' : 'general (no campaign selected)'}. Ask your DM to
      import or assign one, or pick a different campaign from the picker above.
    </p>
  )
}
