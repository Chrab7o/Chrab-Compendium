import { useMemo, useState } from 'react'

// Search-and-select over this plan's own scenes, for connecting an obstacle
// to an already-existing scene instead of always creating a new one -
// mirrors EntryPicker.jsx's shape, but the scene list is already loaded by
// the caller (a plan rarely has more than a few dozen scenes), so this is a
// plain client-side filter with no query of its own.
export default function NodePicker({ nodes, excludeNodeId, onSelect, onCancel }) {
  const [query, setQuery] = useState('')

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    return nodes
      .filter((n) => n.id !== excludeNodeId)
      .filter((n) => !q || n.question.toLowerCase().includes(q))
      .sort((a, b) => a.question.localeCompare(b.question))
      .slice(0, 20)
  }, [nodes, query, excludeNodeId])

  return (
    <div className="entry-picker">
      <div className="entry-picker-row">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search this plan's scenes..."
          aria-label="Search scenes to link"
          autoFocus
        />
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {results.length === 0 && <p className="status-message">No matching scenes.</p>}
      {results.length > 0 && (
        <ul className="entry-picker-results">
          {results.map((n) => (
            <li key={n.id}>
              <button type="button" onClick={() => onSelect(n)}>
                {n.question}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
