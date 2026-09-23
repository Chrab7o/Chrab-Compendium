import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { tagLabel } from '../lib/tagLabels'
import { useTags } from '../contexts/TagContext'
import { typeTagValue } from '../lib/tags'

export default function EntryDetail() {
  const { id } = useParams()
  const { isDM } = useAuth()
  const { tags: allTags, groups } = useTags()
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

  const isDm = entry.visibility === 'dm'
  const tags = entry.tags ?? []
  const type = typeTagValue(allTags, groups, tags)

  return (
    <article className="page entry-detail">
      <Link to="/" className="back-link">
        &larr; Back
      </Link>
      <div className="entry-detail-header">
        <h1>{entry.title}</h1>
        {isDm && <span className="badge badge-dm">DM only</span>}
        {isDM && (
          <Link to={`/dm/entries/${id}/edit`} className="button-link" style={{ marginLeft: 'auto' }}>
            Edit
          </Link>
        )}
      </div>
      {type && <span className="entry-card-category">{tagLabel(type)}</span>}
      {tags.length > 0 && (
        <div className="entry-card-tags">
          {tags
            .filter((tag) => tag !== type)
            .map((tag) => (
              <span key={tag} className="tag">
                {tagLabel(tag)}
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
