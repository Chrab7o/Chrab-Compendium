import { useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { parsePoolText } from '../../../lib/sphereGrid'
import { useTags } from '../../../contexts/TagContext'
import TagGroupPicker from '../../TagGroupPicker'

const emptyDraft = { id: null, name: '', tags: [], text: '' }

// Curated name pools, shared by every grid. Generators only ever draw from
// what is typed in here (or from the installed name schemes).
export default function PoolManager({ pools, onChanged }) {
  const { tags } = useTags()
  const [draft, setDraft] = useState(emptyDraft)
  const [showTags, setShowTags] = useState(false)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const labelOf = (v) => tags.find((t) => t.value === v)?.label ?? v

  function edit(pool) {
    setError(null)
    setDraft({ id: pool.id, name: pool.name, tags: pool.tags ?? [], text: pool.names.join('\n') })
  }

  async function handleSave(e) {
    e.preventDefault()
    const name = draft.name.trim()
    if (!name) return
    // De-duplicate on save, case-insensitively, keeping the first spelling.
    const seen = new Set()
    const names = parsePoolText(draft.text).filter((n) => {
      const key = n.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    setSaving(true)
    setError(null)
    const row = { name, tags: draft.tags, names }
    const { error: saveError } = draft.id
      ? await supabase.from('name_pools').update(row).eq('id', draft.id)
      : await supabase.from('name_pools').insert(row)
    setSaving(false)
    if (saveError) {
      setError(saveError.message)
      return
    }
    setDraft(emptyDraft)
    setShowTags(false)
    onChanged()
  }

  async function handleDelete(pool) {
    if (!confirm(`Delete the pool "${pool.name}"? Entries already generated from it are kept.`)) return
    const { error: deleteError } = await supabase.from('name_pools').delete().eq('id', pool.id)
    if (deleteError) setError(deleteError.message)
    else {
      if (draft.id === pool.id) setDraft(emptyDraft)
      onChanged()
    }
  }

  const lineCount = parsePoolText(draft.text).length

  return (
    <div className="sg-pools">
      <p className="status-message">Pools are shared by every sphere grid.</p>
      {pools.length ? (
        <ul className="dm-list">
          {pools.map((p) => (
            <li key={p.id}>
              <strong>{p.name}</strong>
              <span className="dm-list-meta">
                {p.names.length} names
                {p.tags?.length ? ` · ${p.tags.map(labelOf).join(', ')}` : ''}
              </span>
              <div className="dm-list-actions">
                <button type="button" className="secondary" onClick={() => edit(p)}>
                  Edit
                </button>
                <button type="button" className="danger" onClick={() => handleDelete(p)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="status-message">No pools yet. A pool is a list of names you've chosen yourself.</p>
      )}

      <h3 className="sg-subhead">{draft.id ? 'Edit pool' : 'New pool'}</h3>
      <form className="dm-form" onSubmit={handleSave}>
        <label>
          Pool name
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="e.g. Northern river towns"
            required
          />
        </label>
        <div className="sg-tags">
          <div className="sg-tags-head">
            <span>Default tags for what it generates</span>
            <button type="button" className="secondary sg-small" onClick={() => setShowTags((v) => !v)}>
              {showTags ? 'Done' : 'Edit tags'}
            </button>
          </div>
          {showTags ? (
            <TagGroupPicker value={draft.tags} onChange={(next) => setDraft((d) => ({ ...d, tags: next }))} />
          ) : draft.tags.length ? (
            <div className="sg-tag-chips">
              {draft.tags.map((v) => (
                <span key={v} className="badge badge-tag">
                  {labelOf(v)}
                </span>
              ))}
            </div>
          ) : (
            <p className="status-message">None.</p>
          )}
        </div>
        <label>
          Names — one per line ({lineCount})
          <textarea
            rows={10}
            value={draft.text}
            onChange={(e) => setDraft({ ...draft, text: e.target.value })}
            placeholder={'Harrowmere\nSaltreach\nThe Ninefold Ford'}
          />
        </label>
        {error && <p className="status-message error">{error}</p>}
        <div className="dm-form-actions">
          <button type="submit" disabled={saving}>
            {saving ? 'Saving…' : draft.id ? 'Save pool' : 'Add pool'}
          </button>
          {draft.id && (
            <button type="button" className="secondary" onClick={() => setDraft(emptyDraft)}>
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
