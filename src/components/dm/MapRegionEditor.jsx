import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useMapRegions } from '../../hooks/useMapRegions'
import { getMapImageUrl } from '../../lib/mapStorage'
import MapViewer from '../MapViewer'
import TagQueryPicker from './TagQueryPicker'

const emptyForm = {
  id: null,
  name: '',
  tag_query: [],
  visibility: 'public',
  campaign_id: '',
  linked_map_id: '',
  linkType: 'none',
  // Per-timeline exceptions on top of tag_query (the default) - keyed by
  // campaign_id, value is the override tag array. See region_tag_links.
  tagOverrides: {},
}

export default function MapRegionEditor({ maps, campaigns, regionTagLinks = [], onChange }) {
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
  // A region either browses entries or zooms into another map, never both.
  // This has to be its own explicit field rather than derived from whether
  // tag_query/linked_map_id are set - otherwise picking "Tags" for a region
  // that has no tags yet would immediately re-derive back to "none" and the
  // tag picker would never appear at all.
  const linkType = form?.linkType ?? 'none'

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
    const query = region.tag_query ?? []
    setForm({
      id: region.id,
      name: region.name,
      tag_query: query,
      visibility: region.visibility,
      points: region.points,
      campaign_id: region.campaign_id ?? '',
      linked_map_id: region.linked_map_id ?? '',
      linkType: region.linked_map_id ? 'map' : query.length > 0 ? 'tags' : 'none',
      tagOverrides: Object.fromEntries(
        regionTagLinks
          .filter((l) => l.region_id === region.id)
          .map((l) => [l.campaign_id, l.tag_query ?? []])
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
      tag_query: linkType === 'tags' ? form.tag_query : [],
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
    // browses entries - clearing out any stale rows here too if the DM
    // switched away from "Tags" or emptied one.
    const desired =
      linkType === 'tags'
        ? Object.entries(form.tagOverrides).filter(([, query]) => query?.length > 0)
        : []
    const { error: clearError } = await supabase
      .from('region_tag_links')
      .delete()
      .eq('region_id', saved.id)
    if (!clearError && desired.length > 0) {
      await supabase.from('region_tag_links').insert(
        desired.map(([campaignId, query]) => ({
          region_id: saved.id,
          campaign_id: campaignId,
          tag_query: query,
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
                    if (next === 'tags') setForm({ ...form, linkType: next, linked_map_id: '' })
                    else if (next === 'map') {
                      setForm({
                        ...form,
                        linkType: next,
                        tag_query: [],
                        linked_map_id: otherWorldMaps[0]?.id ?? '',
                      })
                    } else setForm({ ...form, linkType: next, tag_query: [], linked_map_id: '' })
                  }}
                >
                  <option value="none">None</option>
                  <option value="tags">Tags (browse entries)</option>
                  <option value="map" disabled={otherWorldMaps.length === 0}>
                    Another map (zoom in){otherWorldMaps.length === 0 ? ' — no other maps in this world' : ''}
                  </option>
                </select>
              </label>
              {linkType === 'tags' && (
                <TagQueryPicker
                  value={form.tag_query}
                  onChange={(tag_query) => setForm({ ...form, tag_query })}
                />
              )}

              <div className="dm-form-row">
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

              {linkType === 'tags' && mapCampaigns.length > 0 && (
                <div className="region-tag-overrides">
                  <p className="map-edit-hint">
                    Same shape, different destination per timeline — pick tags here to
                    override the default above for that one timeline only. Leave a timeline
                    empty to use the default.
                  </p>
                  {mapCampaigns.map((c) => (
                    <details key={c.id}>
                      <summary>
                        {c.name}
                        {form.tagOverrides[c.id]?.length > 0
                          ? ` — ${form.tagOverrides[c.id].length} tag(s)`
                          : ' — uses default'}
                      </summary>
                      <TagQueryPicker
                        label={`Override for ${c.name}`}
                        value={form.tagOverrides[c.id] ?? []}
                        onChange={(query) =>
                          setForm({
                            ...form,
                            tagOverrides: { ...form.tagOverrides, [c.id]: query },
                          })
                        }
                      />
                    </details>
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
