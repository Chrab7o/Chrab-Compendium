import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { useCampaignContext } from '../contexts/CampaignContext'
import SkillTreeProgress from '../components/SkillTreeProgress'

export default function MySkillTree() {
  const { session } = useAuth()
  const { campaignId } = useCampaignContext()
  const [characterId, setCharacterId] = useState(undefined)

  useEffect(() => {
    let cancelled = false
    let query = supabase.from('characters').select('id').eq('owner_id', session.user.id)
    query = campaignId ? query.eq('campaign_id', campaignId) : query.is('campaign_id', null)
    query.maybeSingle().then(({ data }) => {
      if (!cancelled) setCharacterId(data?.id ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [session.user.id, campaignId])

  if (characterId === undefined) return <p className="page status-message">Loading...</p>
  if (characterId === null) {
    return (
      <p className="page status-message">
        No character found for {campaignId ? 'the selected campaign' : 'general (no campaign selected)'}
        . Ask your DM to assign one first.
      </p>
    )
  }

  return (
    <section className="page">
      <div className="view-header">
        <h1>Skill Tree</h1>
      </div>
      <SkillTreeProgress characterId={characterId} editable />
    </section>
  )
}
