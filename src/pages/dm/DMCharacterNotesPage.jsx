import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'

const EMPTY = { bio: '', arc: '', notes: '', reminder: '' }

// Long-form DM notes about one player character at a time: who they are,
// where you mean to take them, and the short line that shows up on the DM
// screen during play.
//
// The first three live in dm_character_notes; `reminder` is the existing
// dm_reminder_notes row for this character - the same text the DM screen's
// Reminders widget shows. It's edited here too so there's one place to
// write about a character, rather than one field stranded in a widget.
export default function DMCharacterNotesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedId = searchParams.get('character') ?? ''
  const [characters, setCharacters] = useState([])
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [loadingNotes, setLoadingNotes] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)
  const [error, setError] = useState(null)

  // What's currently in the database for the selected character, so Save can
  // skip a no-op write and switching characters knows whether anything is
  // pending. Held in a ref because the unmount/switch save path reads it
  // outside of a render.
  const savedDraft = useRef(EMPTY)
  const draftRef = useRef(EMPTY)
  const selectedRef = useRef('')
  draftRef.current = draft
  selectedRef.current = selectedId

  useEffect(() => {
    supabase
      .from('characters')
      .select('id, name')
      .order('name')
      .then(({ data, error: loadError }) => {
        if (loadError) setError(loadError.message)
        setCharacters(data ?? [])
        setLoading(false)
      })
  }, [])

  const writeNotes = useCallback(async (characterId, value) => {
    const [{ error: notesError }, { error: reminderError }] = await Promise.all([
      supabase
        .from('dm_character_notes')
        .upsert(
          { character_id: characterId, bio: value.bio, arc: value.arc, notes: value.notes },
          { onConflict: 'character_id' }
        ),
      supabase
        .from('dm_reminder_notes')
        .upsert(
          { subject_type: 'character', subject_id: characterId, note: value.reminder },
          { onConflict: 'subject_type,subject_id' }
        ),
    ])
    return notesError ?? reminderError ?? null
  }, [])

  const isDirty = (a, b) => a.bio !== b.bio || a.arc !== b.arc || a.notes !== b.notes || a.reminder !== b.reminder

  // Load whichever character the URL names. Anything unsaved for the
  // previous one is written first - switching characters mid-sentence
  // shouldn't be a way to lose a paragraph.
  useEffect(() => {
    let cancelled = false
    const previousId = selectedRef.current
    const pending = draftRef.current
    if (!selectedId) {
      setDraft(EMPTY)
      savedDraft.current = EMPTY
      return
    }
    setLoadingNotes(true)
    ;(async () => {
      if (previousId && previousId !== selectedId && isDirty(pending, savedDraft.current)) {
        await writeNotes(previousId, pending)
      }
      const [{ data: notesRow, error: notesError }, { data: reminderRow }] = await Promise.all([
        supabase.from('dm_character_notes').select('*').eq('character_id', selectedId).maybeSingle(),
        supabase
          .from('dm_reminder_notes')
          .select('note')
          .eq('subject_type', 'character')
          .eq('subject_id', selectedId)
          .maybeSingle(),
      ])
      if (cancelled) return
      if (notesError) setError(notesError.message)
      const loaded = {
        bio: notesRow?.bio ?? '',
        arc: notesRow?.arc ?? '',
        notes: notesRow?.notes ?? '',
        reminder: reminderRow?.note ?? '',
      }
      savedDraft.current = loaded
      setDraft(loaded)
      setSavedAt(null)
      setLoadingNotes(false)
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  // Leaving the page entirely (navigating away, closing the tab is the
  // browser's business) commits whatever is pending, same as switching.
  useEffect(() => {
    return () => {
      const id = selectedRef.current
      if (id && isDirty(draftRef.current, savedDraft.current)) writeNotes(id, draftRef.current)
    }
  }, [writeNotes])

  async function save() {
    if (!selectedId || !isDirty(draft, savedDraft.current)) return
    setSaving(true)
    setError(null)
    const writeError = await writeNotes(selectedId, draft)
    setSaving(false)
    if (writeError) {
      setError(writeError.message)
      return
    }
    savedDraft.current = draft
    setSavedAt(new Date())
  }

  const selected = characters.find((c) => c.id === selectedId)
  const shown = characters.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()))
  const dirty = isDirty(draft, savedDraft.current)

  if (loading) return <p className="status-message">Loading...</p>

  return (
    <section className="page-wide">
      <div className="view-header">
        <h1>Character Notes</h1>
        <p className="view-subtitle">
          Your own notes on each player character — who they are, where you mean to take them, and anything worth
          remembering. Players never see any of this.
        </p>
      </div>

      {error && <p className="status-message error">{error}</p>}

      <div className="dmcn-layout">
        <aside className="dm-panel dmcn-people">
          <div className="dm-panel-header">
            <h2>Characters</h2>
            <span className="badge">{characters.length}</span>
          </div>
          <input
            className="dmcn-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter characters..."
          />
          <ul className="dm-list dmcn-list">
            {shown.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={`dmcn-person${c.id === selectedId ? ' is-active' : ''}`}
                  onClick={() => setSearchParams(c.id === selectedId ? {} : { character: c.id })}
                >
                  {c.name}
                </button>
              </li>
            ))}
            {shown.length === 0 && <li className="status-message">No character matches that.</li>}
          </ul>
        </aside>

        <section className="dm-panel dmcn-editor">
          {!selected && <p className="status-message">Pick a character to start writing.</p>}
          {selected && (
            <>
              <div className="dm-panel-header">
                <h2>{selected.name}</h2>
                <div className="dm-form-actions">
                  <span className="dm-list-meta">
                    {saving ? 'Saving...' : dirty ? 'Unsaved changes' : savedAt ? `Saved ${savedAt.toLocaleTimeString()}` : 'Up to date'}
                  </span>
                  <button type="button" onClick={save} disabled={saving || !dirty}>
                    Save
                  </button>
                </div>
              </div>
              {loadingNotes ? (
                <p className="status-message">Loading notes...</p>
              ) : (
                <div className="dm-form">
                  <label>
                    Bio
                    <textarea
                      rows={8}
                      value={draft.bio}
                      onChange={(e) => setDraft({ ...draft, bio: e.target.value })}
                      onBlur={save}
                      placeholder="Background, family, what they were doing before the campaign, how they talk."
                    />
                  </label>
                  <label>
                    Character arc plans
                    <textarea
                      rows={8}
                      value={draft.arc}
                      onChange={(e) => setDraft({ ...draft, arc: e.target.value })}
                      onBlur={save}
                      placeholder="Where you want them to end up, the beats to get there, what would test them."
                    />
                  </label>
                  <label>
                    Notes
                    <textarea
                      rows={6}
                      value={draft.notes}
                      onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                      onBlur={save}
                      placeholder="Anything else — promises made, debts owed, things they've figured out."
                    />
                  </label>
                  <label>
                    Table reminder
                    <textarea
                      rows={3}
                      value={draft.reminder}
                      onChange={(e) => setDraft({ ...draft, reminder: e.target.value })}
                      onBlur={save}
                      placeholder="The one line to have in front of you while running — shows on the DM screen."
                    />
                    <span className="dmcn-hint">
                      This is the same note the DM screen's Reminders widget shows for this character.
                    </span>
                  </label>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </section>
  )
}
