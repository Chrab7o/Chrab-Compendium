import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { buildNpcActor, crLabel, npcActorToSpec } from '../../lib/foundryActorBuilder'
import { useCampaignContext } from '../../contexts/CampaignContext'
import { downloadNpcActor } from '../../components/dm/npc/downloadActor'

function timeAgo(iso) {
  if (!iso) return ''
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} h ago`
  return new Date(iso).toLocaleDateString()
}

// Where a draft is in the send-to-Foundry queue (Phase 2, Chrab Sync).
// "Changed since sent" compares spec_updated_at, not updated_at - recording a
// sync result also bumps updated_at.
function SyncBadge({ draft, worldTitle }) {
  const changed = draft.queued_at && draft.spec_updated_at && new Date(draft.spec_updated_at) > new Date(draft.queued_at)
  switch (draft.sync_status) {
    case 'queued':
      return <span className="badge badge-pending" title={`Sent ${timeAgo(draft.queued_at)}`}>Waiting for Foundry</span>
    case 'synced':
      return changed ? (
        <span className="badge badge-own" title="Edited after it was sent - re-send to update Foundry">Changed since sent</span>
      ) : (
        <span className="badge badge-open" title={`${worldTitle ?? 'Foundry'} - ${timeAgo(draft.synced_at)}`}>In Foundry</span>
      )
    case 'failed':
      return <span className="badge badge-closed" title={draft.sync_error ?? ''}>Sync failed</span>
    default:
      return null
  }
}

// NPC Forge list: every statblock drafted on the site, ready to download as a
// Foundry actor or send to the Chrab Sync queue. "Import Foundry NPC" turns
// an existing actor export (a Plutonium monster, say) into a new draft, so
// variants start from the real thing instead of a blank form.
export default function DMNpcForgePage() {
  const navigate = useNavigate()
  const { campaigns, campaignId } = useCampaignContext()
  const [drafts, setDrafts] = useState([])
  const [worlds, setWorlds] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: loadError } = await supabase
      .from('npc_drafts')
      .select('*')
      .order('updated_at', { ascending: false })
    if (loadError) setError(loadError.message)
    else setDrafts(data ?? [])
    const { data: worldRows } = await supabase.from('foundry_worlds').select('*').order('last_seen_at', { ascending: false })
    setWorlds(worldRows ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleImport(e) {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    try {
      const actor = JSON.parse(await file.text())
      if (actor?.type !== 'npc') throw new Error('That file is not a Foundry NPC actor export.')
      const spec = npcActorToSpec(actor)
      const { data, error: saveError } = await supabase
        .from('npc_drafts')
        .insert({ name: spec.name, cr: spec.cr, campaign_id: campaignId || null, spec })
        .select()
        .single()
      if (saveError) throw saveError
      navigate(`/dm/npc-forge/${data.id}/edit`)
    } catch (err) {
      setError(`Import failed: ${err.message}`)
    }
  }

  async function handleSend(draft) {
    if (!draft.campaign_id) {
      setError(`"${draft.name}" has no campaign yet - open it and pick one, so the right Foundry world picks it up.`)
      return
    }
    const { error: sendError } = await supabase
      .from('npc_drafts')
      .update({
        queued_actor: buildNpcActor(draft.spec, { draftId: draft.id }),
        // queued_at is stamped by the npc_drafts_touch_spec trigger.
        sync_status: 'queued',
        sync_error: null,
      })
      .eq('id', draft.id)
    if (sendError) setError(sendError.message)
    else load()
  }

  async function handleDuplicate(draft) {
    const { error: saveError } = await supabase.from('npc_drafts').insert({
      name: `${draft.name} (copy)`,
      cr: draft.cr,
      campaign_id: draft.campaign_id,
      spec: { ...draft.spec, name: `${draft.name} (copy)` },
    })
    if (saveError) setError(saveError.message)
    else load()
  }

  async function handleDelete(draft) {
    if (!confirm(`Delete "${draft.name}"? This only removes the draft here, not any actor already in Foundry.`)) return
    const { error: deleteError } = await supabase.from('npc_drafts').delete().eq('id', draft.id)
    if (deleteError) setError(deleteError.message)
    else load()
  }

  const campaignName = (id) => campaigns.find((c) => c.id === id)?.name
  const worldTitle = (id) => worlds.find((w) => w.world_id === id)?.title

  return (
    <section className="page-wide">
      <div className="view-header">
        <h1>NPC Forge</h1>
      </div>
      <p className="view-subtitle">
        Build statblocks here, then download them as Foundry actors (right-click a blank NPC in Foundry
        &rarr; Import Data). NPCs are always GM-only in Foundry.
      </p>

      <div className="dm-panel">
        <div className="dm-panel-header">
          <h2>Drafts</h2>
          <div className="dm-form-actions">
            <label className="button-link">
              Import Foundry NPC
              <input type="file" accept="application/json" onChange={handleImport} style={{ display: 'none' }} />
            </label>
            <Link to="/dm/npc-forge/new" className="button-link">
              + New NPC
            </Link>
          </div>
        </div>
        {error && <p className="status-message error">{error}</p>}
        {loading ? (
          <p className="status-message">Loading...</p>
        ) : (
          <ul className="dm-list">
            {drafts.map((draft) => (
              <li key={draft.id}>
                <span>{draft.name}</span>
                <span className="dm-list-meta">CR {crLabel(draft.cr)}</span>
                {draft.campaign_id && <span className="badge badge-campaign">{campaignName(draft.campaign_id) ?? 'Campaign'}</span>}
                <SyncBadge draft={draft} worldTitle={worldTitle(draft.foundry_world_id)} />
                <div className="dm-list-actions">
                  <Link to={`/dm/npc-forge/${draft.id}/edit`}>Edit</Link>
                  <button type="button" className="secondary" onClick={() => handleSend(draft)}>
                    {draft.sync_status === 'draft' ? 'Send to Foundry' : 'Re-send'}
                  </button>
                  <button type="button" className="secondary" onClick={() => downloadNpcActor(draft.spec, draft.id)}>
                    Download
                  </button>
                  <button type="button" className="secondary" onClick={() => handleDuplicate(draft)}>
                    Duplicate
                  </button>
                  <button type="button" className="danger" onClick={() => handleDelete(draft)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
            {drafts.length === 0 && <li className="status-message">No NPCs yet.</li>}
          </ul>
        )}
      </div>

      <div className="dm-panel">
        <div className="dm-panel-header">
          <h2>Linked Foundry worlds</h2>
        </div>
        <p className="status-message">
          Worlds running the Chrab Sync module check in here each time the GM loads them. Install it in Foundry with
          the manifest URL <code>{`${window.location.origin}/foundry/chrab-sync/module.json`}</code>.
        </p>
        <ul className="dm-list">
          {worlds.map((w) => (
            <li key={w.world_id}>
              <span>{w.title || w.world_id}</span>
              {w.campaign_id && <span className="badge badge-campaign">{campaignName(w.campaign_id) ?? 'Campaign'}</span>}
              <span className="dm-list-meta">
                last seen {timeAgo(w.last_seen_at)}
                {w.module_version ? ` - module v${w.module_version}` : ''}
              </span>
            </li>
          ))}
          {worlds.length === 0 && <li className="status-message">No worlds have checked in yet.</li>}
        </ul>
      </div>
    </section>
  )
}
