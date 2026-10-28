import { useState } from 'react'
import { Link } from 'react-router-dom'
import { draftUsage, loadFeatureDrafts } from '../../../lib/classFeatureLinks'
import { rowFromDraft } from '../../../lib/forgeClassRows'
import { loadDraftSpecs } from './mechanics'

// "+ Add from the Item Forge…" in the class editors: a feature built in the
// Forge becomes a class feature or sub-feature, linked, with its name and
// text copied in. The list loads when it opens, so something just made in
// another tab is there.
// onPick(fields): the new row's fields (forgeClassRows.rowFromDraft).
// linkedHere: draft ids already linked somewhere in this class.
export default function ForgeFeaturePicker({ label = '+ Add from the Item Forge…', onPick, disabled = false, linkedHere = [] }) {
  const [open, setOpen] = useState(false)
  const [drafts, setDrafts] = useState(null)
  const [usage, setUsage] = useState(new Map())
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)

  async function show() {
    setOpen(true)
    setError(null)
    setDrafts(null)
    try {
      const [list, used] = await Promise.all([loadFeatureDrafts(), draftUsage()])
      setDrafts(list)
      setUsage(used)
    } catch (err) {
      setError(`Couldn't load the Item Forge: ${err.message}`)
    }
  }

  function close() {
    setOpen(false)
    setQuery('')
  }

  async function pick(draft) {
    setBusy(draft.id)
    setError(null)
    try {
      const specs = await loadDraftSpecs([draft.id])
      if (!specs.has(draft.id)) throw new Error('that feature no longer exists')
      onPick(rowFromDraft(draft.id, specs.get(draft.id)))
      close()
    } catch (err) {
      setError(`Couldn't load it: ${err.message}`)
    } finally {
      setBusy(null)
    }
  }

  if (!open) {
    return (
      <button type="button" className="secondary" onClick={show} disabled={disabled}>
        {label}
      </button>
    )
  }

  const words = query.trim().toLowerCase()
  const shown = (drafts ?? []).filter((d) => !words || (d.name ?? '').toLowerCase().includes(words))
  return (
    <div className="forge-pick">
      <div className="forge-pick-head">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search Item Forge features…" aria-label="Search Item Forge features" autoFocus />
        <button type="button" className="secondary npc-small-button" onClick={close}>
          Cancel
        </button>
      </div>
      {!drafts && !error && <p className="sub-features-hint">Loading…</p>}
      {drafts && shown.length === 0 && (
        <p className="sub-features-hint">
          {drafts.length ? 'Nothing matches.' : 'No features in the Item Forge yet.'}{' '}
          <Link to="/dm/item-forge/chain/new" target="_blank" rel="noreferrer">
            Build one
          </Link>
          , then open this again.
        </p>
      )}
      {shown.length > 0 && (
        <ul className="forge-pick-list">
          {shown.map((d) => {
            const where = usage.get(d.id) ?? []
            return (
              <li key={d.id}>
                <button type="button" className="forge-pick-item" onClick={() => pick(d)} disabled={busy != null}>
                  <span className="forge-pick-name">{busy === d.id ? 'Adding…' : d.name || 'Untitled feature'}</span>
                  {linkedHere.includes(d.id) && <span className="forge-pick-here">already in this class</span>}
                  <span className="forge-pick-where">{where.length ? `Used in ${where.join('; ')}` : 'Not in a class yet'}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {error && <p className="status-message error">{error}</p>}
    </div>
  )
}
