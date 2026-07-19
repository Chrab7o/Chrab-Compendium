import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useCampaignContext } from '../contexts/CampaignContext'
import { effectiveEntryCampaignId, effectiveEntryTags, scopedCampaignIds } from '../lib/folders'
import EntryCard from '../components/EntryCard'

// Shared by the Locations/People/Session Notes nav pages — each is just this
// same tag-filtered, session-scoped list with a different tag/title. Not a
// folder/category browse: an entry shows up here purely because it carries
// the matching tag, regardless of where it otherwise lives.
export default function TagView({ tag, title }) {
  const { campaigns, campaign, campaignId, world, worldId } = useCampaignContext()
  const [entries, setEntries] = useState([])
  const [folders, setFolders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      supabase.from('entries').select('*'),
      supabase.from('folders').select('*'),
    ]).then(([{ data: entryData }, { data: folderData }]) => {
      setEntries(entryData ?? [])
      setFolders(folderData ?? [])
      setLoading(false)
    })
  }, [])

  const tagged = entries.filter((e) =>
    effectiveEntryTags(folders, e).some((t) => t.toLowerCase() === tag.toLowerCase())
  )
  const allowedCampaignIds = scopedCampaignIds(campaigns, worldId, campaignId)
  const scoped = allowedCampaignIds
    ? tagged.filter((e) => {
        const eff = effectiveEntryCampaignId(folders, e)
        return !eff || allowedCampaignIds.has(eff)
      })
    : tagged

  const scopeName = campaign?.name ?? world?.name

  return (
    <section className="page">
      <div className="view-header">
        <h1>{scopeName ? `${scopeName} ${title}` : title}</h1>
      </div>

      {loading && <p className="status-message">Loading...</p>}
      {!loading && scoped.length === 0 && (
        <p className="status-message">Nothing tagged "{tag}" yet.</p>
      )}

      <div className="entry-grid">
        {scoped.map((entry) => (
          <EntryCard key={entry.id} entry={entry} folders={folders} />
        ))}
      </div>
    </section>
  )
}
