import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

const emptyForm = { id: null, name: '', slug: '', description: '', world_id: '' }

function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export default function CampaignManager({ campaigns, worlds, onChange }) {
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  function startEdit(campaign) {
    setForm(campaign)
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
      slug: form.slug || slugify(form.name),
      description: form.description,
      world_id: form.world_id || worlds[0]?.id,
    }

    const { error: saveError } = form.id
      ? await supabase.from('campaigns').update(payload).eq('id', form.id)
      : await supabase.from('campaigns').insert(payload)

    setSaving(false)
    if (saveError) {
      setError(saveError.message)
      return
    }
    resetForm()
    onChange()
  }

  async function handleDelete(id) {
    if (!confirm('Delete this campaign? Entries tied to it will be deleted too.')) return
    const { error: deleteError } = await supabase.from('campaigns').delete().eq('id', id)
    if (deleteError) setError(deleteError.message)
    else onChange()
  }

  return (
    <div className="dm-panel">
      <h2>Campaigns</h2>
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
          Slug (used in the URL, auto-generated if left blank)
          <input
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
            placeholder={slugify(form.name)}
          />
        </label>
        <label>
          World
          <select
            value={form.world_id}
            onChange={(e) => setForm({ ...form, world_id: e.target.value })}
            required
          >
            {worlds.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Description
          <textarea
            value={form.description ?? ''}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={2}
          />
        </label>
        {error && <p className="status-message error">{error}</p>}
        <div className="dm-form-actions">
          <button type="submit" disabled={saving}>
            {form.id ? 'Save changes' : 'Add campaign'}
          </button>
          {form.id && (
            <button type="button" className="secondary" onClick={resetForm}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <ul className="dm-list">
        {campaigns.map((c) => (
          <li key={c.id}>
            <span>{c.name}</span>
            <span className="dm-list-slug">/{c.slug}</span>
            <span className="dm-list-meta">{worlds.find((w) => w.id === c.world_id)?.name}</span>
            <div className="dm-list-actions">
              <button type="button" onClick={() => startEdit(c)}>
                Edit
              </button>
              <button type="button" className="danger" onClick={() => handleDelete(c.id)}>
                Delete
              </button>
            </div>
          </li>
        ))}
        {campaigns.length === 0 && <li className="status-message">No campaigns yet.</li>}
      </ul>
    </div>
  )
}
