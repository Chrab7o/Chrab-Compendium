import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../../lib/supabaseClient'
import {
  ABILITY_LABELS,
  ABILITY_SCORES,
  BACKGROUND_FIELDS,
  LANGUAGE_OPTIONS,
  SKILLS,
  TOOL_PROFICIENCY_OPTIONS,
  backgroundFormToExportJson,
  backgroundFormToFiveToolsJson,
  backgroundJsonToFormState,
  backgroundToFormState,
  emptyBackgroundForm,
  fiveToolsBackgroundToForm,
  fiveToolsEntryList,
} from '../../../lib/homebrew'
import { downloadJson, saveParentWithChildren, slugify } from '../../../lib/homebrewSave'
import OptionPicker from '../OptionPicker'
import RepeatableRows from '../RepeatableRows'
import FiveToolsEntryPicker from './FiveToolsEntryPicker'
import VisibilitySelect from './VisibilitySelect'

const SKILL_OPTIONS = SKILLS.map((s) => s.name)

// Single-page editor, same layout as RaceEditor. Covers both editions: the
// 2024 fields (ability options, origin feat) and the 2014 ones (a named
// "Feature", suggested characteristics tables) - the latter just go in the
// features list, and anything left blank is hidden on the detail page.
export default function BackgroundEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isNew = !id

  const [form, setForm] = useState(emptyBackgroundForm)
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [fiveToolsPool, setFiveToolsPool] = useState([])
  const [featNames, setFeatNames] = useState([])

  useEffect(() => {
    supabase
      .from('homebrew_feats')
      .select('name')
      .order('name', { ascending: true })
      .then(({ data }) => setFeatNames((data ?? []).map((f) => f.name)))
  }, [])

  useEffect(() => {
    if (isNew) return
    let cancelled = false
    setLoading(true)
    Promise.all([
      supabase.from('homebrew_backgrounds').select('*').eq('id', id).single(),
      supabase.from('homebrew_background_features').select('*').eq('background_id', id),
    ]).then(([{ data: backgroundRow, error: fetchError }, { data: features }]) => {
      if (cancelled) return
      if (fetchError) setError(fetchError.message)
      else setForm(backgroundToFormState(backgroundRow, features ?? []))
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [id, isNew])

  function set(patch) {
    setForm((f) => ({ ...f, ...patch }))
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
    setSaving(false)
    if (result.id) set({ id: result.id })
    if (result.error) {
      setError(result.error)
      return
    }
    navigate('/dm/homebrew?tab=backgrounds')
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
        <h1>{isNew ? 'New Background' : `Edit ${form.name}`}</h1>
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

        <label>
          Origin Feat
          <input
            list="background-feats"
            value={form.feat}
            onChange={(e) => set({ feat: e.target.value })}
            placeholder="e.g. Magic Initiate (Wizard)"
          />
          <datalist id="background-feats">
            {featNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </label>

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
