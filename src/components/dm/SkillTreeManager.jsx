import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

const emptyForm = { id: null, name: '', description: '', campaign_id: '' }

export default function SkillTreeManager({ trees, campaigns, onChange }) {
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  function startEdit(tree) {
    setForm({
      id: tree.id,
      name: tree.name,
      description: tree.description ?? '',
      campaign_id: tree.campaign_id ?? '',
    })
    setError(null)
  }

  function resetForm() {
    setForm(emptyForm)
    setError(null)
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

    const { error: saveError } = form.id
      ? await supabase.from('skill_trees').update(payload).eq('id', form.id)
      : await supabase.from('skill_trees').insert(payload)

    setSaving(false)
    if (saveError) {
      setError(saveError.message)
      return
    }
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
        {trees.map((tree) => (
          <li key={tree.id}>
            <span>{tree.name}</span>
            <span className="dm-list-meta">
              {campaigns.find((c) => c.id === tree.campaign_id)?.name ?? 'General'}
            </span>
            <div className="dm-list-actions">
              <button type="button" onClick={() => startEdit(tree)}>
                Edit
              </button>
              <button type="button" className="danger" onClick={() => handleDelete(tree)}>
                Delete
              </button>
            </div>
          </li>
        ))}
        {trees.length === 0 && <li className="status-message">No skill trees yet.</li>}
      </ul>
    </div>
  )
}
