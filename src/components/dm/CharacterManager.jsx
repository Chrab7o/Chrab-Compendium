import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'

export default function CharacterManager({ campaigns, onChange }) {
  const [characters, setCharacters] = useState([])
  const [players, setPlayers] = useState([])
  const [skillTrees, setSkillTrees] = useState([])
  const [skillPoints, setSkillPoints] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function load() {
    setLoading(true)
    const [{ data: characterData }, { data: playerData }, { data: treeData }, { data: pointsData }] =
      await Promise.all([
        supabase.from('characters').select('*').order('name', { ascending: true }),
        supabase.from('profiles').select('id, display_name').eq('role', 'player'),
        supabase.from('skill_trees').select('*'),
        supabase.from('character_skill_trees').select('*'),
      ])
    setCharacters(characterData ?? [])
    setPlayers(playerData ?? [])
    setSkillTrees(treeData ?? [])
    setSkillPoints(pointsData ?? [])
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
          const applicableTrees = skillTrees.filter(
            (t) => !t.campaign_id || t.campaign_id === c.campaign_id
          )
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
                <Link to={`/dm/characters/${c.id}/skill-tree`}>View Skill Tree</Link>
                <button type="button" className="danger" onClick={() => handleDelete(c.id)}>
                  Delete
                </button>
              </div>
              {applicableTrees.length > 0 && (
                <div className="character-skill-points">
                  {applicableTrees.map((t) => {
                    const row = skillPoints.find((p) => p.character_id === c.id && p.tree_id === t.id)
                    return (
                      <label key={t.id}>
                        {t.name} points
                        <input
                          type="number"
                          min="0"
                          defaultValue={row?.points_available ?? 0}
                          onBlur={(e) => setPoints(c.id, t.id, Number(e.target.value) || 0)}
                        />
                      </label>
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
