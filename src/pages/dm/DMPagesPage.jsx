import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import './DMPagesPage.css'

// Pages published from the lab with scripts/site-page.mjs (table dm_pages).
// /dm/pages lists them; /dm/pages/:slug shows one.
//
// A page is arbitrary HTML with its own scripts, so it runs in a sandboxed
// iframe without allow-same-origin: it gets an opaque origin and can't read
// the site's cookies, storage or Supabase session, or touch this document.

const formatDate = (iso) => new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })

function PageList() {
  const [pages, setPages] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    supabase
      .from('dm_pages')
      .select('slug,title,description,updated_at')
      .order('updated_at', { ascending: false })
      .then(({ data, error: err }) => (err ? setError(err.message) : setPages(data)))
  }, [])

  return (
    <section className="page">
      <div className="view-header">
        <h1>Pages</h1>
      </div>
      {error && <p className="status-message error">Couldn’t load the pages: {error}</p>}
      {!error && !pages && <p className="status-message">Loading…</p>}
      {pages && !pages.length && (
        <div className="dm-panel">
          <p>No pages yet.</p>
          <p className="status-message">
            Publish one from the lab with <code>node scripts/site-page.mjs publish page.html</code>.
          </p>
        </div>
      )}
      {pages?.length > 0 && (
        <ul className="dm-list dmp-list">
          {pages.map((p) => (
            <li key={p.slug}>
              <Link to={`/dm/pages/${p.slug}`} className="dmp-card">
                <strong>{p.title}</strong>
                {p.description && <span>{p.description}</span>}
                <span className="dm-list-meta">Updated {formatDate(p.updated_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function PageView({ slug }) {
  const [page, setPage] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    setPage(null)
    setError(null)
    supabase
      .from('dm_pages')
      .select('title,html,updated_at')
      .eq('slug', slug)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (err) setError(err.message)
        else if (!data) setError('There’s no page at this address.')
        else setPage(data)
      })
  }, [slug])

  return (
    <section className="page dmp-view">
      <div className="view-header dmp-header">
        <h1>{page?.title ?? 'Page'}</h1>
        <Link to="/dm/pages" className="button-link secondary">All pages</Link>
      </div>
      {error && <p className="status-message error">{error}</p>}
      {!error && !page && <p className="status-message">Loading…</p>}
      {page && (
        <iframe
          key={page.updated_at}
          className="dmp-frame"
          title={page.title}
          srcDoc={page.html}
          sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms"
          allow="clipboard-write"
        />
      )}
    </section>
  )
}

export default function DMPagesPage() {
  const { slug } = useParams()
  return slug ? <PageView slug={slug} /> : <PageList />
}
