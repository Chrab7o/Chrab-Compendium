import { useMemo } from 'react'
import dagre from '@dagrejs/dagre'
import { fullPrereqIds } from '../lib/skillTrees'

const NODE_WIDTH = 160
const NODE_HEIGHT = 56
const CHAR_WIDTH = 7 // rough estimate for auto-sizing box width to the label

// Read-only, auto-laid-out diagram of a tree's shape — no dragging/panning,
// just a computed picture (via dagre, since a multi-prereq tree is a DAG,
// not a plain tree, so a hand-rolled layout would fight overlapping edges).
// Pass `unlockedIds` to color-code locked/unlocked on the player page; omit
// it (DM building a tree) and everything renders in one neutral color.
export default function SkillTreeDiagram({ nodes, extrasByNode, unlockedIds }) {
  const layout = useMemo(() => {
    const g = new dagre.graphlib.Graph()
    g.setGraph({ rankdir: 'TB', nodesep: 30, ranksep: 60 })
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
      <svg width={layout.width} height={layout.height}>
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
          return (
            <g key={n.id} transform={`translate(${n.x - n.width / 2}, ${n.y - n.height / 2})`}>
              <rect
                width={n.width}
                height={n.height}
                rx={8}
                className={`skill-tree-diagram-node${unlocked ? ' unlocked' : ''}`}
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
