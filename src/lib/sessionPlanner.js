// Question-driven session planning: every node is a question with an
// optional answer. A plan always starts with these 3 fixed anchor
// questions as its root nodes (see DMSessionPlannerPage.jsx, which inserts
// them at plan-creation time). Naming an obstacle to an answer spawns a new
// child node whose question is that obstacle text, verbatim - see
// NodeAnswerForm.jsx.
export const ANCHOR_QUESTIONS = ['Where do they start?', 'Where are they going?', 'How do they get there?']

export function isAnswered(node) {
  return Boolean(node.answer?.trim())
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
