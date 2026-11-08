import { useEffect, useMemo, useState } from 'react'
import { fiveToolsFeatToForm } from '../../../lib/homebrew'

// The 5etools category filter. `codes` match the raw `category` field;
// null means "no category" (the 2014 books' feats).
const CATEGORY_FILTERS = [
  { key: 'origin', label: 'Origin', codes: ['O'] },
  { key: 'general', label: 'General', codes: ['G'] },
  { key: 'fighting', label: 'Fighting Style', codes: ['FS', 'FS:P', 'FS:R'] },
  { key: 'boon', label: 'Epic Boon', codes: ['EB'] },
  { key: 'legacy', label: '2014 (no category)', codes: [null] },
  { key: 'other', label: 'Dragonmark / Dark Gift', codes: ['D', 'DG'] },
  { key: 'any', label: 'Any', codes: null },
]

// Search the bundled 5etools feat catalog (src/data/feats/catalog.json,
// built by the lab's scripts/5etools-feats) and pick one. onPick gets the
// raw 5etools entry; run fiveToolsFeatToForm on it for the form shape.
export default function FiveToolsFeatPicker({ initialCategory = 'origin', onPick, onClose }) {
  const [catalog, setCatalog] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState(initialCategory)

  useEffect(() => {
    // ~230 KB of feat text: loaded only when the picker opens.
    import('../../../data/feats/catalog.json')
      .then((m) => setCatalog(m.default))
      .catch((e) => setLoadError(e.message))
  }, [])

  // The form shape gives the readable category and prerequisite per row.
  const rows = useMemo(
    () => (catalog ?? []).map((raw) => ({ raw, form: fiveToolsFeatToForm(raw) })),
    [catalog]
  )

  const codes = CATEGORY_FILTERS.find((c) => c.key === category)?.codes
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const shown = rows.filter(
    ({ raw }) =>
      (!codes || codes.includes(raw.category ?? null)) &&
      words.every((w) => `${raw.name} ${raw.source}`.toLowerCase().includes(w))
  )

  return (
    <div className="npc-spell-picker">
      <div className="dm-panel-header">
        <h4>5etools feats</h4>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close feat picker">
          ×
        </button>
      </div>
      {loadError ? (
        <p className="status-message error">Couldn't load the feat catalog: {loadError}</p>
      ) : !catalog ? (
        <p className="npc-hint">Loading feats…</p>
      ) : (
        <>
          <div className="dm-form-row">
            <label>
              Search
              <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="alert, tough, xphb…" />
            </label>
            <label>
              Category
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORY_FILTERS.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <ul className="npc-spell-results">
            {shown.slice(0, 80).map(({ raw, form }) => (
              <li key={`${raw.name}|${raw.source}`}>
                <span className="npc-spell-result-name">{raw.name}</span>
                <span className="npc-hint">
                  {[form.category || 'Feat', form.prerequisite, raw.source].filter(Boolean).join(' · ')}
                </span>
                <button type="button" className="secondary npc-small-button" onClick={() => onPick(raw)}>
                  Use
                </button>
              </li>
            ))}
            {shown.length > 80 && <li className="npc-hint">{shown.length - 80} more - narrow the search.</li>}
            {!shown.length && <li className="npc-hint">No feats match.</li>}
          </ul>
        </>
      )}
    </div>
  )
}
