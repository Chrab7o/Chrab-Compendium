import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../../lib/supabaseClient'
import { emptyStandaloneSubclassForm, standaloneSubclassToFormState } from '../../../lib/homebrew'
import RepeatableRows from '../RepeatableRows'
import VisibilitySelect from './VisibilitySelect'
import { useAutomationOptions } from './useAutomationOptions'
import FeatureMechanics from './FeatureMechanics'
import ForgeFeaturePicker from './ForgeFeaturePicker'
import { useForgeSaves } from './useForgeSaves'
import { attachMechanics, loadDraftSpecs, saveRowMechanics } from './mechanics'
import { republishQuietly } from '../../../lib/foundryClassPackPublish'
import { attachStandaloneMechanicsFile } from '../../../lib/classMechanicsFile'

function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

// A subclass for a class this app doesn't track itself (e.g. an official
// Monk monastic tradition) - no wizard needed, it's just a name/parent/
// description + a feature list, the same shape as one subclass inside
// ClassWizard's Step 5 but as its own standalone entity (class_id null,
// parent_class_name free text instead of a link).
export default function StandaloneSubclassEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isNew = !id

  const [form, setForm] = useState(emptyStandaloneSubclassForm)
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const automationOptions = useAutomationOptions()
  // Features are built in the chain builder, in another tab; its saves land here.
  const createInChain = useForgeSaves(form, setForm, form.name)

  useEffect(() => {
    if (isNew) return
    let cancelled = false
    setLoading(true)
    Promise.all([
      supabase.from('homebrew_subclasses').select('*').eq('id', id).single(),
      supabase.from('homebrew_subclass_features').select('*').eq('subclass_id', id),
    ]).then(async ([{ data: subclassRow, error: fetchError }, { data: features }]) => {
      if (cancelled) return
      if (fetchError) {
        setError(fetchError.message)
        setLoading(false)
        return
      }
      const loaded = standaloneSubclassToFormState(subclassRow, features ?? [])
      let specs = new Map()
      try {
        specs = await loadDraftSpecs(loaded.features.map((f) => f.feature_draft_id))
      } catch (err) {
        setError(`Couldn't load feature mechanics: ${err.message}`)
      }
      if (cancelled) return
      setForm({ ...loaded, features: attachMechanics(loaded.features, specs) })
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [id, isNew])

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    // Mechanics first (see ClassWizard): drafts get ids before the rows do.
    let savedFeatures
    try {
      savedFeatures = await saveRowMechanics(form.features, { className: form.parent_class_name.trim(), subclassName: form.name.trim() })
    } catch (err) {
      setSaving(false)
      setError(`Saving feature mechanics failed: ${err.message}`)
      return
    }
    setForm({ ...form, features: savedFeatures })

    const payload = {
      name: form.name,
      slug: form.slug || slugify(form.name),
      parent_class_name: form.parent_class_name,
      description: form.description,
      visibility: form.visibility,
      class_id: null,
    }

    let subclassId = form.id
    if (form.id) {
      const { error: saveError } = await supabase.from('homebrew_subclasses').update(payload).eq('id', form.id)
      if (saveError) {
        setSaving(false)
        setError(saveError.message)
        return
      }
    } else {
      const { data, error: saveError } = await supabase.from('homebrew_subclasses').insert(payload).select().single()
      if (saveError) {
        setSaving(false)
        setError(saveError.message)
        return
      }
      subclassId = data.id
    }

    await supabase.from('homebrew_subclass_features').delete().eq('subclass_id', subclassId)
    const featureRows = savedFeatures.filter((f) => f.name.trim() !== '')
    if (featureRows.length > 0) {
      const { error: featureError } = await supabase.from('homebrew_subclass_features').insert(
        featureRows.map((f, i) => ({
          subclass_id: subclassId,
          level: f.level,
          name: f.name,
          description: f.description,
          sort_order: i,
          choice_group: f.choice_group ?? '',
          choice_count: f.choice_group ? f.choice_count ?? null : null,
          choice_swap: f.choice_group ? !!f.choice_swap : false,
          feature_draft_id: f.feature_draft_id || null,
        }))
      )
      if (featureError) {
        setSaving(false)
        setError(featureError.message)
        return
      }
    }

    const notice = await republishQuietly()
    setSaving(false)
    navigate('/dm/homebrew?tab=subclasses', notice ? { state: { notice } } : undefined)
  }

  // A class mechanics file (lib/classMechanicsFile.js) for this subclass's
  // parent class: fills each matching feature's Foundry mechanics, unsaved,
  // for review before saving (see ClassWizard).
  async function handleLoadMechanics(e) {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    setNotice(null)
    try {
      const result = attachStandaloneMechanicsFile(form, JSON.parse(await file.text()))
      if (result.classMismatch && !confirm(`This file is for "${result.classMismatch}", not "${form.parent_class_name}". Load it anyway?`)) return
      setForm(result.form)
      setNotice(
        `Loaded mechanics for ${result.attached.length} feature${result.attached.length === 1 ? '' : 's'} (marked unsaved - review them, then Save changes).` +
          (result.unmatched.length ? ` No matching feature for: ${result.unmatched.join('; ')}.` : ''),
      )
    } catch (err) {
      setError(`Loading mechanics failed: ${err.message}`)
    }
  }

  if (loading) return <p className="status-message">Loading...</p>

  return (
    <section className="page-wide">
      <div className="view-header">
        <h1>{isNew ? 'New Subclass' : `Edit ${form.name}`}</h1>
        {!isNew && (
          <div className="dm-form-actions">
            <label className="button-link">
              Load mechanics
              <input type="file" accept="application/json" onChange={handleLoadMechanics} style={{ display: 'none' }} />
            </label>
          </div>
        )}
      </div>
      {notice && <p className="status-message">{notice}</p>}

      <form onSubmit={handleSubmit} className="dm-form">
        <div className="dm-form-row">
          <label>
            Name
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus />
          </label>
          <label>
            Parent Class
            <input
              value={form.parent_class_name}
              onChange={(e) => setForm({ ...form, parent_class_name: e.target.value })}
              placeholder="e.g. Monk - the official name, so Foundry attaches it to that class"
              required
            />
          </label>
          <VisibilitySelect value={form.visibility} onChange={(visibility) => setForm({ ...form, visibility })} />
        </div>
        <label>
          Slug (used in the URL, auto-generated if left blank)
          <input
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
            placeholder={slugify(form.name)}
          />
        </label>
        <label>
          Description
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={5}
          />
        </label>

        <RepeatableRows
          rows={form.features}
          onChange={(features) => setForm({ ...form, features })}
          withLevel
          withSubFeatures
          addLabel="+ Add Feature"
          renderRowExtra={(row, patch) => (
            <FeatureMechanics
              row={row}
              onChange={patch}
              linkable={automationOptions.options}
              onRefreshLinks={automationOptions.reload}
              classLabel={form.name}
            />
          )}
          collapsible
          onCreate={createInChain}
          untitled="New feature: name it in the chain builder tab"
          renderAddExtra={(add, parent) => (
            <ForgeFeaturePicker
              label={parent ? '+ Add from the Item Forge…' : '+ Add Feature from the Item Forge…'}
              onPick={add}
              linkedHere={form.features.map((f) => f.feature_draft_id).filter(Boolean)}
            />
          )}
        />

        {error && <p className="status-message error">{error}</p>}
        <div className="dm-form-actions">
          <button type="submit" disabled={saving}>
            {saving ? 'Saving...' : isNew ? 'Create Subclass' : 'Save changes'}
          </button>
          <button type="button" className="secondary" onClick={() => navigate('/dm/homebrew')}>
            Cancel
          </button>
        </div>
      </form>
    </section>
  )
}
