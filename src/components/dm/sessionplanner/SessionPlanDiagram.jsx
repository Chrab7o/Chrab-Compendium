import { useMemo } from 'react'
import dagre from '@dagrejs/dagre'
import { nodeTypeInfo } from '../../../lib/sessionPlanner'

const NODE_WIDTH = 160
const NODE_HEIGHT = 68
const CHAR_WIDTH = 6.5 // same rough auto-sizing estimate SkillTreeDiagram uses
const LABEL_CHAR_WIDTH = 6
const LABEL_HEIGHT = 16

// Auto-laid-out tree of beats, adapted from SkillTreeDiagram.jsx's dagre
// setup - same layout math (graph creation, setNode/setEdge, dagre.layout),
// same fixed-height-card approach (title auto-grows the box wider rather
// than wrapping, exactly like skill node names already do, so dagre's
// need-dimensions-before-layout requirement stays satisfied without new
// rendering machinery). What's new here, not adapted: real edge labels for
// branch_label - the skill tree diagram never uses dagre's label support
// (setDefaultEdgeLabel(() => ({}))), since skill prereqs don't need one.
export default function SessionPlanDiagram({ nodes, selectedNodeId, onNodeClick }) {
  const layout = useMemo(() => {
    const g = new dagre.graphlib.Graph()
    g.setGraph({ rankdir: 'TB', nodesep: 24, ranksep: 90 })
    g.setDefaultEdgeLabel(() => ({}))

    for (const n of nodes) {
      const width = Math.max(NODE_WIDTH, n.title.length * CHAR_WIDTH + 24)
      g.setNode(n.id, { title: n.title, nodeType: n.node_type, width, height: NODE_HEIGHT })
    }
    const edges = []
    for (const n of nodes) {
      if (!n.parent_node_id || !g.hasNode(n.parent_node_id)) continue
      const label = n.branch_label || ''
      g.setEdge(n.parent_node_id, n.id, label ? { label, width: label.length * LABEL_CHAR_WIDTH, height: LABEL_HEIGHT } : {})
      edges.push([n.parent_node_id, n.id, label])
    }

    dagre.layout(g)

    const laidOutNodes = nodes.map((n) => ({ ...n, ...g.node(n.id) }))
    const laidOutEdges = edges.map(([from, to, label]) => {
      const edge = g.edge(from, to)
      return { from, to, label, points: edge.points, x: edge.x, y: edge.y }
    })
    const graphInfo = g.graph()
    return { nodes: laidOutNodes, edges: laidOutEdges, width: graphInfo.width ?? 0, height: graphInfo.height ?? 0 }
  }, [nodes])

  if (nodes.length === 0) {
    return <p className="status-message">No beats yet - start with "What happens first?" below.</p>
  }

  return (
    <div className="session-plan-diagram">
      <svg viewBox={`0 0 ${layout.width} ${layout.height}`} style={{ maxWidth: layout.width }}>
        {layout.edges.map((e, i) => (
          <g key={i}>
            <polyline
              className="session-plan-diagram-edge"
              points={e.points.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
            />
            {e.label && (
              <text x={e.x} y={e.y} textAnchor="middle" className="session-plan-diagram-edge-label">
                {e.label}
              </text>
            )}
          </g>
        ))}
        {layout.nodes.map((n) => {
          const selected = n.id === selectedNodeId
          return (
            <g
              key={n.id}
              transform={`translate(${n.x - n.width / 2}, ${n.y - n.height / 2})`}
              className={`session-plan-diagram-node-group${onNodeClick ? ' clickable' : ''}`}
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
                className={`session-plan-diagram-node${selected ? ' selected' : ''}`}
              />
              <text x={n.width / 2} y={n.height / 2 - 6} textAnchor="middle" className="session-plan-diagram-label">
                {n.title}
              </text>
              <text x={n.width / 2} y={n.height / 2 + 14} textAnchor="middle" className="session-plan-diagram-type">
                {nodeTypeInfo(n.nodeType).label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
