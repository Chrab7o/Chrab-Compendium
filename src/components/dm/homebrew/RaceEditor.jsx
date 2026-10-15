import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../../lib/supabaseClient'
import {
  ABILITY_LABELS,
  ABILITY_SCORES,
  CREATURE_TYPES,
  LANGUAGE_OPTIONS,
  RACE_SIZES,
  RACE_SPEEDS,
  emptyRaceForm,
  raceToFormState,
} from '../../../lib/homebrew'
import OptionPicker from '../OptionPicker'
import RepeatableRows from '../RepeatableRows'
import VisibilitySelect from './VisibilitySelect'

function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

// Blank number inputs mean "doesn't have this" (no fly speed, no
// darkvision), so they round-trip as null rather than 0.
function toOptionalNumber(value) {
  return value === '' ? null : Math.max(0, Number(value) || 0)
}

// Single-page editor, like StandaloneSubclassEditor: the fixed stat-line
// fields up top, then a free list of traits (with optional sub-features for
// "choose one" traits such as a subrace or ancestry pick).
export default function RaceEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isNew = !id

  const [form, setForm] = useState(emptyRaceForm)
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (isNew) return
    let cancelled = false
    setLoading(true)
    Promise.all([
      supabase.from('homebrew_races').select('*').eq('id', id).single(),
      supabase.from('homebrew_race_traits').select('*').eq('race_id', id),
    ]).then(([{ data: raceRow, error: fetchError }, { data: traits }]) => {
      if (cancelled) return
      if (fetchError) {
        setError(fetchError.message)
        setLoading(false)
        return
      }
      setForm(raceToFormState(raceRow, traits ?? []))
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [id, isNew])

  function set(patch) {
    setForm((f) => ({ ...f, ...patch }))
  }

  function toggleSize(size) {
    set({ sizes: form.sizes.includes(size) ? form.sizes.filter((s) => s !== size) : [...form.sizes, size] })
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
    if (form.sizes.length === 0) {
      setError('Pick at least one size.')
      return
    }
    setSaving(true)
    setError(null)

    const payload = {
      name: form.name,
      slug: form.slug || slugify(form.name),
      description: form.description,
      creature_type: form.creature_type,
      sizes: RACE_SIZES.filter((s) => form.sizes.includes(s)),
      speed_walk: form.speed_walk,
      speed_fly: form.speed_fly,
      speed_swim: form.speed_swim,
      speed_climb: form.speed_climb,
      speed_burrow: form.speed_burrow,
      darkvision: form.darkvision,
      ability_bonuses: form.ability_bonuses,
      ability_bonus_note: form.ability_bonus_note,
      languages: form.languages,
      visibility: form.visibility,
    }

    let raceId = form.id
    if (form.id) {
      const { error: saveError } = await supabase.from('homebrew_races').update(payload).eq('id', form.id)
      if (saveError) {
        setSaving(false)
        setError(saveError.message)
        return
      }
    } else {
      const { data, error: saveError } = await supabase.from('homebrew_races').insert(payload).select().single()
      if (saveError) {
        setSaving(false)
        setError(saveError.message)
        return
      }
      raceId = data.id
      setForm((f) => ({ ...f, id: data.id }))
    }

    await supabase.from('homebrew_race_traits').delete().eq('race_id', raceId)
    const traitRows = form.traits.filter((t) => t.name.trim() !== '')
    if (traitRows.length > 0) {
      const { error: traitError } = await supabase.from('homebrew_race_traits').insert(
        traitRows.map((t, i) => ({
          race_id: raceId,
          name: t.name,
          description: t.description,
          sort_order: i,
          choice_group: t.choice_group ?? '',
          choice_count: t.choice_group ? t.choice_count ?? null : null,
        }))
      )
      if (traitError) {
        setSaving(false)
        setError(traitError.message)
        return
      }
    }

    setSaving(false)
    navigate('/dm/homebrew?tab=races')
  }

  if (loading) return <p className="status-message">Loading...</p>

  return (
    <section className="page-wide">
      <div className="view-header">
        <h1>{isNew ? 'New Race' : `Edit ${form.name}`}</h1>
      </div>

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
          <textarea value={form.description} onChange={(e) => set({ description: e.target.value })} rows={5} />
        </label>

        <div className="dm-form-row">
          <label>
            Creature Type
            <input
              list="race-creature-types"
              value={form.creature_type}
              onChange={(e) => set({ creature_type: e.target.value })}
            />
            <datalist id="race-creature-types">
              {CREATURE_TYPES.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </label>
          <fieldset className="tag-checklist">
            <legend>Size</legend>
            {RACE_SIZES.map((size) => (
              <label key={size} className="tag-checklist-item">
                <input type="checkbox" checked={form.sizes.includes(size)} onChange={() => toggleSize(size)} />
                {size}
              </label>
            ))}
          </fieldset>
        </div>

        <div className="dm-form-row">
          <label>
            Walking Speed (ft.)
            <input
              type="number"
              min="0"
              step="5"
              value={form.speed_walk}
              onChange={(e) => set({ speed_walk: Math.max(0, Number(e.target.value) || 0) })}
            />
          </label>
          {RACE_SPEEDS.map(({ key, label }) => (
            <label key={key}>
              {label} Speed (ft.)
              <input
                type="number"
                min="0"
                step="5"
                value={form[key] ?? ''}
                placeholder="none"
                onChange={(e) => set({ [key]: toOptionalNumber(e.target.value) })}
              />
            </label>
          ))}
          <label>
            Darkvision (ft.)
            <input
              type="number"
              min="0"
              step="5"
              value={form.darkvision ?? ''}
              placeholder="none"
              onChange={(e) => set({ darkvision: toOptionalNumber(e.target.value) })}
            />
          </label>
        </div>

        <fieldset className="tag-checklist">
          <legend>Ability Score Increases</legend>
          <div className="dm-form-row race-ability-grid">
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
          <label className="race-ability-note">
            Flexible increases (optional)
            <input
              value={form.ability_bonus_note}
              onChange={(e) => set({ ability_bonus_note: e.target.value })}
              placeholder="e.g. +1 to two other scores of your choice"
            />
          </label>
        </fieldset>

        <OptionPicker
          label="Languages"
          options={LANGUAGE_OPTIONS}
          selected={form.languages}
          onChange={(languages) => set({ languages })}
          addPlaceholder="Add language…"
          customPlaceholder="Other language…"
        />

        <h2>Traits</h2>
        <RepeatableRows
          rows={form.traits}
          onChange={(traits) => set({ traits })}
          withSubFeatures
          addLabel="+ Add Trait"
        />

        {error && <p className="status-message error">{error}</p>}
        <div className="dm-form-actions">
          <button type="submit" disabled={saving}>
            {saving ? 'Saving...' : isNew ? 'Create Race' : 'Save changes'}
          </button>
          <button type="button" className="secondary" onClick={() => navigate('/dm/homebrew?tab=races')}>
            Cancel
          </button>
        </div>
      </form>
    </section>
  )
}
