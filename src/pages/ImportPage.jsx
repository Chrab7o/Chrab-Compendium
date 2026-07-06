import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import FoundryImporter from '../components/dm/import/FoundryImporter'
import ObsidianImporter from '../components/dm/import/ObsidianImporter'
import ResetEntriesPanel from '../components/dm/import/ResetEntriesPanel'

export default function ImportPage() {
  const [campaigns, setCampaigns] = useState([])

  useEffect(() => {
    supabase
      .from('campaigns')
      .select('*')
      .order('name', { ascending: true })
      .then(({ data }) => setCampaigns(data ?? []))
  }, [])

  return (
    <section className="page">
      <div className="view-header">
        <h1>Import</h1>
        <p className="view-subtitle">Bring in character sheets and notes from other tools.</p>
      </div>
      <FoundryImporter campaigns={campaigns} />
      <ResetEntriesPanel />
      <ObsidianImporter campaigns={campaigns} />
    </section>
  )
}
