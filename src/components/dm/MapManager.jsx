import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { uploadMapImage, deleteMapImage, readImageDimensions } from '../../lib/mapStorage'

const emptyForm = { id: null, name: '', slug: '', world_id: '' }

function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

// Only runs when a replacement image has different dimensions.
async function scaleMapContents(mapId, { x: sx, y: sy }) {
  const [{ data: markers, error: mErr }, { data: regions, error: rErr }] = await Promise.all([
    supabase.from('map_markers').select('id, x, y').eq('map_id', mapId),
    supabase.from('map_regions').select('id, points').eq('map_id', mapId),
  ])
  if (mErr) throw mErr
  if (rErr) throw rErr
  const updates = [
    ...(markers ?? []).map((m) =>
      supabase.from('map_markers').update({ x: m.x * sx, y: m.y * sy }).eq('id', m.id),
    ),
    ...(regions ?? []).map((r) =>
      supabase
        .from('map_regions')
        .update({ points: r.points.map((p) => ({ ...p, x: p.x * sx, y: p.y * sy })) })
        .eq('id', r.id),
    ),
  ]
  const results = await Promise.all(updates)
  const failed = results.find((res) => res.error)
  if (failed) throw failed.error
}

export default function MapManager({ maps, worlds, onChange }) {
  const [form, setForm] = useState(emptyForm)
  const [file, setFile] = useState(null)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  function startEdit(map) {
    setForm({
      id: map.id,
      name: map.name,
      slug: map.slug,
      world_id: map.world_id ?? '',
      image_path: map.image_path,
      image_width: map.image_width,
      image_height: map.image_height,
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
        world_id: form.world_id || null,
      }

      if (form.id) {
        // Replacing the image keeps every marker and region: they hang off
        // map_id and store pixel coords, so only the image row fields change.
        let scale = null
        if (file) {
          const { width, height } = await readImageDimensions(file)
          if (width !== form.image_width || height !== form.image_height) {
            const ok = confirm(
              `The new image is ${width}×${height}, the old one is ${form.image_width}×${form.image_height}.\n\n` +
                'OK: stretch existing markers and regions to fit the new size.\nCancel: keep the old image.',
            )
            if (!ok) return
            scale = { x: width / form.image_width, y: height / form.image_height }
          }
          payload.image_path = await uploadMapImage(file)
          payload.image_width = width
          payload.image_height = height
        }

        const { error: updateError } = await supabase.from('maps').update(payload).eq('id', form.id)
        if (updateError) throw updateError
        if (scale) await scaleMapContents(form.id, scale)
        if (file && form.image_path) await deleteMapImage(form.image_path)
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
        <label>
          {form.id ? 'Replace image (optional, markers and regions stay put)' : 'Map image'}
          <input
            key={form.id ?? 'new'}
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files[0] ?? null)}
          />
        </label>
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
