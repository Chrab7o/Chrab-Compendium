import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

export default function PlayerNotesViewer({ campaigns }) {
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('player_notes')
      .select('*, profiles(display_name)')
      .order('updated_at', { ascending: false })
      .then(({ data }) => {
        setNotes(data ?? [])
        setLoading(false)
      })
  }, [])

  return (
    <div className="dm-panel">
      <h2>Player Notes</h2>
      <p className="view-subtitle">Read-only — these belong to your players.</p>
      {loading && <p className="status-message">Loading...</p>}
      {!loading && notes.length === 0 && <p className="status-message">No player notes yet.</p>}
      <ul className="dm-list">
        {notes.map((note) => (
          <li key={note.id} style={{ alignItems: 'flex-start', flexDirection: 'column' }}>
            <div style={{ display: 'flex', gap: '0.75rem', width: '100%' }}>
              <span>{note.title}</span>
              <span className="dm-list-meta">
                {note.profiles?.display_name ?? 'Unknown player'} ·{' '}
                {campaigns.find((c) => c.id === note.campaign_id)?.name ?? 'General'}
              </span>
            </div>
            {note.content && <p className="status-message">{note.content}</p>}
          </li>
        ))}
      </ul>
    </div>
  )
}
