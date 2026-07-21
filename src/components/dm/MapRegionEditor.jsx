import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useMapRegions } from '../../hooks/useMapRegions'
import { useCategories } from '../../contexts/CategoryContext'
import { flattenFolders } from '../../lib/folders'
import { getMapImageUrl } from '../../lib/mapStorage'
import MapViewer from '../MapViewer'

const emptyForm = {
  id: null,
  name: '',
  category: '',
  folder_id: '',
  visibility: 'public',
  campaign_id: '',
  linked_map_id: '',
}

export default function MapRegionEditor({ maps, folders, campaigns }) {
  const { categories } = useCategories()
  const [mapId, setMapId] = useState('')
  const [drawing, setDrawing] = useState(false)
  const [drawingPoints, setDrawingPoints] = useState([])
  const [form, setForm] = useState(null)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const map = maps.find((m) => m.id === mapId)
  const { regions, reload } = useMapRegions(mapId)
  const mapCampaigns = campaigns.filter((c) => c.world_id === map?.world_id)
  // Other maps in the same world a region could zoom into — a map with no
  // world isn't part of any world-navigation flow, so nothing to link to.
  const otherWorldMaps = map?.world_id
    ? maps.filter((m) => m.world_id === map.world_id && m.id !== map.id)
    : []
  // A region either browses a folder or zooms into another map, never
  // both — derived from which of the two fields is actually set, not its
  // own stored value.
  const linkType = form?.linked_map_id ? 'map' : form?.folder_id ? 'folder' : 'none'

  useEffect(() => {
    if (form && !form.category && categories.length > 0) {
      setForm((f) => ({ ...f, category: categories[0].value }))
    }
  }, [form, categories])

  // Escape cancels an in-progress drawing session.
  useEffect(() => {
    if (!drawing) return
    function onKeyDown(e) {
      if (e.key === 'Escape') cancelDrawing()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawing])

  function startDrawing() {
    setDrawingPoints([])
    setDrawing(true)
    setForm(null)
    setError(null)
  }

  function cancelDrawing() {
    setDrawing(false)
    setDrawingPoints([])
  }

  function finishDrawing() {
    if (drawingPoints.length < 3) {
      setError('A region needs at least 3 points.')
      return
    }
    setDrawing(false)
    setForm({ ...emptyForm, points: drawingPoints })
    setError(null)
  }

  function handleMapClick({ x, y }) {
    if (!drawing) return
    if (drawingPoints.length >= 3) {
      const [first] = drawingPoints
      if (Math.hypot(first.x - x, first.y - y) < 12) {
        finishDrawing()
        return
      }
    }
    setDrawingPoints((pts) => [...pts, { x, y }])
  }

  function handleRegionClick(region) {
    if (drawing) return
    setForm({
      id: region.id,
      name: region.name,
      category: region.folder_id
        ? folders.find((f) => f.id === region.folder_id)?.category ?? ''
        : '',
      folder_id: region.folder_id ?? '',
      visibility: region.visibility,
      points: region.points,
      campaign_id: region.campaign_id ?? '',
      linked_map_id: region.linked_map_id ?? '',
    })
    setError(null)
  }

  function resetForm() {
    setForm(null)
    setError(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const payload = {
      map_id: mapId,
      name: form.name,
      points: form.points,
      folder_id: form.folder_id || null,
      visibility: form.visibility,
      campaign_id: form.campaign_id || null,
      linked_map_id: form.linked_map_id || null,
    }
    const { error: saveError } = form.id
      ? await supabase.from('map_regions').update(payload).eq('id', form.id)
      : await supabase.from('map_regions').insert(payload)
    setSaving(false)
    if (saveError) {
      setError(saveError.message)
      return
    }
    setForm(null)
    reload()
  }

  async function handleDelete() {
    if (!confirm(`Delete "${form.name}"?`)) return
    const { error: deleteError } = await supabase.from('map_regions').delete().eq('id', form.id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    setForm(null)
    reload()
  }

  return (
    <div className="dm-panel">
      <h2>Map Regions</h2>
      <div className="map-picker">
        <label>
          Map to edit
          <select
            value={mapId}
            onChange={(e) => {
              setMapId(e.target.value)
              setForm(null)
              cancelDrawing()
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
            {drawing
              ? 'Click to place each vertex. Click near the first point (or press Done) to finish. Esc cancels.'
              : 'Draw a new region, or click an existing one to edit it.'}
          </p>
          <div className="dm-form-actions">
            {!drawing && (
              <button type="button" onClick={startDrawing}>
                + Draw region
              </button>
            )}
            {drawing && (
              <>
                <button type="button" onClick={finishDrawing}>
                  Done
                </button>
                <button type="button" className="secondary" onClick={cancelDrawing}>
                  Cancel
                </button>
              </>
            )}
          </div>

          <MapViewer
            imageUrl={getMapImageUrl(map.image_path)}
            width={map.image_width}
            height={map.image_height}
            markers={[]}
            regions={regions}
            regionsEditable={drawing}
            drawingPoints={drawingPoints}
            onMapClick={handleMapClick}
            onRegionClick={handleRegionClick}
          />

          {form && (
            <form onSubmit={handleSubmit} className="marker-form">
              <label>
                Name
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </label>
              <label>
                Region links to
                <select
                  value={linkType}
                  onChange={(e) => {
                    const next = e.target.value
                    if (next === 'folder') setForm({ ...form, linked_map_id: '' })
                    else if (next === 'map') {
                      setForm({ ...form, folder_id: '', linked_map_id: otherWorldMaps[0]?.id ?? '' })
                    } else setForm({ ...form, folder_id: '', linked_map_id: '' })
                  }}
                >
                  <option value="none">None</option>
                  <option value="folder">Folder (browse entries)</option>
                  <option value="map" disabled={otherWorldMaps.length === 0}>
                    Another map (zoom in){otherWorldMaps.length === 0 ? ' — no other maps in this world' : ''}
                  </option>
                </select>
              </label>
              <div className="dm-form-row">
                {linkType === 'folder' && (
                  <>
                    <label>
                      Category
                      <select
                        value={form.category}
                        onChange={(e) => setForm({ ...form, category: e.target.value, folder_id: '' })}
                      >
                        {categories.map((c) => (
                          <option key={c.value} value={c.value}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Folder
                      <select
                        value={form.folder_id}
                        onChange={(e) => setForm({ ...form, folder_id: e.target.value })}
                      >
                        <option value="">(no folder link)</option>
                        {flattenFolders(folders, form.category).map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
                {linkType === 'map' && (
                  <label>
                    Zoom to map
                    <select
                      value={form.linked_map_id}
                      onChange={(e) => setForm({ ...form, linked_map_id: e.target.value })}
                    >
                      {otherWorldMaps.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
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
                  {form.id ? 'Save region' : 'Add region'}
                </button>
                <button type="button" className="secondary" onClick={resetForm}>
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
          {error && !form && <p className="status-message error">{error}</p>}
        </>
      )}
    </div>
  )
}
