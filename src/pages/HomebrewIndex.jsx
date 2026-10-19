import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { formatBackgroundMeta, formatFeatMeta, formatRaceSpeed } from '../lib/homebrew'

const TABS = [
  { key: 'classes', label: 'Classes' },
  { key: 'subclasses', label: 'Subclasses' },
  { key: 'races', label: 'Races' },
  { key: 'feats', label: 'Feats' },
  { key: 'backgrounds', label: 'Backgrounds' },
]

export default function HomebrewIndex() {
  const [tab, setTab] = useState('classes')
  const [classes, setClasses] = useState([])
  const [subclasses, setSubclasses] = useState([])
  const [races, setRaces] = useState([])
  const [feats, setFeats] = useState([])
  const [backgrounds, setBackgrounds] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('homebrew_classes').select('*').order('name', { ascending: true }),
      supabase.from('homebrew_subclasses').select('*').is('class_id', null).order('name', { ascending: true }),
      supabase.from('homebrew_races').select('*').order('name', { ascending: true }),
      supabase.from('homebrew_feats').select('*').order('name', { ascending: true }),
      supabase.from('homebrew_backgrounds').select('*').order('name', { ascending: true }),
    ]).then(([{ data: classData }, { data: subclassData }, { data: raceData }, { data: featData }, { data: bgData }]) => {
      setClasses(classData ?? [])
      setSubclasses(subclassData ?? [])
      setRaces(raceData ?? [])
      setFeats(featData ?? [])
      setBackgrounds(bgData ?? [])
      setLoading(false)
    })
  }, [])

  return (
    <section className="page">
      <div className="view-header">
        <h1>Homebrew</h1>
        <p className="view-subtitle">Character options homebrewed for this table.</p>
      </div>

      <nav className="character-hub-tabs">
        {TABS.map((t) => (
          <button key={t.key} type="button" className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'classes' && (
        <>
          {loading && <p className="status-message">Loading...</p>}
          {!loading && classes.length === 0 && <p className="status-message">No classes published yet.</p>}
          <div className="entry-grid">
            {classes.map((cls) => (
              <Link key={cls.id} to={`/homebrew/classes/${cls.slug}`} className="entry-card">
                <div className="entry-card-header">
                  <h3>{cls.name}</h3>
                  {cls.visibility === 'dm' && <span className="badge badge-dm">DM only</span>}
                </div>
                <span className="entry-card-category">d{cls.hit_die} hit die</span>
              </Link>
            ))}
          </div>
        </>
      )}
      {tab === 'subclasses' && (
        <>
          {loading && <p className="status-message">Loading...</p>}
          {!loading && subclasses.length === 0 && <p className="status-message">No standalone subclasses published yet.</p>}
          <div className="entry-grid">
            {subclasses.map((sc) => (
              <Link key={sc.id} to={`/homebrew/subclasses/${sc.slug}`} className="entry-card">
                <div className="entry-card-header">
                  <h3>{sc.name}</h3>
                  {sc.visibility === 'dm' && <span className="badge badge-dm">DM only</span>}
                </div>
                <span className="entry-card-category">{sc.parent_class_name}</span>
              </Link>
            ))}
          </div>
        </>
      )}
      {tab === 'races' && (
        <>
          {loading && <p className="status-message">Loading...</p>}
          {!loading && races.length === 0 && <p className="status-message">No races published yet.</p>}
          <div className="entry-grid">
            {races.map((race) => (
              <Link key={race.id} to={`/homebrew/races/${race.slug}`} className="entry-card">
                <div className="entry-card-header">
                  <h3>{race.name}</h3>
                  {race.visibility === 'dm' && <span className="badge badge-dm">DM only</span>}
                </div>
                <span className="entry-card-category">
                  {race.sizes.join(' or ')} · {formatRaceSpeed(race)}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
      {tab === 'feats' && (
        <>
          {loading && <p className="status-message">Loading...</p>}
          {!loading && feats.length === 0 && <p className="status-message">No feats published yet.</p>}
          <div className="entry-grid">
            {feats.map((feat) => (
              <Link key={feat.id} to={`/homebrew/feats/${feat.slug}`} className="entry-card">
                <div className="entry-card-header">
                  <h3>{feat.name}</h3>
                  {feat.visibility === 'dm' && <span className="badge badge-dm">DM only</span>}
                </div>
                <span className="entry-card-category">{formatFeatMeta(feat)}</span>
              </Link>
            ))}
          </div>
        </>
      )}
      {tab === 'backgrounds' && (
        <>
          {loading && <p className="status-message">Loading...</p>}
          {!loading && backgrounds.length === 0 && <p className="status-message">No backgrounds published yet.</p>}
          <div className="entry-grid">
            {backgrounds.map((bg) => (
              <Link key={bg.id} to={`/homebrew/backgrounds/${bg.slug}`} className="entry-card">
                <div className="entry-card-header">
                  <h3>{bg.name}</h3>
                  {bg.visibility === 'dm' && <span className="badge badge-dm">DM only</span>}
                </div>
                <span className="entry-card-category">{formatBackgroundMeta(bg)}</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
