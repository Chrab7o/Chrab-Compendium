import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useWorlds } from '../../hooks/useWorlds'
import { adjacency, centroid, linkKey, nearestSphere, orderPair, placeNear } from '../../lib/storyEngine'
import StoryBoard from '../../components/dm/storyengine/StoryBoard'
import SphereDetail from '../../components/dm/storyengine/SphereDetail'
import GeneratorPanel from '../../components/dm/storyengine/GeneratorPanel'
import PoolManager from '../../components/dm/storyengine/PoolManager'

const WORLD_KEY = 'chrab.storyEngine.world'
// A delete with at least this many links between the doomed spheres asks
// first; anything lighter just goes, since only the links go with it.
const CONFIRM_LINKS = 3

const readWorld = () => {
  try {
    return localStorage.getItem(WORLD_KEY) ?? ''
  } catch {
    return ''
  }
}

// The Story Engine: a GM-only sphere grid for building a world from the big
// picture down. Spheres have no hierarchy - only undirected links - and new
// ones come from curated name pools, never invented. See the story_engine
// migration for the data model.
export default function DMStoryEnginePage() {
  const { worlds, loading: worldsLoading } = useWorlds()
  const [worldId, setWorldId] = useState(readWorld)
  const [spheres, setSpheres] = useState([])
  const [links, setLinks] = useState([])
  const [tags, setTags] = useState([])
  const [pools, setPools] = useState([])
  const [selection, setSelection] = useState(() => new Set())
  const [focusId, setFocusId] = useState(null)
  const [tab, setTab] = useState('sphere')
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const viewCenterRef = useRef({ x: 0, y: 0 })

  // Fall back to the first world if the remembered one is gone.
  useEffect(() => {
    if (worldsLoading) return
    if (!worlds.some((w) => w.id === worldId)) setWorldId(worlds[0]?.id ?? '')
  }, [worlds, worldsLoading, worldId])

  useEffect(() => {
    try {
      if (worldId) localStorage.setItem(WORLD_KEY, worldId)
    } catch {
      /* private mode */
    }
    setSelection(new Set())
    setFocusId(null)
  }, [worldId])

  const load = useCallback(async () => {
    if (!worldId) return
    const [sphereRes, linkRes, poolRes, tagRes] = await Promise.all([
      supabase.from('story_spheres').select('*').eq('world_id', worldId).order('created_at', { ascending: true }),
      supabase.from('story_links').select('*').eq('world_id', worldId),
      supabase.from('story_pools').select('*').eq('world_id', worldId).order('name', { ascending: true }),
      supabase.from('story_tags').select('*').order('sort_order', { ascending: true }),
    ])
    const firstError = [sphereRes, linkRes, poolRes, tagRes].find((r) => r.error)?.error
    if (firstError) setError(firstError.message)
    setSpheres(sphereRes.data ?? [])
    setLinks(linkRes.data ?? [])
    setPools(poolRes.data ?? [])
    setTags(tagRes.data ?? [])
  }, [worldId])

  useEffect(() => {
    load()
  }, [load])

  const tagsByValue = useMemo(() => new Map(tags.map((t) => [t.value, t])), [tags])
  const spheresById = useMemo(() => new Map(spheres.map((s) => [s.id, s])), [spheres])
  const focus = focusId ? spheresById.get(focusId) : null
  const selectedSpheres = useMemo(
    () => [...selection].map((id) => spheresById.get(id)).filter(Boolean),
    [selection, spheresById]
  )

  const linkedToFocus = useMemo(() => {
    if (!focus) return []
    return links
      .filter((l) => l.a === focus.id || l.b === focus.id)
      .map((link) => ({ link, other: spheresById.get(link.a === focus.id ? link.b : link.a) }))
      .filter((x) => x.other)
      .sort((x, y) => x.other.name.localeCompare(y.other.name))
  }, [focus, links, spheresById])

  const stats = useMemo(() => {
    const adj = adjacency(links)
    return {
      stubs: spheres.filter((s) => s.is_stub).length,
      untagged: spheres.filter((s) => !s.tag).length,
      unlinked: spheres.filter((s) => !adj.has(s.id)).length,
    }
  }, [spheres, links])

  const handleSelectionChange = useCallback((next, nextFocus) => {
    setSelection(next)
    setFocusId(nextFocus)
    if (nextFocus) setTab((t) => (t === 'pools' ? 'sphere' : t))
  }, [])

  const handleMove = useCallback(
    async (updates) => {
      const byId = new Map(updates.map((u) => [u.id, u]))
      setSpheres((rows) => rows.map((s) => (byId.has(s.id) ? { ...s, ...byId.get(s.id) } : s)))
      const results = await Promise.all(
        updates.map((u) => supabase.from('story_spheres').update({ x: u.x, y: u.y }).eq('id', u.id))
      )
      const failed = results.find((r) => r.error)
      if (failed) {
        setError(failed.error.message)
        load()
      }
    },
    [load]
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
      const target = spheresById.get(targetId)
      const label = sources.length === 1 ? spheresById.get(sources[0])?.name : `${sources.length} spheres`

      if (existing.length === sources.length) {
        const { error: deleteError } = await supabase
          .from('story_links')
          .delete()
          .in('id', existing.map((l) => l.id))
        if (deleteError) setError(deleteError.message)
        else setNotice(`Unlinked ${label} from ${target?.name}.`)
      } else {
        const rows = sources
          .filter((id) => !byKey.has(linkKey(id, targetId)))
          .map((id) => {
            const [a, b] = orderPair(id, targetId)
            return { world_id: worldId, a, b }
          })
        const { error: insertError } = await supabase.from('story_links').insert(rows)
        if (insertError) setError(insertError.message)
        else setNotice(`Linked ${label} to ${target?.name}.`)
      }
      load()
    },
    [links, spheresById, worldId, load]
  )

  async function handleUnlink(linkId) {
    const { error: deleteError } = await supabase.from('story_links').delete().eq('id', linkId)
    if (deleteError) setError(deleteError.message)
    load()
  }

  // Deleting removes the sphere and its links - nothing else. No cascade to
  // linked spheres, no holding area.
  const handleDelete = useCallback(
    async (ids) => {
      if (!ids.length) return
      const doomed = new Set(ids)
      const linkCount = links.filter((l) => doomed.has(l.a) || doomed.has(l.b)).length
      if (linkCount >= CONFIRM_LINKS) {
        const what = ids.length === 1 ? `"${spheresById.get(ids[0])?.name}"` : `${ids.length} spheres`
        if (!confirm(`Delete ${what}? ${ids.length === 1 ? 'Its' : 'Their'} ${linkCount} links go with it. Linked spheres are kept.`)) return
      }
      setError(null)
      const { error: deleteError } = await supabase.from('story_spheres').delete().in('id', ids)
      if (deleteError) {
        setError(deleteError.message)
        return
      }
      setSelection(new Set())
      setFocusId(null)
      setNotice(`Deleted ${ids.length === 1 ? spheresById.get(ids[0])?.name : `${ids.length} spheres`}.`)
      load()
    },
    [links, spheresById, load]
  )

  async function handleUpdate(id, changes) {
    setSpheres((rows) => rows.map((s) => (s.id === id ? { ...s, ...changes } : s)))
    const { error: updateError } = await supabase.from('story_spheres').update(changes).eq('id', id)
    if (updateError) {
      setError(updateError.message)
      load()
    }
  }

  // New spheres land a rough distance from the selection (or, with nothing
  // selected, from whichever sphere is nearest the middle of the view) and
  // link to every selected sphere - but not to each other.
  async function handleCreate(names, tag) {
    setError(null)
    const center = viewCenterRef.current
    let positions
    if (selectedSpheres.length) {
      positions = placeNear(centroid(selectedSpheres), names.length, spheres)
    } else if (spheres.length) {
      positions = placeNear(nearestSphere(spheres, center), names.length, spheres)
    } else if (names.length === 1) {
      positions = [{ x: Math.round(center.x), y: Math.round(center.y) }]
    } else {
      positions = placeNear(center, names.length, [], { distance: 110 })
    }

    const { data: created, error: insertError } = await supabase
      .from('story_spheres')
      .insert(names.map((name, i) => ({ world_id: worldId, name, tag, is_stub: true, ...positions[i] })))
      .select()
    if (insertError) return insertError.message

    if (selectedSpheres.length) {
      const rows = created.flatMap((s) =>
        selectedSpheres.map((anchor) => {
          const [a, b] = orderPair(s.id, anchor.id)
          return { world_id: worldId, a, b }
        })
      )
      const { error: linkError } = await supabase.from('story_links').insert(rows)
      if (linkError) setError(`Spheres created, but linking failed: ${linkError.message}`)
    } else if (!spheres.length) {
      // The very first spheres on a board become the selection, so the next
      // batch naturally grows out of them.
      setSelection(new Set(created.map((s) => s.id)))
      setFocusId(created.length === 1 ? created[0].id : null)
    }
    await load()
    return null
  }

  const existingNames = useMemo(() => spheres.map((s) => s.name), [spheres])

  if (!worldsLoading && !worlds.length) {
    return (
      <section className="page">
        <div className="view-header">
          <h1>Story Engine</h1>
        </div>
        <p className="status-message">
          Each world gets its own board. <Link to="/dm/worlds">Create a world</Link> first.
        </p>
      </section>
    )
  }

  return (
    <section className="page-wide se-page">
      <div className="view-header">
        <h1>Story Engine</h1>
        <p className="view-subtitle">
          Build the world from the big picture down. Spheres connect only by links — the text says what a link
          means. Shift-click to select several, right-click empty space to clear, drag one sphere onto another to
          link or unlink them.
        </p>
      </div>

      <div className="se-toolbar">
        <label className="se-world">
          World
          <select value={worldId} onChange={(e) => setWorldId(e.target.value)}>
            {worlds.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        <div className="se-stats">
          <span className="badge se-stat">{spheres.length} spheres</span>
          <span className="badge se-stat">{links.length} links</span>
          <span className="badge se-stat is-stub">{stats.stubs} stubs</span>
          <span className="badge se-stat is-untagged">{stats.untagged} untagged</span>
          <span className="badge se-stat">{stats.unlinked} unlinked</span>
        </div>
      </div>

      {error && <p className="status-message error">{error}</p>}
      {notice && !error && <p className="status-message se-notice">{notice}</p>}

      <datalist id="se-tag-options">
        {tags.map((t) => (
          <option key={t.value} value={t.label} />
        ))}
      </datalist>

      <div className="se-layout">
        <StoryBoard
          key={worldId}
          spheres={spheres}
          links={links}
          tagsByValue={tagsByValue}
          selection={selection}
          focusId={focusId}
          onSelectionChange={handleSelectionChange}
          onMove={handleMove}
          onLinkDrop={handleLinkDrop}
          onDelete={handleDelete}
          viewCenterRef={viewCenterRef}
        />

        <aside className="dm-panel se-side">
          <div className="shop-tabs se-tabs">
            {[
              ['sphere', 'Sphere'],
              ['generate', 'Generate'],
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

          {tab === 'sphere' && (
            <>
              {selection.size > 1 && (
                <div className="se-multi">
                  <span>
                    <strong>{selection.size}</strong> selected — drag any of them to move or link the group.
                  </span>
                  <button type="button" className="danger" onClick={() => handleDelete([...selection])}>
                    Delete all
                  </button>
                </div>
              )}
              {focus ? (
                <SphereDetail
                  key={focus.id}
                  sphere={focus}
                  tags={tags}
                  tagsByValue={tagsByValue}
                  linked={linkedToFocus}
                  onUpdate={(changes) => handleUpdate(focus.id, changes)}
                  onUnlink={handleUnlink}
                  onFocus={(id) => handleSelectionChange(new Set([id]), id)}
                  onDelete={() => handleDelete([focus.id])}
                />
              ) : (
                <p className="status-message">Click a sphere to open it.</p>
              )}
            </>
          )}

          {tab === 'generate' && (
            <GeneratorPanel
              tags={tags}
              tagsByValue={tagsByValue}
              pools={pools}
              existingNames={existingNames}
              selectedSpheres={selectedSpheres}
              onCreate={handleCreate}
            />
          )}

          {tab === 'pools' && (
            <PoolManager worldId={worldId} pools={pools} tags={tags} tagsByValue={tagsByValue} onChanged={load} />
          )}
        </aside>
      </div>

      {tags.length > 0 && (
        <div className="se-legend">
          {tags.map((t) => (
            <span key={t.value} className="se-legend-item">
              <span className="se-swatch" style={{ background: t.color }} />
              {t.label}
            </span>
          ))}
          <span className="se-legend-item">
            <span className="se-swatch is-stub" />
            Stub
          </span>
          <span className="se-legend-item">
            <span className="se-swatch is-untagged" />
            Untagged
          </span>
        </div>
      )}
    </section>
  )
}
