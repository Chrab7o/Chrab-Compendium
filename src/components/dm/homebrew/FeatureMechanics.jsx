import { useState } from 'react'
import ChainBuilder from '../feature/ChainBuilder'
import { NpcSpecContext } from '../npc/FormulaInput'
import { OWNER_CONTEXT } from '../feature/ownerContext'
import { loadDraftSpecs } from './mechanics'
import { linkTextPatch } from '../../../lib/forgeClassRows'
import { newHandoffKey, openInChain } from '../../../lib/forgeHandoff'

// A class or subclass feature's Foundry mechanics, under its text when the
// row is open: the chain read-only, and "Edit in the chain builder", which
// opens it in another tab. Saving there sends it back here
// (lib/forgeHandoff.js, the editors' useForgeSaves); saving the class saves
// the row's link, and its name and text onto the draft (mechanics.js). The
// draft is what the Foundry class pack hands to characters.
// classLabel: the class's name, shown in the chain tab.
export default function FeatureMechanics({ row, onChange, linkable = [], onRefreshLinks = null, classLabel = '' }) {
  const [error, setError] = useState(null)
  const spec = row.mechanics
  // Mechanics started in the old inline editor and never saved have no draft
  // to open yet.
  const unsavedInline = spec && !row.feature_draft_id

  function openChain() {
    const key = row.forge_key ?? newHandoffKey()
    if (!row.forge_key) onChange({ forge_key: key })
    openInChain({ key, draftId: row.feature_draft_id, start: { name: row.name, description: row.description, label: classLabel } })
  }

  async function link(id) {
    if (!id) return
    setError(null)
    try {
      const specs = await loadDraftSpecs([id])
      if (!specs.has(id)) throw new Error('that feature no longer exists')
      const spec = specs.get(id)
      // Saving the class writes this row's name and text onto the draft, so
      // a blank one takes the draft's, and a different one is a choice.
      const { patch, conflicts, forge } = linkTextPatch(row, spec)
      const keepForge =
        conflicts.length > 0 &&
        confirm(
          `“${spec.item.name}” has a different ${conflicts.join(' and ')} in the Item Forge.\n\n` +
            `OK: use the Item Forge's ${conflicts.join(' and ')} here.\n` +
            `Cancel: keep this row's. Saving the class replaces the Item Forge's with it.`
        )
      onChange({ ...patch, ...(keepForge ? forge : {}), feature_draft_id: id, mechanics: spec, mechanicsDirty: false, mechanicsMissing: false })
    } catch (err) {
      setError(`Couldn't load it: ${err.message}`)
    }
  }

  function unlink() {
    if (!confirm('Remove the mechanics from this feature? The Item Forge keeps its copy, so you can link it again.')) return
    onChange({ feature_draft_id: null, mechanics: undefined, mechanicsDirty: false, mechanicsMissing: false })
  }

  return (
    <div className="feature-flow">
      {spec ? (
        <NpcSpecContext.Provider value={OWNER_CONTEXT}>
          <ChainBuilder spec={{ ...spec, item: { ...spec.item, name: row.name || spec.item.name } }} readOnly />
        </NpcSpecContext.Provider>
      ) : row.mechanicsMissing ? (
        <p className="npc-hint npc-behavior-warn">This feature is linked to an Item Forge item that couldn&apos;t be loaded.</p>
      ) : (
        <p className="npc-hint">Text only: nothing to roll or apply in Foundry yet.</p>
      )}
      <div className="dm-form-actions">
        <button type="button" className="secondary" onClick={openChain} disabled={unsavedInline}>
          {spec ? 'Edit in the chain builder ↗' : 'Build it in the chain builder ↗'}
        </button>
        {!spec && (
          <label className="feature-flow-link">
            or use an Item Forge item
            <select value="" onFocus={() => onRefreshLinks?.()} onChange={(e) => link(e.target.value)}>
              <option value="">Choose…</option>
              {linkable.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {(spec || row.mechanicsMissing) && (
          <button type="button" className="danger npc-small-button" onClick={unlink}>
            {spec ? 'Remove mechanics' : 'Unlink'}
          </button>
        )}
      </div>
      {unsavedInline && <p className="npc-hint">Save the class first, then it opens in the chain builder.</p>}
      {row.mechanicsDirty && !unsavedInline && <p className="feature-mechanics-unsaved">Changed here: save the class to keep it.</p>}
      {error && <p className="status-message error">{error}</p>}
    </div>
  )
}
