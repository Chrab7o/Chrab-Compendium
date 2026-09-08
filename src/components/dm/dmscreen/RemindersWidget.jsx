import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import CharacterPicker from './CharacterPicker'

// A DM-picked list of characters/NPCs, each with a freeform note that
// changes rarely - not auto-populated from a campaign anymore, the DM adds
// exactly who they want to track. Subject membership lives in the widget's
// own config ({ subjects: [{type, id}] }); the note text itself lives in
// the shared dm_reminder_notes table (keyed by subject_type+subject_id) so
// it's tied to the person, not to this one widget instance, and removing
// someone from this widget doesn't discard what was written about them.
export default function RemindersWidget({ config, onConfigChange }) {
  const subjects = config?.subjects ?? []
  const [names, setNames] = useState({})
  const [notes, setNotes] = useState({})
  const [loading, setLoading] = useState(true)
  const [picking, setPicking] = useState(false)
  const timers = useRef({})

  useEffect(() => {
    if (subjects.length === 0) {
      setNames({})
      setNotes({})
      setLoading(false)
      return
    }
    setLoading(true)
    const characterIds = subjects.filter((s) => s.type === 'character').map((s) => s.id)
    const entryIds = subjects.filter((s) => s.type === 'entry').map((s) => s.id)
    Promise.all([
      characterIds.length ? supabase.from('characters').select('id, name').in('id', characterIds) : Promise.resolve({ data: [] }),
      entryIds.length ? supabase.from('entries').select('id, title').in('id', entryIds) : Promise.resolve({ data: [] }),
      supabase.from('dm_reminder_notes').select('subject_type, subject_id, note').in(
        'subject_id',
        subjects.map((s) => s.id)
      ),
    ]).then(([{ data: chars }, { data: entries }, { data: noteRows }]) => {
      const nameMap = {}
      ;(chars ?? []).forEach((c) => (nameMap[`character:${c.id}`] = c.name))
      ;(entries ?? []).forEach((e) => (nameMap[`entry:${e.id}`] = e.title))
      setNames(nameMap)
      const noteMap = {}
      ;(noteRows ?? []).forEach((n) => (noteMap[`${n.subject_type}:${n.subject_id}`] = n.note))
      setNotes(noteMap)
      setLoading(false)
    })
  }, [JSON.stringify(subjects)])

  function handleAddSubject(picked) {
    onConfigChange({ subjects: [...subjects, { type: picked.type, id: picked.id }] })
    setPicking(false)
  }

  function handleRemoveSubject(type, id) {
    onConfigChange({ subjects: subjects.filter((s) => !(s.type === type && s.id === id)) })
  }

  function commitNote(type, id, value) {
    delete timers.current[`${type}:${id}`]
    supabase.from('dm_reminder_notes').upsert(
      { subject_type: type, subject_id: id, note: value },
      { onConflict: 'subject_type,subject_id' }
    )
  }

  function handleNoteChange(type, id, value) {
    const key = `${type}:${id}`
    setNotes((n) => ({ ...n, [key]: value }))
    clearTimeout(timers.current[key]?.timeoutId)
    timers.current[key] = { value, timeoutId: setTimeout(() => commitNote(type, id, value), 600) }
  }

  // Commit early on blur (don't make the DM wait out the debounce just by
  // clicking away) and flush any still-pending debounced writes on unmount
  // - without this, typing a note and then quickly reloading/navigating
  // away (the most natural way to check "did that save?") loses the edit
  // entirely, since the 600ms timer never gets the chance to fire.
  function handleNoteBlur(type, id) {
    const key = `${type}:${id}`
    const pending = timers.current[key]
    if (!pending) return
    clearTimeout(pending.timeoutId)
    commitNote(type, id, pending.value)
  }

  useEffect(() => {
    return () => {
      Object.entries(timers.current).forEach(([key, pending]) => {
        clearTimeout(pending.timeoutId)
        const [type, id] = key.split(':')
        supabase.from('dm_reminder_notes').upsert(
          { subject_type: type, subject_id: id, note: pending.value },
          { onConflict: 'subject_type,subject_id' }
        )
      })
    }
  }, [])

  return (
    <div className="dm-screen-widget-body dm-screen-reminders">
      {loading ? (
        <p className="status-message">Loading...</p>
      ) : subjects.length === 0 ? (
        <p className="status-message">No one added yet.</p>
      ) : (
        subjects.map((s) => {
          const key = `${s.type}:${s.id}`
          return (
            <div key={key} className="dm-screen-reminder-row">
              <div className="dm-screen-reminder-header">
                <strong>{names[key] ?? '...'}</strong>
                <button
                  type="button"
                  className="icon-button"
                  title="Remove"
                  aria-label={`Remove ${names[key] ?? 'this entry'}`}
                  onClick={() => handleRemoveSubject(s.type, s.id)}
                >
                  ✕
                </button>
              </div>
              <textarea
                value={notes[key] ?? ''}
                onChange={(e) => handleNoteChange(s.type, s.id, e.target.value)}
                onBlur={() => handleNoteBlur(s.type, s.id)}
                rows={2}
                placeholder="Quick notes..."
              />
            </div>
          )
        })
      )}

      {picking ? (
        <CharacterPicker excludeSubjects={subjects} onSelect={handleAddSubject} onCancel={() => setPicking(false)} />
      ) : (
        <div className="dm-form-actions">
          <button type="button" className="secondary" onClick={() => setPicking(true)}>
            + Add character or NPC
          </button>
        </div>
      )}
    </div>
  )
}
