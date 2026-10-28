import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../../../lib/supabaseClient'
import {
  FEATURE_KINDS,
  FEAT_TYPES,
  buildFeatureItem,
  gearType,
  rarityLabel,
  featureItemToSpec,
  featureName,
  featureSpecFromRow,
} from '../../../lib/foundryFeatures'
import { featureDraftLinks, republishQuietly } from '../../../lib/foundryClassPackPublish'
import { npcsUsingDraft } from '../../../lib/itemLibraryStore'
import { useCampaignContext } from '../../../contexts/CampaignContext'
import { ItemCard } from '../npc/ActionBuilder'
import { NpcSpecContext } from '../npc/FormulaInput'
import { SpellCard } from '../npc/SpellcastingPanel'
import { downloadFeatureItem } from './downloadItem'
import { OWNER_CONTEXT } from './ownerContext'
import TemplatePicker from './TemplatePicker'
import FeatureWizard from './FeatureWizard'
import ChainBuilder from './ChainBuilder'
import { DescriptionBlocks, GearStatFields } from './GearFields'
import { buildFromTemplate, findTemplate } from '../../../lib/automationTemplates'
import { newForgeSpec } from '../../../lib/forgeKinds'

// Guided (FeatureWizard) or All fields (the item card form), remembered per browser.
const MODE_KEY = 'featureForge.mode'
function storedMode() {
  try {
    return localStorage.getItem(MODE_KEY) === 'all' ? 'all' : 'guided'
  } catch {
    return 'guided'
  }
}

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
  const gearLabel =
    spec.kind === 'gear'
      ? [rarityLabel(spec.gear.rarity), gearType(spec).subtypes.find(([k]) => k === spec.gear.subtype)?.[1], spec.gear.attunement && '(requires attunement)'].filter(Boolean).join(' ')
      : ''
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
  const typeLabel = gearLabel || (item.type === 'spell' ? 'Spell' : FEAT_TYPES.find((t) => t.key === item.system.type?.value)?.label ?? 'Feature')
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
// layout="chain": the experimental chain builder (docs/item-forge-chain.md),
// its own page; the same item, so it links back and forth with this one.
export default function FeatureEditor({ layout = null }) {
  const chain = layout === 'chain'
  const { id } = useParams()
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const isNew = !id
  const { campaigns, campaignId: currentCampaignId } = useCampaignContext()

  // ?template=: a template with settings asks for them first (TemplatePicker).
  const startTemplate = isNew ? findTemplate(search.get('template')) : null
  const [spec, setSpec] = useState(
    // ?kind=spell | weapon | armor | wondrous | consumable (gear = wondrous) starts that kind.
    () => (startTemplate && !startTemplate.params.length ? buildFromTemplate(startTemplate).spec : null) ?? newForgeSpec(search.get('kind') || 'feat'),
  )
  const [pickingTemplate, setPickingTemplate] = useState(!!startTemplate?.params.length)
  const [campaignId, setCampaignId] = useState(currentCampaignId || '')
  const [draftId, setDraftId] = useState(id ?? null)
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [savedAt, setSavedAt] = useState(null)
  const [syncStatus, setSyncStatus] = useState('draft')
  const [usedBy, setUsedBy] = useState([]) // class / subclass features this automates
  const [onNpcs, setOnNpcs] = useState([]) // NPC Forge drafts that link it
  const [mode, setMode] = useState(storedMode)

  function switchMode(next) {
    setMode(next)
    try {
      localStorage.setItem(MODE_KEY, next)
    } catch {
      // private window: just don't remember it
    }
  }

  useEffect(() => {
    if (!draftId) return
    let cancelled = false
    featureDraftLinks(draftId).then((links) => {
      if (!cancelled) setUsedBy(links)
    })
    npcsUsingDraft(draftId)
      .then((npcs) => !cancelled && setOnNpcs(npcs))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [draftId])

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
          setSpec(featureSpecFromRow(data.spec))
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
    // A feature some class links to is in the Foundry class pack: keep it current.
    if (draftId && (await featureDraftLinks(draftId)).length) {
      const notice = await republishQuietly()
      if (notice) setError(notice)
    }
    if (!draftId) navigate(`/dm/item-forge/${result.data.id}/${chain ? 'chain' : 'edit'}`, { replace: true })
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

  // Resolves true when the form was replaced (the wizard's Start step moves on).
  async function handleImport(e) {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return false
    setError(null)
    try {
      const item = JSON.parse(await file.text())
      const next = featureItemToSpec(item)
      if (name && !confirm(`Replace everything on this form with "${item.name}"?`)) return false
      setSpec(next)
      return true
    } catch (err) {
      setError(`Import failed: ${err.message}`)
      return false
    }
  }

  if (loading) return <p className="status-message">Loading...</p>

  return (
    <section className="page-wide">
      <div className="view-header">
        <h1>
          {isNew && !draftId ? 'New item' : `Edit ${name || 'item'}`}
          {chain && <span className="ch-badge">Chain builder · experimental</span>}
        </h1>
        <div className="dm-form-actions">
          {draftId && (
            <Link className="button-link secondary" to={`/dm/item-forge/${draftId}/${chain ? 'edit' : 'chain'}`}>
              {chain ? 'Open in the regular editor' : 'Chain builder (experimental)'}
            </Link>
          )}
          {!chain && (
            <div className="fw-mode" role="group" aria-label="Editor layout">
              <button type="button" className={mode === 'guided' ? 'is-on' : ''} aria-pressed={mode === 'guided'} onClick={() => switchMode('guided')}>
                Guided
              </button>
              <button type="button" className={mode === 'all' ? 'is-on' : ''} aria-pressed={mode === 'all'} onClick={() => switchMode('all')}>
                All fields
              </button>
            </div>
          )}
          <label className="fw-campaign">
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

      {pickingTemplate && (
        <div className="dm-panel">
          <TemplatePicker
            fixedKey={startTemplate.key}
            createLabel="Start the feature"
            onCreate={(next) => {
              setSpec(next)
              setPickingTemplate(false)
            }}
          />
          <button type="button" className="secondary" onClick={() => setPickingTemplate(false)}>
            Skip, start blank
          </button>
        </div>
      )}

      {usedBy.length > 0 && (
        <div className="draft-banner feature-used-by">
          <span>
            Part of{' '}
            {usedBy.map((link, i) => (
              <span key={link.to + i}>
                {i > 0 && ', '}
                <Link to={link.to}>{link.label}</Link>
              </span>
            ))}
            . Its name and text come from there and are replaced when that class is saved; the mechanics edited here are
            kept, and saving republishes the Foundry class pack.
          </span>
        </div>
      )}

      {onNpcs.length > 0 && (
        <div className="draft-banner feature-used-by">
          <span>
            On{' '}
            {onNpcs.map((npc, i) => (
              <span key={npc.id}>
                {i > 0 && ', '}
                <Link to={`/dm/npc-forge/${npc.id}/edit`}>{npc.name || 'Untitled NPC'}</Link>
              </span>
            ))}
            . Changes here show on {onNpcs.length === 1 ? 'it' : 'them'} on the site right away; re-send {onNpcs.length === 1 ? 'it' : 'them'} from the NPC Forge to update Foundry.
          </span>
        </div>
      )}

      <div className="npc-forge-layout">
        <form
          className="dm-form"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          {chain ? (
            <NpcSpecContext.Provider value={OWNER_CONTEXT}>
              <ChainBuilder
                spec={spec}
                set={set}
                replace={setSpec}
                onImport={handleImport}
                showStart={isNew && !draftId && !startTemplate && !search.get('kind')}
                linkedText={usedBy.length > 0}
              />
            </NpcSpecContext.Provider>
          ) : mode === 'guided' ? (
            <NpcSpecContext.Provider value={OWNER_CONTEXT}>
              <FeatureWizard
                spec={spec}
                set={set}
                replace={setSpec}
                onImport={handleImport}
                showStart={isNew && !draftId && !startTemplate && !search.get('kind')}
                linkedText={usedBy.length > 0}
              />
            </NpcSpecContext.Provider>
          ) : (
            <>
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
              </div>

              <NpcSpecContext.Provider value={OWNER_CONTEXT}>
                {spec.kind === 'spell' ? (
                  <SpellCard spell={spec.spell} onChange={(spell) => set({ spell })} standalone />
                ) : spec.kind === 'gear' ? (
                  <>
                    <GearStatFields gear={spec.gear} setGear={(patch) => set({ gear: { ...spec.gear, ...patch } })} />
                    <label>
                      Icon
                      <input value={spec.item.img} onChange={(e) => set({ item: { ...spec.item, img: e.target.value } })} placeholder="Foundry path" />
                    </label>
                    <h3>Description</h3>
                    <DescriptionBlocks blocks={spec.gear.blocks} onChange={(blocks) => set({ gear: { ...spec.gear, blocks } })} />
                    <div className="repeatable-rows">
                      <ItemCard item={spec.item} onChange={(item) => set({ item })} standalone />
                    </div>
                  </>
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
            </>
          )}

          {error && <p className="status-message error">{error}</p>}
          <div className="dm-form-actions">
            <button type="submit" disabled={saving}>
              {saving ? 'Saving...' : isNew && !draftId ? 'Create feature' : 'Save changes'}
            </button>
            <button type="button" className="secondary" onClick={() => navigate('/dm/item-forge')}>
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
