import { useEffect, useMemo, useState } from 'react'
import { generateNames, generatorLabel, schemeSize } from '../../../lib/nameSchemes'
import { cultureLabel, languageById, languageGroups, placeGenerators, placePeoples, placeScheme } from '../../../lib/placeNames'
import './namegen.css'

// Schemes are loaded on demand: 78 races' worth of syllable data has no business
// sitting in the initial bundle when a session needs one or two of them.
const SCHEME_MODULES = import.meta.glob('../../../data/name-schemes/*.json')
const MANIFEST = import.meta.glob('../../../data/name-schemes/manifest.json', { eager: true })

const manifest = Object.values(MANIFEST)[0]?.default ?? { races: [] }
const pathFor = (id) => `../../../data/name-schemes/${id}.json`

const SOURCE_HOME = 'https://www.fantasynamegenerators.com/dungeons-and-dragons.php'

const FAVORITES_KEY = 'chrab.namegen.favorites'

// Culture mode draws from the region and old-tongue generators: people names
// as chips, places in a dropdown.
const cultureGens = Object.entries(placeGenerators)
const peopleGens = cultureGens.filter(([, g]) => g.group === 'People').map(([key, g]) => ({ key, label: g.label }))
const placeGens = cultureGens.filter(([, g]) => g.group !== 'People').map(([key, g]) => ({ key, label: g.label }))
const firstCulture = languageGroups[0]?.items[0]?.id ?? ''
const HUMAN = { id: '', label: 'Human', note: 'The culture as it stands, with no flair' }
const readFavorites = () => {
  try { return JSON.parse(localStorage.getItem(FAVORITES_KEY)) ?? [] } catch { return [] }
}

export default function NameGenerator() {
  const races = manifest.races ?? []
  const [mode, setMode] = useState('culture')
  const [cultureId, setCultureId] = useState(firstCulture)
  const [peopleId, setPeopleId] = useState('')
  const [cultureGen, setCultureGen] = useState(peopleGens[0]?.key ?? '')
  const [raceKey, setRaceKey] = useState(races[0]?.key ?? '')
  const [query, setQuery] = useState('')
  const [scheme, setScheme] = useState(null)
  const [generator, setGenerator] = useState('')
  const [count, setCount] = useState(10)
  const [names, setNames] = useState([])
  const [favorites, setFavorites] = useState(readFavorites)
  const [status, setStatus] = useState(races.length ? 'idle' : 'empty')

  const race = races.find((r) => r.key === raceKey)

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? races.filter((r) => r.label.toLowerCase().includes(q)) : races
  }, [races, query])

  // Whichever mode is showing, the scheme and generator names come from.
  const byCulture = mode === 'culture'
  const activeScheme = byCulture ? placeScheme(cultureId, peopleId || null) : scheme
  const activeGen = byCulture ? cultureGen : generator
  const heading = byCulture ? cultureLabel(cultureId, peopleId) : race?.label
  const culture = languageById(cultureId)

  // Load the selected race's scheme.
  useEffect(() => {
    if (!race) return
    let cancelled = false
    const load = SCHEME_MODULES[pathFor(race.scheme)]
    if (!load) { setStatus('missing'); setScheme(null); return }
    setStatus('loading')
    load().then((mod) => {
      if (cancelled) return
      const next = mod.default ?? mod
      setScheme(next)
      setGenerator((prev) => (next.generators?.[prev] ? prev : Object.keys(next.generators ?? {})[0] ?? ''))
      setStatus('idle')
    }).catch(() => { if (!cancelled) setStatus('error') })
    return () => { cancelled = true }
  }, [race])

  // Roll a fresh batch whenever the inputs settle.
  useEffect(() => {
    if (!activeScheme || !activeGen) { setNames([]); return }
    setNames(generateNames(activeScheme, activeGen, { count }))
  }, [activeScheme, activeGen, count])

  const reroll = () => activeScheme && activeGen && setNames(generateNames(activeScheme, activeGen, { count }))

  const toggleFavorite = (name) => {
    setFavorites((prev) => {
      const entry = `${heading || raceKey} — ${name}`
      const next = prev.includes(entry) ? prev.filter((f) => f !== entry) : [entry, ...prev].slice(0, 200)
      try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(next)) } catch { /* private mode */ }
      return next
    })
  }
  const isFavorite = (name) => favorites.includes(`${heading || raceKey} — ${name}`)

  if (status === 'empty' && !byCulture) {
    return (
      <div className="dm-panel ng-empty">
        <p>No name schemes are installed yet.</p>
        <p className="ng-muted">
          Run <code>node install.mjs</code> in the lab's <code>scripts/name-schemes</code> to add them, then rebuild.
        </p>
      </div>
    )
  }

  const generators = Object.keys(scheme?.generators ?? {})

  return (
    <div className="ng-layout">
      <aside className="dm-panel ng-races">
        <div className="chip-list" role="group" aria-label="Name by">
          {[['culture', 'By culture'], ['race', 'By race']].map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`chip${mode === key ? ' is-active' : ''}`}
              aria-pressed={mode === key}
              onClick={() => setMode(key)}
            >
              {label}
            </button>
          ))}
        </div>
        {byCulture ? (
          languageGroups.map((group) => (
            <div key={group.label}>
              <div className="dm-panel-header">
                <h2>{group.label}</h2>
              </div>
              <ul className="dm-list ng-race-list">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={`ng-race${item.id === cultureId ? ' is-active' : ''}`}
                      aria-current={item.id === cultureId}
                      title={item.note}
                      onClick={() => setCultureId(item.id)}
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))
        ) : (
        <>
        <div className="dm-panel-header">
          <h2>Race</h2>
          <span className="badge">{races.length}</span>
        </div>
        <input
          className="ng-search"
          type="search"
          value={query}
          placeholder="Filter races…"
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Filter races"
        />
        <ul className="dm-list ng-race-list">
          {shown.map((item) => (
            <li key={item.key}>
              <button
                type="button"
                className={`ng-race${item.key === raceKey ? ' is-active' : ''}`}
                aria-current={item.key === raceKey}
                onClick={() => setRaceKey(item.key)}
              >
                {item.label}
              </button>
            </li>
          ))}
          {!shown.length && <li className="ng-muted">No race matches “{query}”.</li>}
        </ul>
        </>
        )}
      </aside>

      <section className="dm-panel ng-results">
        <div className="dm-panel-header">
          <h2>{heading || 'Names'}</h2>
          {activeScheme && activeGen && (
            <span className="badge" title="Distinct names this scheme can reach">
              {schemeSize(activeScheme, activeGen).toLocaleString()} combinations
            </span>
          )}
        </div>

        {byCulture && (
          <div className="dm-form-row ng-controls">
            <div className="chip-list ng-kinds" role="group" aria-label="Flair">
              {[HUMAN, ...placePeoples].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`chip${p.id === peopleId ? ' is-active' : ''}`}
                  aria-pressed={p.id === peopleId}
                  title={p.note}
                  onClick={() => setPeopleId(p.id)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="dm-form-row ng-controls">
          {byCulture ? (
            <>
              <div className="chip-list ng-kinds" role="group" aria-label="Name kind">
                {peopleGens.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    className={`chip${key === cultureGen ? ' is-active' : ''}`}
                    aria-pressed={key === cultureGen}
                    onClick={() => setCultureGen(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label className="ng-count">
                Place
                <select
                  value={placeGens.some((g) => g.key === cultureGen) ? cultureGen : ''}
                  onChange={(e) => e.target.value && setCultureGen(e.target.value)}
                >
                  <option value="">—</option>
                  {placeGens.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}
                </select>
              </label>
            </>
          ) : (
          <div className="chip-list ng-kinds" role="group" aria-label="Name kind">
            {generators.map((key) => (
              <button
                key={key}
                type="button"
                className={`chip${key === generator ? ' is-active' : ''}`}
                aria-pressed={key === generator}
                onClick={() => setGenerator(key)}
              >
                {generatorLabel(key)}
              </button>
            ))}
          </div>
          )}
          <label className="ng-count">
            How many
            <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {[5, 10, 20, 50].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <button type="button" className="secondary" onClick={reroll} disabled={!activeScheme}>
            Reroll
          </button>
        </div>

        {!byCulture && status === 'loading' && <p className="ng-muted">Loading scheme…</p>}
        {!byCulture && status === 'error' && <p className="ng-muted">That scheme failed to load.</p>}
        {!byCulture && status === 'missing' && <p className="ng-muted">No scheme file installed for this race.</p>}

        <ul className="ng-names">
          {names.map((name) => (
            <li key={name}>
              <button
                type="button"
                className="ng-name"
                title="Copy to clipboard"
                onClick={() => navigator.clipboard?.writeText(name)}
              >
                {name}
              </button>
              <button
                type="button"
                className="icon-button ng-fav"
                aria-label={isFavorite(name) ? `Unsave ${name}` : `Save ${name}`}
                aria-pressed={isFavorite(name)}
                onClick={() => toggleFavorite(name)}
              >
                {isFavorite(name) ? '★' : '☆'}
              </button>
            </li>
          ))}
        </ul>

        {byCulture ? (
          <footer className="ng-credit">{culture?.note}</footer>
        ) : (
        <footer className="ng-credit">
          Name scheme from{' '}
          <a href={race?.source ?? SOURCE_HOME} target="_blank" rel="noreferrer noopener">
            fantasynamegenerators.com
          </a>
          {race?.source && <> — {race.label} names</>}. Syllable data is theirs; used here with credit.
        </footer>
        )}
      </section>

      {favorites.length > 0 && (
        <aside className="dm-panel ng-saved">
          <div className="dm-panel-header">
            <h2>Saved</h2>
            <button
              type="button"
              className="secondary"
              onClick={() => { setFavorites([]); try { localStorage.removeItem(FAVORITES_KEY) } catch { /* ignore */ } }}
            >
              Clear
            </button>
          </div>
          <ul className="dm-list ng-saved-list">
            {favorites.map((entry) => <li key={entry}>{entry}</li>)}
          </ul>
        </aside>
      )}
    </div>
  )
}
