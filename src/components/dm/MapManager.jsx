import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { uploadMapImage, deleteMapImage, readImageDimensions } from '../../lib/mapStorage'

const emptyForm = { id: null, name: '', slug: '', campaign_id: '', world_id: '' }

function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export default function MapManager({ maps, campaigns, worlds, onChange }) {
  const [form, setForm] = useState(emptyForm)
  const [file, setFile] = useState(null)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  function startEdit(map) {
    setForm({
      id: map.id,
      name: map.name,
      slug: map.slug,
      campaign_id: map.campaign_id ?? '',
      world_id: map.world_id ?? '',
    })
    setFile(null)
    setError(null)
  }

  function resetForm() {
    setForm(emptyForm)
    setFile(null)
    setError(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (!form.id && !file) {
      setError('Choose an image to upload.')
      return
    }

    setSaving(true)
    try {
      const payload = {
        name: form.name,
        slug: form.slug || slugify(form.name),
        campaign_id: form.campaign_id || null,
        world_id: form.world_id || null,
      }

      if (form.id) {
        const { error: updateError } = await supabase.from('maps').update(payload).eq('id', form.id)
        if (updateError) throw updateError
      } else {
        const { width, height } = await readImageDimensions(file)
        const imagePath = await uploadMapImage(file)
        const { error: insertError } = await supabase.from('maps').insert({
          ...payload,
          image_path: imagePath,
          image_width: width,
          image_height: height,
        })
        if (insertError) throw insertError
      }

      resetForm()
      onChange()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(map) {
    if (!confirm(`Delete "${map.name}"? This removes its markers and image too.`)) return
    const { error: deleteError } = await supabase.from('maps').delete().eq('id', map.id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    await deleteMapImage(map.image_path)
    onChange()
  }

  return (
    <div className="dm-panel">
      <h2>Maps</h2>
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
        <label>
          World
          <select
            value={form.world_id}
            onChange={(e) => setForm({ ...form, world_id: e.target.value })}
          >
            <option value="">No world (not shown on any World page)</option>
            {worlds.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        {!form.id && (
          <label>
            Map image
            <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files[0])} />
          </label>
        )}
        {error && <p className="status-message error">{error}</p>}
        <div className="dm-form-actions">
          <button type="submit" disabled={saving}>
            {saving ? 'Saving...' : form.id ? 'Save changes' : 'Add map'}
          </button>
          {form.id && (
            <button type="button" className="secondary" onClick={resetForm}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <ul className="dm-list">
        {maps.map((map) => (
          <li key={map.id}>
            <span>{map.name}</span>
            <span className="dm-list-slug">/{map.slug}</span>
            <div className="dm-list-actions">
              <button type="button" onClick={() => startEdit(map)}>
                Edit
              </button>
              <button type="button" className="danger" onClick={() => handleDelete(map)}>
                Delete
              </button>
            </div>
          </li>
        ))}
        {maps.length === 0 && <li className="status-message">No maps yet.</li>}
      </ul>
    </div>
  )
}
