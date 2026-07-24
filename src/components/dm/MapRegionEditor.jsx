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
  linkType: 'none',
  // Per-timeline exceptions on top of folder_id (the default) - keyed by
  // campaign_id, value is the override folder_id. See region_folder_links.
  folderOverrides: {},
}

export default function MapRegionEditor({ maps, folders, campaigns, regionFolderLinks = [], onChange }) {
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
  // both. This has to be its own explicit field rather than derived from
  // whether folder_id/linked_map_id are set - otherwise picking "Folder"
  // for a region that doesn't have one yet (folder_id still empty) would
  // immediately re-derive back to "none" and the folder picker would never
  // appear at all.
  const linkType = form?.linkType ?? 'none'

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
      linkType: region.linked_map_id ? 'map' : region.folder_id ? 'folder' : 'none',
      folderOverrides: Object.fromEntries(
        regionFolderLinks
          .filter((l) => l.region_id === region.id)
          .map((l) => [l.campaign_id, l.folder_id])
      ),
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
      folder_id: linkType === 'folder' ? form.folder_id || null : null,
      visibility: form.visibility,
      campaign_id: form.campaign_id || null,
      linked_map_id: linkType === 'map' ? form.linked_map_id || null : null,
    }
    const { data: saved, error: saveError } = form.id
      ? await supabase.from('map_regions').update(payload).eq('id', form.id).select().single()
      : await supabase.from('map_regions').insert(payload).select().single()
    if (saveError) {
      setSaving(false)
      setError(saveError.message)
      return
    }

    // Per-timeline overrides only make sense while the region actually
    // browses a folder - clearing out any stale rows here too if the DM
    // switched away from "Folder" or removed one.
    const desired =
      linkType === 'folder'
        ? Object.entries(form.folderOverrides).filter(([, folderId]) => folderId)
        : []
    const { error: clearError } = await supabase
      .from('region_folder_links')
      .delete()
      .eq('region_id', saved.id)
    if (!clearError && desired.length > 0) {
      await supabase.from('region_folder_links').insert(
        desired.map(([campaignId, folderId]) => ({
          region_id: saved.id,
          campaign_id: campaignId,
          folder_id: folderId,
        }))
      )
    }

    setSaving(false)
    setForm(null)
    reload()
    onChange?.()
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
                    if (next === 'folder') setForm({ ...form, linkType: next, linked_map_id: '' })
                    else if (next === 'map') {
                      setForm({
                        ...form,
                        linkType: next,
                        folder_id: '',
                        linked_map_id: otherWorldMaps[0]?.id ?? '',
                      })
                    } else setForm({ ...form, linkType: next, folder_id: '', linked_map_id: '' })
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

              {linkType === 'folder' && mapCampaigns.length > 0 && (
                <div className="dm-form-row region-folder-overrides">
                  <p className="map-edit-hint">
                    Same shape, different destination per timeline — pick a folder here to
                    override the default above for that one timeline only.
                  </p>
                  {mapCampaigns.map((c) => (
                    <label key={c.id}>
                      {c.name}
                      <select
                        value={form.folderOverrides[c.id] ?? ''}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            folderOverrides: { ...form.folderOverrides, [c.id]: e.target.value },
                          })
                        }
                      >
                        <option value="">(use default)</option>
                        {flattenFolders(folders, form.category).map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              )}

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
