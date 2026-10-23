import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { formatBackgroundMeta, formatFeatMeta, formatRaceSpeed } from '../../lib/homebrew'
import { feedSummary } from '../../lib/homebrewFeed'
import { fetchPublishedFeed, homebrewFeedUrl, publishHomebrewFeed, republishQuietly } from '../../lib/homebrewFeedPublish'

// The Plutonium feed: one public 5etools file with every public class and
// subclass plus linked Feature Forge automation (docs/homebrew-feed.md).
// Saving a class, subclass or linked feature republishes it; this is the
// URL to give Plutonium, what's live now, and a manual republish.
function PlutoniumFeedPanel({ notice }) {
  const url = homebrewFeedUrl()
  const [live, setLive] = useState(undefined) // undefined = loading, null = never published
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(notice ?? null)
  const [copied, setCopied] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const feed = await fetchPublishedFeed()
      setLive(feed ? feedSummary(feed) : null)
    } catch {
      setLive(null)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function handlePublish() {
    setBusy(true)
    setMessage(null)
    try {
      setLive(await publishHomebrewFeed())
    } catch (err) {
      setMessage(`Publish failed: ${err.message}`)
    }
    setBusy(false)
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setMessage('Copy failed - select the URL and copy it by hand.')
    }
  }

  return (
    <div className="dm-panel homebrew-feed">
      <div className="dm-panel-header">
        <h2>Plutonium feed</h2>
        <button type="button" onClick={handlePublish} disabled={busy}>
          {busy ? 'Publishing…' : 'Publish now'}
        </button>
      </div>
      <p className="status-message">
        Every <strong>public</strong> class and subclass as one 5etools file, with the Foundry automation of linked
        Feature Forge features. In Foundry, open Plutonium&apos;s class importer, choose <strong>Custom URL</strong> and
        paste this link; imports and level-ups then always use the current version. It republishes on its own whenever
        you save a class, a subclass or a linked feature.
      </p>
      <div className="homebrew-feed-url">
        <input className="npc-code-input" value={url} readOnly onFocus={(e) => e.target.select()} aria-label="Feed URL" />
        <button type="button" className="secondary" onClick={handleCopy}>
          {copied ? 'Copied' : 'Copy URL'}
        </button>
      </div>
      <p className="dm-list-meta">
        {live === undefined
          ? 'Checking what’s live…'
          : live === null
            ? 'Not published yet.'
            : `Live: ${live.classes} class${live.classes === 1 ? '' : 'es'}, ${live.subclasses} subclass${live.subclasses === 1 ? '' : 'es'}, ${live.automated} automated feature${live.automated === 1 ? '' : 's'}${live.updatedAt ? ` · published ${live.updatedAt.toLocaleString()}` : ''}`}
      </p>
      {message && <p className="status-message error">{message}</p>}
    </div>
  )
}

const TABS = [
  { key: 'classes', label: 'Classes' },
  { key: 'subclasses', label: 'Subclasses' },
  { key: 'races', label: 'Races' },
  { key: 'feats', label: 'Feats' },
  { key: 'backgrounds', label: 'Backgrounds' },
]

function ClassesTab() {
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: loadError } = await supabase.from('homebrew_classes').select('*').order('name', { ascending: true })
    if (loadError) setError(loadError.message)
    else setClasses(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleDelete(cls) {
    if (!confirm(`Delete "${cls.name}"? This also deletes its subclasses and level features.`)) return
    const { error: deleteError } = await supabase.from('homebrew_classes').delete().eq('id', cls.id)
    if (deleteError) return setError(deleteError.message)
    load()
    setError(await republishQuietly())
  }

  if (loading) return <p className="status-message">Loading...</p>

  return (
    <div className="dm-panel">
      <div className="dm-panel-header">
        <h2>Classes</h2>
        <Link to="/dm/homebrew/classes/new" className="button-link">
          + New Class
        </Link>
      </div>
      {error && <p className="status-message error">{error}</p>}
      <ul className="dm-list">
        {classes.map((cls) => (
          <li key={cls.id}>
            <span>{cls.name}</span>
            {cls.visibility === 'dm' && <span className="badge badge-dm">DM only</span>}
            <span className="dm-list-meta">d{cls.hit_die} hit die</span>
            <div className="dm-list-actions">
              <Link to={`/dm/homebrew/classes/${cls.id}/edit`}>Edit</Link>
              <button type="button" className="danger" onClick={() => handleDelete(cls)}>
                Delete
              </button>
            </div>
          </li>
        ))}
        {classes.length === 0 && <li className="status-message">No classes yet.</li>}
      </ul>
    </div>
  )
}

// Standalone subclasses only — ones that belong to one of this app's own
// classes are managed inline in that class's wizard instead (class_id is
// null here specifically to exclude those).
function SubclassesTab() {
  const [subclasses, setSubclasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: loadError } = await supabase
      .from('homebrew_subclasses')
      .select('*')
      .is('class_id', null)
      .order('name', { ascending: true })
    if (loadError) setError(loadError.message)
    else setSubclasses(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleDelete(sc) {
    if (!confirm(`Delete "${sc.name}"? This also deletes its features.`)) return
    const { error: deleteError } = await supabase.from('homebrew_subclasses').delete().eq('id', sc.id)
    if (deleteError) return setError(deleteError.message)
    load()
    setError(await republishQuietly())
  }

  if (loading) return <p className="status-message">Loading...</p>

  return (
    <div className="dm-panel">
      <div className="dm-panel-header">
        <h2>Subclasses</h2>
        <Link to="/dm/homebrew/subclasses/new" className="button-link">
          + New Subclass
        </Link>
      </div>
      <p className="status-message">
        For subclasses of a class this site doesn't otherwise track (e.g. an official Monk tradition). A subclass of
        one of your own homebrew classes is managed from that class's editor instead.
      </p>
      {error && <p className="status-message error">{error}</p>}
      <ul className="dm-list">
        {subclasses.map((sc) => (
          <li key={sc.id}>
            <span>{sc.name}</span>
            {sc.visibility === 'dm' && <span className="badge badge-dm">DM only</span>}
            <span className="dm-list-meta">{sc.parent_class_name}</span>
            <div className="dm-list-actions">
              <Link to={`/dm/homebrew/subclasses/${sc.id}/edit`}>Edit</Link>
              <button type="button" className="danger" onClick={() => handleDelete(sc)}>
                Delete
              </button>
            </div>
          </li>
        ))}
        {subclasses.length === 0 && <li className="status-message">No standalone subclasses yet.</li>}
      </ul>
    </div>
  )
}

// Races, feats and backgrounds are all "one table, edit/delete per row" -
// only the table, the labels and the meta line differ.
function SimpleEntityTab({ table, path, title, singular, childLabel, meta }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: loadError } = await supabase.from(table).select('*').order('name', { ascending: true })
    if (loadError) setError(loadError.message)
    else setRows(data ?? [])
    setLoading(false)
  }, [table])

  useEffect(() => {
    load()
  }, [load])

  async function handleDelete(row) {
    if (!confirm(`Delete "${row.name}"? This also deletes its ${childLabel}.`)) return
    const { error: deleteError } = await supabase.from(table).delete().eq('id', row.id)
    if (deleteError) setError(deleteError.message)
    else load()
  }

  if (loading) return <p className="status-message">Loading...</p>

  return (
    <div className="dm-panel">
      <div className="dm-panel-header">
        <h2>{title}</h2>
        <Link to={`/dm/homebrew/${path}/new`} className="button-link">
          + New {singular}
        </Link>
      </div>
      {error && <p className="status-message error">{error}</p>}
      <ul className="dm-list">
        {rows.map((row) => (
          <li key={row.id}>
            <span>{row.name}</span>
            {row.visibility === 'dm' && <span className="badge badge-dm">DM only</span>}
            <span className="dm-list-meta">{meta(row)}</span>
            <div className="dm-list-actions">
              <Link to={`/dm/homebrew/${path}/${row.id}/edit`}>Edit</Link>
              <button type="button" className="danger" onClick={() => handleDelete(row)}>
                Delete
              </button>
            </div>
          </li>
        ))}
        {rows.length === 0 && <li className="status-message">No {title.toLowerCase()} yet.</li>}
      </ul>
    </div>
  )
}

export default function DMHomebrewPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = TABS.some((t) => t.key === searchParams.get('tab')) ? searchParams.get('tab') : 'classes'
  const setTab = (key) => setSearchParams({ tab: key }, { replace: true })
  // An editor that saved but couldn't republish the feed says so here.
  const notice = useLocation().state?.notice ?? null

  return (
    <section className="page-wide">
      <div className="view-header">
        <h1>Homebrew</h1>
        <p className="view-subtitle">Structured character options — classes, races, feats, and backgrounds.</p>
      </div>

      <nav className="character-hub-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={tab === t.key ? 'active' : ''}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {(tab === 'classes' || tab === 'subclasses') && <PlutoniumFeedPanel notice={notice} />}
      {tab === 'classes' && <ClassesTab />}
      {tab === 'subclasses' && <SubclassesTab />}
      {tab === 'races' && (
        <SimpleEntityTab
          key="races"
          table="homebrew_races"
          path="races"
          title="Races"
          singular="Race"
          childLabel="traits"
          meta={(race) => `${race.sizes.join(' or ')} · ${formatRaceSpeed(race)}`}
        />
      )}
      {tab === 'feats' && (
        <SimpleEntityTab
          key="feats"
          table="homebrew_feats"
          path="feats"
          title="Feats"
          singular="Feat"
          childLabel="benefits"
          meta={formatFeatMeta}
        />
      )}
      {tab === 'backgrounds' && (
        <SimpleEntityTab
          key="backgrounds"
          table="homebrew_backgrounds"
          path="backgrounds"
          title="Backgrounds"
          singular="Background"
          childLabel="features"
          meta={formatBackgroundMeta}
        />
      )}
    </section>
  )
}
