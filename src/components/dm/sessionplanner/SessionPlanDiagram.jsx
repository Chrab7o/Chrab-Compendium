import { useMemo } from 'react'
import dagre from '@dagrejs/dagre'
import { truncateForDiagram, isAnswered } from '../../../lib/sessionPlanner'

const NODE_WIDTH = 160
const NODE_HEIGHT = 68
const CHAR_WIDTH = 6.5 // same rough auto-sizing estimate SkillTreeDiagram uses

// Auto-laid-out tree of questions, adapted from SkillTreeDiagram.jsx's dagre
// setup - same layout math (graph creation, setNode/setEdge, dagre.layout),
// same fixed-height-card approach (the label auto-grows the box wider
// rather than wrapping, exactly like skill node names already do, so
// dagre's need-dimensions-before-layout requirement stays satisfied without
// new rendering machinery). Unlike skill names, real question sentences can
// run long, so the label is capped via truncateForDiagram before sizing -
// the full question is only shown in the detail panel and delete confirms.
// Edges are unlabeled (matching SkillTreeDiagram.jsx), except for a dashed
// vs solid style marking whether the child is an obstacle or a plain "then"
// next step - see is_obstacle in NodeAnswerForm.jsx. Card border color marks
// the node's content_type - see the .type-* rules in index.css. Laid out
// left-to-right (rankdir: 'LR') rather than top-to-bottom, matching the
// forward-in-time reading of the plan (start on the left, later scenes to
// the right) - rendered at its natural pixel size (not scaled to fit the
// container) since a long session's scene chain can run wide; the
// container scrolls horizontally instead of shrinking text down, see
// .session-plan-diagram in index.css.
export default function SessionPlanDiagram({ nodes, selectedNodeId, onNodeClick }) {
  const layout = useMemo(() => {
    const g = new dagre.graphlib.Graph()
    g.setGraph({ rankdir: 'LR', nodesep: 24, ranksep: 90 })
    g.setDefaultEdgeLabel(() => ({}))

    for (const n of nodes) {
      const label = truncateForDiagram(n.question)
      const statusText = isAnswered(n) ? 'Answered' : 'Not answered'
      const width = Math.max(NODE_WIDTH, Math.max(label.length, statusText.length) * CHAR_WIDTH + 24)
      g.setNode(n.id, { label, answered: isAnswered(n), contentType: n.content_type, width, height: NODE_HEIGHT })
    }
    const edges = []
    for (const n of nodes) {
      if (!n.parent_node_id || !g.hasNode(n.parent_node_id)) continue
      g.setEdge(n.parent_node_id, n.id)
      edges.push([n.parent_node_id, n.id, n.is_obstacle])
    }

    dagre.layout(g)

    const laidOutNodes = nodes.map((n) => ({ ...n, ...g.node(n.id) }))
    const laidOutEdges = edges.map(([from, to, isObstacle]) => {
      const edge = g.edge(from, to)
      return { from, to, isObstacle, points: edge.points }
    })
    const graphInfo = g.graph()
    return { nodes: laidOutNodes, edges: laidOutEdges, width: graphInfo.width ?? 0, height: graphInfo.height ?? 0 }
  }, [nodes])

  if (nodes.length === 0) {
    return <p className="status-message">No questions yet.</p>
  }

  return (
    <div className="session-plan-diagram">
      <svg viewBox={`0 0 ${layout.width} ${layout.height}`} width={layout.width} height={layout.height}>
        {layout.edges.map((e, i) => (
          <polyline
            key={i}
            className={`session-plan-diagram-edge${e.isObstacle ? '' : ' then'}`}
            points={e.points.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
          />
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
                className={`session-plan-diagram-node type-${n.contentType}${selected ? ' selected' : ''}`}
              />
              <text x={n.width / 2} y={n.height / 2 - 6} textAnchor="middle" className="session-plan-diagram-label">
                {n.label}
              </text>
              <text
                x={n.width / 2}
                y={n.height / 2 + 14}
                textAnchor="middle"
                className={`session-plan-diagram-status${n.answered ? ' answered' : ' unanswered'}`}
              >
                {n.answered ? 'Answered' : 'Not answered'}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
