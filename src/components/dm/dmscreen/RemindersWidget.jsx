import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'

// One freeform note per character, changes rarely - not session-scoped, not
// reset between sessions. Debounced straight to Supabase on each edit; no
// existing hook fits this (useDraftAutosave is localStorage-only, built for
// draft recovery, with no Supabase-writing code path), so this is a small
// ad-hoc per-character debounce.
export default function RemindersWidget({ campaignId }) {
  const [characters, setCharacters] = useState([])
  const [notes, setNotes] = useState({})
  const [loading, setLoading] = useState(true)
  const timers = useRef({})

  useEffect(() => {
    if (!campaignId) return
    setLoading(true)
    supabase
      .from('characters')
      .select('id, name, dm_note')
      .eq('campaign_id', campaignId)
      .order('name')
      .then(({ data }) => {
        setCharacters(data ?? [])
        setNotes(Object.fromEntries((data ?? []).map((c) => [c.id, c.dm_note ?? ''])))
        setLoading(false)
      })
  }, [campaignId])

  function handleChange(characterId, value) {
    setNotes((n) => ({ ...n, [characterId]: value }))
    clearTimeout(timers.current[characterId])
    timers.current[characterId] = setTimeout(() => {
      supabase.from('characters').update({ dm_note: value }).eq('id', characterId)
    }, 600)
  }

  if (loading) return <p className="status-message">Loading...</p>
  if (characters.length === 0) return <p className="status-message">No characters in this campaign yet.</p>

  return (
    <div className="dm-screen-widget-body dm-screen-reminders">
      {characters.map((c) => (
        <div key={c.id} className="dm-screen-reminder-row">
          <label>
            {c.name}
            <textarea
              value={notes[c.id] ?? ''}
              onChange={(e) => handleChange(c.id, e.target.value)}
              rows={2}
              placeholder="Quick notes for this character..."
            />
          </label>
        </div>
      ))}
    </div>
  )
}
