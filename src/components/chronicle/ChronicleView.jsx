import { useLayoutEffect, useRef } from 'react'
import { formatDate, formatYear } from '../../lib/chronicle'

// Titles are clipped to the room beside a node (the lane gap when vertical,
// one column of LAYOUT.step when horizontal); the full title is in the panel
// and the node's aria-label.
const TITLE_CHARS = { vertical: 26, horizontal: 18 }

// Where a node's title and date sit, and the shape of a date marker.
const LABELS = {
  vertical: {
    title: { x: 16, y: -3, textAnchor: 'start' },
    date: { x: 16, y: 14, textAnchor: 'start' },
    mark: { x1: -10, x2: 10, y1: 0, y2: 0 },
  },
  horizontal: {
    title: { x: 0, y: -16, textAnchor: 'middle' },
    date: { x: 0, y: 26, textAnchor: 'middle' },
    mark: { x1: 0, x2: 0, y1: -10, y2: 10 },
  },
}

function clip(text, max) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

// Paints a layout from layoutChronicle (lib/chronicle.js): canon down the
// middle (or across it, horizontal), each branch on its own lane curving off
// at its split and back at its rejoin. The layout decides every coordinate.
export default function ChronicleView({ layout, calendar, branches, selectedId, onSelect }) {
  const branchById = new Map(branches.map((b) => [b.id, b]))
  const vertical = layout.orientation === 'vertical'
  const labels = LABELS[layout.orientation]
  const scrollRef = useRef(null)

  // Vertical, canon is the middle of the drawing: when the box is narrower
  // than that (a phone), open it scrolled to canon rather than to the
  // year axis at its left edge.
  useLayoutEffect(() => {
    const box = scrollRef.current
    if (box && vertical) box.scrollLeft = (box.scrollWidth - box.clientWidth) / 2
  }, [vertical, layout.width])

  if (layout.nodes.length === 0) {
    return <p className="status-message">Nothing on the Chronicle matches.</p>
  }

  function keySelect(e, id) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(id)
    }
  }

  return (
    <div className="chronicle-scroll" ref={scrollRef}>
      <svg
        className="chronicle-svg"
        width={layout.width}
        height={layout.height}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        role="group"
        aria-label="Chronicle"
      >
        <line className="chronicle-axis" {...layout.axis} />
        {layout.ticks.map((t) => (
          <g key={`${t.year}-${t.x}-${t.y}`} className="chronicle-tick" transform={`translate(${t.x} ${t.y})`}>
            {vertical ? (
              <>
                <line x1={-5} x2={5} y1={0} y2={0} />
                <text x={-10} y={4} textAnchor="end">
                  {formatYear(t.year, calendar)}
                </text>
              </>
            ) : (
              <>
                <line x1={0} x2={0} y1={-5} y2={5} />
                <text x={0} y={20} textAnchor="middle">
                  {formatYear(t.year, calendar)}
                </text>
              </>
            )}
          </g>
        ))}

        {layout.lines.map((line) => (
          <path
            key={line.id ?? 'canon'}
            d={line.path}
            className={line.id ? 'chronicle-line is-branch' : 'chronicle-line is-canon'}
            style={line.color ? { stroke: line.color } : undefined}
          >
            <title>{line.id ? branchById.get(line.id)?.name : 'Canon'}</title>
          </path>
        ))}

        {layout.nodes.map(({ event, x, y, muted }) => {
          const branch = event.branch_id ? branchById.get(event.branch_id) : null
          const selected = event.id === selectedId
          const classes = [
            'chronicle-node',
            event.kind === 'date' ? 'is-date' : 'is-event',
            muted && 'is-muted',
            selected && 'is-selected',
            event.visibility === 'dm' && 'is-dm',
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <g
              key={event.id}
              className={classes}
              transform={`translate(${x} ${y})`}
              role="button"
              tabIndex={0}
              aria-pressed={selected}
              aria-label={`${event.title}, ${formatDate(event, calendar)}`}
              onClick={() => onSelect(event.id)}
              onKeyDown={(e) => keySelect(e, event.id)}
            >
              {event.kind === 'date' ? (
                <line className="chronicle-date-mark" {...labels.mark} />
              ) : (
                <circle r={selected ? 9 : 7} style={branch?.color ? { stroke: branch.color } : undefined} />
              )}
              <text className="chronicle-node-title" {...labels.title}>
                {clip(event.title, TITLE_CHARS[layout.orientation])}
              </text>
              <text className="chronicle-node-date" {...labels.date}>
                {formatDate(event, calendar)}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
