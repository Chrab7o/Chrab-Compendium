import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { useCampaignContext } from '../contexts/CampaignContext'
import { childNodes, pointsSpent, canUnlock } from '../lib/skillTrees'

function SkillNodeView({ node, depth, ctx }) {
  const children = childNodes(ctx.nodes, node.id)
  const unlocked = ctx.unlockedIds.has(node.id)
  const unlockable = !unlocked && canUnlock(node, ctx.nodes, ctx.unlockedIds, ctx.pointsAvailable)

  return (
    <div>
      <div className="tree-row skill-node-row" style={{ paddingLeft: `${depth}rem` }}>
        <span className={`tree-label${unlocked ? ' selected' : ''}`}>
          {node.name} <span className="dm-list-meta">({node.cost} pt{node.cost === 1 ? '' : 's'})</span>
        </span>
        {unlocked ? (
          <span className="badge badge-campaign">Unlocked</span>
        ) : (
          <button type="button" disabled={!unlockable} onClick={() => ctx.onUnlock(node)}>
            Unlock
          </button>
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

export default function MySkillTree() {
  const { session } = useAuth()
  const { campaignId } = useCampaignContext()
  const [characterId, setCharacterId] = useState(undefined)
  const [trees, setTrees] = useState([])
  const [treeId, setTreeId] = useState('')
  const [nodes, setNodes] = useState([])
  const [pointsAvailable, setPointsAvailable] = useState(0)
  const [unlockedIds, setUnlockedIds] = useState(new Set())
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    let query = supabase.from('characters').select('id').eq('owner_id', session.user.id)
    query = campaignId ? query.eq('campaign_id', campaignId) : query.is('campaign_id', null)
    query.maybeSingle().then(({ data }) => {
      if (!cancelled) setCharacterId(data?.id ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [session.user.id, campaignId])

  useEffect(() => {
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
    if (!treeId || !characterId) {
      setNodes([])
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

  if (characterId === undefined) return <p className="page status-message">Loading...</p>
  if (characterId === null) {
    return (
      <p className="page status-message">
        No character found for {campaignId ? 'the selected campaign' : 'general (no campaign selected)'}
        . Ask your DM to assign one first.
      </p>
    )
  }
  if (trees.length === 0) {
    return <p className="page status-message">No skill trees are set up for this campaign yet.</p>
  }

  const spent = pointsSpent(nodes, unlockedIds)
  const roots = childNodes(nodes, null)

  return (
    <section className="page">
      <div className="view-header">
        <h1>Skill Tree</h1>
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

      <div className="tree-outline">
        {roots.map((node) => (
          <SkillNodeView
            key={node.id}
            node={node}
            depth={0}
            ctx={{ nodes, unlockedIds, pointsAvailable, onUnlock: handleUnlock }}
          />
        ))}
        {roots.length === 0 && <p className="status-message">This tree has no nodes yet.</p>}
      </div>
    </section>
  )
}
