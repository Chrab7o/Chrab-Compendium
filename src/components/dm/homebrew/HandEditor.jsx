import { useEffect, useState } from 'react'
import FeatureWizard from '../feature/FeatureWizard'
import { NpcSpecContext } from '../npc/FormulaInput'
import { OWNER_CONTEXT } from '../feature/ownerContext'
import { emptyFeatureSpec } from '../../../lib/foundryFeatures'
import { saveLibraryItem } from '../../../lib/itemLibraryStore'
import { featureDraftLinks, republishQuietly } from '../../../lib/foundryClassPackPublish'

// A class feature's mechanics built by hand, in the Levels panel: the Item
// Forge's guided steps (how it's used, rolls, effects, reactions) without its
// Basics step, since the class row owns the name and text. Saving writes the
// Item Forge draft at once and, when a class already uses it, republishes the
// class pack. Replaces the Item Forge dialog for class features
// (docs/forge-overhaul.md, Phase 2c, in the lab).
//
// stored: the draft's spec, or null for a new one. onSaved(row): the saved
// draft row.
const STEPS = ['use', 'rolls', 'effects', 'reactions', 'review']

export default function HandEditor({ stored = null, draftId = null, name, description, campaignId = null, onSaved, onCancel }) {
  const [spec, setSpec] = useState(() => {
    const base = stored ? structuredClone(stored) : emptyFeatureSpec('feat')
    return { ...base, item: { ...base.item, name, description } }
  })
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [links, setLinks] = useState([])

  useEffect(() => {
    if (!draftId) return
    let cancelled = false
    featureDraftLinks(draftId)
      .then((l) => !cancelled && setLinks(l))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [draftId])

  const edit = (update) => {
    setSpec(update)
    setDirty(true)
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      // The row's words, whatever the steps did.
      const row = await saveLibraryItem(draftId, { ...spec, item: { ...spec.item, name, description } }, { campaignId })
      const notice = links.length ? await republishQuietly() : null
      setDirty(false)
      onSaved(row)
      if (notice) setError(notice)
    } catch (err) {
      setError(err.message)
    }
    setSaving(false)
  }

  function cancel() {
    if (!dirty || confirm('Close without saving these mechanics?')) onCancel()
  }

  return (
    <div className="hand-editor mechanics-editing">
      {links.length > 1 && <p className="draft-banner">Shared: saving also changes it on {links.map((l) => l.label).join(', ')}.</p>}
      <NpcSpecContext.Provider value={OWNER_CONTEXT}>
        <FeatureWizard spec={spec} set={(patch) => edit((s) => ({ ...s, ...patch }))} replace={edit} linkedText allowSpell={false} allowGear={false} only={STEPS} />
      </NpcSpecContext.Provider>
      {error && <p className="status-message error">{error}</p>}
      <div className="dm-form-actions">
        <button type="button" onClick={save} disabled={saving || (!dirty && !!stored)}>
          {saving ? 'Saving…' : 'Save mechanics'}
        </button>
        <button type="button" className="secondary" onClick={cancel}>
          {dirty ? 'Cancel' : 'Close'}
        </button>
      </div>
    </div>
  )
}
