// Skill trees are single-parent (same shape as folders.parent_folder_id) —
// pure helpers here mirror the style of src/lib/folders.js.

export function childNodes(nodes, parentId) {
  return nodes
    .filter((n) => (n.parent_node_id ?? null) === parentId)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
}

export function isNodeUnlocked(node, unlockedNodeIds) {
  return unlockedNodeIds.has(node.id)
}

// Total points committed so far — computed from unlocks rather than stored,
// same "computed not cascade-written" approach used for folder visibility
// and campaign inheritance.
export function pointsSpent(nodes, unlockedNodeIds) {
  return nodes.filter((n) => unlockedNodeIds.has(n.id)).reduce((sum, n) => sum + n.cost, 0)
}

// A node is unlockable if it isn't already, its prerequisite (if any) is
// unlocked, and there's enough of the budget left to afford it. Mirrors the
// same checks unlock_skill_node() enforces server-side — this is just for
// disabling the button client-side; the RPC is what actually guards it.
export function canUnlock(node, nodes, unlockedNodeIds, pointsAvailable) {
  if (unlockedNodeIds.has(node.id)) return false
  if (node.parent_node_id && !unlockedNodeIds.has(node.parent_node_id)) return false
  return pointsSpent(nodes, unlockedNodeIds) + node.cost <= pointsAvailable
}

// --- JSON export/import -------------------------------------------------
// Local string ids (not DB uuids) so a re-import doesn't collide with the
// original tree's rows and can be dropped into a different campaign/site.

export function treeToExportJson(tree, nodes) {
  const idMap = new Map(nodes.map((n, i) => [n.id, `n${i}`]))
  return {
    name: tree.name,
    description: tree.description ?? '',
    nodes: nodes.map((n) => ({
      localId: idMap.get(n.id),
      parentLocalId: n.parent_node_id ? idMap.get(n.parent_node_id) : null,
      name: n.name,
      description: n.description ?? '',
      cost: n.cost,
      sortOrder: n.sort_order,
    })),
  }
}

// Returns nodes reordered so every node comes after its parent (or throws if
// the JSON references a parentLocalId that isn't present) — lets the caller
// insert in a single top-to-bottom pass, building localId -> real DB id as
// it goes, the same memoized parent-before-child approach the Obsidian
// importer uses for its folder chains.
export function orderNodesForImport(jsonNodes) {
  const byLocalId = new Map(jsonNodes.map((n) => [n.localId, n]))
  const ordered = []
  const seen = new Set()

  function visit(node, stack = []) {
    if (seen.has(node.localId)) return
    if (stack.includes(node.localId)) {
      throw new Error(`Circular parent reference at "${node.name}"`)
    }
    if (node.parentLocalId) {
      const parent = byLocalId.get(node.parentLocalId)
      if (!parent) throw new Error(`"${node.name}" references a missing parentLocalId`)
      visit(parent, [...stack, node.localId])
    }
    seen.add(node.localId)
    ordered.push(node)
  }

  for (const node of jsonNodes) visit(node)
  return ordered
}
