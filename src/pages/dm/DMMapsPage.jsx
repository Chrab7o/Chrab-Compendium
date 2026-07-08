import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useCampaignContext } from '../../contexts/CampaignContext'
import MapManager from '../../components/dm/MapManager'
import MapMarkerEditor from '../../components/dm/MapMarkerEditor'

export default function DMMapsPage() {
  const { campaigns } = useCampaignContext()
  const [maps, setMaps] = useState([])
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: mapData }, { data: entryData }] = await Promise.all([
      supabase.from('maps').select('*').order('name', { ascending: true }),
      supabase.from('entries').select('id, title').order('title', { ascending: true }),
    ])
    setMaps(mapData ?? [])
    setEntries(entryData ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (loading) return <p className="status-message">Loading...</p>

  return (
    <section className="page">
      <div className="view-header">
        <h1>Maps</h1>
      </div>
      <MapManager maps={maps} campaigns={campaigns} onChange={load} />
      <MapMarkerEditor maps={maps} entries={entries} />
    </section>
  )
}
