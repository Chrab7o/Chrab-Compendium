import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { supabase } from '../lib/supabaseClient'
import { categoryLabel } from '../lib/categories'

export default function EntryDetail() {
  const { id } = useParams()
  const [entry, setEntry] = useState(null)
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

  if (loading) return <p className="status-message">Loading...</p>
  if (error || !entry)
    return <p className="status-message error">Couldn't find that entry.</p>

  return (
    <article className="entry-detail">
      <Link to="/general" className="back-link">
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
        <ReactMarkdown>{entry.content}</ReactMarkdown>
      </div>
    </article>
  )
}
