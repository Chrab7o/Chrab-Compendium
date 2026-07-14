import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useMaps } from '../hooks/useMaps'
import { getWorldHeroImageUrl } from '../lib/worldStorage'
import MapWithRegions from '../components/MapWithRegions'

export default function WorldMapPage() {
  const { slug } = useParams()
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

  const { maps, loading: mapsLoading } = useMaps({ worldId: world?.id })

  useEffect(() => {
    if (maps.length > 0 && !maps.some((m) => m.id === mapId)) {
      setMapId(maps[0].id)
    }
  }, [maps, mapId])

  if (loading) return <p className="page status-message">Loading...</p>
  if (!world) return <p className="page status-message error">Couldn't find that world.</p>

  const activeMap = maps.find((m) => m.id === mapId)

  return (
    <section className="page-wide world-map-page">
      <div
        className="world-map-hero"
        style={
          world.hero_image_path
            ? { backgroundImage: `url(${getWorldHeroImageUrl(world.hero_image_path)})` }
            : undefined
        }
      >
        <div className="world-map-hero-overlay">
          <h1>{world.name}</h1>
          {world.description && <p className="home-tagline">{world.description}</p>}
        </div>
      </div>

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
        <Link to="/">&larr; Back to Home</Link>
      </p>
    </section>
  )
}
