import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import MapWithRegions from '../components/MapWithRegions'

export default function MapDetail() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const [map, setMap] = useState(null)
  const [loading, setLoading] = useState(true)

  // A linked region gives us the target map's id, but this page is routed
  // by slug — look it up and navigate there.
  async function handleNavigateToMap(targetMapId) {
    const { data } = await supabase.from('maps').select('slug').eq('id', targetMapId).single()
    if (data) navigate(`/map/${data.slug}`)
  }

  useEffect(() => {
    let cancelled = false
    supabase
      .from('maps')
      .select('*')
      .eq('slug', slug)
      .single()
      .then(({ data }) => {
        if (!cancelled) {
          setMap(data ?? null)
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [slug])

  if (loading) return <p className="status-message">Loading...</p>
  if (!map) return <p className="status-message error">Couldn't find that map.</p>

  return (
    <section className="page-wide single-map-page">
      <Link to="/maps" className="back-link">
        &larr; Back to maps
      </Link>
      <div className="view-header">
        <h1>{map.name}</h1>
      </div>
      <MapWithRegions map={map} onNavigateToMap={handleNavigateToMap} />
    </section>
  )
}
