import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { featureDraftLinks, republishQuietly } from '../../../lib/foundryClassPackPublish'
import { loadLibraryRows, npcsUsingDraft, saveLibraryItem } from '../../../lib/itemLibraryStore'
import { NpcSpecContext } from '../npc/FormulaInput'
import FeatureWizard from './FeatureWizard'

// One Item Forge item, edited in the guided steps without leaving the page
// (the NPC Forge's "+ Add" and "Edit"). Saving writes the library item, so
// every NPC that links it changes too; the dialog says which.
// draftId: the item to edit, or null for a new one starting from initialSpec.
// ownerCtx: the NpcSpecContext value formulas are previewed against.
// npcId: the NPC being edited, left out of the "also on" list.
// onSaved(row): the saved library row (itemLibraryStore).
export default function LibraryItemDialog({ draftId = null, initialSpec, ownerCtx, campaignId = null, npcId = null, onSaved, onClose }) {
  const ref = useRef(null)
  const [spec, setSpec] = useState(draftId ? null : initialSpec)
  const [alsoOn, setAlsoOn] = useState([])
  const [classLinks, setClassLinks] = useState([])
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  useEffect(() => {
    if (!draftId) return
    let cancelled = false
    Promise.all([loadLibraryRows([draftId]), npcsUsingDraft(draftId), featureDraftLinks(draftId)])
      .then(([rows, npcs, links]) => {
        if (cancelled) return
        if (!rows.has(draftId)) throw new Error('This library item no longer exists.')
        setSpec(rows.get(draftId).spec)
        setAlsoOn(npcs.filter((n) => n.id !== npcId))
        setClassLinks(links)
      })
      .catch((err) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
    }
  }, [draftId, npcId])

  const edit = (update) => {
    setSpec(update)
    setDirty(true)
  }
  const close = () => {
    if (!dirty || confirm('Close without saving this item?')) ref.current?.close()
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const row = await saveLibraryItem(draftId, spec, { campaignId })
      // An item a homebrew class uses is in the Foundry class pack: keep it current.
      if (classLinks.length) {
        const notice = await republishQuietly()
        if (notice) setError(notice)
      }
      onSaved(row)
      ref.current?.close()
    } catch (err) {
      setError(err.message)
    }
    setSaving(false)
  }

  return (
    <dialog
      ref={ref}
      className="item-dialog fw-dialog"
      onClose={onClose}
      onCancel={(e) => {
        if (dirty && !confirm('Close without saving this item?')) e.preventDefault()
      }}
    >
      <header className="item-dialog-header">
        <div>
          <h2>{draftId ? `Edit ${spec?.item?.name || 'item'}` : 'New library item'}</h2>
          <p className="dm-list-meta">Item Forge · saved to the library</p>
        </div>
        <button type="button" className="secondary" onClick={close}>
          Close
        </button>
      </header>
      <div className="item-dialog-body">
        {(alsoOn.length > 0 || classLinks.length > 0) && (
          <p className="draft-banner">
            Shared: saving also changes it on{' '}
            {[...alsoOn.map((n) => n.name || 'Untitled NPC'), ...classLinks.map((l) => l.label)].join(', ')}. Re-send
            those NPCs to update them in Foundry, or use “Make a private copy” for a version only this NPC has.
          </p>
        )}
        {spec ? (
          <NpcSpecContext.Provider value={ownerCtx}>
            <FeatureWizard key={draftId ?? 'new'} spec={spec} set={(patch) => edit((s) => ({ ...s, ...patch }))} replace={edit} showStart={!draftId} allowSpell={false} allowGear={false} />
          </NpcSpecContext.Provider>
        ) : (
          !error && <p className="status-message">Loading…</p>
        )}
        {error && <p className="status-message error">{error}</p>}
      </div>
      <div className="item-dialog-actions">
        {draftId && (
          <Link to={`/dm/item-forge/${draftId}/edit`} target="_blank" rel="noreferrer" className="button-link secondary">
            Open in the Item Forge
          </Link>
        )}
        <span className="npc-item-actions-spacer" />
        <button type="button" className="secondary" onClick={close}>
          Cancel
        </button>
        <button type="button" onClick={save} disabled={!spec || saving}>
          {saving ? 'Saving…' : draftId ? 'Save to library' : 'Add to library'}
        </button>
      </div>
    </dialog>
  )
}
