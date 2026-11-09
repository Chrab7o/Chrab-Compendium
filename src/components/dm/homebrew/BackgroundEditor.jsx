import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../../../lib/supabaseClient'
import {
  ABILITY_LABELS,
  ABILITY_SCORES,
  BACKGROUND_FIELDS,
  FEAT_FIELDS,
  LANGUAGE_OPTIONS,
  SKILLS,
  TOOL_PROFICIENCY_OPTIONS,
  backgroundFormToExportJson,
  backgroundFormToFiveToolsJson,
  backgroundFeatOptions,
  backgroundJsonToFormState,
  backgroundToFormState,
  duplicateBackgroundForm,
  emptyBackgroundForm,
  fiveToolsBackgroundToForm,
  fiveToolsEntryList,
  fiveToolsFeatToForm,
  joinBackgroundFeatOptions,
} from '../../../lib/homebrew'
import { downloadJson, saveParentWithChildren, slugify } from '../../../lib/homebrewSave'
import { republishQuietly } from '../../../lib/foundryClassPackPublish'
import OptionPicker from '../OptionPicker'
import RepeatableRows from '../RepeatableRows'
import FiveToolsEntryPicker from './FiveToolsEntryPicker'
import FiveToolsFeatPicker from './FiveToolsFeatPicker'
import VisibilitySelect from './VisibilitySelect'

const SKILL_OPTIONS = SKILLS.map((s) => s.name)

// Single-page editor, same layout as RaceEditor. Covers both editions: the
// 2024 fields (ability options, origin feat) and the 2014 ones (a named
// "Feature", suggested characteristics tables) - the latter just go in the
// features list, and anything left blank is hidden on the detail page.
//
// The origin feat can be several options the player chooses one of; they're
// stored in the one `feat` column, joined with " or " (backgroundFeatOptions).
//
// /new?from=<id> starts from a copy of that background (Duplicate), so one
// can serve as a template: same feat list and picks, new name and lore.
export default function BackgroundEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isNew = !id
  const [searchParams] = useSearchParams()
  const fromId = isNew ? searchParams.get('from') : null
  const loadId = id ?? fromId

  const [form, setForm] = useState(emptyBackgroundForm)
  const [loading, setLoading] = useState(!!loadId)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [fiveToolsPool, setFiveToolsPool] = useState([])
  const [featNames, setFeatNames] = useState([])
  // The feat options as edited, blanks included (a just-added row), so
  // typing doesn't lose an empty row. form.feat is always their join.
  const [featRows, setFeatRows] = useState([''])
  // Feats picked from the 5etools catalog: [{ feat (form shape), add }]. On
  // save each still named is also added to Feats, so the detail page links
  // its full text and it's in the Foundry pack, unless one by that name
  // already exists or the DM unticks it.
  const [featPickerOpen, setFeatPickerOpen] = useState(false)
  const [pickedFeats, setPickedFeats] = useState([])

  // A load or import replaced form.feat: show its options.
  useEffect(() => {
    setFeatRows((rows) => {
      if (joinBackgroundFeatOptions(rows) === form.feat) return rows
      const options = backgroundFeatOptions(form.feat)
      return options.length ? options : ['']
    })
  }, [form.feat])

  useEffect(() => {
    supabase
      .from('homebrew_feats')
      .select('name')
      .order('name', { ascending: true })
      .then(({ data }) => setFeatNames((data ?? []).map((f) => f.name)))
  }, [])

  useEffect(() => {
    if (!loadId) {
      setForm(emptyBackgroundForm)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    Promise.all([
      supabase.from('homebrew_backgrounds').select('*').eq('id', loadId).single(),
      supabase.from('homebrew_background_features').select('*').eq('background_id', loadId),
    ]).then(([{ data: backgroundRow, error: fetchError }, { data: features }]) => {
      if (cancelled) return
      if (fetchError) setError(fetchError.message)
      else {
        const loaded = backgroundToFormState(backgroundRow, features ?? [])
        setForm(fromId ? duplicateBackgroundForm(loaded) : loaded)
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [loadId, fromId])

  function set(patch) {
    setForm((f) => ({ ...f, ...patch }))
  }

  function changeFeatRows(rows) {
    setFeatRows(rows)
    set({ feat: joinBackgroundFeatOptions(rows) })
  }

  // A picked feat still named by an option - as is, or with a variant added
  // ("Magic Initiate (Wizard)"), which the detail page also links.
  const featOptions = backgroundFeatOptions(form.feat)
  const inUse = (feat) => featOptions.some((o) => o === feat.name || o.startsWith(`${feat.name} (`))
  const exists = (feat) => featNames.some((n) => n.toLowerCase() === feat.name.toLowerCase())
  const pickedInUse = pickedFeats.filter((p) => inUse(p.feat))

  // Fills the first blank option, else adds one.
  function pickFeat(entry) {
    const feat = fiveToolsFeatToForm(entry)
    setPickedFeats((list) => [...list.filter((p) => p.feat.name !== feat.name), { feat, add: true }])
    const blank = featRows.findIndex((r) => !r.trim())
    changeFeatRows(blank >= 0 ? featRows.map((r, i) => (i === blank ? feat.name : r)) : [...featRows, feat.name])
    setFeatPickerOpen(false)
  }

  function toggleAbility(ability) {
    const options = form.ability_options.includes(ability)
      ? form.ability_options.filter((a) => a !== ability)
      : [...form.ability_options, ability]
    set({ ability_options: ABILITY_SCORES.filter((a) => options.includes(a)) })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const payload = { ...Object.fromEntries(BACKGROUND_FIELDS.map((k) => [k, form[k]])), visibility: form.visibility }
    payload.slug = form.slug || slugify(form.name)

    const result = await saveParentWithChildren({
      table: 'homebrew_backgrounds',
      childTable: 'homebrew_background_features',
      foreignKey: 'background_id',
      id: form.id,
      payload,
      children: form.features,
    })
    if (result.id) set({ id: result.id })
    if (result.error) {
      setSaving(false)
      setError(result.error)
      return
    }

    for (const { feat } of pickedInUse.filter((p) => p.add && !exists(p.feat))) {
      const featResult = await saveParentWithChildren({
        table: 'homebrew_feats',
        childTable: 'homebrew_feat_benefits',
        foreignKey: 'feat_id',
        id: null,
        payload: {
          ...Object.fromEntries(FEAT_FIELDS.map((k) => [k, feat[k]])),
          slug: slugify(feat.name),
          visibility: form.visibility,
        },
        children: feat.benefits,
      })
      if (featResult.id) setFeatNames((names) => [...names, feat.name])
      if (featResult.error) {
        setSaving(false)
        setError(`The background saved, but adding ${feat.name} to Feats failed: ${featResult.error}`)
        return
      }
    }
    // Public backgrounds and feats are in the Foundry class pack.
    const notice = await republishQuietly()
    setSaving(false)
    navigate('/dm/homebrew?tab=backgrounds', notice ? { state: { notice } } : undefined)
  }

  async function readJsonFile(e) {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return null
    setError(null)
    return JSON.parse(await file.text())
  }

  async function handleImport(e) {
    try {
      const json = await readJsonFile(e)
      if (json) setForm(backgroundJsonToFormState(json))
    } catch (err) {
      setError(`Import failed: ${err.message}`)
    }
  }

  async function handleImportFiveTools(e) {
    try {
      const json = await readJsonFile(e)
      if (!json) return
      const entries = fiveToolsEntryList(json, 'background')
      if (entries.length === 1) setForm(fiveToolsBackgroundToForm(entries[0]))
      else setFiveToolsPool(entries)
    } catch (err) {
      setError(`Import failed: ${err.message}`)
    }
  }

  const fileBase = form.slug || slugify(form.name) || 'background'

  if (loading) return <p className="status-message">Loading...</p>

  return (
    <section className="page-wide">
      <div className="view-header">
        <h1>{isNew ? (fromId ? 'New Background (from a copy)' : 'New Background') : `Edit ${form.name}`}</h1>
        <div className="dm-form-actions">
          {isNew ? (
            <>
              <label className="button-link">
                Import JSON
                <input type="file" accept="application/json" onChange={handleImport} style={{ display: 'none' }} />
              </label>
              <label className="button-link">
                Import from 5etools
                <input type="file" accept="application/json" onChange={handleImportFiveTools} style={{ display: 'none' }} />
              </label>
            </>
          ) : (
            <>
              <button
                type="button"
                className="secondary"
                title="Start a new background from this one's saved version"
                onClick={() => navigate(`/dm/homebrew/backgrounds/new?from=${id}`)}
              >
                Duplicate
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => downloadJson(backgroundFormToExportJson(form), `${fileBase}.background.json`)}
              >
                Export JSON
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => downloadJson(backgroundFormToFiveToolsJson(form), `${fileBase}.5etools.json`)}
              >
                Export to 5etools
              </button>
            </>
          )}
        </div>
      </div>

      {fiveToolsPool.length > 0 && (
        <FiveToolsEntryPicker
          entries={fiveToolsPool}
          noun="background"
          onPick={(entry) => {
            setForm(fiveToolsBackgroundToForm(entry))
            setFiveToolsPool([])
          }}
          onCancel={() => setFiveToolsPool([])}
        />
      )}

      <form onSubmit={handleSubmit} className="dm-form">
        <div className="dm-form-row">
          <label>
            Name
            <input value={form.name} onChange={(e) => set({ name: e.target.value })} required autoFocus />
          </label>
          <label>
            Slug (URL, auto-generated if blank)
            <input value={form.slug} onChange={(e) => set({ slug: e.target.value })} placeholder={slugify(form.name)} />
          </label>
          <VisibilitySelect value={form.visibility} onChange={(visibility) => set({ visibility })} />
        </div>
        <label>
          Description
          <textarea value={form.description} onChange={(e) => set({ description: e.target.value })} rows={4} />
        </label>

        <fieldset className="tag-checklist">
          <legend>Ability Scores</legend>
          {ABILITY_SCORES.map((a) => (
            <label key={a} className="tag-checklist-item">
              <input type="checkbox" checked={form.ability_options.includes(a)} onChange={() => toggleAbility(a)} />
              {ABILITY_LABELS[a]}
            </label>
          ))}
          <label className="homebrew-ability-note">
            Note (optional)
            <input
              value={form.ability_note}
              onChange={(e) => set({ ability_note: e.target.value })}
              placeholder="e.g. +2 to one and +1 to another, or +1 to all three"
            />
          </label>
        </fieldset>

        <fieldset className="background-feat-options">
          <legend>Origin Feat</legend>
          <p className="npc-hint">
            {featOptions.length > 1
              ? `The player chooses one of these ${featOptions.length} feats.`
              : 'Add another option to let the player choose one.'}
          </p>
          <datalist id="background-feats">
            {featNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          {featRows.map((value, i) => (
            <div key={i} className="background-feat-option">
              <input
                list="background-feats"
                value={value}
                aria-label={`Feat option ${i + 1}`}
                onChange={(e) => changeFeatRows(featRows.map((r, j) => (j === i ? e.target.value : r)))}
                placeholder="e.g. Magic Initiate (Wizard)"
              />
              {featRows.length > 1 && (
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove feat option ${i + 1}`}
                  onClick={() => changeFeatRows(featRows.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <div className="dm-form-actions">
            <button type="button" className="secondary" onClick={() => changeFeatRows([...featRows, ''])}>
              + Add another option
            </button>
            <button type="button" className="secondary" onClick={() => setFeatPickerOpen((o) => !o)}>
              Pick from 5etools
            </button>
          </div>
          {featPickerOpen && <FiveToolsFeatPicker onPick={pickFeat} onClose={() => setFeatPickerOpen(false)} />}
          {pickedInUse.map(({ feat, add }) =>
            exists(feat) ? (
              <p key={feat.name} className="npc-hint">
                {feat.name} is already in Feats - the background will link to it.
              </p>
            ) : (
              <label key={feat.name} className="tag-checklist-item">
                <input
                  type="checkbox"
                  checked={add}
                  onChange={(e) =>
                    setPickedFeats((list) => list.map((p) => (p.feat.name === feat.name ? { ...p, add: e.target.checked } : p)))
                  }
                />
                Also add {feat.name} to Feats on save, so this background links to it and Foundry can grant it
              </label>
            )
          )}
        </fieldset>

        <OptionPicker
          label="Skill Proficiencies"
          options={SKILL_OPTIONS}
          selected={form.skill_proficiencies}
          onChange={(skill_proficiencies) => set({ skill_proficiencies })}
          addPlaceholder="Add skill…"
          customPlaceholder="Other (e.g. One of: Arcana, Nature)…"
        />
        <OptionPicker
          label="Tool Proficiencies"
          options={TOOL_PROFICIENCY_OPTIONS}
          selected={form.tool_proficiencies}
          onChange={(tool_proficiencies) => set({ tool_proficiencies })}
          addPlaceholder="Add tool…"
          customPlaceholder="Other tool…"
        />
        <OptionPicker
          label="Languages"
          options={LANGUAGE_OPTIONS}
          selected={form.languages}
          onChange={(languages) => set({ languages })}
          addPlaceholder="Add language…"
          customPlaceholder="Other language…"
        />

        <label>
          Equipment
          <textarea
            value={form.equipment}
            onChange={(e) => set({ equipment: e.target.value })}
            rows={3}
            placeholder="e.g. Choose A or B: (A) Quarterstaff, Book, Robe, 8 GP; or (B) 50 GP"
          />
        </label>

        <h2>Features</h2>
        <RepeatableRows
          rows={form.features}
          onChange={(features) => set({ features })}
          withSubFeatures
          addLabel="+ Add Feature"
        />

        {error && <p className="status-message error">{error}</p>}
        <div className="dm-form-actions">
          <button type="submit" disabled={saving}>
            {saving ? 'Saving...' : isNew ? 'Create Background' : 'Save changes'}
          </button>
          <button type="button" className="secondary" onClick={() => navigate('/dm/homebrew?tab=backgrounds')}>
            Cancel
          </button>
        </div>
      </form>
    </section>
  )
}
