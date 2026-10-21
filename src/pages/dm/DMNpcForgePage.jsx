import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { crLabel, npcActorToSpec } from '../../lib/foundryActorBuilder'
import { useCampaignContext } from '../../contexts/CampaignContext'
import { downloadNpcActor } from '../../components/dm/npc/downloadActor'

// NPC Forge list: every statblock drafted on the site, ready to download as a
// Foundry actor. "Import Foundry NPC" turns an existing actor export (a
// Plutonium monster, say) into a new draft, so variants start from the real
// thing instead of a blank form.
export default function DMNpcForgePage() {
  const navigate = useNavigate()
  const { campaigns, campaignId } = useCampaignContext()
  const [drafts, setDrafts] = useState([])
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
                <div className="dm-list-actions">
                  <Link to={`/dm/npc-forge/${draft.id}/edit`}>Edit</Link>
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
    </section>
  )
}
