import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useTags } from '../../contexts/TagContext'
import { adjacency, centroid, linkKey, nearestSphere, orderPair, placeNear, sphereKind } from '../../lib/sphereGrid'
import SphereBoard from '../../components/dm/spheregrid/SphereBoard'
import SphereDetail from '../../components/dm/spheregrid/SphereDetail'
import GeneratorPanel from '../../components/dm/spheregrid/GeneratorPanel'
import PoolManager from '../../components/dm/spheregrid/PoolManager'
import EntryAdder from '../../components/dm/spheregrid/EntryAdder'

const GRID_KEY = 'chrab.sphereGrid.grid'

const readGrid = () => {
  try {
    return localStorage.getItem(GRID_KEY) ?? ''
  } catch {
    return ''
  }
}

// The Sphere Grid: a way to explore wiki entries as a web of links, and a
// graphical way to create them. A sphere IS an entry - same title, text, tags
// and visibility - and links belong to the entries, so they show on every
// grid. A grid only decides which entries are laid out and where. See the
// sphere_grid migration for the data model.
export default function DMSphereGridPage() {
  const { tags, typeGroup } = useTags()
  const [grids, setGrids] = useState([])
  const [gridsLoaded, setGridsLoaded] = useState(false)
  const [gridId, setGridId] = useState(readGrid)
  const [nodes, setNodes] = useState([])
  const [entries, setEntries] = useState([])
  const [links, setLinks] = useState([])
  const [pools, setPools] = useState([])
  const [selection, setSelection] = useState(() => new Set())
  const [focusId, setFocusId] = useState(null)
  const [tab, setTab] = useState('generate')
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [newGridName, setNewGridName] = useState('')
  const viewCenterRef = useRef({ x: 0, y: 0 })
  const editorRef = useRef(null)

  const loadGrids = useCallback(async () => {
    const { data, error: gridError } = await supabase
      .from('sphere_grids')
      .select('*')
      .order('created_at', { ascending: true })
    if (gridError) setError(gridError.message)
    setGrids(data ?? [])
    setGridsLoaded(true)
  }, [])

  useEffect(() => {
    loadGrids()
  }, [loadGrids])

  // Fall back to the first grid if the remembered one is gone.
  useEffect(() => {
    if (!gridsLoaded) return
    if (!grids.some((g) => g.id === gridId)) setGridId(grids[0]?.id ?? '')
  }, [grids, gridsLoaded, gridId])

  useEffect(() => {
    try {
      if (gridId) localStorage.setItem(GRID_KEY, gridId)
    } catch {
      /* private mode */
    }
    setSelection(new Set())
    setFocusId(null)
  }, [gridId])

  const load = useCallback(async () => {
    const [entryRes, linkRes, poolRes, nodeRes] = await Promise.all([
      supabase.from('entries').select('id, title, content, tags, visibility, is_stub, parent_entry_id'),
      supabase.from('entry_links').select('*'),
      supabase.from('name_pools').select('*').order('name', { ascending: true }),
      gridId
        ? supabase.from('sphere_grid_nodes').select('*').eq('grid_id', gridId)
        : Promise.resolve({ data: [] }),
    ])
    const firstError = [entryRes, linkRes, poolRes, nodeRes].find((r) => r.error)?.error
    if (firstError) setError(firstError.message)
    setEntries(entryRes.data ?? [])
    setLinks(linkRes.data ?? [])
    setPools(poolRes.data ?? [])
    setNodes(nodeRes.data ?? [])
  }, [gridId])

  useEffect(() => {
    load()
  }, [load])

  const entriesById = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries])
  const onGrid = useMemo(() => new Set(nodes.map((n) => n.entry_id)), [nodes])
  const colorOf = useCallback((entry) => sphereKind(entry.tags, tags, typeGroup?.id).color, [tags, typeGroup])

  const spheres = useMemo(() => {
    const adj = adjacency(links)
    const labelOf = (v) => tags.find((t) => t.value === v)?.label ?? v
    return nodes
      .map((n) => {
        const entry = entriesById.get(n.entry_id)
        if (!entry) return null
        const kind = sphereKind(entry.tags, tags, typeGroup?.id)
        const neighbours = adj.get(entry.id) ?? new Set()
        return {
          id: entry.id,
          name: entry.title,
          x: n.x,
          y: n.y,
          is_stub: entry.is_stub,
          gm_only: entry.visibility === 'dm',
          color: kind.color,
          kindLabel: kind.tag?.label ?? null,
          tagLabels: (entry.tags ?? []).map(labelOf),
          hiddenLinks: [...neighbours].filter((id) => !onGrid.has(id) && entriesById.has(id)).length,
        }
      })
      .filter(Boolean)
  }, [nodes, entriesById, links, tags, typeGroup, onGrid])

  const spheresById = useMemo(() => new Map(spheres.map((s) => [s.id, s])), [spheres])
  const gridLinks = useMemo(() => links.filter((l) => onGrid.has(l.a) && onGrid.has(l.b)), [links, onGrid])
  const focusSphere = focusId ? spheresById.get(focusId) : null
  const focusEntry = focusId ? entriesById.get(focusId) : null
  const selectedSpheres = useMemo(
    () => [...selection].map((id) => spheresById.get(id)).filter(Boolean),
    [selection, spheresById]
  )

  const linkedToFocus = useMemo(() => {
    if (!focusEntry) return []
    return links
      .filter((l) => l.a === focusEntry.id || l.b === focusEntry.id)
      .map((link) => {
        const other = entriesById.get(link.a === focusEntry.id ? link.b : link.a)
        return other && { link, other, color: colorOf(other), onGrid: onGrid.has(other.id) }
      })
      .filter(Boolean)
      .sort((x, y) => Number(y.onGrid) - Number(x.onGrid) || x.other.title.localeCompare(y.other.title))
  }, [focusEntry, links, entriesById, colorOf, onGrid])

  const stats = useMemo(
    () => ({
      stubs: spheres.filter((s) => s.is_stub).length,
      untagged: spheres.filter((s) => !s.color).length,
      offGrid: spheres.reduce((n, s) => n + (s.hiddenLinks > 0 ? 1 : 0), 0),
    }),
    [spheres]
  )

  const existingNames = useMemo(() => entries.map((e) => e.title), [entries])

  const handleSelectionChange = useCallback((next, nextFocus) => {
    setSelection(next)
    setFocusId(nextFocus)
  }, [])

  // The editor opens above the grid, so bring it into view when a different
  // sphere is opened and its top has scrolled off screen.
  useEffect(() => {
    if (!focusId || !editorRef.current) return
    if (editorRef.current.getBoundingClientRect().top < 0) {
      editorRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [focusId])

  // Where new spheres go: around the selection, else near whichever sphere is
  // closest to the middle of the view, else the middle of the view itself.
  function placementAnchor() {
    const center = viewCenterRef.current
    if (selectedSpheres.length) return centroid(selectedSpheres)
    if (spheres.length) return nearestSphere(spheres, center)
    return center
  }

  async function insertNodes(entryIds, anchor) {
    let positions
    if (!spheres.length && entryIds.length === 1) {
      positions = [{ x: Math.round(anchor.x), y: Math.round(anchor.y) }]
    } else {
      positions = placeNear(anchor, entryIds.length, spheres, spheres.length ? {} : { distance: 110 })
    }
    return supabase
      .from('sphere_grid_nodes')
      .upsert(
        entryIds.map((entry_id, i) => ({ grid_id: gridId, entry_id, ...positions[i] })),
        { onConflict: 'grid_id,entry_id', ignoreDuplicates: true }
      )
  }

  const handleMove = useCallback(
    async (updates) => {
      const byId = new Map(updates.map((u) => [u.id, u]))
      setNodes((rows) =>
        rows.map((n) => (byId.has(n.entry_id) ? { ...n, x: byId.get(n.entry_id).x, y: byId.get(n.entry_id).y } : n))
      )
      const results = await Promise.all(
        updates.map((u) =>
          supabase.from('sphere_grid_nodes').update({ x: u.x, y: u.y }).eq('grid_id', gridId).eq('entry_id', u.id)
        )
      )
      const failed = results.find((r) => r.error)
      if (failed) {
        setError(failed.error.message)
        load()
      }
    },
    [gridId, load]
  )

  // Dropping spheres on a target links them all to it - unless every one of
  // them is already linked, in which case the drop unlinks instead.
  const handleLinkDrop = useCallback(
    async (sourceIds, targetId) => {
      setError(null)
      const sources = sourceIds.filter((id) => id !== targetId)
      if (!sources.length) return
      const byKey = new Map(links.map((l) => [linkKey(l.a, l.b), l]))
      const existing = sources.map((id) => byKey.get(linkKey(id, targetId))).filter(Boolean)
      const target = entriesById.get(targetId)
      const label = sources.length === 1 ? entriesById.get(sources[0])?.title : `${sources.length} spheres`

      if (existing.length === sources.length) {
        const { error: deleteError } = await supabase
          .from('entry_links')
          .delete()
          .in('id', existing.map((l) => l.id))
        if (deleteError) setError(deleteError.message)
        else setNotice(`Unlinked ${label} from ${target?.title}.`)
      } else {
        const rows = sources
          .filter((id) => !byKey.has(linkKey(id, targetId)))
          .map((id) => {
            const [a, b] = orderPair(id, targetId)
            return { a, b }
          })
        const { error: insertError } = await supabase.from('entry_links').insert(rows)
        if (insertError) setError(insertError.message)
        else setNotice(`Linked ${label} to ${target?.title}.`)
      }
      load()
    },
    [links, entriesById, load]
  )

  async function handleUnlink(linkId) {
    const { error: deleteError } = await supabase.from('entry_links').delete().eq('id', linkId)
    if (deleteError) setError(deleteError.message)
    load()
  }

  // Taking spheres off a grid touches nothing else: the entries and their
  // links stay, and show up again wherever they are placed.
  const handleRemove = useCallback(
    async (ids) => {
      if (!ids.length) return
      setError(null)
      const { error: deleteError } = await supabase
        .from('sphere_grid_nodes')
        .delete()
        .eq('grid_id', gridId)
        .in('entry_id', ids)
      if (deleteError) {
        setError(deleteError.message)
        return
      }
      setSelection(new Set())
      setFocusId(null)
      setNotice(`Took ${ids.length === 1 ? entriesById.get(ids[0])?.title : `${ids.length} spheres`} off this grid.`)
      load()
    },
    [gridId, entriesById, load]
  )

  // Deleting the entry itself removes it from the wiki and every grid, along
  // with its links. Always asks, since this is real wiki content.
  async function handleDeleteEntry(id) {
    const entry = entriesById.get(id)
    if (!entry) return
    const linkCount = links.filter((l) => l.a === id || l.b === id).length
    const children = entries.filter((e) => e.parent_entry_id === id).length
    const parts = [`Delete "${entry.title}" from the wiki?`]
    if (linkCount) parts.push(`Its ${linkCount} link(s) go with it; linked entries are kept.`)
    if (children) parts.push(`It also has ${children} sub-entr${children === 1 ? 'y' : 'ies'}, which will be deleted too.`)
    if (!confirm(parts.join(' '))) return
    const { error: deleteError } = await supabase.from('entries').delete().eq('id', id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    setSelection(new Set())
    setFocusId(null)
    setNotice(`Deleted ${entry.title}.`)
    load()
  }

  async function handleUpdate(id, changes) {
    setEntries((rows) => rows.map((e) => (e.id === id ? { ...e, ...changes } : e)))
    const { error: updateError } = await supabase.from('entries').update(changes).eq('id', id)
    if (updateError) {
      setError(updateError.message)
      load()
    }
  }

  // New entries land near the selection and link to every selected sphere -
  // but not to each other.
  async function handleCreate(names, { tags: batchTags, visibility }) {
    setError(null)
    const anchor = placementAnchor()
    const { data: created, error: insertError } = await supabase
      .from('entries')
      .insert(names.map((title) => ({ title, content: '', tags: batchTags, visibility, is_stub: true })))
      .select('id')
    if (insertError) return insertError.message

    const ids = created.map((e) => e.id)
    const { error: nodeError } = await insertNodes(ids, anchor)
    if (nodeError) setError(`Entries created, but placing them failed: ${nodeError.message}`)

    if (selectedSpheres.length) {
      const rows = ids.flatMap((id) =>
        selectedSpheres.map((anchorSphere) => {
          const [a, b] = orderPair(id, anchorSphere.id)
          return { a, b }
        })
      )
      const { error: linkError } = await supabase.from('entry_links').insert(rows)
      if (linkError) setError(`Entries created, but linking failed: ${linkError.message}`)
    } else if (!spheres.length) {
      // The very first spheres on a grid become the selection, so the next
      // batch naturally grows out of them.
      setSelection(new Set(ids))
      setFocusId(ids.length === 1 ? ids[0] : null)
    }
    await load()
    return null
  }

  // Put existing entries on this grid. From a sphere's link list they gather
  // around that sphere; from the search they go where new spheres would.
  async function handlePlace(entryIds, around) {
    setError(null)
    const anchor = around ?? placementAnchor()
    const { error: nodeError } = await insertNodes(entryIds, anchor)
    if (nodeError) setError(nodeError.message)
    else
      setNotice(
        `Placed ${entryIds.length === 1 ? entriesById.get(entryIds[0])?.title : `${entryIds.length} entries`} on this grid.`
      )
    load()
  }

  async function handleCreateGrid(e) {
    e.preventDefault()
    const name = newGridName.trim()
    if (!name) return
    const { data, error: insertError } = await supabase.from('sphere_grids').insert({ name }).select().single()
    if (insertError) {
      setError(insertError.message)
      return
    }
    setNewGridName('')
    await loadGrids()
    setGridId(data.id)
  }

  async function handleRenameGrid() {
    const grid = grids.find((g) => g.id === gridId)
    const name = prompt('Rename this grid', grid?.name ?? '')?.trim()
    if (!name || name === grid?.name) return
    const { error: updateError } = await supabase.from('sphere_grids').update({ name }).eq('id', gridId)
    if (updateError) setError(updateError.message)
    loadGrids()
  }

  async function handleDeleteGrid() {
    const grid = grids.find((g) => g.id === gridId)
    if (!grid) return
    if (!confirm(`Delete the grid "${grid.name}"? Its entries and links stay in the wiki.`)) return
    const { error: deleteError } = await supabase.from('sphere_grids').delete().eq('id', gridId)
    if (deleteError) setError(deleteError.message)
    else {
      setGridId('')
      loadGrids()
    }
  }

  const newGridForm = (
    <form className="sg-new-grid" onSubmit={handleCreateGrid}>
      <input
        value={newGridName}
        onChange={(e) => setNewGridName(e.target.value)}
        placeholder="New grid name, e.g. Aracia"
        aria-label="New grid name"
      />
      <button type="submit" disabled={!newGridName.trim()}>
        New grid
      </button>
    </form>
  )

  if (gridsLoaded && !grids.length) {
    return (
      <section className="page">
        <div className="view-header">
          <h1>Sphere Grid</h1>
          <p className="view-subtitle">
            Explore your entries as a web of linked spheres, and create new ones graphically. Start with a grid — a
            named view you lay entries out on.
          </p>
        </div>
        {error && <p className="status-message error">{error}</p>}
        <div className="dm-panel">{newGridForm}</div>
      </section>
    )
  }

  return (
    <section className="page-wide sg-page">
      <div className="view-header">
        <h1>Sphere Grid</h1>
        <p className="view-subtitle">
          Every sphere is a wiki entry. Shift-click to select several, right-click empty space to clear, drag one
          sphere onto another to link or unlink them. Delete takes spheres off this grid — the entries stay.
        </p>
      </div>

      <div className="sg-toolbar">
        <div className="sg-grid-picker">
          <label className="sg-world">
            Grid
            <select value={gridId} onChange={(e) => setGridId(e.target.value)}>
              {grids.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="secondary" onClick={handleRenameGrid}>
            Rename
          </button>
          <button type="button" className="secondary" onClick={handleDeleteGrid}>
            Delete grid
          </button>
          {newGridForm}
        </div>
        <div className="sg-stats">
          <span className="badge sg-stat">{spheres.length} spheres</span>
          <span className="badge sg-stat">{gridLinks.length} links</span>
          <span className="badge sg-stat is-stub">{stats.stubs} stubs</span>
          <span className="badge sg-stat is-untagged">{stats.untagged} untagged</span>
          <span className="badge sg-stat">{stats.offGrid} with links off-grid</span>
        </div>
      </div>

      {error && <p className="status-message error">{error}</p>}
      {notice && !error && <p className="status-message sg-notice">{notice}</p>}

      {focusSphere && focusEntry && (
        <div className="dm-panel sg-editor" ref={editorRef}>
          <SphereDetail
            key={focusEntry.id}
            sphere={focusSphere}
            entry={focusEntry}
            linked={linkedToFocus}
            onUpdate={(changes) => handleUpdate(focusEntry.id, changes)}
            onUnlink={handleUnlink}
            onFocus={(id) => handleSelectionChange(new Set([id]), id)}
            onPlace={(ids) => handlePlace(ids, focusSphere)}
            onRemove={() => handleRemove([focusEntry.id])}
            onDeleteEntry={() => handleDeleteEntry(focusEntry.id)}
            onClose={() => setFocusId(null)}
          />
        </div>
      )}

      {selection.size > 1 && (
        <div className="sg-multi">
          <span>
            <strong>{selection.size}</strong> selected — drag any of them to move or link the group.
          </span>
          <button type="button" className="secondary" onClick={() => handleRemove([...selection])}>
            Remove from grid
          </button>
        </div>
      )}

      {!focusSphere && spheres.length > 0 && (
        <p className="status-message sg-hint">Click a sphere to open it here.</p>
      )}

      <div className="sg-layout">
        <SphereBoard
          key={gridId}
          spheres={spheres}
          links={gridLinks}
          selection={selection}
          focusId={focusId}
          onSelectionChange={handleSelectionChange}
          onMove={handleMove}
          onLinkDrop={handleLinkDrop}
          onRemove={handleRemove}
          viewCenterRef={viewCenterRef}
        />

        <aside className="dm-panel sg-side">
          <div className="shop-tabs sg-tabs">
            {[
              ['generate', 'Generate'],
              ['add', 'Add existing'],
              ['pools', `Pools (${pools.length})`],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`secondary${tab === key ? ' is-active' : ''}`}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'generate' && (
            <GeneratorPanel
              pools={pools}
              existingNames={existingNames}
              selectedSpheres={selectedSpheres}
              onCreate={handleCreate}
            />
          )}

          {tab === 'add' && <EntryAdder entries={entries} onGrid={onGrid} colorOf={colorOf} onPlace={handlePlace} />}

          {tab === 'pools' && <PoolManager pools={pools} onChanged={load} />}
        </aside>
      </div>

      <div className="sg-legend">
        <span className="sg-legend-item">Color = the entry's Type tag</span>
        <span className="sg-legend-item">
          <span className="sg-swatch is-stub" />
          Stub
        </span>
        <span className="sg-legend-item">
          <span className="sg-swatch is-untagged" />
          Untagged
        </span>
        <span className="sg-legend-item">
          <span className="sg-legend-badge is-gm">GM</span>
          GM-only
        </span>
        <span className="sg-legend-item">
          <span className="sg-legend-badge is-more">+2</span>
          Linked entries not on this grid
        </span>
      </div>
    </section>
  )
}
