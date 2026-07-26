import { useMemo } from 'react'
import dagre from '@dagrejs/dagre'
import { fullPrereqIds } from '../lib/skillTrees'

const NODE_WIDTH = 160
const NODE_HEIGHT = 68
const CHAR_WIDTH = 6.5 // rough estimate for auto-sizing box width to the label

// Auto-laid-out diagram of a tree's shape (via dagre, since a multi-prereq
// tree is a DAG, not a plain tree, so a hand-rolled layout would fight
// overlapping edges) - no dragging/panning, just a computed picture.
// Pass `unlockedIds` to color-code locked/unlocked on the player page; omit
// it (DM building a tree) and everything renders in one neutral color.
// `onNodeClick` is optional - when passed, nodes become clickable/focusable
// and `selectedNodeId` highlights the current one; toggling selection
// on/off is the caller's job, this stays a dumb presentational piece.
export default function SkillTreeDiagram({ nodes, extrasByNode, unlockedIds, selectedNodeId, onNodeClick }) {
  const layout = useMemo(() => {
    const g = new dagre.graphlib.Graph()
    // ranksep (vertical gap between ranks) is deliberately larger than
    // nodesep (horizontal gap within a rank) - the whole diagram scales to
    // fit the available width regardless (see the viewBox/width:100% combo
    // below), so a taller natural shape for the same width just means it
    // renders bigger on screen, using more of the page's vertical room
    // instead of nodesep bloating things out sideways too.
    g.setGraph({ rankdir: 'TB', nodesep: 18, ranksep: 90 })
    g.setDefaultEdgeLabel(() => ({}))

    for (const n of nodes) {
      const width = Math.max(NODE_WIDTH, n.name.length * CHAR_WIDTH + 24)
      g.setNode(n.id, { label: n.name, width, height: NODE_HEIGHT })
    }
    const edges = []
    for (const n of nodes) {
      for (const prereqId of fullPrereqIds(n, extrasByNode)) {
        if (!g.hasNode(prereqId)) continue
        g.setEdge(prereqId, n.id)
        edges.push([prereqId, n.id])
      }
    }

    dagre.layout(g)

    const laidOutNodes = nodes.map((n) => ({ ...n, ...g.node(n.id) }))
    const laidOutEdges = edges.map(([from, to]) => ({ from, to, points: g.edge(from, to).points }))
    const graphInfo = g.graph()
    return { nodes: laidOutNodes, edges: laidOutEdges, width: graphInfo.width ?? 0, height: graphInfo.height ?? 0 }
  }, [nodes, extrasByNode])

  if (nodes.length === 0) return <p className="status-message">Nothing to show yet.</p>

  return (
    <div className="skill-tree-diagram">
      {/* viewBox + width:100%/height:auto (from the .skill-tree-diagram svg
          rule) scales the whole picture - nodes, text, edges together -
          down to fit the available width instead of overflowing into a
          horizontal scrollbar. maxWidth caps it at the diagram's own
          natural size so a small tree doesn't get stretched up bigger than
          intended just because its container is wide. */}
      <svg viewBox={`0 0 ${layout.width} ${layout.height}`} style={{ maxWidth: layout.width }}>
        {layout.edges.map((e, i) => (
          <polyline
            key={i}
            className="skill-tree-diagram-edge"
            points={e.points.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
          />
        ))}
        {layout.nodes.map((n) => {
          const unlocked = unlockedIds?.has(n.id)
          const selected = n.id === selectedNodeId
          return (
            <g
              key={n.id}
              transform={`translate(${n.x - n.width / 2}, ${n.y - n.height / 2})`}
              className={`skill-tree-diagram-node-group${onNodeClick ? ' clickable' : ''}`}
              onClick={onNodeClick ? () => onNodeClick(n) : undefined}
              role={onNodeClick ? 'button' : undefined}
              tabIndex={onNodeClick ? 0 : undefined}
              onKeyDown={
                onNodeClick
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onNodeClick(n)
                      }
                    }
                  : undefined
              }
            >
              <rect
                width={n.width}
                height={n.height}
                rx={8}
                className={`skill-tree-diagram-node${unlocked ? ' unlocked' : ''}${selected ? ' selected' : ''}`}
              />
              <text x={n.width / 2} y={n.height / 2 - 6} textAnchor="middle" className="skill-tree-diagram-label">
                {n.name}
              </text>
              <text x={n.width / 2} y={n.height / 2 + 14} textAnchor="middle" className="skill-tree-diagram-cost">
                {n.cost} pt{n.cost === 1 ? '' : 's'}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
