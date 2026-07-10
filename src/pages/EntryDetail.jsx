import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { categoryLabel } from '../lib/categories'

export default function EntryDetail() {
  const { id } = useParams()
  const { isDM } = useAuth()
  const [entry, setEntry] = useState(null)
  const [dmNotes, setDmNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('entries')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data, error: fetchError }) => {
        if (cancelled) return
        if (fetchError) setError(fetchError.message)
        else setEntry(data)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => {
    if (!isDM) {
      setDmNotes([])
      return
    }
    let cancelled = false
    supabase
      .from('entries')
      .select('*')
      .eq('parent_entry_id', id)
      .then(({ data }) => {
        if (!cancelled) setDmNotes(data ?? [])
      })
    return () => {
      cancelled = true
    }
  }, [id, isDM])

  if (loading) return <p className="status-message">Loading...</p>
  if (error || !entry)
    return <p className="status-message error">Couldn't find that entry.</p>

  return (
    <article className="page entry-detail">
      <Link to="/" className="back-link">
        &larr; Back
      </Link>
      <div className="entry-detail-header">
        <h1>{entry.title}</h1>
        {entry.visibility === 'dm' && <span className="badge badge-dm">DM only</span>}
      </div>
      <span className="entry-card-category">{categoryLabel(entry.category)}</span>
      {entry.tags?.length > 0 && (
        <div className="entry-card-tags">
          {entry.tags.map((tag) => (
            <span key={tag} className="tag">
              {tag}
            </span>
          ))}
        </div>
      )}
      <div className="entry-content">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.content}</ReactMarkdown>
      </div>

      {isDM && dmNotes.length > 0 && (
        <div className="dm-notes-section">
          <h2>DM Notes</h2>
          {dmNotes.map((note) => (
            <div key={note.id} className="dm-notes-block">
              <h3>{note.title}</h3>
              <div className="entry-content">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{note.content}</ReactMarkdown>
              </div>
            </div>
          ))}
        </div>
      )}
    </article>
  )
}
