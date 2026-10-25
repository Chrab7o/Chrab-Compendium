import { useEffect, useMemo, useRef, useState } from 'react'
import { FEAT_TYPES, mechanicsSummary } from '../../../lib/foundryFeatures'
import { listLibrary } from '../../../lib/itemLibraryStore'

// "+ Add" on an NPC statblock section: pick an Item Forge item to link, or
// build a new one. sectionLabel: where it will go ("Bonus Actions").
// onPick(row), onNew(), onClose().
export default function LibraryPicker({ sectionLabel, onPick, onNew, onClose }) {
  const ref = useRef(null)
  const [rows, setRows] = useState(null)
  const [query, setQuery] = useState('')
  const [type, setType] = useState('')
  const [error, setError] = useState(null)

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
    let cancelled = false
    listLibrary()
      .then((list) => !cancelled && setRows(list))
      .catch((err) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
    }
  }, [])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (rows ?? []).filter((r) => (!type || r.spec.featType === type) && (!q || r.name.toLowerCase().includes(q)))
  }, [rows, query, type])

  const pick = (fn) => {
    fn()
    ref.current?.close()
  }

  return (
    <dialog ref={ref} className="item-dialog fw-dialog" onClose={onClose}>
      <header className="item-dialog-header">
        <div>
          <h2>Add to {sectionLabel}</h2>
          <p className="dm-list-meta">From the Item Forge library</p>
        </div>
        <button type="button" className="secondary" onClick={() => ref.current?.close()}>
          Close
        </button>
      </header>
      <div className="item-dialog-body aw-body">
        <button type="button" className="aw-choice is-selected" onClick={() => pick(onNew)}>
          <strong>Build a new item</strong>
          <span>Step by step, saved to the library so other creatures can use it too.</span>
        </button>
        <div className="dm-form-row">
          <label className="npc-wide-field">
            Search
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Bite, Multiattack, Frightful Presence…" autoFocus />
          </label>
          <label>
            Kind
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">Any</option>
              {FEAT_TYPES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {error && <p className="status-message error">{error}</p>}
        {!rows && !error && <p className="status-message">Loading…</p>}
        {rows && (
          <ul className="dm-list fw-library-list">
            {shown.map((r) => (
              <li key={r.id}>
                <span>{r.name}</span>
                <span className="dm-list-meta">
                  {[FEAT_TYPES.find((t) => t.key === r.spec.featType)?.label, mechanicsSummary(r.spec)].filter(Boolean).join(' · ')}
                </span>
                <div className="dm-list-actions">
                  <button type="button" className="secondary" onClick={() => pick(() => onPick(r))}>
                    Add
                  </button>
                </div>
              </li>
            ))}
            {!shown.length && <li className="status-message">{rows.length ? 'Nothing matches.' : 'The library is empty: build the first item above.'}</li>}
          </ul>
        )}
      </div>
    </dialog>
  )
}
