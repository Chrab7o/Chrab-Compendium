import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../../lib/supabaseClient'
import {
  ABILITY_LABELS,
  ABILITY_SCORES,
  FEAT_CATEGORIES,
  FEAT_FIELDS,
  emptyFeatForm,
  featFormToExportJson,
  featFormToFiveToolsJson,
  featJsonToFormState,
  featToFormState,
  fiveToolsEntryList,
  fiveToolsFeatToForm,
} from '../../../lib/homebrew'
import { downloadJson, saveParentWithChildren, slugify } from '../../../lib/homebrewSave'
import RepeatableRows from '../RepeatableRows'
import FiveToolsEntryPicker from './FiveToolsEntryPicker'
import VisibilitySelect from './VisibilitySelect'

// Single-page editor, same layout as RaceEditor: the fixed stat line up top
// (category, prerequisite, ability increase), then a free list of benefits
// - the named sections a 5etools feat's entries break into.
export default function FeatEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isNew = !id

  const [form, setForm] = useState(emptyFeatForm)
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [fiveToolsPool, setFiveToolsPool] = useState([])

  useEffect(() => {
    if (isNew) return
    let cancelled = false
    setLoading(true)
    Promise.all([
      supabase.from('homebrew_feats').select('*').eq('id', id).single(),
      supabase.from('homebrew_feat_benefits').select('*').eq('feat_id', id),
    ]).then(([{ data: featRow, error: fetchError }, { data: benefits }]) => {
      if (cancelled) return
      if (fetchError) setError(fetchError.message)
      else setForm(featToFormState(featRow, benefits ?? []))
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [id, isNew])

  function set(patch) {
    setForm((f) => ({ ...f, ...patch }))
  }

  function setBonus(ability, value) {
    const next = { ...form.ability_bonuses }
    const n = Number(value)
    if (value === '' || !n) delete next[ability]
    else next[ability] = n
    set({ ability_bonuses: next })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const payload = { ...Object.fromEntries(FEAT_FIELDS.map((k) => [k, form[k]])), visibility: form.visibility }
    payload.slug = form.slug || slugify(form.name)

    const result = await saveParentWithChildren({
      table: 'homebrew_feats',
      childTable: 'homebrew_feat_benefits',
      foreignKey: 'feat_id',
      id: form.id,
      payload,
      children: form.benefits,
    })
    setSaving(false)
    if (result.id) set({ id: result.id })
    if (result.error) {
      setError(result.error)
      return
    }
    navigate('/dm/homebrew?tab=feats')
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
      if (json) setForm(featJsonToFormState(json))
    } catch (err) {
      setError(`Import failed: ${err.message}`)
    }
  }

  async function handleImportFiveTools(e) {
    try {
      const json = await readJsonFile(e)
      if (!json) return
      const entries = fiveToolsEntryList(json, 'feat')
      if (entries.length === 1) setForm(fiveToolsFeatToForm(entries[0]))
      else setFiveToolsPool(entries)
    } catch (err) {
      setError(`Import failed: ${err.message}`)
    }
  }

  const fileBase = form.slug || slugify(form.name) || 'feat'

  if (loading) return <p className="status-message">Loading...</p>

  return (
    <section className="page-wide">
      <div className="view-header">
        <h1>{isNew ? 'New Feat' : `Edit ${form.name}`}</h1>
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
              <button type="button" className="secondary" onClick={() => downloadJson(featFormToExportJson(form), `${fileBase}.feat.json`)}>
                Export JSON
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => downloadJson(featFormToFiveToolsJson(form), `${fileBase}.5etools.json`)}
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
          noun="feat"
          onPick={(entry) => {
            setForm(fiveToolsFeatToForm(entry))
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

        <div className="dm-form-row">
          <label>
            Category
            <input list="feat-categories" value={form.category} onChange={(e) => set({ category: e.target.value })} />
            <datalist id="feat-categories">
              {FEAT_CATEGORIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <label>
            Prerequisite
            <input
              value={form.prerequisite}
              onChange={(e) => set({ prerequisite: e.target.value })}
              placeholder="e.g. Level 4+, Strength 13+"
            />
          </label>
          <fieldset className="tag-checklist">
            <legend>Repeatable</legend>
            <label className="tag-checklist-item">
              <input type="checkbox" checked={form.repeatable} onChange={(e) => set({ repeatable: e.target.checked })} />
              Can be taken more than once
            </label>
          </fieldset>
        </div>

        <fieldset className="tag-checklist">
          <legend>Ability Score Increase</legend>
          <div className="dm-form-row homebrew-ability-grid">
            {ABILITY_SCORES.map((a) => (
              <label key={a}>
                {ABILITY_LABELS[a]}
                <input
                  type="number"
                  min="-5"
                  max="5"
                  value={form.ability_bonuses[a] ?? ''}
                  placeholder="0"
                  onChange={(e) => setBonus(a, e.target.value)}
                />
              </label>
            ))}
          </div>
          <label className="homebrew-ability-note">
            Flexible increase (optional)
            <input
              value={form.ability_bonus_note}
              onChange={(e) => set({ ability_bonus_note: e.target.value })}
              placeholder="e.g. +1 to Intelligence, Wisdom, or Charisma"
            />
          </label>
        </fieldset>

        <h2>Benefits</h2>
        <RepeatableRows
          rows={form.benefits}
          onChange={(benefits) => set({ benefits })}
          withSubFeatures
          addLabel="+ Add Benefit"
        />

        {error && <p className="status-message error">{error}</p>}
        <div className="dm-form-actions">
          <button type="submit" disabled={saving}>
            {saving ? 'Saving...' : isNew ? 'Create Feat' : 'Save changes'}
          </button>
          <button type="button" className="secondary" onClick={() => navigate('/dm/homebrew?tab=feats')}>
            Cancel
          </button>
        </div>
      </form>
    </section>
  )
}
