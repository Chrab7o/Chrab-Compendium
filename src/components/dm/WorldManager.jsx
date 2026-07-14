import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { uploadWorldHeroImage, deleteWorldHeroImage, getWorldHeroImageUrl } from '../../lib/worldStorage'

const emptyForm = { id: null, name: '', slug: '', description: '' }

function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export default function WorldManager({ worlds, onChange }) {
  const [form, setForm] = useState(emptyForm)
  const [file, setFile] = useState(null)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  function startEdit(world) {
    setForm({
      id: world.id,
      name: world.name,
      slug: world.slug,
      description: world.description ?? '',
      hero_image_path: world.hero_image_path,
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
    setSaving(true)
    try {
      const payload = {
        name: form.name,
        slug: form.slug || slugify(form.name),
        description: form.description || null,
      }

      if (file) {
        payload.hero_image_path = await uploadWorldHeroImage(file)
        if (form.id && form.hero_image_path) await deleteWorldHeroImage(form.hero_image_path)
      }

      const { error: saveError } = form.id
        ? await supabase.from('worlds').update(payload).eq('id', form.id)
        : await supabase.from('worlds').insert(payload)
      if (saveError) throw saveError

      resetForm()
      onChange()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(world) {
    if (!confirm(`Delete "${world.name}"? Maps assigned to it just become unassigned.`)) return
    const { error: deleteError } = await supabase.from('worlds').delete().eq('id', world.id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    await deleteWorldHeroImage(world.hero_image_path)
    onChange()
  }

  return (
    <div className="dm-panel">
      <h2>Worlds</h2>
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
          Description
          <textarea
            rows={3}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </label>
        <label>
          Hero image {form.id ? '(leave blank to keep the current one)' : ''}
          <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files[0])} />
        </label>
        {error && <p className="status-message error">{error}</p>}
        <div className="dm-form-actions">
          <button type="submit" disabled={saving}>
            {saving ? 'Saving...' : form.id ? 'Save changes' : 'Add world'}
          </button>
          {form.id && (
            <button type="button" className="secondary" onClick={resetForm}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <ul className="dm-list">
        {worlds.map((world) => (
          <li key={world.id}>
            {world.hero_image_path && (
              <img
                src={getWorldHeroImageUrl(world.hero_image_path)}
                alt=""
                className="dm-list-thumb"
              />
            )}
            <span>{world.name}</span>
            <span className="dm-list-slug">/{world.slug}</span>
            <div className="dm-list-actions">
              <button type="button" onClick={() => startEdit(world)}>
                Edit
              </button>
              <button type="button" className="danger" onClick={() => handleDelete(world)}>
                Delete
              </button>
            </div>
          </li>
        ))}
        {worlds.length === 0 && <li className="status-message">No worlds yet.</li>}
      </ul>
    </div>
  )
}
