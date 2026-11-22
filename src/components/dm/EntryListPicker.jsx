import { useState } from 'react'

// Picks specific entries by title — for a map region that should show a
// handful of named things rather than (or as well as) everything carrying a
// tag. Picked entries show as removable chips; typing filters the rest.
// `entries` is [{ id, title, campaign_id }]; the timeline name is shown next
// to a title so same-named entries from different eras can be told apart.
export default function EntryListPicker({ entries, campaigns = [], value, onChange, label = 'Also show these entries' }) {
  const [query, setQuery] = useState('')
  const selected = value ?? []
  const selectedSet = new Set(selected)
  const byId = new Map(entries.map((e) => [e.id, e]))
  const campaignName = (id) => campaigns.find((c) => c.id === id)?.name

  const q = query.trim().toLowerCase()
  const matches = q
    ? entries.filter((e) => !selectedSet.has(e.id) && e.title.toLowerCase().includes(q)).slice(0, 12)
    : []

  function describe(entry) {
    const era = campaignName(entry.campaign_id)
    return era ? `${entry.title} (${era})` : entry.title
  }

  function add(id) {
    onChange([...selected, id])
    setQuery('')
  }

  return (
    <div className="entry-list-picker">
      <label>
        {label}
        <input
          type="search"
          value={query}
          placeholder="Search entries by title…"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            // Enter adds the top match instead of submitting the region form.
            if (e.key === 'Enter') {
              e.preventDefault()
              if (matches[0]) add(matches[0].id)
            }
          }}
        />
      </label>

      {matches.length > 0 && (
        <ul className="entry-list-picker-results">
          {matches.map((e) => (
            <li key={e.id}>
              <button type="button" className="link-button" onClick={() => add(e.id)}>
                + {describe(e)}
              </button>
            </li>
          ))}
        </ul>
      )}
      {q && matches.length === 0 && <p className="status-message">No entries match.</p>}

      {selected.length > 0 && (
        <div className="entry-search-chips">
          {selected.map((id) => {
            const entry = byId.get(id)
            return (
              <button
                key={id}
                type="button"
                className="chip chip-tag active"
                title="Remove"
                onClick={() => onChange(selected.filter((x) => x !== id))}
              >
                {entry ? describe(entry) : 'Deleted entry'} ×
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
