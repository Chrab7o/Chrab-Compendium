import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { CATEGORIES, categoryLabel } from '../../lib/categories'

const emptyForm = {
  id: null,
  title: '',
  content: '',
  category: 'lore',
  visibility: 'public',
  campaign_id: '',
  tags: '',
}

function toFormState(entry) {
  return {
    ...entry,
    campaign_id: entry.campaign_id ?? '',
    tags: (entry.tags ?? []).join(', '),
  }
}

export default function EntryManager({ entries, campaigns, onChange }) {
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [filterCampaign, setFilterCampaign] = useState('')

  function startEdit(entry) {
    setForm(toFormState(entry))
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
      title: form.title,
      content: form.content,
      category: form.category,
      visibility: form.visibility,
      campaign_id: form.campaign_id || null,
      tags: form.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    }

    const { error: saveError } = form.id
      ? await supabase.from('entries').update(payload).eq('id', form.id)
      : await supabase.from('entries').insert(payload)

    setSaving(false)
    if (saveError) {
      setError(saveError.message)
      return
    }
    resetForm()
    onChange()
  }

  async function handleDelete(id) {
    if (!confirm('Delete this entry?')) return
    const { error: deleteError } = await supabase.from('entries').delete().eq('id', id)
    if (deleteError) setError(deleteError.message)
    else onChange()
  }

  const visibleEntries = filterCampaign
    ? entries.filter((e) =>
        filterCampaign === 'general' ? !e.campaign_id : e.campaign_id === filterCampaign
      )
    : entries

  return (
    <div className="dm-panel">
      <h2>Entries</h2>
      <form onSubmit={handleSubmit} className="dm-form">
        <label>
          Title
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
          />
        </label>
        <label>
          Content (Markdown)
          <textarea
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
            rows={8}
          />
        </label>
        <div className="dm-form-row">
          <label>
            Category
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Visibility
            <select
              value={form.visibility}
              onChange={(e) => setForm({ ...form, visibility: e.target.value })}
            >
              <option value="public">Public</option>
              <option value="dm">DM only</option>
            </select>
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
        </div>
        <label>
          Tags (comma separated)
          <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
        </label>
        {error && <p className="status-message error">{error}</p>}
        <div className="dm-form-actions">
          <button type="submit" disabled={saving}>
            {form.id ? 'Save changes' : 'Add entry'}
          </button>
          {form.id && (
            <button type="button" className="secondary" onClick={resetForm}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="dm-filter">
        <label>
          Filter by campaign
          <select value={filterCampaign} onChange={(e) => setFilterCampaign(e.target.value)}>
            <option value="">All</option>
            <option value="general">General (no campaign)</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ul className="dm-list">
        {visibleEntries.map((entry) => (
          <li key={entry.id}>
            <span>{entry.title}</span>
            <span className="dm-list-meta">
              {categoryLabel(entry.category)} &middot; {entry.visibility}
              {entry.campaign_id &&
                ` · ${campaigns.find((c) => c.id === entry.campaign_id)?.name ?? ''}`}
            </span>
            <div className="dm-list-actions">
              <button type="button" onClick={() => startEdit(entry)}>
                Edit
              </button>
              <button type="button" className="danger" onClick={() => handleDelete(entry.id)}>
                Delete
              </button>
            </div>
          </li>
        ))}
        {visibleEntries.length === 0 && <li className="status-message">No entries yet.</li>}
      </ul>
    </div>
  )
}
