import { useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { parsePoolText, resolveTag } from '../../../lib/storyEngine'

const emptyDraft = { id: null, name: '', tagInput: '', text: '' }

// Curated name pools for this world. Generators only ever draw from what is
// typed in here (or from the installed name schemes).
export default function PoolManager({ worldId, pools, tags, tagsByValue, onChanged }) {
  const [draft, setDraft] = useState(emptyDraft)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  function edit(pool) {
    setError(null)
    setDraft({
      id: pool.id,
      name: pool.name,
      tagInput: pool.tag ? tagsByValue.get(pool.tag)?.label ?? pool.tag : '',
      text: pool.names.join('\n'),
    })
  }

  async function handleSave(e) {
    e.preventDefault()
    const name = draft.name.trim()
    if (!name) return
    const { value: tag, error: tagError } = resolveTag(draft.tagInput, tags)
    if (tagError) {
      setError(tagError)
      return
    }
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
    const row = { name, tag, names }
    const { error: saveError } = draft.id
      ? await supabase.from('story_pools').update(row).eq('id', draft.id)
      : await supabase.from('story_pools').insert({ ...row, world_id: worldId })
    setSaving(false)
    if (saveError) {
      setError(saveError.message)
      return
    }
    setDraft(emptyDraft)
    onChanged()
  }

  async function handleDelete(pool) {
    if (!confirm(`Delete the pool "${pool.name}"? Spheres already generated from it are kept.`)) return
    const { error: deleteError } = await supabase.from('story_pools').delete().eq('id', pool.id)
    if (deleteError) setError(deleteError.message)
    else {
      if (draft.id === pool.id) setDraft(emptyDraft)
      onChanged()
    }
  }

  const lineCount = parsePoolText(draft.text).length

  return (
    <div className="se-pools">
      {pools.length ? (
        <ul className="dm-list">
          {pools.map((p) => {
            const tag = p.tag ? tagsByValue.get(p.tag) : null
            return (
              <li key={p.id}>
                <span className="se-swatch" style={tag?.color ? { background: tag.color } : undefined} />
                <strong>{p.name}</strong>
                <span className="dm-list-meta">
                  {p.names.length} names{tag ? ` · ${tag.label}` : ''}
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
            )
          })}
        </ul>
      ) : (
        <p className="status-message">No pools yet. A pool is a list of names you've chosen for this world.</p>
      )}

      <h3 className="se-subhead">{draft.id ? 'Edit pool' : 'New pool'}</h3>
      <form className="dm-form" onSubmit={handleSave}>
        <div className="dm-form-row">
          <label>
            Pool name
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="e.g. Northern river towns"
              required
            />
          </label>
          <label>
            Tag (optional)
            <input
              list="se-tag-options"
              value={draft.tagInput}
              onChange={(e) => setDraft({ ...draft, tagInput: e.target.value })}
              placeholder="Untagged"
            />
          </label>
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
