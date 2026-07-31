import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { effectiveEntryCampaignId } from '../../../lib/folders'

// A search-and-select widget, not a page - EntrySearch.jsx is the closest
// existing thing but it's a full page that navigates via <Link> on click and
// scopes itself to whatever campaign the DM currently has selected globally
// (useCampaignContext). Neither fits here: this needs an onSelect callback
// instead of navigation, and it needs to scope to the *plan's own* fixed
// campaignId, which can easily differ from the DM's current nav-wide pick.
export default function EntryPicker({ campaignId, onSelect, onCancel }) {
  const [entries, setEntries] = useState([])
  const [folders, setFolders] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([supabase.from('entries').select('*'), supabase.from('folders').select('*')]).then(
      ([{ data: entryData }, { data: folderData }]) => {
        setEntries(entryData ?? [])
        setFolders(folderData ?? [])
        setLoading(false)
      }
    )
  }, [])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return entries
      .filter((e) => {
        const eff = effectiveEntryCampaignId(folders, e)
        if (eff !== (campaignId || null)) return false
        return e.title.toLowerCase().includes(q)
      })
      .sort((a, b) => a.title.localeCompare(b.title))
      .slice(0, 20)
  }, [entries, folders, query, campaignId])

  return (
    <div className="entry-picker">
      <div className="entry-picker-row">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search entries by name..."
          aria-label="Search entries to link"
          autoFocus
        />
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {loading && <p className="status-message">Loading...</p>}
      {!loading && query.trim() && results.length === 0 && (
        <p className="status-message">No matching entries in this campaign.</p>
      )}
      {results.length > 0 && (
        <ul className="entry-picker-results">
          {results.map((e) => (
            <li key={e.id}>
              <button type="button" onClick={() => onSelect(e)}>
                {e.title} <span className="dm-list-meta">{e.category}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
