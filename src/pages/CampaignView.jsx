import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useEntries } from '../hooks/useEntries'
import EntryCard from '../components/EntryCard'

export default function CampaignView() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const [campaigns, setCampaigns] = useState([])
  const [campaign, setCampaign] = useState(null)
  const [loadingCampaigns, setLoadingCampaigns] = useState(true)

  useEffect(() => {
    supabase
      .from('campaigns')
      .select('*')
      .order('name', { ascending: true })
      .then(({ data }) => {
        setCampaigns(data ?? [])
        setLoadingCampaigns(false)
      })
  }, [])

  useEffect(() => {
    setCampaign(slug ? campaigns.find((c) => c.slug === slug) ?? null : null)
  }, [slug, campaigns])

  const { entries, loading, error } = useEntries({
    campaignId: campaign?.id,
    includeGeneral: true,
  })

  return (
    <section>
      <div className="view-header">
        <h1>Campaign Info</h1>
        <p className="view-subtitle">Pick your campaign to see lore relevant to your party.</p>
        <select
          value={slug ?? ''}
          onChange={(e) => navigate(e.target.value ? `/campaign/${e.target.value}` : '/campaign')}
        >
          <option value="">Choose a campaign...</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {!loadingCampaigns && campaigns.length === 0 && (
        <p className="status-message">No campaigns have been added yet.</p>
      )}

      {slug && !campaign && !loadingCampaigns && (
        <p className="status-message error">Couldn't find that campaign.</p>
      )}

      {campaign && (
        <>
          {campaign.description && <p className="campaign-description">{campaign.description}</p>}
          {loading && <p className="status-message">Loading...</p>}
          {error && <p className="status-message error">{error}</p>}
          {!loading && !error && entries.length === 0 && (
            <p className="status-message">Nothing here yet.</p>
          )}
          <div className="entry-grid">
            {entries.map((entry) => (
              <EntryCard key={entry.id} entry={entry} />
            ))}
          </div>
        </>
      )}
    </section>
  )
}
