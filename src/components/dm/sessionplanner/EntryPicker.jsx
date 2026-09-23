import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { entryInCampaignScope } from '../../../lib/tags'

// A search-and-select widget, not a page - EntrySearch.jsx is the closest
// existing thing but it's a full page that navigates via <Link> on click and
// scopes itself to whatever campaign the DM currently has selected globally
// (useCampaignContext). Neither fits here: this needs an onSelect callback
// instead of navigation, and it needs to scope to the *plan's own* fixed
// campaignId, which can easily differ from the DM's current nav-wide pick.
export default function EntryPicker({ campaignId, onSelect, onCancel }) {
  const [entries, setEntries] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('entries')
      .select('*')
      .then(({ data }) => {
        setEntries(data ?? [])
        setLoading(false)
      })
  }, [])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const scope = campaignId ? new Set([campaignId]) : null
    return entries
      .filter((e) => {
        if (!entryInCampaignScope(e, scope)) return false
        return e.title.toLowerCase().includes(q)
      })
      .sort((a, b) => a.title.localeCompare(b.title))
      .slice(0, 20)
  }, [entries, query, campaignId])

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
                {e.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
