import { Link } from 'react-router-dom'
import { useMaps } from '../hooks/useMaps'
import { useCampaignContext } from '../contexts/CampaignContext'

export default function MapsView() {
  const { campaigns, campaign, campaignId, world, worldId } = useCampaignContext()
  const { maps, loading } = useMaps({
    campaignId: campaignId || undefined,
    worldId: worldId || undefined,
    campaigns,
    includeGeneral: true,
  })
  const scopeName = campaign?.name ?? world?.name

  return (
    <section className="page">
      <div className="view-header">
        <h1>{scopeName ? `${scopeName} Maps` : 'Maps'}</h1>
        <p className="view-subtitle">Click a map, then click a marker to jump to its entry.</p>
      </div>

      {loading && <p className="status-message">Loading...</p>}
      {!loading && maps.length === 0 && <p className="status-message">No maps yet.</p>}

      <div className="entry-grid">
        {maps.map((map) => (
          <Link key={map.id} to={`/map/${map.slug}`} className="entry-card">
            <h3>{map.name}</h3>
          </Link>
        ))}
      </div>
    </section>
  )
}
