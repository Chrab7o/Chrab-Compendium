import { useState } from 'react'
import { useEntries } from '../hooks/useEntries'
import EntryCard from '../components/EntryCard'
import { CATEGORIES } from '../lib/categories'

export default function GeneralView() {
  const [category, setCategory] = useState('')
  const { entries, loading, error } = useEntries({ category: category || undefined })

  return (
    <section>
      <div className="view-header">
        <h1>World Lore</h1>
        <p className="view-subtitle">Everything public, across every campaign.</p>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {loading && <p className="status-message">Loading...</p>}
      {error && <p className="status-message error">{error}</p>}
      {!loading && !error && entries.length === 0 && (
        <p className="status-message">Nothing here yet.</p>
      )}

      <div className="entry-grid">
        {entries.map((entry) => (
          <EntryCard key={entry.id} entry={entry} />
        ))}
      </div>
    </section>
  )
}
