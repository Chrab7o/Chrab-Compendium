// Question-driven session planning, worked forward from where the party
// currently is: every node is a question with an optional answer. A plan
// always starts with this one fixed anchor question as its root node (see
// DMSessionPlannerPage.jsx, which inserts it at plan-creation time) -
// planning starts from wherever the party is right now (the end goal isn't
// always known up front), then each child node names what happens next (an
// obstacle, or a plain lead-in step) working forward from its parent. See
// NodeAnswerForm.jsx and BranchForm.jsx for how child nodes get created.
export const ANCHOR_QUESTION = 'Where do they start?'

export function isAnswered(node) {
  return Boolean(node.answer?.trim())
}

// Every node is a scene: at minimum it has a location, characters, and a
// purpose (see the `location`/`characters`/`purpose` columns, shown on
// every node regardless of type - nobody's forced to fill them in). Beyond
// that shared shape, a scene type just relabels the question/answer columns
// (titleLabel/bodyLabel) and supplies a `hint` - inspiration placeholder
// text shown in the Details box - rather than needing type-specific columns
// of its own. defaultIsObstacle is only a UI default applied when a DM
// picks this type for a new child row - the is_obstacle flag itself stays
// independently editable, since it's a different axis (how this node
// connects to its parent) from content_type (what kind of scene it is).
export const CONTENT_TYPES = [
  {
    key: 'question',
    label: 'Question',
    titleLabel: 'Question',
    bodyLabel: 'Answer',
    emptyBodyLabel: 'Not answered yet.',
    hint: '',
    defaultIsObstacle: true,
  },
  {
    key: 'encounter',
    label: 'Encounter',
    titleLabel: 'Encounter',
    bodyLabel: 'Details',
    emptyBodyLabel: 'No details yet.',
    hint: 'Consider: the threat, the terrain, an escape or negotiation option, what makes this fight distinct.',
    defaultIsObstacle: true,
  },
  {
    key: 'conversation',
    label: 'Conversation',
    titleLabel: 'Conversation',
    bodyLabel: 'Details',
    emptyBodyLabel: 'No details yet.',
    hint: "Consider: what this person wants, what they're hiding, their attitude going in.",
    defaultIsObstacle: false,
  },
  {
    key: 'puzzle',
    label: 'Puzzle',
    titleLabel: 'Puzzle',
    bodyLabel: 'Details',
    emptyBodyLabel: 'No details yet.',
    hint: 'Consider: the mechanism, the solution, what happens on failure.',
    defaultIsObstacle: true,
  },
  {
    key: 'decision',
    label: 'Decision',
    titleLabel: 'Decision',
    bodyLabel: 'Details',
    emptyBodyLabel: 'No details yet.',
    hint: "Consider: the likely choices, whether a \"wrong\" choice is actually fine.",
    defaultIsObstacle: false,
  },
  {
    key: 'downtime',
    label: 'Downtime',
    titleLabel: 'Downtime',
    bodyLabel: 'Details',
    emptyBodyLabel: 'No details yet.',
    hint: 'Consider: what past thread this ties to, the follow-up hook.',
    defaultIsObstacle: false,
  },
  {
    key: 'travel',
    label: 'Travel',
    titleLabel: 'Travel',
    bodyLabel: 'Details',
    emptyBodyLabel: 'No details yet.',
    hint: "Consider: checks required, pacing, what's encountered along the way.",
    defaultIsObstacle: false,
  },
  {
    key: 'note',
    label: 'Note',
    titleLabel: 'Note',
    bodyLabel: 'Details',
    emptyBodyLabel: 'No details yet.',
    hint: '',
    defaultIsObstacle: false,
  },
]

export function contentTypeInfo(contentType) {
  return CONTENT_TYPES.find((t) => t.key === contentType) ?? CONTENT_TYPES[0]
}

// SVG <text> doesn't wrap or ellipsize on its own - unlike the short
// single-word skill names SkillTreeDiagram was built for, real question/
// obstacle sentences need an explicit cap so dagre cards stay a sane width.
// The full untruncated text is still shown in the detail panel and delete
// confirms; this only affects the diagram card label.
export function truncateForDiagram(text, maxChars = 40) {
  const trimmed = text.trim()
  return trimmed.length > maxChars ? `${trimmed.slice(0, maxChars - 1)}…` : trimmed
}

// The plan is a DAG, not a strict tree - a scene can have more than one
// incoming connection (two different obstacles both leading to the same
// next scene), stored as rows in session_plan_edges rather than a single
// parent_node_id column. Returns {edge, node} pairs (not bare nodes) so
// callers can read the connection's own is_obstacle/sort_order alongside
// the scene it points to, ordered by sort_order then edge id (stable).
export function childConnections(nodes, edges, fromNodeId) {
  const nodeById = new Map(nodes.map((n) => [n.id, n]))
  return edges
    .filter((e) => e.from_node_id === fromNodeId)
    .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
    .map((edge) => ({ edge, node: nodeById.get(edge.to_node_id) }))
    .filter((c) => c.node)
}

// All node ids reachable by following edges forward from startId (not
// including startId itself unless a cycle loops back to it) - the basis for
// cycle detection below.
function reachableFrom(edges, startId) {
  const visited = new Set()
  const stack = [startId]
  while (stack.length > 0) {
    const current = stack.pop()
    for (const edge of edges) {
      if (edge.from_node_id === current && !visited.has(edge.to_node_id)) {
        visited.add(edge.to_node_id)
        stack.push(edge.to_node_id)
      }
    }
  }
  return visited
}

// Linking fromNodeId -> toNodeId would create a cycle if toNodeId can
// already reach fromNodeId (directly or transitively) - i.e. toNodeId is
// already upstream of fromNodeId, so the new edge would close a loop. Used
// before saving a "link to an existing scene" connection, since a real
// cycle would break both the forward-planning mental model and dagre's
// layered layout.
export function wouldCreateCycle(edges, fromNodeId, toNodeId) {
  if (fromNodeId === toNodeId) return true
  return reachableFrom(edges, toNodeId).has(fromNodeId)
}
