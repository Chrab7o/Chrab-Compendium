import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { useCampaignContext } from '../contexts/CampaignContext'
import { useImpersonation } from '../contexts/ImpersonationContext'

const emptyForm = { id: null, title: '', content: '', campaign_id: '' }

// The Character hub's "My Notes" tab — private, player-authored scratch
// notes. Was its own routed page; the CRUD logic is unchanged, just no
// longer wrapped in its own <section className="page"> since it's embedded.
export default function NotesPanel() {
  const { session } = useAuth()
  const { campaigns } = useCampaignContext()
  const { impersonating } = useImpersonation()
  const ownerId = impersonating?.ownerId ?? session.user.id
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('player_notes')
      .select('*')
      .eq('owner_id', ownerId)
      .order('updated_at', { ascending: false })
    setNotes(data ?? [])
    setLoading(false)
  }, [ownerId])

  useEffect(() => {
    load()
  }, [load])

  function startEdit(note) {
    setForm({ ...note, campaign_id: note.campaign_id ?? '' })
    setError(null)
  }

  function resetForm() {
    setForm(emptyForm)
    setError(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const payload = {
      owner_id: ownerId,
      title: form.title,
      content: form.content,
      campaign_id: form.campaign_id || null,
    }

    const { error: saveError } = form.id
      ? await supabase.from('player_notes').update(payload).eq('id', form.id)
      : await supabase.from('player_notes').insert(payload)

    setSaving(false)
    if (saveError) {
      setError(saveError.message)
      return
    }
    resetForm()
    load()
  }

  async function handleDelete(id) {
    if (!confirm('Delete this note?')) return
    const { error: deleteError } = await supabase.from('player_notes').delete().eq('id', id)
    if (deleteError) setError(deleteError.message)
    else load()
  }

  return (
    <div>
      <p className="view-subtitle">
        {impersonating
          ? `Viewing ${impersonating.name}'s private notes.`
          : 'Private to you — visible to your DM, but not to other players or the public.'}
      </p>

      <div className="dm-panel">
        <form onSubmit={handleSubmit} className="dm-form">
          <label>
            Title
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
          </label>
          <label>
            Notes
            <textarea
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              rows={6}
            />
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
          {error && <p className="status-message error">{error}</p>}
          <div className="dm-form-actions">
            <button type="submit" disabled={saving}>
              {form.id ? 'Save changes' : 'Add note'}
            </button>
            {form.id && (
              <button type="button" className="secondary" onClick={resetForm}>
                Cancel
              </button>
            )}
          </div>
        </form>

        {loading && <p className="status-message">Loading...</p>}
        {!loading && notes.length === 0 && <p className="status-message">No notes yet.</p>}

        <ul className="dm-list">
          {notes.map((note) => (
            <li key={note.id}>
              <span>{note.title}</span>
              <span className="dm-list-meta">
                {campaigns.find((c) => c.id === note.campaign_id)?.name ?? 'General'}
              </span>
              <div className="dm-list-actions">
                <button type="button" onClick={() => startEdit(note)}>
                  Edit
                </button>
                <button type="button" className="danger" onClick={() => handleDelete(note.id)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
