import { useMemo, useState } from 'react'

// Puts existing wiki entries onto the current grid. Placing an entry never
// creates links - it shows the links the entry already has.
export default function EntryAdder({ entries, onGrid, colorOf, onPlace }) {
  const [query, setQuery] = useState('')

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    return entries
      .filter((e) => !onGrid.has(e.id) && (!q || e.title.toLowerCase().includes(q)))
      .sort((a, b) => a.title.localeCompare(b.title))
      .slice(0, 30)
  }, [entries, onGrid, query])

  return (
    <div className="sg-adder">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search entries by name..."
        aria-label="Search entries to add"
        autoFocus
      />
      {results.length ? (
        <ul className="dm-list sg-links">
          {results.map((e) => {
            const color = colorOf(e)
            return (
              <li key={e.id}>
                <span className="sg-swatch" style={color ? { background: color } : undefined} />
                <span className="sg-link-name">{e.title}</span>
                {e.visibility === 'dm' && <span className="badge badge-dm">DM</span>}
                <div className="dm-list-actions">
                  <button type="button" className="secondary sg-small" onClick={() => onPlace([e.id])}>
                    Place
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="status-message">
          {query.trim() ? 'No matching entries off this grid.' : 'Every entry is already on this grid.'}
        </p>
      )}
    </div>
  )
}
