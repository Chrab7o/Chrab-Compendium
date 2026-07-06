import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'

export default function CharacterManager({ campaigns, onChange }) {
  const [characters, setCharacters] = useState([])
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function load() {
    setLoading(true)
    const [{ data: characterData }, { data: playerData }] = await Promise.all([
      supabase.from('characters').select('*').order('name', { ascending: true }),
      supabase.from('profiles').select('id, display_name').eq('role', 'player'),
    ])
    setCharacters(characterData ?? [])
    setPlayers(playerData ?? [])
    setLoading(false)
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
        {characters.map((c) => (
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
              <button type="button" className="danger" onClick={() => handleDelete(c.id)}>
                Delete
              </button>
            </div>
          </li>
        ))}
        {characters.length === 0 && <li className="status-message">No characters imported yet.</li>}
      </ul>
    </div>
  )
}
