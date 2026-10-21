import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../../lib/supabaseClient'
import { CREATURE_TYPES, LANGUAGE_OPTIONS } from '../../../lib/homebrew'
import {
  CONDITIONS,
  CR_OPTIONS,
  DAMAGE_TYPES,
  NPC_ABILITIES,
  NPC_SIZES,
  NPC_SKILLS,
  abilityMod,
  averageFormula,
  crLabel,
  buildNpcActor,
  emptyNpcSpec,
  npcActorToSpec,
} from '../../../lib/foundryActorBuilder'
import { useCampaignContext } from '../../../contexts/CampaignContext'
import AbilityScorePicker from '../AbilityScorePicker'
import OptionPicker from '../OptionPicker'
import ActionBuilder from './ActionBuilder'
import StatblockPreview from './StatblockPreview'
import { downloadNpcActor } from './downloadActor'

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)

// Damage/condition pickers show capitalized labels but the spec (and dnd5e)
// store lowercase keys.
function KeyPicker({ label, keys, selected, onChange }) {
  return (
    <OptionPicker
      label={label}
      options={keys.map(cap)}
      selected={(selected ?? []).map(cap)}
      onChange={(list) => onChange(list.map((s) => s.toLowerCase()))}
      allowCustom={false}
      addPlaceholder="Add…"
    />
  )
}

// Blank number inputs mean "doesn't have this", same as RaceEditor.
function toOptionalNumber(value) {
  return value === '' ? null : Math.max(0, Number(value) || 0)
}

// NPC Forge editor: form on the left, live statblock on the right. The form
// state *is* the spec stored in npc_drafts.spec, so there's no form<->row
// conversion layer - lib/foundryActorBuilder.js turns it into a Foundry actor
// only at download time.
export default function NpcEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isNew = !id
  const { campaigns, campaignId: currentCampaignId } = useCampaignContext()

  const [spec, setSpec] = useState(emptyNpcSpec)
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
      .from('npc_drafts')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data, error: fetchError }) => {
        if (cancelled) return
        if (fetchError) setError(fetchError.message)
        else {
          // Merge over the empty spec so drafts saved before a field existed
          // still get its default.
          setSpec({ ...emptyNpcSpec(), ...data.spec })
          setCampaignId(data.campaign_id ?? '')
          setSyncStatus(data.sync_status ?? 'draft')
        }
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id, isNew])

  function set(patch) {
    setSpec((s) => ({ ...s, ...patch }))
  }

  function setNested(field, patch) {
    setSpec((s) => ({ ...s, [field]: { ...s[field], ...patch } }))
  }

  // `queue` also hands the built actor to the Chrab Sync module: the next time
  // the GM is in the Foundry world mapped to this campaign, it's offered for
  // import (see docs/npc-forge-phase2.md). The actor is built here, at send
  // time, so Foundry gets exactly what the preview showed.
  async function save({ queue = false } = {}) {
    setSaving(true)
    setError(null)
    const payload = { name: spec.name || 'Untitled NPC', cr: Number(spec.cr) || 0, campaign_id: campaignId || null, spec }
    if (queue) {
      Object.assign(payload, {
        queued_actor: buildNpcActor(spec, { draftId }),
        queued_at: new Date().toISOString(),
        sync_status: 'queued',
        sync_error: null,
      })
    }
    const result = draftId
      ? await supabase.from('npc_drafts').update(payload).eq('id', draftId).select().single()
      : await supabase.from('npc_drafts').insert(payload).select().single()
    setSaving(false)
    if (result.error) {
      setError(result.error.message)
      return null
    }
    setDraftId(result.data.id)
    setSavedAt(new Date())
    setSyncStatus(result.data.sync_status)
    // A brand-new draft has no id until the insert, so its first queued
    // actor couldn't carry the npcDraftId flag the module matches on -
    // rebuild it now that the id exists.
    if (queue && !draftId) {
      const fixed = await supabase
        .from('npc_drafts')
        .update({ queued_actor: buildNpcActor(spec, { draftId: result.data.id }) })
        .eq('id', result.data.id)
      if (fixed.error) setError(fixed.error.message)
    }
    if (!draftId) navigate(`/dm/npc-forge/${result.data.id}/edit`, { replace: true })
    return result.data.id
  }

  async function handleSend() {
    if (!campaignId) {
      setError('Pick a campaign first - each Foundry world pulls only its own campaign.')
      return
    }
    await save({ queue: true })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    await save()
  }

  async function handleDownload() {
    const savedId = await save()
    if (savedId) downloadNpcActor(spec, savedId)
  }

  async function handleImport(e) {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    try {
      const actor = JSON.parse(await file.text())
      if (actor?.type !== 'npc') throw new Error('That file is not a Foundry NPC actor export.')
      if (spec.name && !confirm(`Replace everything on this form with "${actor.name}"?`)) return
      setSpec(npcActorToSpec(actor))
    } catch (err) {
      setError(`Import failed: ${err.message}`)
    }
  }

  if (loading) return <p className="status-message">Loading...</p>

  const hpAverage = averageFormula(spec.hpFormula)
  const dexMod = abilityMod(spec.abilities.dex)

  return (
    <section className="page-wide">
      <div className="view-header">
        <h1>{isNew ? 'New NPC' : `Edit ${spec.name || 'NPC'}`}</h1>
        <div className="dm-form-actions">
          <label className="button-link">
            Load Foundry NPC
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
        <form onSubmit={handleSubmit} className="dm-form">
          <div className="dm-form-row">
            <label>
              Name
              <input value={spec.name} onChange={(e) => set({ name: e.target.value })} required autoFocus={isNew} />
            </label>
            <label>
              CR
              <select value={spec.cr} onChange={(e) => set({ cr: Number(e.target.value) })}>
                {CR_OPTIONS.map((cr) => (
                  <option key={cr} value={cr}>
                    {crLabel(cr)}
                  </option>
                ))}
              </select>
            </label>
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

          <div className="dm-form-row">
            <label>
              Size
              <select value={spec.size} onChange={(e) => set({ size: e.target.value })}>
                {NPC_SIZES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Creature type
              <select value={spec.creatureType} onChange={(e) => set({ creatureType: e.target.value })}>
                {CREATURE_TYPES.map((t) => (
                  <option key={t} value={t.toLowerCase()}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Subtype / tags
              <input value={spec.subtype} onChange={(e) => set({ subtype: e.target.value })} placeholder="e.g. Titan" />
            </label>
            <label>
              Alignment
              <input value={spec.alignment} onChange={(e) => set({ alignment: e.target.value })} placeholder="e.g. Chaotic Evil" />
            </label>
          </div>

          <fieldset className="tag-checklist">
            <legend>Ability scores</legend>
            <div className="dm-form-row race-ability-grid">
              {NPC_ABILITIES.map((a) => (
                <label key={a}>
                  {a.toUpperCase()} ({abilityMod(spec.abilities[a]) >= 0 ? '+' : ''}
                  {abilityMod(spec.abilities[a])})
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={spec.abilities[a]}
                    onChange={(e) => setNested('abilities', { [a]: Number(e.target.value) || 1 })}
                  />
                </label>
              ))}
            </div>
          </fieldset>

          <AbilityScorePicker
            legend="Saving throw proficiencies"
            selected={spec.saves.map((a) => a.toUpperCase())}
            onChange={(list) => set({ saves: list.map((a) => a.toLowerCase()) })}
          />

          <fieldset className="tag-checklist">
            <legend>Skills</legend>
            <div className="dm-form-row npc-skill-grid">
              {Object.entries(NPC_SKILLS).map(([key, skill]) => (
                <label key={key}>
                  {skill.label}
                  <select
                    value={spec.skills[key] ?? 0}
                    onChange={(e) => {
                      const next = { ...spec.skills }
                      const v = Number(e.target.value)
                      if (v) next[key] = v
                      else delete next[key]
                      set({ skills: next })
                    }}
                  >
                    <option value={0}>—</option>
                    <option value={1}>Proficient</option>
                    <option value={2}>Expertise</option>
                  </select>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="dm-form-row">
            <label>
              Armor Class
              <input type="number" min="0" value={spec.ac} onChange={(e) => set({ ac: Number(e.target.value) || 0 })} />
            </label>
            <label className="tag-checklist-item">
              <input type="checkbox" checked={spec.naturalArmor} onChange={(e) => set({ naturalArmor: e.target.checked })} />
              Natural armor
            </label>
            <label>
              HP formula
              <input value={spec.hpFormula} onChange={(e) => set({ hpFormula: e.target.value })} placeholder="e.g. 8d8 + 16" />
            </label>
            <label>
              Max HP
              <input
                type="number"
                min="1"
                value={spec.hpMax}
                placeholder={hpAverage ? `${hpAverage} (average)` : ''}
                onChange={(e) => set({ hpMax: e.target.value })}
              />
            </label>
            <label>
              Initiative
              <input
                type="number"
                value={spec.initiative}
                placeholder={`${dexMod >= 0 ? '+' : ''}${dexMod} (DEX)`}
                onChange={(e) => set({ initiative: e.target.value })}
              />
            </label>
          </div>

          <div className="dm-form-row">
            {['walk', 'fly', 'swim', 'climb', 'burrow'].map((key) => (
              <label key={key}>
                {cap(key)} (ft.)
                <input
                  type="number"
                  min="0"
                  step="5"
                  value={spec.speed[key] ?? ''}
                  placeholder="none"
                  onChange={(e) => setNested('speed', { [key]: toOptionalNumber(e.target.value) })}
                />
              </label>
            ))}
            <label className="tag-checklist-item">
              <input type="checkbox" checked={spec.speed.hover} onChange={(e) => setNested('speed', { hover: e.target.checked })} />
              Hover
            </label>
          </div>

          <div className="dm-form-row">
            {['darkvision', 'blindsight', 'tremorsense', 'truesight'].map((key) => (
              <label key={key}>
                {cap(key)} (ft.)
                <input
                  type="number"
                  min="0"
                  step="5"
                  value={spec.senses[key] ?? ''}
                  placeholder="none"
                  onChange={(e) => setNested('senses', { [key]: toOptionalNumber(e.target.value) })}
                />
              </label>
            ))}
            <label>
              Other senses
              <input value={spec.senses.special} onChange={(e) => setNested('senses', { special: e.target.value })} />
            </label>
          </div>

          <KeyPicker label="Damage resistances" keys={DAMAGE_TYPES} selected={spec.resistances} onChange={(resistances) => set({ resistances })} />
          <KeyPicker label="Damage immunities" keys={DAMAGE_TYPES} selected={spec.immunities} onChange={(immunities) => set({ immunities })} />
          <KeyPicker
            label="Damage vulnerabilities"
            keys={DAMAGE_TYPES}
            selected={spec.vulnerabilities}
            onChange={(vulnerabilities) => set({ vulnerabilities })}
          />
          <KeyPicker
            label="Condition immunities"
            keys={CONDITIONS}
            selected={spec.conditionImmunities}
            onChange={(conditionImmunities) => set({ conditionImmunities })}
          />

          <OptionPicker
            label="Languages"
            options={LANGUAGE_OPTIONS.filter((g) => g.group !== 'Choice')}
            selected={spec.languages}
            onChange={(languages) => set({ languages })}
            addPlaceholder="Add language…"
            customPlaceholder="Other language…"
          />
          <label>
            Language notes
            <input
              value={spec.languagesCustom}
              onChange={(e) => set({ languagesCustom: e.target.value })}
              placeholder="e.g. telepathy 120 ft.; understands Abyssal but can't speak"
            />
          </label>

          <div className="dm-form-row">
            <label>
              Legendary actions per round
              <input type="number" min="0" max="5" value={spec.legendaryActions} onChange={(e) => set({ legendaryActions: Number(e.target.value) || 0 })} />
            </label>
            <label>
              Legendary resistances per day
              <input
                type="number"
                min="0"
                max="5"
                value={spec.legendaryResistances}
                onChange={(e) => set({ legendaryResistances: Number(e.target.value) || 0 })}
              />
            </label>
            <label className="tag-checklist-item">
              <input type="checkbox" checked={spec.lair} onChange={(e) => set({ lair: e.target.checked })} />
              Has a lair
            </label>
          </div>

          <h2>Statblock</h2>
          <ActionBuilder items={spec.items} onChange={(items) => set({ items })} />

          <h2>Token &amp; art</h2>
          <p className="status-message">
            Paths are Foundry paths (e.g. <code>tokenizer/npc-images/goblin.webp</code>) or full image URLs. Blank uses
            Foundry&apos;s default.
          </p>
          <div className="dm-form-row">
            <label>
              Portrait image
              <input value={spec.img} onChange={(e) => set({ img: e.target.value })} />
            </label>
            <label>
              Token image
              <input value={spec.token.img} onChange={(e) => setNested('token', { img: e.target.value })} placeholder="same as portrait" />
            </label>
            <label>
              Disposition
              <select value={spec.token.disposition} onChange={(e) => setNested('token', { disposition: e.target.value })}>
                <option value="hostile">Hostile</option>
                <option value="neutral">Neutral</option>
                <option value="friendly">Friendly</option>
                <option value="secret">Secret</option>
              </select>
            </label>
            <label>
              Token scale
              <input
                type="number"
                min="0.2"
                max="3"
                step="0.1"
                value={spec.token.scale}
                onChange={(e) => setNested('token', { scale: Number(e.target.value) || 1 })}
              />
            </label>
            <label className="tag-checklist-item">
              <input
                type="checkbox"
                checked={spec.token.appendNumber}
                onChange={(e) => setNested('token', { appendNumber: e.target.checked })}
              />
              Number duplicates (Goblin 1, Goblin 2…)
            </label>
          </div>

          <label>
            Biography / GM notes
            <textarea value={spec.biography} rows={5} onChange={(e) => set({ biography: e.target.value })} />
          </label>

          {error && <p className="status-message error">{error}</p>}
          <div className="dm-form-actions">
            <button type="submit" disabled={saving}>
              {saving ? 'Saving...' : isNew && !draftId ? 'Create NPC' : 'Save changes'}
            </button>
            <button type="button" className="secondary" onClick={() => navigate('/dm/npc-forge')}>
              Back to list
            </button>
            {savedAt && (
              <span className="status-message">
                {syncStatus === 'queued' ? 'Saved and queued for Foundry' : 'Saved'} {savedAt.toLocaleTimeString()}
              </span>
            )}
          </div>
        </form>

        <StatblockPreview spec={spec} />
      </div>
    </section>
  )
}
