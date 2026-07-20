import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useMapMarkers } from '../../hooks/useMapMarkers'
import { getMapImageUrl } from '../../lib/mapStorage'
import MapViewer from '../MapViewer'

const emptyForm = { id: null, x: 0, y: 0, label: '', visibility: 'public', entry_id: '', campaign_id: '' }

export default function MapMarkerEditor({ maps, entries, campaigns }) {
  const [mapId, setMapId] = useState('')
  const [form, setForm] = useState(null)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const formRef = useRef(null)

  const map = maps.find((m) => m.id === mapId)
  const { markers, reload } = useMapMarkers(mapId)
  const mapCampaigns = campaigns.filter((c) => c.world_id === map?.world_id)

  useEffect(() => {
    if (form) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [form])

  function handleMapClick({ x, y }) {
    setForm({ ...emptyForm, x, y })
    setError(null)
  }

  function handleMarkerClick(marker) {
    setForm({ ...marker, entry_id: marker.entry_id ?? '', campaign_id: marker.campaign_id ?? '' })
    setError(null)
  }

  async function handleMarkerDragEnd(marker, { x, y }) {
    const { error: moveError } = await supabase.from('map_markers').update({ x, y }).eq('id', marker.id)
    if (moveError) {
      setError(moveError.message)
      return
    }
    setForm((current) => (current?.id === marker.id ? { ...current, x, y } : current))
    reload()
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const payload = {
      map_id: mapId,
      x: form.x,
      y: form.y,
      label: form.label,
      visibility: form.visibility,
      entry_id: form.entry_id || null,
      campaign_id: form.campaign_id || null,
    }

    const { error: saveError } = form.id
      ? await supabase.from('map_markers').update(payload).eq('id', form.id)
      : await supabase.from('map_markers').insert(payload)

    setSaving(false)
    if (saveError) {
      setError(saveError.message)
      return
    }
    setForm(null)
    reload()
  }

  async function handleDelete() {
    if (!confirm('Delete this marker?')) return
    const { error: deleteError } = await supabase.from('map_markers').delete().eq('id', form.id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    setForm(null)
    reload()
  }

  return (
    <div className="dm-panel">
      <h2>Map Markers</h2>
      <div className="map-picker">
        <label>
          Map to edit
          <select
            value={mapId}
            onChange={(e) => {
              setMapId(e.target.value)
              setForm(null)
            }}
          >
            <option value="">Choose a map...</option>
            {maps.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {map && (
        <>
          <p className="map-edit-hint">
            Click anywhere on the map to add a marker. Drag a marker to reposition it, or click
            it to edit its label/visibility/link.
          </p>
          <MapViewer
            imageUrl={getMapImageUrl(map.image_path)}
            width={map.image_width}
            height={map.image_height}
            markers={markers}
            editable
            onMapClick={handleMapClick}
            onMarkerClick={handleMarkerClick}
            onMarkerDragEnd={handleMarkerDragEnd}
          />

          {form && (
            <form ref={formRef} onSubmit={handleSubmit} className="marker-form">
              <label>
                Label
                <input
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  required
                />
              </label>
              <div className="dm-form-row">
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
                  Links to entry
                  <select
                    value={form.entry_id}
                    onChange={(e) => setForm({ ...form, entry_id: e.target.value })}
                  >
                    <option value="">No linked entry</option>
                    {entries.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Timeline
                  <select
                    value={form.campaign_id}
                    onChange={(e) => setForm({ ...form, campaign_id: e.target.value })}
                  >
                    <option value="">General (all timelines)</option>
                    {mapCampaigns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {error && <p className="status-message error">{error}</p>}
              <div className="dm-form-actions">
                <button type="submit" disabled={saving}>
                  {form.id ? 'Save marker' : 'Add marker'}
                </button>
                <button type="button" className="secondary" onClick={() => setForm(null)}>
                  Cancel
                </button>
                {form.id && (
                  <button type="button" className="danger" onClick={handleDelete}>
                    Delete
                  </button>
                )}
              </div>
            </form>
          )}
        </>
      )}
    </div>
  )
}
