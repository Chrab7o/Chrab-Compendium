import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { FEATURE_TEMPLATES, FEAT_TYPES, buildFeatureItem, featureItemToSpec, featureName } from '../../lib/foundryFeatures'
import { useCampaignContext } from '../../contexts/CampaignContext'
import { downloadFeatureItem } from '../../components/dm/feature/downloadItem'
import { SyncBadge } from './DMNpcForgePage'

// Feature Forge list: single features and spells, built on the site and sent
// to the world's Items directory through Chrab Sync (its Items tab), ready to
// drag onto characters. Templates start from a finished feature.
export default function DMFeatureForgePage() {
  const navigate = useNavigate()
  const { campaigns, campaignId } = useCampaignContext()
  const [drafts, setDrafts] = useState([])
  const [worlds, setWorlds] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: loadError } = await supabase.from('feature_drafts').select('*').order('updated_at', { ascending: false })
    if (loadError) setError(loadError.message)
    else setDrafts(data ?? [])
    const { data: worldRows } = await supabase.from('foundry_worlds').select('world_id, title')
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
      const spec = featureItemToSpec(JSON.parse(await file.text()))
      const { data, error: saveError } = await supabase
        .from('feature_drafts')
        .insert({ name: featureName(spec) || 'Imported feature', kind: spec.kind, campaign_id: campaignId || null, spec })
        .select()
        .single()
      if (saveError) throw saveError
      navigate(`/dm/feature-forge/${data.id}/edit`)
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
      .from('feature_drafts')
      .update({ queued_item: buildFeatureItem(draft.spec, { draftId: draft.id }), sync_status: 'queued', sync_error: null })
      .eq('id', draft.id)
    if (sendError) setError(sendError.message)
    else load()
  }

  async function handleDuplicate(draft) {
    const copyName = `${draft.name} (copy)`
    const spec = structuredClone(draft.spec)
    if (spec.kind === 'spell') spec.spell.name = copyName
    else spec.item.name = copyName
    const { error: saveError } = await supabase.from('feature_drafts').insert({ name: copyName, kind: draft.kind, campaign_id: draft.campaign_id, spec })
    if (saveError) setError(saveError.message)
    else load()
  }

  async function handleDelete(draft) {
    if (!confirm(`Delete "${draft.name}"? This only removes the draft here, not any item already in Foundry.`)) return
    const { error: deleteError } = await supabase.from('feature_drafts').delete().eq('id', draft.id)
    if (deleteError) setError(deleteError.message)
    else load()
  }

  const campaignName = (id) => campaigns.find((c) => c.id === id)?.name
  const worldTitle = (id) => worlds.find((w) => w.world_id === id)?.title
  const kindLabel = (draft) =>
    draft.kind === 'spell' ? 'Spell' : FEAT_TYPES.find((t) => t.key === draft.spec?.featType)?.label ?? 'Feature'

  return (
    <section className="page-wide">
      <div className="view-header">
        <h1>Feature Forge</h1>
      </div>
      <p className="view-subtitle">
        Custom class features, feats and spells with their own automation - stances, &ldquo;when I hit…&rdquo; rules,
        midi-qol scripts. Send them to Foundry and they land in the Items directory, ready to drag onto a character.
      </p>

      <div className="dm-panel">
        <div className="dm-panel-header">
          <h2>Start from a template</h2>
        </div>
        <ul className="dm-list">
          {FEATURE_TEMPLATES.map((t) => (
            <li key={t.key}>
              <span>{t.label}</span>
              <span className="dm-list-meta">{t.help}</span>
              <div className="dm-list-actions">
                <Link to={`/dm/feature-forge/new?template=${t.key}`}>Use</Link>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="dm-panel">
        <div className="dm-panel-header">
          <h2>Drafts</h2>
          <div className="dm-form-actions">
            <label className="button-link">
              Import Foundry item
              <input type="file" accept="application/json" onChange={handleImport} style={{ display: 'none' }} />
            </label>
            <Link to="/dm/feature-forge/new?kind=spell" className="button-link">
              + New spell
            </Link>
            <Link to="/dm/feature-forge/new" className="button-link">
              + New feature
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
                <span className="dm-list-meta">{kindLabel(draft)}</span>
                {draft.campaign_id && <span className="badge badge-campaign">{campaignName(draft.campaign_id) ?? 'Campaign'}</span>}
                <SyncBadge draft={draft} worldTitle={worldTitle(draft.foundry_world_id)} />
                <div className="dm-list-actions">
                  <Link to={`/dm/feature-forge/${draft.id}/edit`}>Edit</Link>
                  <button type="button" className="secondary" onClick={() => handleSend(draft)}>
                    {draft.sync_status === 'draft' ? 'Send to Foundry' : 'Re-send'}
                  </button>
                  <button type="button" className="secondary" onClick={() => downloadFeatureItem(draft.spec, draft.id)}>
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
            {drafts.length === 0 && <li className="status-message">No features yet.</li>}
          </ul>
        )}
      </div>
    </section>
  )
}
