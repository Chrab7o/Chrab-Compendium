import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../../lib/supabaseClient'
import { summarizeActor, getCurrency } from '../../../lib/foundryCharacter'

export default function FoundryImporter({ campaigns }) {
  const [players, setPlayers] = useState([])
  // { file, exportedAt, actor, summary, existing, pendingTrades, campaignId, ownerId, status, error, characterId }
  // `existing` is the characters already imported from this Foundry actor;
  // when non-empty, importing updates them instead of creating a new page.
  // `pendingTrades` are their shop trades not yet marked as applied in Foundry.
  const [parsed, setParsed] = useState([])

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
        const data = JSON.parse(text)
        // party.json from the party-export macro is an array of actors;
        // a single-actor "Export Data" file is one object.
        const actors = Array.isArray(data) ? data : [data]
        for (const actor of actors) {
          results.push({
            file: file.name,
            // When the macro saved the file - i.e. the moment the export
            // reflects. Trades made before it are already in Foundry.
            exportedAt: new Date(file.lastModified).toISOString(),
            actor,
            summary: summarizeActor(actor),
            existing: [],
            pendingTrades: [],
            campaignId: '',
            ownerId: '',
            status: 'pending',
            error: null,
          })
        }
      } catch (err) {
        results.push({ file: file.name, error: `Couldn't parse: ${err.message}`, status: 'error' })
      }
    }

    const foundryIds = results.map((r) => r.actor?._id).filter(Boolean)
    if (foundryIds.length > 0) {
      const { data: existing } = await supabase
        .from('characters')
        .select('id, foundry_id, owner_id, campaign_id')
        .in('foundry_id', foundryIds)
      const existingIds = (existing ?? []).map((c) => c.id)
      const { data: trades } = existingIds.length
        ? await supabase
            .from('shop_transactions')
            .select('id, character_id, created_at')
            .in('character_id', existingIds)
            .is('settled_at', null)
        : { data: [] }
      for (const row of results) {
        row.existing = (existing ?? []).filter((c) => c.foundry_id === row.actor?._id)
        const ids = new Set(row.existing.map((c) => c.id))
        row.pendingTrades = (trades ?? []).filter(
          (t) => ids.has(t.character_id) && new Date(t.created_at) < new Date(row.exportedAt)
        )
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
    const synced = {
      name: row.actor.name,
      foundry_id: row.actor._id ?? null,
      currency: getCurrency(row.actor),
      raw_data: row.actor,
    }

    if (row.existing.length > 0) {
      // Owner and campaign are left alone - they were assigned on first import.
      const { error } = await supabase
        .from('characters')
        .update(synced)
        .in('id', row.existing.map((c) => c.id))
      if (error) {
        updateRow(index, { status: 'error', error: error.message })
        return
      }
      // The export now includes these trades, so they stop counting toward
      // the balance on top of the imported gold.
      if (row.pendingTrades.length > 0) {
        const { error: settleError } = await supabase
          .from('shop_transactions')
          .update({ settled_at: new Date().toISOString() })
          .in('id', row.pendingTrades.map((t) => t.id))
        if (settleError) {
          updateRow(index, { status: 'error', error: `Updated, but couldn't settle trades: ${settleError.message}` })
          return
        }
      }
      updateRow(index, { status: 'done', characterId: row.existing[0].id })
      return
    }

    const { data, error } = await supabase
      .from('characters')
      .insert({
        ...synced,
        owner_id: row.ownerId || null,
        campaign_id: row.campaignId || null,
        source: 'foundry',
      })
      .select()
      .single()

    if (error) updateRow(index, { status: 'error', error: error.message })
    else updateRow(index, { status: 'done', characterId: data.id })
  }

  async function updateAllExisting() {
    const indexes = parsed
      .map((row, i) => (row.summary && row.existing.length > 0 && row.status === 'pending' ? i : -1))
      .filter((i) => i >= 0)
    await Promise.all(indexes.map((i) => importRow(i)))
  }

  const pendingUpdates = parsed.filter(
    (row) => row.summary && row.existing.length > 0 && row.status === 'pending'
  ).length

  return (
    <div className="dm-panel">
      <h2>Import Foundry Characters</h2>
      <p className="view-subtitle">
        Upload a party.json from the party-export macro, or one or more Actor export .json files
        from FoundryVTT. Characters imported before are updated in place (sheet and gold); new ones
        need a player and campaign assigned. Shop trades made before the file was exported are marked as
        applied — so apply pending trades in Foundry before running the export macro.
      </p>
      <input type="file" accept=".json" multiple onChange={handleFiles} />

      {pendingUpdates > 0 && (
        <button type="button" onClick={updateAllExisting}>
          Update all {pendingUpdates} existing
        </button>
      )}

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
                      {` · ${getCurrency(row.actor).gp ?? 0} gp`}
                    </span>
                  </div>
                  {row.status === 'done' ? (
                    <Link to={`/character/${row.characterId}`}>View sheet →</Link>
                  ) : row.existing.length > 0 ? (
                    <>
                      <span className="dm-list-meta">
                        Already imported
                        {row.pendingTrades.length > 0 &&
                          ` · settles ${row.pendingTrades.length} shop trade${row.pendingTrades.length === 1 ? '' : 's'}`}
                      </span>
                      <button type="button" onClick={() => importRow(i)} disabled={row.status === 'saving'}>
                        {row.status === 'saving' ? 'Updating...' : 'Update'}
                      </button>
                    </>
                  ) : (
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
