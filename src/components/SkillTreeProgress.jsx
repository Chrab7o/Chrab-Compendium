import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { pointsSpent, canUnlock, canCraft, fullPrereqIds, minPrereqsRequired } from '../lib/skillTrees'
import SkillTreeDiagram from './SkillTreeDiagram'

// Shared by the player's own Skill Tree page and the DM's read-only preview
// of a specific character's progress — driven entirely by `characterId`
// (its own campaign, from the character record, not the global campaign
// picker) so both call sites see the same thing regardless of which
// campaign the viewer currently has selected in nav.
export default function SkillTreeProgress({ characterId, editable }) {
  // undefined = not fetched yet (show a real loading state); [] only once
  // we've actually confirmed there's nothing scoped to this character.
  const [trees, setTrees] = useState(undefined)
  const [treeId, setTreeId] = useState('')
  const [nodes, setNodes] = useState([])
  // Every node across every tree that shares the selected tree's tree_type —
  // points are pooled per type, not per tree, so "spent" and the unlock cap
  // both need to account for nodes unlocked in sibling trees too, not just
  // the one currently on screen.
  const [typePoolNodes, setTypePoolNodes] = useState([])
  const [prereqRows, setPrereqRows] = useState([])
  const [pointsAvailable, setPointsAvailable] = useState(0)
  const [unlockedIds, setUnlockedIds] = useState(new Set())
  const [craftSpend, setCraftSpend] = useState(0)
  const [error, setError] = useState(null)
  const [selectedNodeId, setSelectedNodeId] = useState(null)

  useEffect(() => {
    let cancelled = false
    setTrees(undefined)
    // Fetched together (not one-then-the-other) so there's no in-between
    // moment where the character's campaign is known but the tree list
    // isn't yet — that gap used to render a misleading "no skill trees"
    // message before the second request had a chance to come back.
    Promise.all([
      supabase.from('characters').select('campaign_id').eq('id', characterId).single(),
      supabase.rpc('visible_skill_trees', { p_character_id: characterId }),
    ]).then(([{ data: character }, { data: treeData }]) => {
      if (cancelled) return
      const campaignId = character?.campaign_id ?? null
      const scoped = (treeData ?? []).filter(
        (t) => !campaignId || !t.campaign_id || t.campaign_id === campaignId
      )
      setTrees(scoped)
      setTreeId((current) => (scoped.some((t) => t.id === current) ? current : scoped[0]?.id ?? ''))
    })
    return () => {
      cancelled = true
    }
  }, [characterId])

  const loadTreeState = useCallback(async () => {
    if (!treeId) {
      setNodes([])
      setTypePoolNodes([])
      setPrereqRows([])
      setUnlockedIds(new Set())
      setPointsAvailable(0)
      setCraftSpend(0)
      return
    }
    const treeType = trees?.find((t) => t.id === treeId)?.tree_type ?? 'feature'
    const siblingTreeIds = (trees ?? []).filter((t) => t.tree_type === treeType).map((t) => t.id)

    const [{ data: nodeData }, { data: poolNodeData }, { data: pointsRow }, { data: unlockRows }, { data: craftRows }] =
      await Promise.all([
        supabase.from('skill_tree_nodes').select('*').eq('tree_id', treeId),
        supabase.from('skill_tree_nodes').select('*').in('tree_id', siblingTreeIds),
        supabase
          .from('character_skill_points')
          .select('points_available')
          .eq('character_id', characterId)
          .eq('tree_type', treeType)
          .maybeSingle(),
        supabase.from('character_skill_unlocks').select('node_id').eq('character_id', characterId),
        supabase.from('character_skill_crafts').select('node_id, cost').eq('character_id', characterId),
      ])
    setNodes(nodeData ?? [])
    setTypePoolNodes(poolNodeData ?? [])
    setPointsAvailable(pointsRow?.points_available ?? 0)
    const poolNodeIds = new Set((poolNodeData ?? []).map((n) => n.id))
    setUnlockedIds(new Set((unlockRows ?? []).map((u) => u.node_id).filter((id) => poolNodeIds.has(id))))
    setCraftSpend(
      (craftRows ?? []).filter((r) => poolNodeIds.has(r.node_id)).reduce((sum, r) => sum + r.cost, 0)
    )

    const ids = (nodeData ?? []).map((n) => n.id)
    if (ids.length > 0) {
      const { data: prereqData } = await supabase.from('skill_tree_node_prereqs').select('*').in('node_id', ids)
      setPrereqRows(prereqData ?? [])
    } else {
      setPrereqRows([])
    }
  }, [treeId, characterId, trees])

  useEffect(() => {
    loadTreeState()
  }, [loadTreeState])

  // A stale selection from a previous tree shouldn't carry over - node ids
  // are UUIDs so a collision is essentially impossible, but even a
  // momentary mismatch is worth avoiding.
  useEffect(() => {
    setSelectedNodeId(null)
  }, [treeId])

  function handleNodeClick(node) {
    setSelectedNodeId((current) => (current === node.id ? null : node.id))
  }

  async function handleUnlock(node) {
    setError(null)
    const { error: rpcError } = await supabase.rpc('unlock_skill_node', {
      p_character_id: characterId,
      p_node_id: node.id,
    })
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    loadTreeState()
  }

  async function handleCraft(node) {
    setError(null)
    const { error: rpcError } = await supabase.rpc('craft_skill_item', {
      p_character_id: characterId,
      p_node_id: node.id,
    })
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    loadTreeState()
  }

  if (trees === undefined) return <p className="status-message">Loading...</p>
  if (trees.length === 0) {
    return <p className="status-message">No skill trees are set up for this character's campaign yet.</p>
  }

  const currentTree = trees.find((t) => t.id === treeId)
  const craftCost = currentTree?.craft_cost ?? 20
  const spent = pointsSpent(typePoolNodes, unlockedIds) + craftSpend
  const nodesById = new Map(nodes.map((n) => [n.id, n]))
  const extrasByNode = new Map()
  for (const row of prereqRows) {
    if (!extrasByNode.has(row.node_id)) extrasByNode.set(row.node_id, [])
    extrasByNode.get(row.node_id).push(row.prereq_node_id)
  }

  const selectedNode = nodes.find((n) => n.id === selectedNodeId)
  const selectedUnlocked = selectedNode && unlockedIds.has(selectedNode.id)
  const selectedUnlockable =
    selectedNode &&
    editable &&
    !selectedUnlocked &&
    canUnlock(selectedNode, typePoolNodes, unlockedIds, pointsAvailable, extrasByNode, craftSpend)
  const selectedCraftable =
    selectedNode &&
    editable &&
    canCraft(selectedNode, typePoolNodes, unlockedIds, pointsAvailable, craftSpend, craftCost)
  const selectedPrereqNames = selectedNode
    ? fullPrereqIds(selectedNode, extrasByNode).map((id) => nodesById.get(id)?.name ?? '?')
    : []

  return (
    <div>
      <div className="skill-tree-progress-header">
        {trees.length > 1 && (
          <select value={treeId} onChange={(e) => setTreeId(e.target.value)}>
            {trees.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
        <p className="view-subtitle">
          {spent} / {pointsAvailable} points spent
        </p>
      </div>

      {error && <p className="status-message error">{error}</p>}

      <div className="skill-tree-layout">
        <SkillTreeDiagram
          nodes={nodes}
          extrasByNode={extrasByNode}
          unlockedIds={unlockedIds}
          selectedNodeId={selectedNodeId}
          onNodeClick={handleNodeClick}
        />

        {selectedNode && (
          <aside className="region-panel skill-node-panel">
            <div className="region-panel-header">
              <h2>{selectedNode.name}</h2>
              <button type="button" className="secondary" onClick={() => setSelectedNodeId(null)}>
                Close
              </button>
            </div>
            <p className="dm-list-meta">
              {selectedNode.cost} pt{selectedNode.cost === 1 ? '' : 's'}
              {selectedNode.craftable && <span className="badge badge-campaign">Craftable</span>}
            </p>
            {selectedPrereqNames.length > 0 && (
              <p className="dm-list-meta">
                {(() => {
                  const min = minPrereqsRequired(selectedNode, selectedPrereqNames.length)
                  return `Requires ${min >= selectedPrereqNames.length ? 'all of' : `${min} of`}`
                })()}
                : {selectedPrereqNames.join(', ')}
              </p>
            )}
            {selectedNode.description && <p>{selectedNode.description}</p>}
            {selectedUnlocked ? (
              <div className="skill-node-panel-actions">
                <span className="badge badge-campaign">Unlocked</span>
                {selectedNode.craftable && editable && (
                  <button type="button" disabled={!selectedCraftable} onClick={() => handleCraft(selectedNode)}>
                    Craft ({craftCost} pts)
                  </button>
                )}
              </div>
            ) : (
              editable && (
                <button type="button" disabled={!selectedUnlockable} onClick={() => handleUnlock(selectedNode)}>
                  Unlock
                </button>
              )
            )}
          </aside>
        )}
      </div>
    </div>
  )
}
