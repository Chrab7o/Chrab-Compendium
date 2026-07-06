import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../../lib/supabaseClient'
import { summarizeActor } from '../../../lib/foundryCharacter'

export default function FoundryImporter({ campaigns }) {
  const [players, setPlayers] = useState([])
  const [parsed, setParsed] = useState([]) // { file, actor, summary, campaignId, ownerId, status, error, characterId }

  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, display_name')
      .eq('role', 'player')
      .then(({ data }) => setPlayers(data ?? []))
  }, [])

  async function handleFiles(e) {
    const files = Array.from(e.target.files)
    e.target.value = ''
    const results = []
    for (const file of files) {
      try {
        const text = await file.text()
        const actor = JSON.parse(text)
        results.push({
          file: file.name,
          actor,
          summary: summarizeActor(actor),
          campaignId: '',
          ownerId: '',
          status: 'pending',
          error: null,
        })
      } catch (err) {
        results.push({ file: file.name, error: `Couldn't parse: ${err.message}`, status: 'error' })
      }
    }
    setParsed((prev) => [...prev, ...results])
  }

  function updateRow(index, patch) {
    setParsed((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  async function importRow(index) {
    const row = parsed[index]
    updateRow(index, { status: 'saving' })
    const { data, error } = await supabase
      .from('characters')
      .insert({
        name: row.actor.name,
        owner_id: row.ownerId || null,
        campaign_id: row.campaignId || null,
        source: 'foundry',
        raw_data: row.actor,
      })
      .select()
      .single()

    if (error) updateRow(index, { status: 'error', error: error.message })
    else updateRow(index, { status: 'done', characterId: data.id })
  }

  return (
    <div className="dm-panel">
      <h2>Import Foundry Characters</h2>
      <p className="view-subtitle">
        Upload one or more Actor export .json files from FoundryVTT. Assign each to a player and
        campaign before importing.
      </p>
      <input type="file" accept=".json" multiple onChange={handleFiles} />

      {parsed.length > 0 && (
        <ul className="dm-list import-list">
          {parsed.map((row, i) => (
            <li key={i} className="import-row">
              {row.error && row.status === 'error' && !row.summary ? (
                <span className="status-message error">
                  {row.file}: {row.error}
                </span>
              ) : (
                <>
                  <div className="import-row-summary">
                    <strong>{row.summary.name}</strong>
                    <span className="dm-list-meta">
                      {row.summary.classSummary} · Level {row.summary.level}
                      {row.summary.race && ` · ${row.summary.race}`}
                    </span>
                  </div>
                  {row.status !== 'done' ? (
                    <>
                      <select
                        value={row.ownerId}
                        onChange={(e) => updateRow(i, { ownerId: e.target.value })}
                      >
                        <option value="">No player assigned</option>
                        {players.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.display_name}
                          </option>
                        ))}
                      </select>
                      <select
                        value={row.campaignId}
                        onChange={(e) => updateRow(i, { campaignId: e.target.value })}
                      >
                        <option value="">No campaign</option>
                        {campaigns.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <button type="button" onClick={() => importRow(i)} disabled={row.status === 'saving'}>
                        {row.status === 'saving' ? 'Importing...' : 'Import'}
                      </button>
                    </>
                  ) : (
                    <Link to={`/character/${row.characterId}`}>View sheet →</Link>
                  )}
                  {row.error && <span className="status-message error">{row.error}</span>}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
