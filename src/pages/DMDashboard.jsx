import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import CampaignManager from '../components/dm/CampaignManager'
import EntryManager from '../components/dm/EntryManager'

export default function DMDashboard() {
  const [campaigns, setCampaigns] = useState([])
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: campaignData }, { data: entryData }] = await Promise.all([
      supabase.from('campaigns').select('*').order('name', { ascending: true }),
      supabase.from('entries').select('*').order('title', { ascending: true }),
    ])
    setCampaigns(campaignData ?? [])
    setEntries(entryData ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (loading) return <p className="status-message">Loading...</p>

  return (
    <section className="dm-dashboard">
      <h1>DM Dashboard</h1>
      <p className="view-subtitle">
        Everything here is only visible to you. Public visitors only ever see entries marked
        "Public".
      </p>
      <CampaignManager campaigns={campaigns} onChange={load} />
      <EntryManager entries={entries} campaigns={campaigns} onChange={load} />
    </section>
  )
}
