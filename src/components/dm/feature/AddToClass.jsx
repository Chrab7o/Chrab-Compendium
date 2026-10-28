import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { addDraftToTarget, loadFeatureTargets, loadTargetRows } from '../../../lib/classFeatureLinks'
import { placementsFor } from '../../../lib/forgeClassRows'

// The Item Forge's "Add to a class": puts this saved feature into a homebrew
// class or subclass, on its own at a level or as an option under one of its
// features (Bleeding Scar under Illustrate). The other way in is the class
// editor's "+ Add from the Item Forge".
// onAdded({ spec, notice }): the draft as saved with the class's requirements.
export default function AddToClass({ draftId, spec, onAdded, onClose }) {
  const [targets, setTargets] = useState(null)
  const [targetKey, setTargetKey] = useState('')
  const [placements, setPlacements] = useState(null)
  const [under, setUnder] = useState('')
  const [level, setLevel] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(null)

  useEffect(() => {
    let cancelled = false
    loadFeatureTargets()
      .then((list) => !cancelled && setTargets(list))
      .catch((err) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
    }
  }, [])

  const target = targets?.find((t) => `${t.table}:${t.id}` === targetKey) ?? null

  useEffect(() => {
    setPlacements(null)
    setUnder('')
    if (!target) return
    let cancelled = false
    loadTargetRows(target)
      .then((rows) => !cancelled && setPlacements(placementsFor(rows)))
      .catch((err) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
    }
  }, [targetKey]) // eslint-disable-line react-hooks/exhaustive-deps

  async function add() {
    setBusy(true)
    setError(null)
    try {
      const result = await addDraftToTarget(target, { id: draftId, spec }, { level, under })
      setDone(target)
      onAdded(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="dm-panel add-to-class">
        <p>
          Added to <Link to={done.editPath}>{done.label}</Link>.
        </p>
        <button type="button" className="secondary" onClick={onClose}>
          Close
        </button>
      </div>
    )
  }

  return (
    <div className="dm-panel add-to-class">
      <h3>Add {spec.item.name || 'this feature'} to a class</h3>
      {!targets && !error && <p className="npc-hint">Loading classes…</p>}
      {targets && (
        <div className="dm-form-row">
          <label>
            Class or subclass
            <select value={targetKey} onChange={(e) => setTargetKey(e.target.value)}>
              <option value="">Choose…</option>
              {targets.map((t) => (
                <option key={`${t.table}:${t.id}`} value={`${t.table}:${t.id}`}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          {placements && (
            <label>
              Where
              <select value={under} onChange={(e) => setUnder(e.target.value)}>
                <option value="">Its own feature</option>
                {placements.map((p) => (
                  <option key={p.name} value={p.name}>
                    An option under {p.name} (level {p.level}
                    {p.options ? `, ${p.options} option${p.options === 1 ? '' : 's'}` : ''})
                  </option>
                ))}
              </select>
            </label>
          )}
          {placements && !under && (
            <label>
              Level
              <input type="number" min="1" max="20" value={level} onChange={(e) => setLevel(Number(e.target.value) || 1)} />
            </label>
          )}
        </div>
      )}
      {target && (
        <p className="npc-hint">
          Its name and text go in as they are here. If {target.label} is open in another tab, reload it before saving
          there, or saving it drops this feature again.
        </p>
      )}
      {error && <p className="status-message error">{error}</p>}
      <div className="dm-form-actions">
        <button type="button" onClick={add} disabled={!target || !placements || busy}>
          {busy ? 'Adding…' : 'Add it'}
        </button>
        <button type="button" className="secondary" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  )
}
