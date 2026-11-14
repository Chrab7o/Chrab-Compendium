import { useState } from 'react'
import BlockEditor from './BlockEditor'
import HandEditor from './HandEditor'
import { loadDraftSpecs } from './mechanics'
import { linkTextPatch } from '../../../lib/forgeClassRows'
import { mechanicsSummary } from '../../../lib/foundryFeatures'
import { findTemplate } from '../../../lib/automationTemplates'
import { followsTemplate } from '../../../lib/forgeSource'
import { automationOf, automationSummary } from '../../../lib/automation'
import { blocksOf } from '../../../lib/forgeBlocks'

// A class or subclass feature's Foundry mechanics, in the Levels panel: what
// they are in a line, where they come from, and editing: as building blocks
// right here (BlockEditor) when the feature is new or still follows its
// template or blocks, else by hand in the guided steps, also right here
// (HandEditor). The dialog saves the Item Forge draft at once; the
// row's link to it is saved with the class (mechanics.js). The draft is what
// the Foundry class pack hands to characters.
export default function FeatureMechanics({ row, onChange, linkable = [], onRefreshLinks = null, campaignId = null }) {
  const [error, setError] = useState(null)
  // null, 'blocks' (BlockEditor) or 'hand' (HandEditor)
  const [editing, setEditing] = useState(null)
  const spec = row.mechanics
  // Changed on this page and not saved yet (a mechanics file loaded into the
  // class): the draft doesn't have it, so the dialog would open the old one.
  const unsaved = spec && (!row.feature_draft_id || row.mechanicsDirty)
  const ownedBy = spec?.sandboxPush?.from ?? ''
  const template = spec?.source?.template ? findTemplate(spec.source.template) : null
  const blockList = spec?.source?.blocks?.map((b) => b.block).join(', ')
  // Everything it does, from rules, flows and recipes alike (automation.js).
  // New, or still exactly what its template or blocks built: edit as blocks.
  const asBlocks = !spec || (followsTemplate(spec) && !!blocksOf(spec.source))
  const doing = spec ? automationSummary(spec.item.automation ?? automationOf(spec.item), spec.item) : []

  async function link(id) {
    if (!id) return
    setError(null)
    try {
      const specs = await loadDraftSpecs([id])
      if (!specs.has(id)) throw new Error('that feature no longer exists')
      const linked = specs.get(id)
      // Saving the class writes this row's name and text onto the draft, so
      // a blank one takes the draft's, and a different one is a choice.
      const { patch, conflicts, forge } = linkTextPatch(row, linked)
      const keepForge =
        conflicts.length > 0 &&
        confirm(
          `“${linked.item.name}” has a different ${conflicts.join(' and ')} in the Item Forge.\n\n` +
            `OK: use the Item Forge's ${conflicts.join(' and ')} here.\n` +
            `Cancel: keep this feature's. Saving the class replaces the Item Forge's with it.`,
        )
      onChange({ ...patch, ...(keepForge ? forge : {}), feature_draft_id: id, mechanics: linked, mechanicsDirty: false, mechanicsMissing: false })
    } catch (err) {
      setError(`Couldn't load it: ${err.message}`)
    }
  }

  function unlink() {
    if (!confirm('Remove the mechanics from this feature? The Item Forge keeps its copy, so you can link it again.')) return
    onChange({ feature_draft_id: null, mechanics: undefined, mechanicsDirty: false, mechanicsMissing: false })
  }

  const saved = (row) => onChange({ feature_draft_id: row.id, mechanics: row.spec, mechanicsDirty: false, mechanicsMissing: false })

  if (editing === 'blocks') {
    return (
      <div className="feature-flow">
        <BlockEditor
          stored={spec ?? null}
          draftId={row.feature_draft_id ?? null}
          name={row.name}
          description={row.description}
          campaignId={campaignId}
          onSaved={(r) => {
            saved(r)
            setEditing(null)
          }}
          onCancel={() => setEditing(null)}
          onHandEdit={() => setEditing('hand')}
        />
      </div>
    )
  }

  if (editing === 'hand') {
    return (
      <div className="feature-flow">
        <HandEditor
          stored={spec ?? null}
          draftId={row.feature_draft_id ?? null}
          name={row.name}
          description={row.description}
          campaignId={campaignId}
          onSaved={(r) => {
            saved(r)
            setEditing(null)
          }}
          onCancel={() => setEditing(null)}
        />
      </div>
    )
  }

  return (
    <div className="feature-flow">
      {spec ? (
        <>
          <p className="feature-mechanics-summary">{mechanicsSummary(spec) || 'Mechanics with nothing in them yet.'}</p>
          {doing.length > 0 && (
            <ul className="feature-automation-lines">
              {doing.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          )}
          {ownedBy ? (
            <p className="npc-hint">
              Written in the lab&apos;s <code>{ownedBy}</code>: change it there and push.
            </p>
          ) : template && followsTemplate(spec) ? (
            <p className="npc-hint">Follows the “{template.label}” template, so a fix to the template reaches it.</p>
          ) : template ? (
            <p className="npc-hint">Started from the “{template.label}” template and edited by hand since.</p>
          ) : blockList && followsTemplate(spec) ? (
            <p className="npc-hint">Built from blocks ({blockList}), so a fix to a block reaches it.</p>
          ) : blockList ? (
            <p className="npc-hint">Built from blocks ({blockList}) and edited by hand since.</p>
          ) : null}
        </>
      ) : row.mechanicsMissing ? (
        <p className="npc-hint npc-behavior-warn">This feature is linked to an Item Forge item that couldn&apos;t be loaded.</p>
      ) : (
        <p className="npc-hint">Text only: nothing to roll or apply in Foundry yet.</p>
      )}
      <div className="dm-form-actions">
        {!ownedBy && !row.mechanicsMissing && (
          <button type="button" className="secondary" onClick={() => setEditing(asBlocks ? 'blocks' : 'hand')} disabled={unsaved}>
            {spec ? (asBlocks ? 'Edit blocks' : 'Edit mechanics') : 'Build mechanics'}
          </button>
        )}
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
      {unsaved && <p className="feature-mechanics-unsaved">Changed here: save the class to keep it, then edit it.</p>}
      {error && <p className="status-message error">{error}</p>}
    </div>
  )
}
