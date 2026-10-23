import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../../../lib/supabaseClient'
import { emptyNpcSpec } from '../../../lib/foundryActorBuilder'
import {
  FEATURE_KINDS,
  FEATURE_TEMPLATES,
  FEAT_TYPES,
  buildFeatureItem,
  emptyFeatureSpec,
  featureItemToSpec,
  featureName,
} from '../../../lib/foundryFeatures'
import { useCampaignContext } from '../../../contexts/CampaignContext'
import { ItemCard } from '../npc/ActionBuilder'
import { NpcSpecContext } from '../npc/FormulaInput'
import { SpellCard } from '../npc/SpellcastingPanel'
import { downloadFeatureItem } from './downloadItem'

// The shared item editors expect an NPC to resolve @references against. A
// feature's owner isn't known until it's on a character, so formulas show "—"
// instead of an NPC's numbers.
const OWNER_CONTEXT = { spec: { ...emptyNpcSpec(), name: 'the owner' }, rollData: {} }

function stripHtml(html) {
  return String(html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

// Right-hand preview: the item card as Foundry will show it, plus the
// generated behavior macro for anyone who wants to read what will run.
function FeaturePreview({ spec }) {
  const { item, error } = useMemo(() => {
    try {
      return { item: buildFeatureItem(spec), error: null }
    } catch (err) {
      return { item: null, error: err.message }
    }
  }, [spec])
  if (error) return <aside className="npc-statblock"><p className="status-message error">{error}</p></aside>
  const activities = Object.values(item.system.activities ?? {})
  const hook = item.flags?.['chrab-sync']?.behavior ? activities[0] : null
  const typeLabel = item.type === 'spell' ? 'Spell' : FEAT_TYPES.find((t) => t.key === item.system.type?.value)?.label ?? 'Feature'
  return (
    <aside className="npc-statblock" aria-label="Item preview">
      <h2>{item.name}</h2>
      <p className="npc-statblock-sub">
        {typeLabel}
        {item.system.requirements ? ` · ${item.system.requirements}` : ''}
      </p>
      <hr />
      <p>{stripHtml(item.system.description?.value) || <span className="npc-statblock-muted">No description yet.</span>}</p>
      {activities.length > 0 && (
        <>
          <h3>On the sheet</h3>
          {activities.map((a) => (
            <p key={a._id}>
              <strong>{a.name || a.type}</strong> <span className="npc-statblock-muted">({a.midiProperties?.automationOnly ? 'automatic, not a choice' : a.activation?.type})</span>
            </p>
          ))}
        </>
      )}
      {item.effects.length > 0 && (
        <>
          <h3>Effects</h3>
          {item.effects.map((e) => (
            <p key={e._id}>
              <strong>{e.name}</strong>{' '}
              <span className="npc-statblock-muted">
                {e.flags?.['chrab-sync']?.stance ? 'while toggled on' : e.transfer ? 'always on' : 'on the target'}
                {e.system.changes.length ? ` · ${e.system.changes.length} change${e.system.changes.length === 1 ? '' : 's'}` : ''}
              </span>
            </p>
          ))}
        </>
      )}
      {hook?.macroData && (
        <details className="npc-cheatsheet">
          <summary>Generated macro (runs in Foundry)</summary>
          <pre className="npc-code feature-macro">{hook.macroData.command}</pre>
        </details>
      )}
    </aside>
  )
}

// Feature Forge editor: one class feature, feat or spell, saved as a
// feature_drafts row and sent to the world's Items directory by Chrab Sync.
// The form state is the stored spec (lib/foundryFeatures.js).
export default function FeatureEditor() {
  const { id } = useParams()
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const isNew = !id
  const { campaigns, campaignId: currentCampaignId } = useCampaignContext()

  const [spec, setSpec] = useState(() => FEATURE_TEMPLATES.find((t) => t.key === search.get('template'))?.build() ?? emptyFeatureSpec(search.get('kind') === 'spell' ? 'spell' : 'feat'))
  const [campaignId, setCampaignId] = useState(currentCampaignId || '')
  const [draftId, setDraftId] = useState(id ?? null)
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [savedAt, setSavedAt] = useState(null)
  const [syncStatus, setSyncStatus] = useState('draft')

  useEffect(() => {
    if (isNew) return
    let cancelled = false
    setLoading(true)
    supabase
      .from('feature_drafts')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data, error: fetchError }) => {
        if (cancelled) return
        if (fetchError) setError(fetchError.message)
        else {
          const base = emptyFeatureSpec(data.spec?.kind)
          setSpec({ ...base, ...data.spec, item: { ...base.item, ...data.spec?.item }, spell: { ...base.spell, ...data.spec?.spell } })
          setCampaignId(data.campaign_id ?? '')
          setSyncStatus(data.sync_status ?? 'draft')
        }
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id, isNew])

  const set = (patch) => setSpec((s) => ({ ...s, ...patch }))
  const name = featureName(spec)

  // Same flow as the NPC editor: the item is built at send time into
  // queued_item, and a brand-new draft is rebuilt once its id exists so the
  // featureDraftId flag Chrab Sync matches on is set.
  async function save({ queue = false } = {}) {
    setSaving(true)
    setError(null)
    const payload = { name: name || 'Untitled feature', kind: spec.kind, campaign_id: campaignId || null, spec }
    if (queue) Object.assign(payload, { queued_item: buildFeatureItem(spec, { draftId }), sync_status: 'queued', sync_error: null })
    const result = draftId
      ? await supabase.from('feature_drafts').update(payload).eq('id', draftId).select().single()
      : await supabase.from('feature_drafts').insert(payload).select().single()
    setSaving(false)
    if (result.error) {
      setError(result.error.message)
      return null
    }
    setDraftId(result.data.id)
    setSavedAt(new Date())
    setSyncStatus(result.data.sync_status)
    if (queue && !draftId) {
      const fixed = await supabase.from('feature_drafts').update({ queued_item: buildFeatureItem(spec, { draftId: result.data.id }) }).eq('id', result.data.id)
      if (fixed.error) setError(fixed.error.message)
    }
    if (!draftId) navigate(`/dm/feature-forge/${result.data.id}/edit`, { replace: true })
    return result.data.id
  }

  async function handleSend() {
    if (!campaignId) {
      setError('Pick a campaign first - each Foundry world pulls only its own campaign.')
      return
    }
    await save({ queue: true })
  }

  async function handleDownload() {
    const savedId = await save()
    if (savedId) downloadFeatureItem(spec, savedId)
  }

  async function handleImport(e) {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    try {
      const item = JSON.parse(await file.text())
      const next = featureItemToSpec(item)
      if (name && !confirm(`Replace everything on this form with "${item.name}"?`)) return
      setSpec(next)
    } catch (err) {
      setError(`Import failed: ${err.message}`)
    }
  }

  if (loading) return <p className="status-message">Loading...</p>

  return (
    <section className="page-wide">
      <div className="view-header">
        <h1>{isNew && !draftId ? 'New feature' : `Edit ${name || 'feature'}`}</h1>
        <div className="dm-form-actions">
          <label className="button-link">
            Load Foundry item
            <input type="file" accept="application/json" onChange={handleImport} style={{ display: 'none' }} />
          </label>
          <button type="button" className="secondary" onClick={handleDownload} disabled={saving}>
            Save &amp; download Foundry JSON
          </button>
          <button type="button" onClick={handleSend} disabled={saving} title={campaignId ? '' : 'Pick a campaign first'}>
            {syncStatus === 'queued' ? 'Re-send to Foundry' : 'Send to Foundry'}
          </button>
        </div>
      </div>

      <div className="npc-forge-layout">
        <form
          className="dm-form"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          <div className="dm-form-row">
            <label>
              Kind
              <select value={spec.kind} onChange={(e) => set({ kind: e.target.value })}>
                {FEATURE_KINDS.map((k) => (
                  <option key={k.key} value={k.key}>
                    {k.label}
                  </option>
                ))}
              </select>
            </label>
            {spec.kind === 'feat' && (
              <>
                <label>
                  Feature type
                  <select value={spec.featType} onChange={(e) => set({ featType: e.target.value })}>
                    {FEAT_TYPES.map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Requirements
                  <input value={spec.requirements} onChange={(e) => set({ requirements: e.target.value })} placeholder="e.g. Fighter 3" />
                </label>
              </>
            )}
            <label>
              Campaign
              <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
                <option value="">None</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <NpcSpecContext.Provider value={OWNER_CONTEXT}>
            {spec.kind === 'spell' ? (
              <SpellCard spell={spec.spell} onChange={(spell) => set({ spell })} standalone />
            ) : (
              <>
                <label>
                  Icon
                  <input value={spec.item.img} onChange={(e) => set({ item: { ...spec.item, img: e.target.value } })} placeholder="Foundry path, e.g. icons/svg/skull.svg" />
                </label>
                <div className="repeatable-rows">
                  <ItemCard item={spec.item} onChange={(item) => set({ item })} standalone />
                </div>
              </>
            )}
          </NpcSpecContext.Provider>

          <p className="status-message">
            Formulas resolve against whoever owns the item in Foundry: <code>@abilities.con.mod</code> is that
            character&apos;s CON modifier. Scripts and behaviors run in the browser of the player who uses the item.
          </p>

          {error && <p className="status-message error">{error}</p>}
          <div className="dm-form-actions">
            <button type="submit" disabled={saving}>
              {saving ? 'Saving...' : isNew && !draftId ? 'Create feature' : 'Save changes'}
            </button>
            <button type="button" className="secondary" onClick={() => navigate('/dm/feature-forge')}>
              Back to list
            </button>
            {savedAt && (
              <span className="status-message">
                {syncStatus === 'queued' ? 'Saved and queued for Foundry' : 'Saved'} {savedAt.toLocaleTimeString()}
              </span>
            )}
          </div>
        </form>

        <FeaturePreview spec={spec} />
      </div>
    </section>
  )
}
