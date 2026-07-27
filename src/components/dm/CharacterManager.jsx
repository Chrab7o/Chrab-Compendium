import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useImpersonation } from '../../contexts/ImpersonationContext'

const TREE_TYPE_LABELS = { feature: 'Feature Tree', archetype: 'Archetype Tree' }
const XP_GRANT_AMOUNT = 20

function SkillPointInput({ treeType, initialValue, onSave }) {
  const [value, setValue] = useState(initialValue)
  const [saved, setSaved] = useState(false)

  // Keep in sync if the underlying row changes from elsewhere (e.g. a
  // reload after some other edit), but not while the DM is mid-edit.
  useEffect(() => {
    setValue(initialValue)
  }, [initialValue])

  async function save() {
    await onSave(Number(value) || 0)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <label className="skill-point-input">
      {TREE_TYPE_LABELS[treeType] ?? treeType} points
      <span className="skill-point-input-row">
        <input
          type="number"
          min="0"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              e.target.blur()
            }
          }}
        />
        <button type="button" onClick={save}>
          Save
        </button>
        {saved && <span className="skill-point-saved">Saved</span>}
      </span>
    </label>
  )
}

export default function CharacterManager({ campaigns, onChange }) {
  const navigate = useNavigate()
  const { startImpersonating } = useImpersonation()
  const [characters, setCharacters] = useState([])
  const [players, setPlayers] = useState([])
  const [skillTrees, setSkillTrees] = useState([])
  const [skillPoints, setSkillPoints] = useState([])
  const [visibleToRows, setVisibleToRows] = useState([])
  const [nodes, setNodes] = useState([])
  const [unlocks, setUnlocks] = useState([])
  const [crafts, setCrafts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function load() {
    setLoading(true)
    const [
      { data: characterData },
      { data: playerData },
      { data: treeData },
      { data: pointsData },
      { data: visibleToData },
      { data: nodeData },
      { data: unlockData },
      { data: craftData },
    ] = await Promise.all([
      supabase.from('characters').select('*').order('name', { ascending: true }),
      supabase.from('profiles').select('id, display_name').eq('role', 'player'),
      supabase.from('skill_trees').select('*'),
      supabase.from('character_skill_points').select('*'),
      supabase.from('skill_tree_visible_to').select('*'),
      supabase.from('skill_tree_nodes').select('id, tree_id, cost'),
      supabase.from('character_skill_unlocks').select('character_id, node_id'),
      supabase.from('character_skill_crafts').select('character_id, node_id, cost'),
    ])
    setCharacters(characterData ?? [])
    setPlayers(playerData ?? [])
    setSkillTrees(treeData ?? [])
    setSkillPoints(pointsData ?? [])
    setVisibleToRows(visibleToData ?? [])
    setNodes(nodeData ?? [])
    setUnlocks(unlockData ?? [])
    setCrafts(craftData ?? [])
    setLoading(false)
  }

  async function setPoints(characterId, treeType, points) {
    const { error: upsertError } = await supabase
      .from('character_skill_points')
      .upsert(
        { character_id: characterId, tree_type: treeType, points_available: points },
        { onConflict: 'character_id,tree_type' }
      )
    if (upsertError) setError(upsertError.message)
    else load()
  }

  // The points box holds the current remaining balance directly, so
  // granting more XP still means adding to whatever's already there (not
  // just typing the award amount, which would overwrite instead of add) -
  // this is exactly that addition, one XP-award click at a time instead of
  // the DM doing the math by hand.
  function grantXp(characterId, treeType, currentAvailable) {
    setPoints(characterId, treeType, currentAvailable + XP_GRANT_AMOUNT)
  }

  useEffect(() => {
    load()
  }, [])

  async function reassign(id, patch) {
    const { error: updateError } = await supabase.from('characters').update(patch).eq('id', id)
    if (updateError) setError(updateError.message)
    else load()
  }

  // points_available is a live balance now (unlock_skill_node/craft_skill_item
  // decrement it directly, dm_undo_skill_unlock refunds it) - the box above
  // already shows what's left. This is a separate, purely historical "spent
  // so far" total computed from the unlock/craft log, same as the player's
  // own Skill Tree tab (SkillTreeProgress.jsx) and the service-role-only
  // character_skill_pool_summary view the Discord bot uses. This page has no
  // access to that view (locked to service_role), but the DM already has
  // full RLS access to the underlying tables, so it's recomputed here the
  // same way instead.
  function pointsSpentFor(characterId, treeType) {
    const nodeInfoById = new Map(
      nodes.map((n) => [n.id, { cost: n.cost, treeType: skillTrees.find((t) => t.id === n.tree_id)?.tree_type }])
    )
    const unlockSpent = unlocks
      .filter((u) => u.character_id === characterId && nodeInfoById.get(u.node_id)?.treeType === treeType)
      .reduce((sum, u) => sum + (nodeInfoById.get(u.node_id)?.cost ?? 0), 0)
    const craftSpent = crafts
      .filter((cr) => cr.character_id === characterId && nodeInfoById.get(cr.node_id)?.treeType === treeType)
      .reduce((sum, cr) => sum + cr.cost, 0)
    return unlockSpent + craftSpent
  }

  function viewAs(character) {
    startImpersonating(character)
    navigate('/character')
  }

  async function handleDelete(id) {
    if (!confirm('Delete this character?')) return
    const { error: deleteError } = await supabase.from('characters').delete().eq('id', id)
    if (deleteError) setError(deleteError.message)
    else {
      load()
      onChange?.()
    }
  }

  if (loading) return <p className="status-message">Loading...</p>

  return (
    <div className="dm-panel">
      <div className="dm-panel-header">
        <h2>Characters</h2>
        <Link to="/dm/import" className="button-link">
          + Import
        </Link>
      </div>
      {error && <p className="status-message error">{error}</p>}
      <ul className="dm-list">
        {characters.map((c) => {
          // Same campaign scoping as everywhere else, plus: if a tree is
          // restricted to specific characters, it only counts as
          // "applicable" here when this character is one of them — so the
          // DM isn't offered a points box for a tree this character can't
          // actually see.
          const restrictedTreeIds = new Set(visibleToRows.map((v) => v.tree_id))
          const applicableTrees = skillTrees.filter((t) => {
            const inCampaign = !t.campaign_id || t.campaign_id === c.campaign_id
            if (!inCampaign) return false
            if (!restrictedTreeIds.has(t.id)) return true
            return visibleToRows.some((v) => v.tree_id === t.id && v.character_id === c.id)
          })
          // Points are pooled per tree_type, not per tree — one input per
          // type this character actually has a tree for, not one per tree.
          const applicableTreeTypes = [...new Set(applicableTrees.map((t) => t.tree_type))]
          return (
            <li key={c.id}>
              <span>{c.name}</span>
              <select
                value={c.owner_id ?? ''}
                onChange={(e) => reassign(c.id, { owner_id: e.target.value || null })}
              >
                <option value="">No player assigned</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name}
                  </option>
                ))}
              </select>
              <select
                value={c.campaign_id ?? ''}
                onChange={(e) => reassign(c.id, { campaign_id: e.target.value || null })}
              >
                <option value="">No campaign</option>
                {campaigns.map((camp) => (
                  <option key={camp.id} value={camp.id}>
                    {camp.name}
                  </option>
                ))}
              </select>
              <div className="dm-list-actions">
                <Link to={`/character/${c.id}`}>View</Link>
                {c.owner_id ? (
                  <button type="button" onClick={() => viewAs(c)}>
                    View As
                  </button>
                ) : (
                  <span className="dm-list-meta" title="Assign a player first">
                    View As (needs a player)
                  </span>
                )}
                <button type="button" className="danger" onClick={() => handleDelete(c.id)}>
                  Delete
                </button>
              </div>
              {applicableTreeTypes.length > 0 && (
                <div className="character-skill-points">
                  {applicableTreeTypes.map((treeType) => {
                    const row = skillPoints.find((p) => p.character_id === c.id && p.tree_type === treeType)
                    const available = row?.points_available ?? 0
                    const spent = pointsSpentFor(c.id, treeType)
                    return (
                      <div key={treeType} className="skill-point-input-group">
                        <SkillPointInput
                          treeType={treeType}
                          initialValue={available}
                          onSave={(points) => setPoints(c.id, treeType, points)}
                        />
                        <span className="dm-list-meta">{spent} XP spent so far</span>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => grantXp(c.id, treeType, available)}
                        >
                          +{XP_GRANT_AMOUNT} XP
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </li>
          )
        })}
        {characters.length === 0 && <li className="status-message">No characters imported yet.</li>}
      </ul>
    </div>
  )
}
