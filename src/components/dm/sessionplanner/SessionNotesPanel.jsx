import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { effectiveEntryCampaignId, effectiveEntryTags } from '../../../lib/folders'

// Read-only reference list of past session notes while planning the next
// one - same tag-match TagView.jsx uses ('session-note', case-insensitive),
// but scoped to the plan's own fixed campaignId rather than TagView's
// global nav-wide useCampaignContext() selection, which can easily be a
// different campaign than the one this plan belongs to.
export default function SessionNotesPanel({ campaignId }) {
  const [entries, setEntries] = useState([])
  const [folders, setFolders] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    Promise.all([supabase.from('entries').select('*'), supabase.from('folders').select('*')]).then(
      ([{ data: entryData }, { data: folderData }]) => {
        setEntries(entryData ?? [])
        setFolders(folderData ?? [])
        setLoading(false)
      }
    )
  }, [])

  const notes = useMemo(() => {
    return entries
      .filter((e) => {
        const eff = effectiveEntryCampaignId(folders, e)
        if (eff !== (campaignId || null)) return false
        return effectiveEntryTags(folders, e).some((t) => t.toLowerCase() === 'session-note')
      })
      .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
  }, [entries, folders, campaignId])

  if (loading) return <p className="status-message">Loading...</p>

  return (
    <div className="session-notes-panel">
      <h3>Session Notes</h3>
      {notes.length === 0 && <p className="status-message">No session notes for this campaign yet.</p>}
      <ul className="session-notes-list">
        {notes.map((n) => {
          const expanded = expandedId === n.id
          return (
            <li key={n.id}>
              <button
                type="button"
                className="link-button"
                onClick={() => setExpandedId(expanded ? null : n.id)}
              >
                {n.title}
              </button>
              {expanded && <p className="session-notes-content">{n.content}</p>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
