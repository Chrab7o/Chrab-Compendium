import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useCampaignContext } from '../contexts/CampaignContext'
import { useMaps } from '../hooks/useMaps'
import { useMapMarkers } from '../hooks/useMapMarkers'
import { getMapImageUrl } from '../lib/mapStorage'
import MapViewer from '../components/MapViewer'
import EntrySearch from '../components/EntrySearch'

// The primary map for the current General/Campaign scope — its own small
// component so useMapMarkers (keyed on one map id) only ever tracks the map
// actually being shown, not every map useMaps returned.
function PrimaryMap({ map }) {
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

export default function Home() {
  const navigate = useNavigate()
  const location = useLocation()
  const { session, isPlayer } = useAuth()
  const { campaigns, campaignId, campaign, setCampaignId } = useCampaignContext()
  const { maps, loading: mapsLoading } = useMaps({ campaignId: campaignId || undefined, includeGeneral: true })
  // A campaign quick-link card (CampaignHome) navigates here with a target
  // category in router state, so following it lands pre-filtered instead of
  // dumping the visitor into an unfiltered search.
  const [initialCategory, setInitialCategory] = useState(location.state?.category ?? null)

  useEffect(() => {
    if (location.state?.category) setInitialCategory(location.state.category)
  }, [location.state])

  return (
    <section className="page-wide home-page">
      <div className="home-hero">
        <h1>Chrab Corner</h1>
        <p className="home-tagline">
          {campaign
            ? `Browsing ${campaign.name} lore.`
            : 'World lore, characters, maps, and secrets — everything for the table, in one place.'}
        </p>
        <div className="home-actions">
          <button type="button" onClick={() => navigate('/maps')}>
            View Maps
          </button>
          {!session && (
            <button type="button" className="secondary" onClick={() => navigate('/login')}>
              Login
            </button>
          )}
          {isPlayer && (
            <button type="button" className="secondary" onClick={() => navigate('/character')}>
              My Character
            </button>
          )}
        </div>
      </div>

      {campaigns.length > 0 && (
        <div className="home-scope-picker">
          <span className="home-scope-label">Viewing:</span>
          <div className="home-campaign-picker">
            <button
              type="button"
              className={campaignId ? 'chip' : 'chip active'}
              onClick={() => setCampaignId('')}
            >
              General
            </button>
            {campaigns.map((c) => (
              <button
                key={c.id}
                type="button"
                className={campaignId === c.id ? 'chip active' : 'chip'}
                onClick={() => setCampaignId(c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {!mapsLoading && maps.length > 0 && (
        <div className="home-section">
          <div className="home-section-header">
            <h2>Map</h2>
            <p className="view-subtitle">Click a marker to jump straight to its entry.</p>
          </div>
          <PrimaryMap map={maps[0]} />
          {maps.length > 1 && (
            <p className="home-more-maps">
              {maps.length - 1} more map{maps.length - 1 > 1 ? 's' : ''} —{' '}
              <Link to="/maps">see all maps</Link>
            </p>
          )}
        </div>
      )}

      <div className="home-section">
        <div className="home-section-header">
          <h2>Browse</h2>
        </div>
        <EntrySearch initialCategory={initialCategory} />
      </div>
    </section>
  )
}
