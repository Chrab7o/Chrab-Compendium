import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { formatRaceSpeed } from '../../lib/homebrew'

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
    if (deleteError) setError(deleteError.message)
    else load()
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
    if (deleteError) setError(deleteError.message)
    else load()
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

function RacesTab() {
  const [races, setRaces] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: loadError } = await supabase.from('homebrew_races').select('*').order('name', { ascending: true })
    if (loadError) setError(loadError.message)
    else setRaces(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleDelete(race) {
    if (!confirm(`Delete "${race.name}"? This also deletes its traits.`)) return
    const { error: deleteError } = await supabase.from('homebrew_races').delete().eq('id', race.id)
    if (deleteError) setError(deleteError.message)
    else load()
  }

  if (loading) return <p className="status-message">Loading...</p>

  return (
    <div className="dm-panel">
      <div className="dm-panel-header">
        <h2>Races</h2>
        <Link to="/dm/homebrew/races/new" className="button-link">
          + New Race
        </Link>
      </div>
      {error && <p className="status-message error">{error}</p>}
      <ul className="dm-list">
        {races.map((race) => (
          <li key={race.id}>
            <span>{race.name}</span>
            {race.visibility === 'dm' && <span className="badge badge-dm">DM only</span>}
            <span className="dm-list-meta">
              {race.sizes.join(' or ')} · {formatRaceSpeed(race)}
            </span>
            <div className="dm-list-actions">
              <Link to={`/dm/homebrew/races/${race.id}/edit`}>Edit</Link>
              <button type="button" className="danger" onClick={() => handleDelete(race)}>
                Delete
              </button>
            </div>
          </li>
        ))}
        {races.length === 0 && <li className="status-message">No races yet.</li>}
      </ul>
    </div>
  )
}

export default function DMHomebrewPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = TABS.some((t) => t.key === searchParams.get('tab')) ? searchParams.get('tab') : 'classes'
  const setTab = (key) => setSearchParams({ tab: key }, { replace: true })

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

      {tab === 'classes' && <ClassesTab />}
      {tab === 'subclasses' && <SubclassesTab />}
      {tab === 'races' && <RacesTab />}
      {(tab === 'feats' || tab === 'backgrounds') && <p className="status-message">Coming soon.</p>}
    </section>
  )
}
