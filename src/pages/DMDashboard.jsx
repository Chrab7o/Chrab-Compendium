import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import CampaignManager from '../components/dm/CampaignManager'
import CategoryManager from '../components/dm/CategoryManager'
import CategoryBrowser from '../components/CategoryBrowser'
import MapManager from '../components/dm/MapManager'
import MapMarkerEditor from '../components/dm/MapMarkerEditor'
import PlayerNotesViewer from '../components/dm/PlayerNotesViewer'
import CharacterManager from '../components/dm/CharacterManager'

export default function DMDashboard() {
  const [campaigns, setCampaigns] = useState([])
  const [entries, setEntries] = useState([])
  const [maps, setMaps] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: campaignData }, { data: entryData }, { data: mapData }] = await Promise.all([
      supabase.from('campaigns').select('*').order('name', { ascending: true }),
      supabase.from('entries').select('*').order('title', { ascending: true }),
      supabase.from('maps').select('*').order('name', { ascending: true }),
    ])
    setCampaigns(campaignData ?? [])
    setEntries(entryData ?? [])
    setMaps(mapData ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (loading) return <p className="status-message">Loading...</p>

  return (
    <section className="page dm-dashboard">
      <h1>DM Dashboard</h1>
      <p className="view-subtitle">
        Everything here is only visible to you. Public visitors only ever see entries marked
        "Public".
      </p>
      <CampaignManager campaigns={campaigns} onChange={load} />
      <CategoryManager />
      <div className="dm-panel">
        <h2>Folders &amp; Entries</h2>
        <p className="view-subtitle">
          Browse, organize, and add entries within any category's folder tree — same tool as
          General, without leaving the dashboard.
        </p>
        <CategoryBrowser compact />
      </div>
      <MapManager maps={maps} campaigns={campaigns} onChange={load} />
      <MapMarkerEditor maps={maps} entries={entries} />
      <CharacterManager campaigns={campaigns} />
      <PlayerNotesViewer campaigns={campaigns} />
    </section>
  )
}
