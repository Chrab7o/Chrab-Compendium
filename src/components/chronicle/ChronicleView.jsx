import { formatDate, formatYear } from '../../lib/chronicle'

// Titles are clipped to fit one column of LAYOUT.step; the full title is in
// the panel and the node's aria-label.
const TITLE_CHARS = 18

function clip(text, max = TITLE_CHARS) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

// Paints a layout from layoutChronicle (lib/chronicle.js): canon across the
// middle, each branch on its own lane curving off at its split and back at
// its rejoin. Scrolls sideways; the layout decides every coordinate.
export default function ChronicleView({ layout, calendar, branches, selectedId, onSelect }) {
  const branchById = new Map(branches.map((b) => [b.id, b]))

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
    <div className="chronicle-scroll">
      <svg
        className="chronicle-svg"
        width={layout.width}
        height={layout.height}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        role="group"
        aria-label="Chronicle"
      >
        <line className="chronicle-axis" x1={0} x2={layout.width} y1={layout.axisY} y2={layout.axisY} />
        {layout.ticks.map((t) => (
          <g key={`${t.year}-${t.x}`} className="chronicle-tick">
            <line x1={t.x} x2={t.x} y1={layout.axisY - 5} y2={layout.axisY + 5} />
            <text x={t.x} y={layout.axisY + 20} textAnchor="middle">
              {formatYear(t.year, calendar)}
            </text>
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
                <line className="chronicle-date-mark" x1={0} x2={0} y1={-10} y2={10} />
              ) : (
                <circle r={selected ? 9 : 7} style={branch?.color ? { stroke: branch.color } : undefined} />
              )}
              <text className="chronicle-node-title" y={-16} textAnchor="middle">
                {clip(event.title)}
              </text>
              <text className="chronicle-node-date" y={26} textAnchor="middle">
                {formatDate(event, calendar)}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
