import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useMaps } from '../hooks/useMaps'
import { useMapMarkers } from '../hooks/useMapMarkers'
import { useMapRegions } from '../hooks/useMapRegions'
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

  const { maps, loading: mapsLoading } = useMaps({ worldId: world?.id })

  useEffect(() => {
    // Sorted by name, same as the old "Map" dropdown's default — lands on
    // the world's primary/overview map first; getting to any other map
    // (e.g. a continent within it) now happens by clicking a linked region
    // on the current map instead of picking from a flat list.
    if (maps.length > 0 && !maps.some((m) => m.id === mapId)) {
      setMapId([...maps].sort((a, b) => a.name.localeCompare(b.name))[0].id)
    }
  }, [maps, mapId])

  const activeMap = maps.find((m) => m.id === mapId)

  // For the "nothing for this timeline" fallback message: the full,
  // unfiltered marker/region lists for the active map, so we know both
  // whether the current timeline has anything here, and which other
  // world campaigns do.
  const { markers: activeMapMarkers } = useMapMarkers(activeMap?.id)
  const { regions: activeMapRegions } = useMapRegions(activeMap?.id)
  const hasContentForTimeline =
    activeMapMarkers.some((m) => !m.campaign_id || m.campaign_id === effectiveCampaignId) ||
    activeMapRegions.some((r) => !r.campaign_id || r.campaign_id === effectiveCampaignId)
  const campaignsWithContentHere = worldCampaigns.filter(
    (c) =>
      activeMapMarkers.some((m) => m.campaign_id === c.id) ||
      activeMapRegions.some((r) => r.campaign_id === c.id)
  )

  if (loading) return <p className="page status-message">Loading...</p>
  if (!world) return <p className="page status-message error">Couldn't find that world.</p>

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
            Timeline
            <select
              value={effectiveCampaignId}
              onChange={(e) => setCampaignId(e.target.value)}
              aria-label="Filter by timeline"
            >
              <option value="">All timelines</option>
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

      {activeMap && effectiveCampaignId && !hasContentForTimeline && (
        <p className="status-message">
          Nothing for {worldCampaigns.find((c) => c.id === effectiveCampaignId)?.name} on this map
          yet.
          {campaignsWithContentHere.length > 0 && (
            <>
              {' '}
              Try:{' '}
              {campaignsWithContentHere.map((c, i) => (
                <span key={c.id}>
                  {i > 0 && ', '}
                  <button type="button" className="link-button" onClick={() => setCampaignId(c.id)}>
                    {c.name}
                  </button>
                </span>
              ))}
            </>
          )}
        </p>
      )}

      {activeMap && (
        <MapWithRegions key={activeMap.id} map={activeMap} onNavigateToMap={setMapId} />
      )}

      <p className="home-guidance">
        <Link to="/">&larr; Back to Worlds</Link>
      </p>
    </section>
  )
}
