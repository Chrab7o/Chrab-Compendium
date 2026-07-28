import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../../lib/supabaseClient'
import { emptyStandaloneSubclassForm, standaloneSubclassToFormState } from '../../../lib/homebrew'
import RepeatableRows from '../RepeatableRows'

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

  useEffect(() => {
    if (isNew) return
    let cancelled = false
    setLoading(true)
    Promise.all([
      supabase.from('homebrew_subclasses').select('*').eq('id', id).single(),
      supabase.from('homebrew_subclass_features').select('*').eq('subclass_id', id),
    ]).then(([{ data: subclassRow, error: fetchError }, { data: features }]) => {
      if (cancelled) return
      if (fetchError) {
        setError(fetchError.message)
        setLoading(false)
        return
      }
      setForm(standaloneSubclassToFormState(subclassRow, features ?? []))
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

    const payload = {
      name: form.name,
      slug: form.slug || slugify(form.name),
      parent_class_name: form.parent_class_name,
      description: form.description,
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
    const featureRows = form.features.filter((f) => f.name.trim() !== '')
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
        }))
      )
      if (featureError) {
        setSaving(false)
        setError(featureError.message)
        return
      }
    }

    setSaving(false)
    navigate('/dm/homebrew')
  }

  if (loading) return <p className="status-message">Loading...</p>

  return (
    <section className="page-wide">
      <div className="view-header">
        <h1>{isNew ? 'New Subclass' : `Edit ${form.name}`}</h1>
      </div>

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
              placeholder="e.g. Monk"
              required
            />
          </label>
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
          withChoiceGroup
          addLabel="+ Add Feature"
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
