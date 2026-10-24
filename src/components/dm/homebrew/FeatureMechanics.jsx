import { useState } from 'react'
import { Link } from 'react-router-dom'
import { emptyFeatureSpec, mechanicsSummary } from '../../../lib/foundryFeatures'
import TemplatePicker from '../feature/TemplatePicker'
import { ItemCard } from '../npc/ActionBuilder'
import { NpcSpecContext } from '../npc/FormulaInput'
import { OWNER_CONTEXT } from '../feature/ownerContext'
import { loadDraftSpecs } from './mechanics'

// A class or subclass feature's Foundry mechanics, edited right in its row:
// uses, rolls, effects, a stance and its rules - the Feature Forge's item
// editor, minus the name and text, which the row already has. Saving the
// class saves them as the row's Feature Forge draft (mechanics.js), which the
// Foundry class pack then hands to characters.
export default function FeatureMechanics({ row, onChange, linkable = [] }) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState(null)
  const spec = row.mechanics
  const summary = spec ? mechanicsSummary(spec) || 'no rolls yet' : row.mechanicsMissing ? 'linked feature not found' : 'none, text only'

  function start(next) {
    onChange({ mechanics: next, mechanicsDirty: true, mechanicsMissing: false })
    setOpen(true)
  }

  async function link(id) {
    if (!id) return
    setError(null)
    try {
      const specs = await loadDraftSpecs([id])
      if (!specs.has(id)) throw new Error('that feature no longer exists')
      onChange({ feature_draft_id: id, mechanics: specs.get(id), mechanicsDirty: false, mechanicsMissing: false })
      setOpen(true)
    } catch (err) {
      setError(`Couldn't load it: ${err.message}`)
    }
  }

  function unlink() {
    if (!confirm('Remove the mechanics from this feature? The Feature Forge keeps its copy, so you can link it again.')) return
    onChange({ feature_draft_id: null, mechanics: undefined, mechanicsDirty: false, mechanicsMissing: false })
  }

  return (
    <details className="npc-automation feature-mechanics" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        Foundry mechanics <span className="npc-badge">{summary}</span>
        {row.mechanicsDirty && <span className="feature-mechanics-unsaved">unsaved</span>}
      </summary>
      {open && (
        <div className="npc-automation-body">
          {!spec && (
            <>
              <p className="npc-hint">
                Uses, attack or save rolls, effects, or a stance with “when I hit…” rules. Characters who gain this
                feature in Foundry get them from the class compendium.
              </p>
              <div className="dm-form-row">
                <button type="button" className="secondary npc-small-button" onClick={() => start(emptyFeatureSpec('feat'))}>
                  + Start blank
                </button>
                <label>
                  Use a Feature Forge feature
                  <select value="" onChange={(e) => link(e.target.value)}>
                    <option value="">Choose…</option>
                    {linkable.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <TemplatePicker onCreate={start} createLabel="Use this template" />
            </>
          )}
          {row.mechanicsMissing && !spec && (
            <p className="npc-hint npc-behavior-warn">
              This feature is linked to a Feature Forge draft that couldn&apos;t be loaded.{' '}
              <button type="button" className="secondary npc-small-button" onClick={unlink}>
                Unlink
              </button>
            </p>
          )}
          {spec && (
            <>
              <label>
                Icon
                <input
                  value={spec.item.img ?? ''}
                  onChange={(e) => onChange({ mechanics: { ...spec, item: { ...spec.item, img: e.target.value } }, mechanicsDirty: true })}
                  placeholder="Foundry path, e.g. icons/svg/skull.svg"
                />
              </label>
              <NpcSpecContext.Provider value={OWNER_CONTEXT}>
                <div className="repeatable-rows">
                  <ItemCard
                    item={{ ...spec.item, name: row.name }}
                    onChange={(item) => onChange({ mechanics: { ...spec, item }, mechanicsDirty: true })}
                    standalone
                    hideText
                  />
                </div>
              </NpcSpecContext.Provider>
              <div className="dm-form-actions">
                {row.feature_draft_id ? (
                  <Link to={`/dm/feature-forge/${row.feature_draft_id}/edit`} target="_blank" rel="noreferrer" className="button-link secondary">
                    Open in Feature Forge (macro preview, send to Foundry)
                  </Link>
                ) : (
                  <span className="npc-hint">Saved to the Feature Forge when you save the class.</span>
                )}
                <button type="button" className="danger npc-small-button" onClick={unlink}>
                  Remove mechanics
                </button>
              </div>
            </>
          )}
          {error && <p className="status-message error">{error}</p>}
        </div>
      )}
    </details>
  )
}
