// Skill trees are single-parent for display/nesting purposes (same shape as
// folders.parent_folder_id) — pure helpers here mirror the style of
// src/lib/folders.js. A node's full *prerequisite* set (for unlock checks,
// separate from where it's nested in the outline) is parent_node_id plus
// whatever's in skill_tree_node_prereqs, passed around here as a
// Map<nodeId, string[]> ("extraPrereqsByNode").

export function childNodes(nodes, parentId) {
  return nodes
    .filter((n) => (n.parent_node_id ?? null) === parentId)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
}

export function isNodeUnlocked(node, unlockedNodeIds) {
  return unlockedNodeIds.has(node.id)
}

// Total points committed so far, for display only (e.g. "140 XP spent") -
// character_skill_points.points_available itself already counts down as
// points are spent, so this is never used to figure out what's left; it's
// just a running history total computed from the unlock log.
export function pointsSpent(nodes, unlockedNodeIds) {
  return nodes.filter((n) => unlockedNodeIds.has(n.id)).reduce((sum, n) => sum + n.cost, 0)
}

export function fullPrereqIds(node, extraPrereqsByNode) {
  return [node.parent_node_id, ...(extraPrereqsByNode.get(node.id) ?? [])].filter(Boolean)
}

// How many of a node's full prerequisite set actually need to be unlocked -
// node.min_prereqs is null/undefined for "all of them" (the common case,
// and dynamic: it tracks however many prereqs the node currently has rather
// than a stale count baked in when it was set), or a specific number for
// "any N of them" (e.g. Intermediate Alchemical Knowledge needing 4 of its
// 8 basic-tier potions, not all 8).
export function minPrereqsRequired(node, prereqCount) {
  return node.min_prereqs ?? prereqCount
}

// A node is unlockable if it isn't already, enough of its prerequisites are
// satisfied, and its cost fits in what's left. Mirrors the same checks
// unlock_skill_node() enforces server-side — this is just for disabling the
// button client-side; the RPC is what actually guards it. pointsAvailable is
// a live balance that already counts down as points are spent (not a fixed
// budget to subtract history from), so the cost alone is what matters here.
export function canUnlock(node, unlockedNodeIds, pointsAvailable, extraPrereqsByNode) {
  if (unlockedNodeIds.has(node.id)) return false
  const prereqs = fullPrereqIds(node, extraPrereqsByNode)
  if (prereqs.length > 0) {
    const unlockedCount = prereqs.filter((id) => unlockedNodeIds.has(id)).length
    if (unlockedCount < minPrereqsRequired(node, prereqs.length)) return false
  }
  return node.cost <= pointsAvailable
}

// A craftable node can be crafted once it's unlocked (you have to know the
// recipe first) and the tree's flat craft_cost fits in what's left. Mirrors
// craft_skill_item()'s checks.
export function canCraft(node, unlockedNodeIds, pointsAvailable, craftCost) {
  if (!node.craftable) return false
  if (!unlockedNodeIds.has(node.id)) return false
  return craftCost <= pointsAvailable
}

// Would adding candidatePrereqId as a prerequisite of nodeId create a cycle?
// Walks candidatePrereqId's own full prerequisite chain (parent + extras,
// recursively) checking whether it ever reaches back to nodeId. Used by the
// DM editor to reject a cyclic pick before it's ever saved — there's no DB
// constraint for this since a cycle just makes a node unreachable, not a
// security issue (unlock_skill_node only checks direct prereqs, so it can't
// loop even on a bad graph).
export function wouldCreateCycle(nodeId, candidatePrereqId, nodesById, extraPrereqsByNode) {
  const seen = new Set()
  function walk(id) {
    if (id === nodeId) return true
    if (seen.has(id)) return false
    seen.add(id)
    const node = nodesById.get(id)
    if (!node) return false
    return fullPrereqIds(node, extraPrereqsByNode).some(walk)
  }
  return walk(candidatePrereqId)
}

// --- JSON export/import -------------------------------------------------
// Local string ids (not DB uuids) so a re-import doesn't collide with the
// original tree's rows and can be dropped into a different campaign/site.

export function treeToExportJson(tree, nodes, prereqRows = []) {
  const idMap = new Map(nodes.map((n, i) => [n.id, `n${i}`]))
  const extrasByNode = new Map()
  for (const row of prereqRows) {
    if (!extrasByNode.has(row.node_id)) extrasByNode.set(row.node_id, [])
    extrasByNode.get(row.node_id).push(row.prereq_node_id)
  }
  return {
    name: tree.name,
    description: tree.description ?? '',
    nodes: nodes.map((n) => ({
      localId: idMap.get(n.id),
      parentLocalId: n.parent_node_id ? idMap.get(n.parent_node_id) : null,
      extraPrereqLocalIds: (extrasByNode.get(n.id) ?? []).map((id) => idMap.get(id)).filter(Boolean),
      minPrereqs: n.min_prereqs ?? null,
      name: n.name,
      description: n.description ?? '',
      cost: n.cost,
      craftable: n.craftable ?? false,
      sortOrder: n.sort_order,
    })),
  }
}

// Returns nodes reordered so every node comes after its parent AND its extra
// prerequisites (or throws if the JSON references a missing local id) — lets
// the caller insert in a single top-to-bottom pass, building localId -> real
// DB id as it goes, the same memoized parent-before-child approach the
// Obsidian importer uses for its folder chains.
export function orderNodesForImport(jsonNodes) {
  const byLocalId = new Map(jsonNodes.map((n) => [n.localId, n]))
  const ordered = []
  const seen = new Set()

  function visit(node, stack = []) {
    if (seen.has(node.localId)) return
    if (stack.includes(node.localId)) {
      throw new Error(`Circular parent reference at "${node.name}"`)
    }
    const dependsOnIds = [node.parentLocalId, ...(node.extraPrereqLocalIds ?? [])].filter(Boolean)
    for (const dependsOnId of dependsOnIds) {
      const dependsOn = byLocalId.get(dependsOnId)
      if (!dependsOn) throw new Error(`"${node.name}" references a missing local id "${dependsOnId}"`)
      visit(dependsOn, [...stack, node.localId])
    }
    seen.add(node.localId)
    ordered.push(node)
  }

  for (const node of jsonNodes) visit(node)
  return ordered
}
