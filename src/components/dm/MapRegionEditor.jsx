import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useMapRegions } from '../../hooks/useMapRegions'
import { getMapImageUrl } from '../../lib/mapStorage'
import MapViewer from '../MapViewer'
import TagQueryPicker from './TagQueryPicker'
import EntryListPicker from './EntryListPicker'

const emptyForm = {
  id: null,
  name: '',
  tag_query: [],
  // Hand-picked entries shown alongside whatever tag_query matches.
  entry_ids: [],
  visibility: 'public',
  campaign_id: '',
  linked_map_id: '',
  linkType: 'none',
  // Per-timeline exceptions to the default (tag_query + entry_ids) - keyed by
  // campaign_id, value is { tag_query, entry_ids }. See region_tag_links.
  overrides: {},
}

export default function MapRegionEditor({ maps, campaigns, entries = [], regionTagLinks = [], onChange }) {
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

  // The form sits below the map, often off screen — bring it into view and
  // focus Name whenever a region is opened (a new one after "Done", or an
  // existing one clicked on the map), so it's clear saving is a next step.
  const formRef = useRef(null)
  const formKey = form ? (form.id ?? 'new') : null
  useEffect(() => {
    if (!formKey || !formRef.current) return
    formRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    formRef.current.querySelector('input')?.focus({ preventScroll: true })
  }, [formKey])

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
    setDrawingPoints([])
    const query = region.tag_query ?? []
    const entryIds = region.entry_ids ?? []
    setForm({
      id: region.id,
      name: region.name,
      tag_query: query,
      entry_ids: entryIds,
      visibility: region.visibility,
      points: region.points,
      campaign_id: region.campaign_id ?? '',
      linked_map_id: region.linked_map_id ?? '',
      linkType: region.linked_map_id
        ? 'map'
        : query.length > 0 || entryIds.length > 0
          ? 'tags'
          : 'none',
      overrides: Object.fromEntries(
        regionTagLinks
          .filter((l) => l.region_id === region.id)
          .map((l) => [l.campaign_id, { tag_query: l.tag_query ?? [], entry_ids: l.entry_ids ?? [] }])
      ),
    })
    setError(null)
  }

  function resetForm() {
    setForm(null)
    setDrawingPoints([])
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
      entry_ids: linkType === 'tags' ? form.entry_ids : [],
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
    // switched away from "Entries" or emptied one.
    const desired =
      linkType === 'tags'
        ? Object.entries(form.overrides).filter(
            ([, o]) => o?.tag_query?.length > 0 || o?.entry_ids?.length > 0
          )
        : []
    const { error: clearError } = await supabase
      .from('region_tag_links')
      .delete()
      .eq('region_id', saved.id)
    if (!clearError && desired.length > 0) {
      await supabase.from('region_tag_links').insert(
        desired.map(([campaignId, o]) => ({
          region_id: saved.id,
          campaign_id: campaignId,
          tag_query: o.tag_query ?? [],
          entry_ids: o.entry_ids ?? [],
        }))
      )
    }

    setSaving(false)
    setForm(null)
    setDrawingPoints([])
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
              : form && !form.id
                ? 'Name the region below and click "Add region" to save it.'
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
            // Always on in the editor: keeps every saved outline visible (not
            // just on hover) and keeps a just-drawn shape on screen while its
            // form is open. Map clicks outside drawing are ignored anyway.
            regionsEditable
            drawingPoints={drawingPoints}
            onMapClick={handleMapClick}
            onRegionClick={handleRegionClick}
          />

          {form && (
            <form ref={formRef} onSubmit={handleSubmit} className="marker-form">
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
                        entry_ids: [],
                        linked_map_id: otherWorldMaps[0]?.id ?? '',
                      })
                    } else {
                      setForm({ ...form, linkType: next, tag_query: [], entry_ids: [], linked_map_id: '' })
                    }
                  }}
                >
                  <option value="none">None</option>
                  <option value="tags">Entries (by tag or picked by name)</option>
                  <option value="map" disabled={otherWorldMaps.length === 0}>
                    Another map (zoom in){otherWorldMaps.length === 0 ? ' — no other maps in this world' : ''}
                  </option>
                </select>
              </label>
              {linkType === 'tags' && (
                <>
                  <TagQueryPicker
                    value={form.tag_query}
                    onChange={(tag_query) => setForm({ ...form, tag_query })}
                  />
                  <EntryListPicker
                    entries={entries}
                    campaigns={mapCampaigns}
                    value={form.entry_ids}
                    onChange={(entry_ids) => setForm({ ...form, entry_ids })}
                  />
                </>
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
                    Same shape, different destination per timeline — pick tags or entries
                    here to replace the default above (both parts) for that one timeline
                    only. Leave a timeline empty to use the default.
                  </p>
                  {mapCampaigns.map((c) => {
                    const o = form.overrides[c.id] ?? { tag_query: [], entry_ids: [] }
                    const setOverride = (patch) =>
                      setForm({ ...form, overrides: { ...form.overrides, [c.id]: { ...o, ...patch } } })
                    const parts = [
                      o.tag_query.length > 0 && `${o.tag_query.length} tag(s)`,
                      o.entry_ids.length > 0 && `${o.entry_ids.length} entry(s)`,
                    ].filter(Boolean)
                    return (
                      <details key={c.id}>
                        <summary>
                          {c.name} — {parts.length > 0 ? parts.join(', ') : 'uses default'}
                        </summary>
                        <TagQueryPicker
                          label={`Override for ${c.name}`}
                          value={o.tag_query}
                          onChange={(tag_query) => setOverride({ tag_query })}
                        />
                        <EntryListPicker
                          entries={entries}
                          campaigns={mapCampaigns}
                          value={o.entry_ids}
                          onChange={(entry_ids) => setOverride({ entry_ids })}
                        />
                      </details>
                    )
                  })}
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
