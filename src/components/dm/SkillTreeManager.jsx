import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

const emptyForm = { id: null, name: '', description: '', campaign_id: '', restrictedToIds: [] }

export default function SkillTreeManager({ trees, campaigns, characters, visibleToRows, onChange }) {
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  function restrictedIdsFor(treeId) {
    return visibleToRows.filter((r) => r.tree_id === treeId).map((r) => r.character_id)
  }

  function startEdit(tree) {
    setForm({
      id: tree.id,
      name: tree.name,
      description: tree.description ?? '',
      campaign_id: tree.campaign_id ?? '',
      restrictedToIds: restrictedIdsFor(tree.id),
    })
    setError(null)
  }

  function resetForm() {
    setForm(emptyForm)
    setError(null)
  }

  function toggleRestricted(characterId) {
    setForm((f) => ({
      ...f,
      restrictedToIds: f.restrictedToIds.includes(characterId)
        ? f.restrictedToIds.filter((id) => id !== characterId)
        : [...f.restrictedToIds, characterId],
    }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const payload = {
      name: form.name,
      description: form.description,
      campaign_id: form.campaign_id || null,
    }

    let treeId = form.id
    if (form.id) {
      const { error: saveError } = await supabase.from('skill_trees').update(payload).eq('id', form.id)
      if (saveError) {
        setSaving(false)
        setError(saveError.message)
        return
      }
    } else {
      const { data, error: saveError } = await supabase.from('skill_trees').insert(payload).select().single()
      if (saveError) {
        setSaving(false)
        setError(saveError.message)
        return
      }
      treeId = data.id
    }

    await supabase.from('skill_tree_visible_to').delete().eq('tree_id', treeId)
    if (form.restrictedToIds.length > 0) {
      const { error: visError } = await supabase
        .from('skill_tree_visible_to')
        .insert(form.restrictedToIds.map((character_id) => ({ tree_id: treeId, character_id })))
      if (visError) {
        setSaving(false)
        setError(visError.message)
        return
      }
    }

    setSaving(false)
    resetForm()
    onChange()
  }

  async function handleDelete(tree) {
    if (!confirm(`Delete "${tree.name}"? This removes every node in it, and every character's progress on it.`))
      return
    const { error: deleteError } = await supabase.from('skill_trees').delete().eq('id', tree.id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    onChange()
  }

  return (
    <div className="dm-panel">
      <h2>Skill Trees</h2>
      <form onSubmit={handleSubmit} className="dm-form">
        <label>
          Name
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </label>
        <label>
          Description
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={2}
          />
        </label>
        <label>
          Campaign
          <select
            value={form.campaign_id}
            onChange={(e) => setForm({ ...form, campaign_id: e.target.value })}
          >
            <option value="">General (no campaign)</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        {characters.length > 0 && (
          <fieldset className="tag-checklist">
            <legend>Restrict to specific players (leave empty for everyone in the campaign above)</legend>
            {characters.map((c) => (
              <label key={c.id} className="tag-checklist-item">
                <input
                  type="checkbox"
                  checked={form.restrictedToIds.includes(c.id)}
                  onChange={() => toggleRestricted(c.id)}
                />
                {c.name}
              </label>
            ))}
          </fieldset>
        )}

        {error && <p className="status-message error">{error}</p>}
        <div className="dm-form-actions">
          <button type="submit" disabled={saving}>
            {form.id ? 'Save changes' : 'Add tree'}
          </button>
          {form.id && (
            <button type="button" className="secondary" onClick={resetForm}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <ul className="dm-list">
        {trees.map((tree) => {
          const restrictedIds = restrictedIdsFor(tree.id)
          return (
            <li key={tree.id}>
              <span>{tree.name}</span>
              <span className="dm-list-meta">
                {campaigns.find((c) => c.id === tree.campaign_id)?.name ?? 'General'}
              </span>
              {restrictedIds.length > 0 && (
                <span className="dm-list-meta">
                  Restricted to{' '}
                  {restrictedIds.map((id) => characters.find((c) => c.id === id)?.name ?? '?').join(', ')}
                </span>
              )}
              <div className="dm-list-actions">
                <button type="button" onClick={() => startEdit(tree)}>
                  Edit
                </button>
                <button type="button" className="danger" onClick={() => handleDelete(tree)}>
                  Delete
                </button>
              </div>
            </li>
          )
        })}
        {trees.length === 0 && <li className="status-message">No skill trees yet.</li>}
      </ul>
    </div>
  )
}
