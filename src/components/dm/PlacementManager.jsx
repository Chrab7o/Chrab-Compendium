import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useCategories } from '../../contexts/CategoryContext'
import { flattenFolders } from '../../lib/folders'
import { categoryLabel } from '../../lib/categories'

// Lets the same entry also show up when browsing other folders/categories,
// on top of its primary category/folder set in the main form above.
export default function PlacementManager({ entryId, folders }) {
  const { categories } = useCategories()
  const [placements, setPlacements] = useState([])
  const [category, setCategory] = useState('')
  const [folderId, setFolderId] = useState('')
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!category && categories.length > 0) setCategory(categories[0].value)
  }, [categories, category])

  const load = useCallback(async () => {
    const { data } = await supabase.from('entry_placements').select('*').eq('entry_id', entryId)
    setPlacements(data ?? [])
  }, [entryId])

  useEffect(() => {
    load()
  }, [load])

  async function addPlacement(e) {
    e.preventDefault()
    setError(null)
    const { error: insertError } = await supabase
      .from('entry_placements')
      .insert({ entry_id: entryId, category, folder_id: folderId || null })
    if (insertError) setError(insertError.message)
    else load()
  }

  async function removePlacement(id) {
    await supabase.from('entry_placements').delete().eq('id', id)
    load()
  }

  function folderName(p) {
    if (!p.folder_id) return `(top level of ${categoryLabel(p.category)})`
    return flattenFolders(folders, p.category).find((f) => f.id === p.folder_id)?.label ?? '?'
  }

  return (
    <div className="dm-panel">
      <h2>Also Show In</h2>
      <p className="view-subtitle">
        Place this same entry in additional folders or categories too, without duplicating it.
        Editing it anywhere always edits the one real entry.
      </p>

      <ul className="dm-list">
        {placements.map((p) => (
          <li key={p.id}>
            <span>{categoryLabel(p.category)}</span>
            <span className="dm-list-meta">{folderName(p)}</span>
            <div className="dm-list-actions">
              <button type="button" className="danger" onClick={() => removePlacement(p.id)}>
                Remove
              </button>
            </div>
          </li>
        ))}
        {placements.length === 0 && (
          <li className="status-message">Not placed anywhere extra yet.</li>
        )}
      </ul>

      <form onSubmit={addPlacement} className="dm-form-row">
        <label>
          Category
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value)
              setFolderId('')
            }}
          >
            {categories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Folder
          <select value={folderId} onChange={(e) => setFolderId(e.target.value)}>
            <option value="">(top level)</option>
            {flattenFolders(folders, category).map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">+ Add placement</button>
      </form>
      {error && <p className="status-message error">{error}</p>}
    </div>
  )
}
