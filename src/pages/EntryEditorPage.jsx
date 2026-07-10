import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useCategories } from '../contexts/CategoryContext'
import { useTags } from '../contexts/TagContext'
import { flattenFolders } from '../lib/folders'
import RichTextEditor from '../components/RichTextEditor'
import PlacementManager from '../components/dm/PlacementManager'

const emptyForm = {
  id: null,
  title: '',
  content: '',
  category: 'lore',
  visibility: 'public',
  campaign_id: '',
  parent_entry_id: '',
  folder_id: '',
  tags: [],
}

function toFormState(entry) {
  return {
    ...entry,
    campaign_id: entry.campaign_id ?? '',
    parent_entry_id: entry.parent_entry_id ?? '',
    folder_id: entry.folder_id ?? '',
    tags: entry.tags ?? [],
  }
}

export default function EntryEditorPage() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { categories } = useCategories()
  const { tags: availableTags } = useTags()
  const isNew = !id

  const [form, setForm] = useState(() => ({
    ...emptyForm,
    category: searchParams.get('category') ?? 'lore',
    folder_id: searchParams.get('folder') ?? '',
  }))
  const [campaigns, setCampaigns] = useState([])
  const [folders, setFolders] = useState([])
  const [otherEntries, setOtherEntries] = useState([])
  const [loading, setLoading] = useState(!isNew)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase
      .from('campaigns')
      .select('*')
      .order('name', { ascending: true })
      .then(({ data }) => setCampaigns(data ?? []))
    supabase
      .from('folders')
      .select('*')
      .then(({ data }) => setFolders(data ?? []))
    supabase
      .from('entries')
      .select('id, title')
      .order('title', { ascending: true })
      .then(({ data }) => setOtherEntries(data ?? []))
  }, [])

  useEffect(() => {
    if (isNew) return
    let cancelled = false
    setLoading(true)
    supabase
      .from('entries')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data, error: fetchError }) => {
        if (cancelled) return
        if (fetchError) setError(fetchError.message)
        else setForm(toFormState(data))
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
      title: form.title,
      content: form.content,
      category: form.category,
      visibility: form.visibility,
      campaign_id: form.campaign_id || null,
      parent_entry_id: form.parent_entry_id || null,
      folder_id: form.folder_id || null,
      tags: form.tags,
    }

    if (isNew) {
      const { data, error: saveError } = await supabase
        .from('entries')
        .insert(payload)
        .select()
        .single()
      setSaving(false)
      if (saveError) {
        setError(saveError.message)
        return
      }
      navigate(`/entry/${data.id}`)
    } else {
      const { error: saveError } = await supabase.from('entries').update(payload).eq('id', id)
      setSaving(false)
      if (saveError) {
        setError(saveError.message)
        return
      }
      navigate(`/entry/${id}`)
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this entry?')) return
    const { error: deleteError } = await supabase.from('entries').delete().eq('id', id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    navigate('/dm')
  }

  if (loading) return <p className="status-message">Loading...</p>

  const linkableEntries = otherEntries.filter((e) => e.id !== id)

  function toggleTag(value) {
    setForm((f) => ({
      ...f,
      tags: f.tags.includes(value) ? f.tags.filter((t) => t !== value) : [...f.tags, value],
    }))
  }

  return (
    <section className="page entry-editor-page">
      <div className="view-header">
        <h1>{isNew ? 'New Entry' : 'Edit Entry'}</h1>
      </div>

      <form onSubmit={handleSubmit} className="dm-form">
        <label>
          Title
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
            autoFocus
          />
        </label>

        <label>
          Content
          <RichTextEditor
            key={id ?? 'new'}
            content={form.content}
            onChange={(markdown) => setForm((f) => ({ ...f, content: markdown }))}
          />
        </label>

        <div className="dm-form-row">
          <label>
            Category
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value, folder_id: '' })}
            >
              {categories.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Folder
            <select
              value={form.folder_id}
              onChange={(e) => setForm({ ...form, folder_id: e.target.value })}
            >
              <option value="">(top level)</option>
              {flattenFolders(folders, form.category).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Visibility
            <select
              value={form.visibility}
              onChange={(e) => setForm({ ...form, visibility: e.target.value })}
            >
              <option value="public">Public</option>
              <option value="dm">DM only</option>
            </select>
          </label>
          <label>
            Campaign
            <select
              value={form.campaign_id}
              onChange={(e) => setForm({ ...form, campaign_id: e.target.value })}
            >
              <option value="">General (no campaign)</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Attach as DM notes on entry (optional)
          <select
            value={form.parent_entry_id}
            onChange={(e) => setForm({ ...form, parent_entry_id: e.target.value })}
          >
            <option value="">Not linked to another entry</option>
            {linkableEntries.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.title}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="tag-checklist">
          <legend>Tags</legend>
          {availableTags.length === 0 && (
            <p className="status-message">
              No tags yet — add some from DM Dashboard → Tags.
            </p>
          )}
          {availableTags.map((t) => (
            <label key={t.value} className="tag-checklist-item">
              <input
                type="checkbox"
                checked={form.tags.includes(t.value)}
                onChange={() => toggleTag(t.value)}
              />
              {t.label}
            </label>
          ))}
        </fieldset>
        {error && <p className="status-message error">{error}</p>}
        <div className="dm-form-actions">
          <button type="submit" disabled={saving}>
            {saving ? 'Saving...' : isNew ? 'Create entry' : 'Save changes'}
          </button>
          <button type="button" className="secondary" onClick={() => navigate(-1)}>
            Cancel
          </button>
          {!isNew && (
            <button type="button" className="danger" onClick={handleDelete}>
              Delete
            </button>
          )}
        </div>
      </form>

      {isNew ? (
        <p className="status-message">Save this entry first to also place it in other folders.</p>
      ) : (
        <PlacementManager entryId={id} folders={folders} />
      )}
    </section>
  )
}
