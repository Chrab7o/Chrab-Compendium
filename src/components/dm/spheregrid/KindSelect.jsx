import { useEffect, useMemo, useRef, useState } from 'react'
import { kindChain, kindPath } from '../../../lib/sphereGrid'

const bySortThenLabel = (a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label)

// A collapsible tree picker for sphere kinds. With close to a hundred kinds a
// flat <select> is a wall of options, so this opens on the top level only;
// ▸ expands a branch, and the branch holding the current kind starts open.
// Typing in the search box lists every matching kind with its full path.
// `exclude` hides ids (a kind can't become its own descendant).
export default function KindSelect({ kinds, value, onChange, emptyLabel = '— No kind —', exclude, ...rest }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState(() => new Set())
  const rootRef = useRef(null)

  const usable = useMemo(() => kinds.filter((k) => !exclude?.has(k.id)), [kinds, exclude])
  const children = useMemo(() => {
    const ids = new Set(usable.map((k) => k.id))
    const map = new Map()
    for (const k of usable) {
      const key = k.parent_id && ids.has(k.parent_id) ? k.parent_id : null
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(k)
    }
    for (const list of map.values()) list.sort(bySortThenLabel)
    return map
  }, [usable])

  // Close on a click anywhere else, or Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function toggleOpen() {
    if (!open) {
      // Start with the current kind's branch unfolded.
      setExpanded(new Set(kindChain(kinds, value).slice(1).map((k) => k.id)))
      setQuery('')
    }
    setOpen((v) => !v)
  }

  function choose(id) {
    onChange(id)
    setOpen(false)
  }

  function toggleBranch(id) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const q = query.trim().toLowerCase()
  const matches = q
    ? usable
        .filter((k) => k.label.toLowerCase().includes(q))
        .map((k) => ({ kind: k, path: kindPath(kinds, k.id) }))
        .sort((a, b) => a.path.localeCompare(b.path))
    : []

  function renderLevel(parentId, depth) {
    return (children.get(parentId) ?? []).map((k) => {
      const hasChildren = children.has(k.id)
      const isOpen = expanded.has(k.id)
      return (
        <li key={k.id} role="treeitem" aria-expanded={hasChildren ? isOpen : undefined} aria-selected={k.id === value}>
          <div className="kind-select-row" style={{ '--depth': depth }}>
            {hasChildren ? (
              <button
                type="button"
                className="kind-select-twisty"
                onClick={() => toggleBranch(k.id)}
                aria-label={isOpen ? `Collapse ${k.label}` : `Expand ${k.label}`}
              >
                {isOpen ? '▾' : '▸'}
              </button>
            ) : (
              <span className="kind-select-twisty-spacer" />
            )}
            <button
              type="button"
              className={`kind-select-option${k.id === value ? ' is-current' : ''}`}
              onClick={() => choose(k.id)}
            >
              {k.label}
              {hasChildren && <span className="kind-select-count">{children.get(k.id).length}</span>}
            </button>
          </div>
          {hasChildren && isOpen && <ul role="group">{renderLevel(k.id, depth + 1)}</ul>}
        </li>
      )
    })
  }

  return (
    <div className="kind-select" ref={rootRef}>
      <button
        type="button"
        className="kind-select-toggle"
        onClick={toggleOpen}
        aria-haspopup="tree"
        aria-expanded={open}
        {...rest}
      >
        <span>{value ? kindPath(kinds, value) : emptyLabel}</span>
        <span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className="kind-select-pop">
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              // Never let Enter submit a surrounding form.
              if (e.key === 'Enter') {
                e.preventDefault()
                if (matches.length) choose(matches[0].kind.id)
              }
            }}
            placeholder="Search kinds…"
            aria-label="Search kinds"
          />
          {q ? (
            matches.length ? (
              <ul className="kind-select-list">
                {matches.map(({ kind, path }) => (
                  <li key={kind.id}>
                    <button
                      type="button"
                      className={`kind-select-option${kind.id === value ? ' is-current' : ''}`}
                      onClick={() => choose(kind.id)}
                    >
                      {path}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="kind-select-empty">No kind matches “{query.trim()}”.</p>
            )
          ) : (
            <ul className="kind-select-list" role="tree">
              <li>
                <div className="kind-select-row">
                  <span className="kind-select-twisty-spacer" />
                  <button
                    type="button"
                    className={`kind-select-option is-empty${!value ? ' is-current' : ''}`}
                    onClick={() => choose(null)}
                  >
                    {emptyLabel}
                  </button>
                </div>
              </li>
              {renderLevel(null, 0)}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
