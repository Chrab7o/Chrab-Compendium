// Question-driven session planning, worked backward from the end: every
// node is a question with an optional answer. A plan always starts with
// this one fixed anchor question as its root node (see
// DMSessionPlannerPage.jsx, which inserts it at plan-creation time) -
// planning starts from where the party ends up, then each child node names
// what has to happen (an obstacle, or a plain lead-in step) to arrive at
// its parent, working backward toward wherever the party currently is. See
// NodeAnswerForm.jsx and BranchForm.jsx for how child nodes get created.
export const ANCHOR_QUESTION = 'Where do they end up?'

export function isAnswered(node) {
  return Boolean(node.answer?.trim())
}

// Prefab content types, layered on top of the question/answer tree rather
// than replacing it - a node's `question`/`answer` columns are just
// relabeled per type (titleLabel/bodyLabel) rather than needing their own
// columns, since every type here is "one title + one free-text block."
// defaultIsObstacle is only a UI default applied when a DM picks this type
// for a new child row - the is_obstacle flag itself stays independently
// editable, since it's a different axis (how this node connects to its
// parent) from content_type (what kind of content this node holds).
export const CONTENT_TYPES = [
  { key: 'question', label: 'Question', titleLabel: 'Question', bodyLabel: 'Answer', emptyBodyLabel: 'Not answered yet.', defaultIsObstacle: true },
  { key: 'location', label: 'Location', titleLabel: 'Location name', bodyLabel: 'Description', emptyBodyLabel: 'No description yet.', defaultIsObstacle: false },
  { key: 'event', label: 'Event', titleLabel: 'Event', bodyLabel: 'What happens', emptyBodyLabel: 'No details yet.', defaultIsObstacle: false },
  { key: 'travel', label: 'Travel', titleLabel: 'Travel', bodyLabel: 'Details', emptyBodyLabel: 'No details yet.', defaultIsObstacle: false },
  { key: 'obstacle', label: 'Obstacle', titleLabel: 'Obstacle', bodyLabel: 'Details', emptyBodyLabel: 'No details yet.', defaultIsObstacle: true },
  { key: 'note', label: 'Note', titleLabel: 'Note', bodyLabel: 'Details', emptyBodyLabel: 'No details yet.', defaultIsObstacle: false },
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

// Same single-parent filter+sort shape as skillTrees.js's childNodes -
// siblings ordered by sort_order, ties broken by id (stable, always defined).
export function childNodes(nodes, parentId) {
  return nodes
    .filter((n) => (n.parent_node_id ?? null) === parentId)
    .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
}

// Walks the full subtree under nodeId - used to warn "this will also delete
// N questions under it" before a destructive delete, since parent_node_id
// cascades and a DM could otherwise fat-finger-delete a whole line of
// planning.
export function descendantCount(nodeId, nodes) {
  let count = 0
  for (const child of childNodes(nodes, nodeId)) {
    count += 1 + descendantCount(child.id, nodes)
  }
  return count
}
