import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useMaps } from '../hooks/useMaps'
import { useCampaignContext } from '../contexts/CampaignContext'
import { getWorldHeroImageUrl } from '../lib/worldStorage'
import MapWithRegions from '../components/MapWithRegions'

export default function WorldMapPage() {
  const { slug } = useParams()
  const { campaigns, campaignId, setCampaignId, setWorldId } = useCampaignContext()
  const [world, setWorld] = useState(null)
  const [loading, setLoading] = useState(true)
  const [mapId, setMapId] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    supabase
      .from('worlds')
      .select('*')
      .eq('slug', slug)
      .single()
      .then(({ data }) => {
        if (!cancelled) {
          setWorld(data ?? null)
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [slug])

  // Just landing on a world's page registers it as the session's active
  // world — locations/People/Search then auto-filter to it even before a
  // specific campaign is picked below.
  useEffect(() => {
    if (world) setWorldId(world.id)
    // Only world?.id, not setWorldId: that function is recreated on every
    // CampaignProvider render (it's not memoized), and depending on it here
    // would loop — calling it updates provider state, which re-renders the
    // provider, which recreates setWorldId, re-triggering this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world?.id])

  // Campaign selection is world-first now: only offer/apply a campaign that
  // actually belongs to this world. If the globally-remembered campaignId
  // is from a different world (e.g. left over from a previous world visit),
  // treat this world's view as "all campaigns" rather than silently
  // filtering maps by a campaign that isn't even listed in the picker.
  const worldCampaigns = world ? campaigns.filter((c) => c.world_id === world.id) : []
  const effectiveCampaignId = worldCampaigns.some((c) => c.id === campaignId) ? campaignId : ''

  const { maps, loading: mapsLoading } = useMaps({
    worldId: world?.id,
    campaignId: effectiveCampaignId || undefined,
  })

  useEffect(() => {
    if (maps.length > 0 && !maps.some((m) => m.id === mapId)) {
      setMapId(maps[0].id)
    }
  }, [maps, mapId])

  if (loading) return <p className="page status-message">Loading...</p>
  if (!world) return <p className="page status-message error">Couldn't find that world.</p>

  const activeMap = maps.find((m) => m.id === mapId)

  return (
    <section className="page-wide single-map-page">
      {world.hero_image_path ? (
        <div
          className="world-map-hero"
          style={{ backgroundImage: `url(${getWorldHeroImageUrl(world.hero_image_path)})` }}
        >
          <div className="world-map-hero-overlay">
            <h1>{world.name}</h1>
            {world.description && <p className="home-tagline">{world.description}</p>}
          </div>
        </div>
      ) : (
        <div className="view-header">
          <h1>{world.name}</h1>
          {world.description && <p className="view-subtitle">{world.description}</p>}
        </div>
      )}

      {worldCampaigns.length > 0 && (
        <div className="map-picker">
          <label>
            Campaign
            <select
              value={effectiveCampaignId}
              onChange={(e) => setCampaignId(e.target.value)}
              aria-label="Filter by campaign"
            >
              <option value="">All campaigns</option>
              {worldCampaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {!mapsLoading && maps.length === 0 && (
        <p className="status-message">No maps have been added for this world yet.</p>
      )}

      {maps.length > 1 && (
        <div className="map-picker">
          <label>
            Timeline
            <select value={mapId} onChange={(e) => setMapId(e.target.value)}>
              {maps.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {activeMap && <MapWithRegions key={activeMap.id} map={activeMap} />}

      <p className="home-guidance">
        <Link to="/">&larr; Back to Worlds</Link>
      </p>
    </section>
  )
}
