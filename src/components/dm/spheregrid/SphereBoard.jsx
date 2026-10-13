import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { SPHERE_RADIUS, centroid, linkEnds, linkKey } from '../../../lib/sphereGrid'

const MIN_ZOOM = 0.25
const MAX_ZOOM = 2.5
// Below this zoom, names only show on selected/hovered spheres - a zoomed-out
// board full of overlapping labels is unreadable anyway.
const LABEL_ZOOM = 0.55
// Pointer travel (screen px) before a press counts as a drag, not a click.
const DRAG_THRESHOLD = 4

const isTyping = (el) =>
  el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)

// The sphere grid: a static 2D space you pan, where spheres (entries) stay
// wherever they are put on this grid. Plain SVG rather than a graph library - nothing here is laid out
// automatically, so a layout engine would only be in the way.
//
// Drag has two jobs, settled by where the drop lands: released over another
// sphere it links (or, if already linked, unlinks) and the dragged spheres
// snap back; released anywhere else it is a move. Dragging a selected sphere
// carries the whole selection with it, for both.
//
// A link with a direction is drawn from container to contained, ending in an
// arrowhead at the contained sphere's edge; a plain link is a bare line.
// A sphere's fill says where it sits in that hierarchy (red contains, blue is
// inside, purple both) and its outer ring carries its Type tag color.
export default function SphereBoard({
  spheres,
  links,
  selection,
  focusId,
  onSelectionChange,
  onMove,
  onLinkDrop,
  onRemove,
  viewCenterRef,
}) {
  const wrapRef = useRef(null)
  const svgRef = useRef(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })
  const viewRef = useRef(view)
  viewRef.current = view
  const [drag, setDrag] = useState(null) // { ids, dx, dy, targetId }
  const [hoverId, setHoverId] = useState(null)
  const gesture = useRef(null)
  const fitted = useRef(false)

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize({ w: width, h: height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const fitToSpheres = useCallback(() => {
    if (!size.w) return
    const c = spheres.length ? centroid(spheres) : { x: 0, y: 0 }
    setView({ x: size.w / 2 - c.x, y: size.h / 2 - c.y, k: 1 })
  }, [spheres, size])

  // Center once per board, as soon as both the size and the spheres are in.
  useEffect(() => {
    if (fitted.current || !size.w) return
    fitToSpheres()
    if (spheres.length) fitted.current = true
  }, [size, spheres, fitToSpheres])

  // Where new spheres land when nothing is selected.
  useEffect(() => {
    if (!viewCenterRef) return
    viewCenterRef.current = {
      x: (size.w / 2 - view.x) / view.k,
      y: (size.h / 2 - view.y) / view.k,
    }
  }, [view, size, viewCenterRef])

  const toWorld = useCallback((clientX, clientY) => {
    const rect = svgRef.current.getBoundingClientRect()
    const v = viewRef.current
    return { x: (clientX - rect.left - v.x) / v.k, y: (clientY - rect.top - v.y) / v.k }
  }, [])

  const hitTest = useCallback(
    (point, excludeIds = []) => {
      const skip = new Set(excludeIds)
      for (let i = spheres.length - 1; i >= 0; i--) {
        const s = spheres[i]
        if (skip.has(s.id)) continue
        if (Math.hypot(s.x - point.x, s.y - point.y) <= SPHERE_RADIUS + 6) return s
      }
      return null
    },
    [spheres]
  )

  // Wheel zoom around the cursor. Attached natively because React's wheel
  // listener is passive and cannot stop the page from scrolling.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e) => {
      e.preventDefault()
      const rect = svg.getBoundingClientRect()
      const px = e.clientX - rect.left
      const py = e.clientY - rect.top
      setView((v) => {
        const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.k * Math.exp(-e.deltaY * 0.0015)))
        return { k, x: px - (px - v.x) * (k / v.k), y: py - (py - v.y) * (k / v.k) }
      })
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [])

  // Delete takes the selection off this grid (the entries themselves stay);
  // Escape clears it. Ignored while typing in the side panel so Backspace in
  // a text field never removes a sphere.
  useEffect(() => {
    const onKey = (e) => {
      if (isTyping(e.target)) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && selection.size) {
        e.preventDefault()
        onRemove([...selection])
      } else if (e.key === 'Escape' && selection.size) {
        onSelectionChange(new Set(), null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selection, onRemove, onSelectionChange])

  function handlePointerDown(e) {
    if (e.button !== 0 && e.button !== 1) return
    const sphereEl = e.button === 0 ? e.target.closest('[data-sphere-id]') : null
    const id = sphereEl?.getAttribute('data-sphere-id')
    if (id) {
      gesture.current = {
        type: 'sphere',
        id,
        shift: e.shiftKey,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
        ids: selection.has(id) ? [...selection] : [id],
      }
    } else {
      gesture.current = {
        type: 'pan',
        startX: e.clientX,
        startY: e.clientY,
        origin: { x: view.x, y: view.y },
        moved: false,
      }
    }
    svgRef.current.setPointerCapture(e.pointerId)
  }

  function handlePointerMove(e) {
    const g = gesture.current
    if (!g) return
    const dx = e.clientX - g.startX
    const dy = e.clientY - g.startY
    if (!g.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
    g.moved = true
    if (g.type === 'pan') {
      setView((v) => ({ ...v, x: g.origin.x + dx, y: g.origin.y + dy }))
    } else {
      const k = viewRef.current.k
      const target = hitTest(toWorld(e.clientX, e.clientY), g.ids)
      setDrag({ ids: g.ids, dx: dx / k, dy: dy / k, targetId: target?.id ?? null })
    }
  }

  function handlePointerUp(e) {
    const g = gesture.current
    gesture.current = null
    if (svgRef.current.hasPointerCapture(e.pointerId)) svgRef.current.releasePointerCapture(e.pointerId)
    if (!g || g.type !== 'sphere') return

    if (!g.moved) {
      if (g.shift) {
        const next = new Set(selection)
        if (next.has(g.id)) {
          next.delete(g.id)
          onSelectionChange(next, focusId === g.id ? [...next].pop() ?? null : focusId)
        } else {
          next.add(g.id)
          onSelectionChange(next, g.id)
        }
      } else {
        onSelectionChange(new Set([g.id]), g.id)
      }
      return
    }

    const k = viewRef.current.k
    const dx = (e.clientX - g.startX) / k
    const dy = (e.clientY - g.startY) / k
    const target = hitTest(toWorld(e.clientX, e.clientY), g.ids)
    setDrag(null)
    if (target) {
      onLinkDrop(g.ids, target.id)
    } else {
      const byId = new Map(spheres.map((s) => [s.id, s]))
      onMove(
        g.ids
          .map((id) => byId.get(id))
          .filter(Boolean)
          .map((s) => ({ id: s.id, x: Math.round(s.x + dx), y: Math.round(s.y + dy) }))
      )
    }
  }

  function handleContextMenu(e) {
    e.preventDefault()
    if (!e.target.closest('[data-sphere-id]')) onSelectionChange(new Set(), null)
  }

  function zoomBy(factor) {
    setView((v) => {
      const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.k * factor))
      const px = size.w / 2
      const py = size.h / 2
      return { k, x: px - (px - v.x) * (k / v.k), y: py - (py - v.y) * (k / v.k) }
    })
  }

  const dragging = drag ? new Set(drag.ids) : null
  const pos = new Map(
    spheres.map((s) =>
      dragging?.has(s.id) ? [s.id, { x: s.x + drag.dx, y: s.y + drag.dy }] : [s.id, { x: s.x, y: s.y }]
    )
  )

  // Show what a drop would do before it happens.
  let dropMode = null
  if (drag?.targetId) {
    const existing = new Set(links.map((l) => linkKey(l.a, l.b)))
    const pairs = drag.ids.filter((id) => id !== drag.targetId).map((id) => linkKey(id, drag.targetId))
    dropMode = pairs.length && pairs.every((p) => existing.has(p)) ? 'unlink' : 'link'
  }

  const R = SPHERE_RADIUS
  const showAllLabels = view.k >= LABEL_ZOOM
  const gridSize = 40 * view.k

  return (
    <div className="sg-board" ref={wrapRef}>
      <svg
        ref={svgRef}
        className={`sg-board-svg${gesture.current?.type === 'pan' ? ' is-panning' : ''}${drag ? ' is-dragging' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onContextMenu={handleContextMenu}
      >
        <defs>
          <pattern
            id="sg-grid"
            width={gridSize}
            height={gridSize}
            patternUnits="userSpaceOnUse"
            x={view.x % gridSize}
            y={view.y % gridSize}
          >
            <circle cx={1.5} cy={1.5} r={1.3} className="sg-grid-dot" />
          </pattern>
          {/* In board units, so arrowheads zoom with the spheres. */}
          {['', '-lit'].map((suffix) => (
            <marker
              key={suffix}
              id={`sg-arrow${suffix}`}
              viewBox="0 0 10 10"
              refX="10"
              refY="5"
              markerWidth="13"
              markerHeight="13"
              markerUnits="userSpaceOnUse"
              orient="auto"
            >
              <path d="M0,0 L10,5 L0,10 z" className={`sg-arrow${suffix ? ' is-lit' : ''}`} />
            </marker>
          ))}
        </defs>
        <rect width="100%" height="100%" fill="url(#sg-grid)" />

        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {links.map((l) => {
            const ends = linkEnds(l)
            const p1 = pos.get(ends ? ends.parent : l.a)
            const p2 = pos.get(ends ? ends.child : l.b)
            if (!p1 || !p2) return null
            const lit = focusId && (l.a === focusId || l.b === focusId)
            // Stop a directed line outside the child's Type ring, so the
            // arrowhead shows.
            const len = Math.hypot(p2.x - p1.x, p2.y - p1.y)
            const trim = ends && len > R * 2 ? (R + 8) / len : 0
            return (
              <line
                key={l.id}
                x1={p1.x}
                y1={p1.y}
                x2={p2.x - (p2.x - p1.x) * trim}
                y2={p2.y - (p2.y - p1.y) * trim}
                className={`sg-link${ends ? ' is-directed' : ''}${lit ? ' is-lit' : ''}`}
                markerEnd={trim ? `url(#sg-arrow${lit ? '-lit' : ''})` : undefined}
              />
            )
          })}

          {drag?.targetId &&
            drag.ids
              .filter((id) => id !== drag.targetId)
              .map((id) => {
                const p1 = pos.get(id)
                const p2 = pos.get(drag.targetId)
                return (
                  <line
                    key={`preview-${id}`}
                    x1={p1.x}
                    y1={p1.y}
                    x2={p2.x}
                    y2={p2.y}
                    className={`sg-link-preview is-${dropMode}`}
                  />
                )
              })}

          {spheres.map((s) => {
            const p = pos.get(s.id)
            const selected = selection.has(s.id)
            const isTarget = drag?.targetId === s.id
            const showLabel = showAllLabels || selected || hoverId === s.id || isTarget
            const classes = [
              'sg-sphere',
              s.color ? 'is-tagged' : 'is-untagged',
              s.role && `is-role-${s.role}`,
              s.is_stub && 'is-stub',
              selected && 'is-selected',
              focusId === s.id && 'is-focus',
              dragging?.has(s.id) && 'is-dragged',
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <g
                key={s.id}
                data-sphere-id={s.id}
                transform={`translate(${p.x} ${p.y})`}
                className={classes}
                style={s.color ? { '--sg-color': s.color } : undefined}
                onPointerEnter={() => setHoverId(s.id)}
                onPointerLeave={() => setHoverId((h) => (h === s.id ? null : h))}
              >
                {selected && <circle r={R + 10} className="sg-sphere-ring" />}
                {isTarget && <circle r={R + 15} className={`sg-sphere-drop is-${dropMode}`} />}
                {s.color && <circle r={R + 3} className="sg-sphere-type" />}
                <circle r={R} className="sg-sphere-body" />
                {s.gm_only && (
                  <g transform={`translate(${R * 0.72} ${-R * 0.72})`} className="sg-sphere-gm">
                    <circle r={8} />
                    <text dy="0.35em">GM</text>
                  </g>
                )}
                {s.hiddenLinks > 0 && (
                  <g transform={`translate(${R * 0.72} ${R * 0.72})`} className="sg-sphere-more">
                    <circle r={9} />
                    <text dy="0.35em">+{s.hiddenLinks}</text>
                  </g>
                )}
                {showLabel && (
                  <text y={R + 17} className="sg-sphere-label">
                    {s.name}
                  </text>
                )}
                <title>
                  {s.name}
                  {s.kindLabel ? ` · ${s.kindLabel}` : ' · untagged'}
                  {s.role === 'parent' ? ' · contains others' : s.role === 'child' ? ' · inside another' : s.role === 'both' ? ' · inside another, contains others' : ''}
                  {s.is_stub ? ' · stub' : ''}
                  {s.gm_only ? ' · GM-only' : ''}
                  {s.hiddenLinks ? ` · ${s.hiddenLinks} linked entr${s.hiddenLinks === 1 ? 'y' : 'ies'} not on this grid` : ''}
                </title>
              </g>
            )
          })}
        </g>
      </svg>

      {!spheres.length && (
        <div className="sg-board-empty">
          <p>An empty grid.</p>
          <p>
            <strong>Generate</strong> new entries, or <strong>Add existing</strong> ones from the wiki — a planet, an
            era, an arc title, anything.
          </p>
        </div>
      )}

      <div className="sg-board-zoom">
        <button type="button" className="secondary" onClick={() => zoomBy(1.25)} aria-label="Zoom in">
          +
        </button>
        <button type="button" className="secondary" onClick={() => zoomBy(0.8)} aria-label="Zoom out">
          −
        </button>
        <button type="button" className="secondary" onClick={fitToSpheres}>
          Center
        </button>
      </div>
    </div>
  )
}
