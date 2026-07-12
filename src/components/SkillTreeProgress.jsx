import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { childNodes, pointsSpent, canUnlock, fullPrereqIds } from '../lib/skillTrees'
import SkillTreeDiagram from './SkillTreeDiagram'

function SkillNodeView({ node, depth, ctx }) {
  const children = childNodes(ctx.nodes, node.id)
  const unlocked = ctx.unlockedIds.has(node.id)
  const unlockable =
    ctx.editable &&
    !unlocked &&
    canUnlock(node, ctx.nodes, ctx.unlockedIds, ctx.pointsAvailable, ctx.extrasByNode)
  const prereqs = fullPrereqIds(node, ctx.extrasByNode)
  const extraPrereqs = prereqs.filter((id) => id !== node.parent_node_id)

  return (
    <div>
      <div className="tree-row skill-node-row" style={{ paddingLeft: `${depth}rem` }}>
        <span className={`tree-label${unlocked ? ' selected' : ''}`}>
          {node.name} <span className="dm-list-meta">({node.cost} pt{node.cost === 1 ? '' : 's'})</span>
          {extraPrereqs.length > 0 && (
            <span className="dm-list-meta">
              {' '}
              — requires {node.require_all_prereqs ? 'all of' : 'any of'}:{' '}
              {prereqs.map((id) => ctx.nodesById.get(id)?.name ?? '?').join(', ')}
            </span>
          )}
        </span>
        {unlocked ? (
          <span className="badge badge-campaign">Unlocked</span>
        ) : (
          ctx.editable && (
            <button type="button" disabled={!unlockable} onClick={() => ctx.onUnlock(node)}>
              Unlock
            </button>
          )
        )}
      </div>
      {node.description && (
        <p className="status-message skill-node-description" style={{ paddingLeft: `${depth + 1.5}rem` }}>
          {node.description}
        </p>
      )}
      {children.map((child) => (
        <SkillNodeView key={child.id} node={child} depth={depth + 1} ctx={ctx} />
      ))}
    </div>
  )
}

// Shared by the player's own Skill Tree page and the DM's read-only preview
// of a specific character's progress — driven entirely by `characterId`
// (its own campaign, from the character record, not the global campaign
// picker) so both call sites see the same thing regardless of which
// campaign the viewer currently has selected in nav.
export default function SkillTreeProgress({ characterId, editable }) {
  const [campaignId, setCampaignId] = useState(undefined)
  const [trees, setTrees] = useState([])
  const [treeId, setTreeId] = useState('')
  const [nodes, setNodes] = useState([])
  const [prereqRows, setPrereqRows] = useState([])
  const [pointsAvailable, setPointsAvailable] = useState(0)
  const [unlockedIds, setUnlockedIds] = useState(new Set())
  const [error, setError] = useState(null)
  const [showDiagram, setShowDiagram] = useState(false)

  useEffect(() => {
    supabase
      .from('characters')
      .select('campaign_id')
      .eq('id', characterId)
      .single()
      .then(({ data }) => setCampaignId(data?.campaign_id ?? null))
  }, [characterId])

  useEffect(() => {
    if (campaignId === undefined) return
    supabase
      .from('skill_trees')
      .select('*')
      .then(({ data }) => {
        const scoped = (data ?? []).filter((t) => !campaignId || !t.campaign_id || t.campaign_id === campaignId)
        setTrees(scoped)
        setTreeId((current) => (scoped.some((t) => t.id === current) ? current : scoped[0]?.id ?? ''))
      })
  }, [campaignId])

  const loadTreeState = useCallback(async () => {
    if (!treeId) {
      setNodes([])
      setPrereqRows([])
      setUnlockedIds(new Set())
      setPointsAvailable(0)
      return
    }
    const [{ data: nodeData }, { data: pointsRow }, { data: unlockRows }] = await Promise.all([
      supabase.from('skill_tree_nodes').select('*').eq('tree_id', treeId),
      supabase
        .from('character_skill_trees')
        .select('points_available')
        .eq('character_id', characterId)
        .eq('tree_id', treeId)
        .maybeSingle(),
      supabase.from('character_skill_unlocks').select('node_id').eq('character_id', characterId),
    ])
    setNodes(nodeData ?? [])
    setPointsAvailable(pointsRow?.points_available ?? 0)
    const nodeIds = new Set((nodeData ?? []).map((n) => n.id))
    setUnlockedIds(new Set((unlockRows ?? []).map((u) => u.node_id).filter((id) => nodeIds.has(id))))

    const ids = (nodeData ?? []).map((n) => n.id)
    if (ids.length > 0) {
      const { data: prereqData } = await supabase.from('skill_tree_node_prereqs').select('*').in('node_id', ids)
      setPrereqRows(prereqData ?? [])
    } else {
      setPrereqRows([])
    }
  }, [treeId, characterId])

  useEffect(() => {
    loadTreeState()
  }, [loadTreeState])

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

  if (campaignId === undefined) return <p className="status-message">Loading...</p>
  if (trees.length === 0) {
    return <p className="status-message">No skill trees are set up for this character's campaign yet.</p>
  }

  const spent = pointsSpent(nodes, unlockedIds)
  const roots = childNodes(nodes, null)
  const nodesById = new Map(nodes.map((n) => [n.id, n]))
  const extrasByNode = new Map()
  for (const row of prereqRows) {
    if (!extrasByNode.has(row.node_id)) extrasByNode.set(row.node_id, [])
    extrasByNode.get(row.node_id).push(row.prereq_node_id)
  }

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
        <button type="button" className="secondary" onClick={() => setShowDiagram((v) => !v)}>
          {showDiagram ? 'Show list' : 'Show diagram'}
        </button>
      </div>

      {error && <p className="status-message error">{error}</p>}

      {showDiagram ? (
        <SkillTreeDiagram nodes={nodes} extrasByNode={extrasByNode} unlockedIds={unlockedIds} />
      ) : (
        <div className="tree-outline">
          {roots.map((node) => (
            <SkillNodeView
              key={node.id}
              node={node}
              depth={0}
              ctx={{
                nodes,
                nodesById,
                unlockedIds,
                pointsAvailable,
                extrasByNode,
                editable,
                onUnlock: handleUnlock,
              }}
            />
          ))}
          {roots.length === 0 && <p className="status-message">This tree has no nodes yet.</p>}
        </div>
      )}
    </div>
  )
}
