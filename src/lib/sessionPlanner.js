// Guided question sets per beat type - each question has a stable `key` the
// answer is stored under in session_plan_nodes.answers (jsonb), independent
// of the prompt wording itself, so editing a prompt below later doesn't
// orphan previously-saved answers. `title` is always asked separately, up
// front, for every type - it's the card label, not one of these guided
// answers.
export const NODE_TYPES = [
  {
    key: 'scene',
    label: 'Scene',
    questions: [
      { key: 'hook', prompt: 'What do the players see or hear first?' },
      { key: 'goal', prompt: "What's the goal of this scene?" },
      { key: 'skip_consequence', prompt: 'What happens if they skip or rush it?' },
    ],
  },
  {
    key: 'encounter',
    label: 'Encounter',
    questions: [
      { key: 'terrain', prompt: 'Where does this happen (terrain/setting)?' },
      { key: 'escape', prompt: "What's the escape or negotiation option?" },
      { key: 'distinct', prompt: 'What makes this fight different from the last one?' },
    ],
  },
  {
    key: 'npc',
    label: 'NPC Interaction',
    questions: [
      { key: 'wants', prompt: 'What does this NPC want?' },
      { key: 'knows', prompt: "What do they know that the players don't?" },
      { key: 'attitude', prompt: 'Their attitude going in?' },
    ],
  },
  {
    key: 'decision',
    label: 'Decision Point',
    questions: [
      { key: 'choices', prompt: 'What are the likely player choices here?' },
      { key: 'wrong_choice', prompt: "Is there a \"wrong\" choice that's actually fine?" },
    ],
  },
  {
    key: 'twist',
    label: 'Twist / Reveal',
    questions: [
      { key: 'reveal', prompt: "What's being revealed?" },
      { key: 'recontextualize', prompt: 'Does it recontextualize something earlier?' },
      { key: 'foreshadowing', prompt: 'Any foreshadowing already planted?' },
    ],
  },
  {
    key: 'downtime',
    label: 'Downtime / Loose End',
    questions: [
      { key: 'thread', prompt: 'What past thread does this tie back to?' },
      { key: 'hook', prompt: "What's the follow-up hook?" },
    ],
  },
  {
    key: 'note',
    label: 'Note',
    questions: [{ key: 'notes', prompt: 'Notes' }],
  },
]

export function nodeTypeInfo(nodeType) {
  return NODE_TYPES.find((t) => t.key === nodeType) ?? NODE_TYPES[NODE_TYPES.length - 1]
}

// Same single-parent filter+sort shape as skillTrees.js's childNodes -
// siblings ordered by sort_order, ties broken by title.
export function childNodes(nodes, parentId) {
  return nodes
    .filter((n) => (n.parent_node_id ?? null) === parentId)
    .sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title))
}

// Walks the full subtree under nodeId - used to warn "this will also delete
// N beats under it" before a destructive delete, since parent_node_id
// cascades and a DM could otherwise fat-finger-delete a whole act.
export function descendantCount(nodeId, nodes) {
  let count = 0
  for (const child of childNodes(nodes, nodeId)) {
    count += 1 + descendantCount(child.id, nodes)
  }
  return count
}
