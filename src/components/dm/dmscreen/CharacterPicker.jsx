import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'

// Search-and-select over both player characters and NPCs, for the
// Reminders widget's "add someone" action. NPCs are wiki entries tagged
// "character" (a DM-created tag, same generic mechanism as any other tag -
// nothing hardcoded requires it to exist ahead of time, it just returns no
// NPC results until the DM tags something).
export default function CharacterPicker({ excludeSubjects, onSelect, onCancel }) {
  const [query, setQuery] = useState('')
  const [characters, setCharacters] = useState([])
  const [npcEntries, setNpcEntries] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('characters').select('id, name'),
      supabase.from('entries').select('id, title').contains('tags', ['character']),
    ]).then(([{ data: chars }, { data: entries }]) => {
      setCharacters(chars ?? [])
      setNpcEntries(entries ?? [])
      setLoading(false)
    })
  }, [])

  const excludedKeys = useMemo(
    () => new Set(excludeSubjects.map((s) => `${s.type}:${s.id}`)),
    [excludeSubjects]
  )

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const charResults = characters
      .filter((c) => !excludedKeys.has(`character:${c.id}`))
      .filter((c) => !q || c.name.toLowerCase().includes(q))
      .map((c) => ({ type: 'character', id: c.id, label: c.name, kind: 'PC' }))
    const npcResults = npcEntries
      .filter((e) => !excludedKeys.has(`entry:${e.id}`))
      .filter((e) => !q || e.title.toLowerCase().includes(q))
      .map((e) => ({ type: 'entry', id: e.id, label: e.title, kind: 'NPC' }))
    return [...charResults, ...npcResults].sort((a, b) => a.label.localeCompare(b.label)).slice(0, 30)
  }, [characters, npcEntries, query, excludedKeys])

  return (
    <div className="entry-picker">
      <div className="entry-picker-row">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search characters and NPCs..."
          aria-label="Search characters and NPCs to add"
          autoFocus
        />
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {loading && <p className="status-message">Loading...</p>}
      {!loading && results.length === 0 && (
        <p className="status-message">
          No matches. NPCs need the "character" tag applied to their entry in the DM Tags page.
        </p>
      )}
      {results.length > 0 && (
        <ul className="entry-picker-results">
          {results.map((r) => (
            <li key={`${r.type}:${r.id}`}>
              <button type="button" onClick={() => onSelect(r)}>
                {r.label} <span className="dm-list-meta">{r.kind}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
