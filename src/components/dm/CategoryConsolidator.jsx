import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useCategories } from '../../contexts/CategoryContext'

function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

// Collapses every category into one, turning each old category into a
// top-level folder inside the new one. Nothing is deleted except the now-
// empty old category rows — every folder/entry/placement is reassigned,
// never removed.
export default function CategoryConsolidator() {
  const { categories, reload } = useCategories()
  const [targetLabel, setTargetLabel] = useState('Worlds')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  async function handleConsolidate(e) {
    e.preventDefault()
    setError(null)
    setResult(null)

    const confirmed = confirm(
      `Collapse all ${categories.length} categories into one called "${targetLabel}"? Every ` +
        `other category becomes a top-level folder inside it (with everything that was in it ` +
        `moved along, nothing deleted). This can't be undone automatically.`
    )
    if (!confirmed) return

    setBusy(true)
    try {
      const targetValue = slugify(targetLabel)
      let target = categories.find((c) => c.value === targetValue)
      if (!target) {
        const { data, error: insertError } = await supabase
          .from('categories')
          .insert({ value: targetValue, label: targetLabel, sort_order: 0 })
          .select()
          .single()
        if (insertError) throw insertError
        target = data
      } else if (target.label !== targetLabel) {
        await supabase.from('categories').update({ label: targetLabel }).eq('value', targetValue)
      }

      const [{ data: allFolders }, { data: allEntries }, { data: allPlacements }] = await Promise.all([
        supabase.from('folders').select('id, category, parent_folder_id'),
        supabase.from('entries').select('id, category, folder_id'),
        supabase.from('entry_placements').select('id, category, folder_id'),
      ])

      const otherCategories = categories.filter((c) => c.value !== target.value)
      let foldersMoved = 0
      let entriesMoved = 0

      for (const [index, cat] of otherCategories.entries()) {
        const hasAnyContent =
          allFolders.some((f) => f.category === cat.value) || allEntries.some((e) => e.category === cat.value)

        if (!hasAnyContent) {
          await supabase.from('categories').delete().eq('value', cat.value)
          continue
        }

        const topFolderIds = allFolders
          .filter((f) => f.category === cat.value && !f.parent_folder_id)
          .map((f) => f.id)
        const topEntryIds = allEntries.filter((e) => e.category === cat.value && !e.folder_id).map((e) => e.id)
        const topPlacementIds = allPlacements
          .filter((p) => p.category === cat.value && !p.folder_id)
          .map((p) => p.id)

        const { data: marker, error: markerError } = await supabase
          .from('folders')
          .insert({ name: cat.label, category: target.value, parent_folder_id: null, sort_order: index })
          .select()
          .single()
        if (markerError) throw markerError

        await supabase.from('folders').update({ category: target.value }).eq('category', cat.value)
        await supabase.from('entries').update({ category: target.value }).eq('category', cat.value)
        await supabase.from('entry_placements').update({ category: target.value }).eq('category', cat.value)

        if (topFolderIds.length) {
          await supabase.from('folders').update({ parent_folder_id: marker.id }).in('id', topFolderIds)
        }
        if (topEntryIds.length) {
          await supabase.from('entries').update({ folder_id: marker.id }).in('id', topEntryIds)
        }
        if (topPlacementIds.length) {
          await supabase.from('entry_placements').update({ folder_id: marker.id }).in('id', topPlacementIds)
        }

        await supabase.from('categories').delete().eq('value', cat.value)
        foldersMoved += topFolderIds.length
        entriesMoved += topEntryIds.length
      }

      setResult(`Done — everything now lives under "${targetLabel}".`)
      reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="dm-panel danger-zone">
      <h2>Consolidate Into One Category</h2>
      <p className="view-subtitle">
        Turns every other category into a top-level folder inside a single one, so you get one
        primary tab (e.g. "Worlds") and go deeper via folders from there. Nothing is deleted —
        every folder, entry, and placement is reassigned and kept.
      </p>
      <form onSubmit={handleConsolidate} className="dm-form">
        <label>
          New single category name
          <input value={targetLabel} onChange={(e) => setTargetLabel(e.target.value)} required />
        </label>
        <div className="dm-form-actions">
          <button type="submit" className="danger" disabled={busy || !targetLabel.trim()}>
            {busy ? 'Consolidating...' : `Consolidate ${categories.length} categories`}
          </button>
        </div>
      </form>
      {result && <p className="status-message">{result}</p>}
      {error && <p className="status-message error">{error}</p>}
    </div>
  )
}
