import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../../lib/supabaseClient'
import { summarizeActor, getCurrency } from '../../../lib/foundryCharacter'

const normalize = (name) => (name ?? '').trim().toLowerCase()

// Best guess at which existing character a Foundry actor is, by name: an
// exact match, else a unique one-name-starts-with-the-other match ("Lunasear
// Alvalium" vs "Lunasear Alvalium 2024"). Only a guess - the DM confirms it
// in the row's dropdown before anything is written.
function guessLink(actorName, candidates) {
  const name = normalize(actorName)
  if (!name) return ''
  const exact = candidates.filter((c) => normalize(c.name) === name)
  if (exact.length === 1) return exact[0].id
  const prefix = candidates.filter((c) => {
    const other = normalize(c.name)
    return other.startsWith(name) || name.startsWith(other)
  })
  return prefix.length === 1 ? prefix[0].id : ''
}

// Imports Foundry actors, updating characters that already exist instead of
// duplicating them. Updating only replaces the Foundry data (sheet, gold) -
// the page, its id, player, campaign, skill-tree progress, notes and trade
// history all stay - so re-importing is safe to do every session.
//
// A row targets an existing character in one of two ways:
// - by Foundry actor id (characters.foundry_id) - automatic;
// - by a link the DM confirms, for characters imported before ids were
//   stored. Foundry's per-actor "Export Data" drops the actor's _id, so
//   those rows have no id to match on. Linking saves the id, so the next
//   import matches automatically.
export default function FoundryImporter({ campaigns }) {
  const [players, setPlayers] = useState([])
  const [characters, setCharacters] = useState([])
  // { file, exportedAt, actor, summary, existing, linkId, campaignId, ownerId, status, error, characterId }
  // `existing`: characters matched by Foundry id. `linkId`: the character the
  // DM has linked an id-less match to ('' = import as new).
  const [parsed, setParsed] = useState([])

  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, display_name')
      .eq('role', 'player')
      .then(({ data }) => setPlayers(data ?? []))
  }, [])

  async function loadCharacters() {
    const { data } = await supabase.from('characters').select('id, name, foundry_id').order('name')
    setCharacters(data ?? [])
    return data ?? []
  }

  useEffect(() => {
    loadCharacters()
  }, [])

  // Characters that don't yet carry a Foundry id - the only ones a row can be
  // linked to, since anything with an id is matched (or not) by that id.
  const unlinked = characters.filter((c) => !c.foundry_id)

  async function handleFiles(e) {
    const files = Array.from(e.target.files)
    e.target.value = ''
    const all = await loadCharacters()
    const linkable = all.filter((c) => !c.foundry_id)
    const results = []
    for (const file of files) {
      try {
        const data = JSON.parse(await file.text())
        // party.json from the party-export macro is an array of actors;
        // a single-actor "Export Data" file is one object.
        const actors = Array.isArray(data) ? data : [data]
        for (const actor of actors) {
          const existing = actor._id ? all.filter((c) => c.foundry_id === actor._id) : []
          results.push({
            file: file.name,
            // When the macro saved the file - i.e. the moment the export
            // reflects. Trades made before it are already in Foundry.
            exportedAt: new Date(file.lastModified).toISOString(),
            actor,
            summary: summarizeActor(actor),
            existing,
            linkId: existing.length > 0 ? '' : guessLink(actor.name, linkable),
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
    setParsed((prev) => [...prev, ...results])
  }

  function updateRow(index, patch) {
    setParsed((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  const targetIds = (row) => (row.existing.length > 0 ? row.existing.map((c) => c.id) : row.linkId ? [row.linkId] : [])

  async function importRow(index) {
    const row = parsed[index]
    updateRow(index, { status: 'saving', error: null })
    const synced = {
      foundry_id: row.actor._id ?? null,
      currency: getCurrency(row.actor),
      raw_data: row.actor,
    }
    const ids = targetIds(row)

    if (ids.length > 0) {
      // Only the Foundry data changes. Name, player and campaign are the
      // site's own and stay as they are, so a character renamed here (e.g.
      // "... 2024") keeps its name.
      const { error } = await supabase.from('characters').update(synced).in('id', ids)
      if (error) {
        updateRow(index, { status: 'error', error: error.message })
        return
      }
      // Trades made before the export are now included in its gold, so they
      // stop counting on top of it.
      const { error: settleError } = await supabase
        .from('shop_transactions')
        .update({ settled_at: new Date().toISOString() })
        .in('character_id', ids)
        .is('settled_at', null)
        .lt('created_at', row.exportedAt)
      if (settleError) {
        updateRow(index, { status: 'error', error: `Updated, but couldn't settle trades: ${settleError.message}` })
        return
      }
      updateRow(index, { status: 'done', characterId: ids[0] })
      loadCharacters()
      return
    }

    const { data, error } = await supabase
      .from('characters')
      .insert({
        ...synced,
        name: row.actor.name,
        owner_id: row.ownerId || null,
        campaign_id: row.campaignId || null,
        source: 'foundry',
      })
      .select()
      .single()

    if (error) updateRow(index, { status: 'error', error: error.message })
    else {
      updateRow(index, { status: 'done', characterId: data.id })
      loadCharacters()
    }
  }

  const updatable = parsed
    .map((row, i) => ({ row, i }))
    .filter(({ row }) => row.summary && row.status === 'pending' && targetIds(row).length > 0)

  async function updateAllExisting() {
    await Promise.all(updatable.map(({ i }) => importRow(i)))
  }

  // Two rows pointed at the same character would overwrite each other.
  const linkCounts = {}
  for (const row of parsed) if (row.status === 'pending' && row.linkId) linkCounts[row.linkId] = (linkCounts[row.linkId] ?? 0) + 1

  const nameOf = (id) => characters.find((c) => c.id === id)?.name ?? 'that character'

  return (
    <div className="dm-panel">
      <h2>Import Foundry Characters</h2>
      <p className="view-subtitle">
        Upload a party.json from the party-export macro, or Actor export .json files from FoundryVTT. Updating a
        character only replaces its sheet and gold — its page, player, campaign, skill-tree progress and notes stay.
        Shop trades made before the file was exported are marked as applied, so apply pending trades in Foundry
        before running the export macro.
      </p>
      <input type="file" accept=".json" multiple onChange={handleFiles} />

      {updatable.length > 0 && (
        <button type="button" onClick={updateAllExisting}>
          Update all {updatable.length} existing
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
                      <span className="dm-list-meta">Matched: {row.existing.map((c) => c.name).join(', ')}</span>
                      <button type="button" onClick={() => importRow(i)} disabled={row.status === 'saving'}>
                        {row.status === 'saving' ? 'Updating...' : 'Update'}
                      </button>
                    </>
                  ) : (
                    <>
                      <label className="import-link">
                        Existing character
                        <select value={row.linkId} onChange={(e) => updateRow(i, { linkId: e.target.value })}>
                          <option value="">None — import as new</option>
                          {unlinked.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      {row.linkId ? (
                        <button type="button" onClick={() => importRow(i)} disabled={row.status === 'saving'}>
                          {row.status === 'saving' ? 'Updating...' : `Update ${nameOf(row.linkId)}`}
                        </button>
                      ) : (
                        <>
                          <select value={row.ownerId} onChange={(e) => updateRow(i, { ownerId: e.target.value })}>
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
                            {row.status === 'saving' ? 'Importing...' : 'Import as new'}
                          </button>
                        </>
                      )}
                      {row.linkId && linkCounts[row.linkId] > 1 && (
                        <span className="status-message error">
                          Another row is also linked to {nameOf(row.linkId)}.
                        </span>
                      )}
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
