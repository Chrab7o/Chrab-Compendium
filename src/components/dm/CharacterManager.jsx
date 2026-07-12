import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useImpersonation } from '../../contexts/ImpersonationContext'

function SkillPointInput({ treeName, initialValue, onSave }) {
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
      {treeName} points
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
    ] = await Promise.all([
      supabase.from('characters').select('*').order('name', { ascending: true }),
      supabase.from('profiles').select('id, display_name').eq('role', 'player'),
      supabase.from('skill_trees').select('*'),
      supabase.from('character_skill_trees').select('*'),
      supabase.from('skill_tree_visible_to').select('*'),
    ])
    setCharacters(characterData ?? [])
    setPlayers(playerData ?? [])
    setSkillTrees(treeData ?? [])
    setSkillPoints(pointsData ?? [])
    setVisibleToRows(visibleToData ?? [])
    setLoading(false)
  }

  async function setPoints(characterId, treeId, points) {
    const { error: upsertError } = await supabase
      .from('character_skill_trees')
      .upsert({ character_id: characterId, tree_id: treeId, points_available: points }, { onConflict: 'character_id,tree_id' })
    if (upsertError) setError(upsertError.message)
    else load()
  }

  useEffect(() => {
    load()
  }, [])

  async function reassign(id, patch) {
    const { error: updateError } = await supabase.from('characters').update(patch).eq('id', id)
    if (updateError) setError(updateError.message)
    else load()
  }

  function viewAs(character) {
    startImpersonating(character)
    navigate('/account')
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
              {applicableTrees.length > 0 && (
                <div className="character-skill-points">
                  {applicableTrees.map((t) => {
                    const row = skillPoints.find((p) => p.character_id === c.id && p.tree_id === t.id)
                    return (
                      <SkillPointInput
                        key={t.id}
                        treeName={t.name}
                        initialValue={row?.points_available ?? 0}
                        onSave={(points) => setPoints(c.id, t.id, points)}
                      />
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
