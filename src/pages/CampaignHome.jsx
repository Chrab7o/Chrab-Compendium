import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useEffect } from 'react'
import { useCampaignContext } from '../contexts/CampaignContext'
import { useMaps } from '../hooks/useMaps'
import { useMapMarkers } from '../hooks/useMapMarkers'
import { getMapImageUrl } from '../lib/mapStorage'
import MapViewer from '../components/MapViewer'

// A campaign-scoped map, its own component so useMapMarkers (keyed on one
// map id) only ever tracks the map actually being shown.
function CampaignMap({ map }) {
  const { markers } = useMapMarkers(map.id)
  return (
    <MapViewer
      imageUrl={getMapImageUrl(map.image_path)}
      width={map.image_width}
      height={map.image_height}
      markers={markers}
    />
  )
}

// A landing page for one campaign, not a category dump — earlier this
// listed a quick-link card per category with content, but for a world
// organized mostly through nested folders inside one or two categories,
// that card just flattened the whole folder tree into "click here to see
// literally everything," the same "shows all files" problem Home itself
// had. Browsing lives in the top nav (already campaign-scoped once you're
// here, via CampaignContext) and, per-campaign, in that campaign's own map.
export default function CampaignHome() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { campaigns, setCampaignId } = useCampaignContext()
  const { maps, loading: mapsLoading } = useMaps({ campaignId: id, includeGeneral: true })

  const campaign = campaigns.find((c) => c.id === id)

  useEffect(() => {
    setCampaignId(id)
  }, [id, setCampaignId])

  if (campaigns.length > 0 && !campaign) return <Navigate to="/" replace />
  if (!campaign) return <p className="page status-message">Loading...</p>

  return (
    <section className="page-wide campaign-home">
      <div className="home-hero">
        <h1>{campaign.name}</h1>
        {campaign.description && <p className="home-tagline">{campaign.description}</p>}
        <div className="home-actions">
          <button type="button" onClick={() => navigate('/')}>
            Browse Everything
          </button>
        </div>
      </div>

      <p className="home-guidance">
        Use <strong>Maps</strong>, <strong>Locations</strong>, <strong>People</strong>, and{' '}
        <strong>Session Notes</strong> up top — they're already scoped to {campaign.name}.
      </p>

      {!mapsLoading && maps.length > 0 && (
        <div className="home-section">
          <div className="home-section-header">
            <h2>Map</h2>
            <p className="view-subtitle">Click a marker to jump straight to its entry.</p>
          </div>
          <CampaignMap map={maps[0]} />
        </div>
      )}
    </section>
  )
}
