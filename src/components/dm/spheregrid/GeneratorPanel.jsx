import { useEffect, useRef, useState } from 'react'
import { generateNamed, generatorLabel } from '../../../lib/nameSchemes'
import { meaningLine, parsePlaceSource, placeLanguages, placeScheme } from '../../../lib/placeNames'
import { answerLine, drawFromPool, kindChain, kindTag } from '../../../lib/sphereGrid'
import GeneratorOptions, { isKnownSource, LanguageOptions } from './GeneratorOptions'
import KindSelect from './KindSelect'
import TagGroupPicker from '../../TagGroupPicker'

// Same lazy loading as the Name Generator: syllable data only loads once a
// scheme is actually picked.
const SCHEME_MODULES = import.meta.glob('../../../data/name-schemes/*.json')
const pathFor = (id) => `../../../data/name-schemes/${id}.json`

const MAX_COUNT = 20

// The last language picked is remembered per browser; it's only a default.
const LANGUAGE_KEY = 'sphereGrid.placeLanguage'
function storedLanguage() {
  try {
    const id = localStorage.getItem(LANGUAGE_KEY)
    if (placeLanguages.some((l) => l.id === id)) return id
  } catch {
    // Storage blocked - fall through to the default.
  }
  return placeLanguages.find((l) => l.id === 'sylvan')?.id ?? placeLanguages[0]?.id ?? ''
}

// The generation loop: pick a generator and a count, get a draft batch,
// reroll all or one at a time (or type over any name), then create the lot in
// one press. Everything is drawn from curated pools, the place-name word lists
// or the installed syllable schemes - nothing is invented, and no name already
// used by an entry anywhere in the wiki comes back. Picking a kind switches to
// that kind's default generator, unless one was picked by hand.
//
// Place generators speak one of the invented languages. A name built from
// roots with meanings keeps its meaning on the draft row, and the meaning is
// written into the new entry - unless the name was retyped.
export default function GeneratorPanel({ kinds, pools, existingNames, selectedSpheres, onCreate }) {
  const [source, setSource] = useState('')
  const [scheme, setScheme] = useState(null)
  const [schemeGen, setSchemeGen] = useState('')
  const [language, setLanguage] = useState(storedLanguage)
  const [count, setCount] = useState(5)
  const [batchTags, setBatchTags] = useState([])
  const [kindId, setKindId] = useState(null)
  const [gmOnly, setGmOnly] = useState(true)
  // How a batch stands to the selected spheres: 'inside' (placed below them),
  // 'containing' (placed above) or plain 'linked'.
  const [relation, setRelation] = useState('inside')
  const [draft, setDraft] = useState([])
  const [notice, setNotice] = useState(null)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const nextKey = useRef(0)
  // The source the last kind picked, so a later kind may replace it but a
  // generator chosen by hand stays put.
  const autoSource = useRef('')

  const pool = source.startsWith('pool:') ? pools.find((p) => p.id === source.slice(5)) : null
  const schemeId = source.startsWith('scheme:') ? source.slice(7) : null
  const placeKey = parsePlaceSource(source)?.generator ?? null

  function changeLanguage(next) {
    setLanguage(next)
    try {
      localStorage.setItem(LANGUAGE_KEY, next)
    } catch {
      // Not remembered - fine.
    }
  }

  // A pool's own tags are the default for what it generates.
  useEffect(() => {
    if (pool) setBatchTags(pool.tags ?? [])
  }, [pool])

  useEffect(() => {
    if (!schemeId) {
      setScheme(null)
      return
    }
    let cancelled = false
    const load = SCHEME_MODULES[pathFor(schemeId)]
    if (!load) {
      setError('That name scheme is not installed.')
      return
    }
    load().then((mod) => {
      if (cancelled) return
      const next = mod.default ?? mod
      setScheme(next)
      setSchemeGen((prev) => (next.generators?.[prev] ? prev : Object.keys(next.generators ?? {})[0] ?? ''))
    })
    return () => {
      cancelled = true
    }
  }, [schemeId])

  const ready = Boolean(pool || placeKey || (scheme && schemeGen))

  // `{ name, meaning, language }` items; meaning is '' unless a place name's
  // roots carry one.
  function draw(n, exclude) {
    if (pool) return drawFromPool(pool.names, n, exclude).map((name) => ({ name, meaning: '', language: null }))
    const [from, gen] = placeKey ? [placeScheme(language), placeKey] : [scheme, schemeGen]
    if (!from || !gen) return []
    const skip = new Set(exclude.map((x) => x.trim().toLowerCase()))
    const out = []
    for (let attempt = 0; attempt < n * 50 && out.length < n; attempt++) {
      const { name, meaning } = generateNamed(from, gen, { row: out.length % 10 })
      const key = name.toLowerCase()
      if (!name || skip.has(key)) continue
      skip.add(key)
      out.push({ name, meaning, language: placeKey ? language : null })
    }
    return out
  }

  const row = (item) => ({ key: nextKey.current++, ...item })

  function generate() {
    setError(null)
    const n = Math.max(1, Math.min(MAX_COUNT, Number(count) || 1))
    const names = draw(n, existingNames)
    setDraft(names.map(row))
    if (names.length < n) {
      setNotice(
        names.length
          ? `Only ${names.length} unused name(s) left in this generator.`
          : 'This generator has no unused names left.'
      )
    } else setNotice(null)
  }

  function rerollOne(index) {
    const exclude = [...existingNames, ...draft.map((d) => d.name)]
    const [item] = draw(1, exclude)
    if (!item) {
      setNotice('Nothing unused left to reroll into.')
      return
    }
    setDraft((rows) => rows.map((r, i) => (i === index ? { ...r, ...item } : r)))
  }

  const toCreate = draft
    .filter((d) => d.name.trim())
    .map((d) => ({
      title: d.name.trim(),
      content: d.meaning ? answerLine('Meaning', meaningLine(d.meaning, d.language)) : '',
    }))

  // A new entry should never start out with nothing describing it: a kind
  // (which brings its own questions and tag) or at least one tag.
  const tagProblem = !kindId && !batchTags.length ? 'Pick a kind or at least one tag for the batch.' : null

  // Picking a kind adds its wiki tag to the batch, the same as on a sphere,
  // and switches to the nearest default generator up its chain.
  function changeKind(next) {
    setKindId(next)
    const tag = next ? kindTag(kinds, next) : null
    if (tag) setBatchTags((current) => (current.includes(tag) ? current : [...current, tag]))
    const preferred = next
      ? kindChain(kinds, next).map((k) => k.name_generator).find((g) => isKnownSource(g, pools))
      : null
    if (preferred && (!source || source === autoSource.current)) {
      // A place default may pin a language (place:ruins@old); it's split off
      // so the dropdown holds the plain generator.
      const place = parsePlaceSource(preferred)
      const value = place ? `place:${place.generator}` : preferred
      if (place?.language) changeLanguage(place.language)
      autoSource.current = value
      setSource(value)
    }
  }

  async function handleCreate() {
    if (!toCreate.length || tagProblem) return
    setSaving(true)
    setError(null)
    const err = await onCreate(toCreate, { tags: batchTags, visibility: gmOnly ? 'dm' : 'public', kindId, relation })
    setSaving(false)
    if (err) setError(err)
    else {
      setDraft([])
      setNotice(`Created ${toCreate.length} entr${toCreate.length === 1 ? 'y' : 'ies'}.`)
    }
  }

  return (
    <div className="sg-generate">
      {selectedSpheres.length ? (
        <label className="sg-context sg-relation">
          New spheres are
          <select value={relation} onChange={(e) => setRelation(e.target.value)}>
            <option value="inside">inside</option>
            <option value="containing">containing</option>
            <option value="linked">linked to</option>
          </select>
          <strong>{selectedSpheres.length === 1 ? selectedSpheres[0].name : `${selectedSpheres.length} selected spheres`}</strong>
        </label>
      ) : (
        <p className="sg-context">Nothing selected — new entries start unlinked.</p>
      )}

      <div className="dm-form">
        <label>
          Generator
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">— Pick a generator —</option>
            <GeneratorOptions pools={pools} />
          </select>
        </label>
        {placeKey && (
          <label>
            Language
            <select value={language} onChange={(e) => changeLanguage(e.target.value)}>
              <LanguageOptions />
            </select>
          </label>
        )}
        {scheme && (
          <label>
            Variant
            <select value={schemeGen} onChange={(e) => setSchemeGen(e.target.value)}>
              {Object.keys(scheme.generators ?? {}).map((g) => (
                <option key={g} value={g}>
                  {generatorLabel(g)}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="dm-form-row">
          <label>
            Count
            <input
              type="number"
              min={1}
              max={MAX_COUNT}
              value={count}
              onChange={(e) => setCount(e.target.value)}
            />
          </label>
          <label className="sg-flag sg-flag-inline">
            <input type="checkbox" checked={gmOnly} onChange={(e) => setGmOnly(e.target.checked)} />
            GM-only
          </label>
        </div>
        <label>
          Kind for the batch
          <KindSelect kinds={kinds} value={kindId} onChange={changeKind} />
        </label>
        <div className="sg-tags">
          <span>Tags for the batch</span>
          <TagGroupPicker showRequired={false} value={batchTags} onChange={setBatchTags} />
        </div>
        {tagProblem && draft.length > 0 && <p className="status-message error">{tagProblem}</p>}
        <div className="dm-form-actions">
          <button type="button" onClick={generate} disabled={!ready}>
            {draft.length ? 'Reroll all' : 'Generate'}
          </button>
          <button type="button" className="secondary" onClick={() => setDraft((rows) => [...rows, row({ name: '', meaning: '', language: null })])}>
            Add a name by hand
          </button>
        </div>
      </div>

      {notice && <p className="status-message">{notice}</p>}
      {error && <p className="status-message error">{error}</p>}

      {draft.length > 0 && (
        <>
          <ol className="sg-draft">
            {draft.map((d, i) => (
              <li key={d.key}>
                <input
                  value={d.name}
                  // A retyped name no longer means what its roots did.
                  onChange={(e) =>
                    setDraft((rows) => rows.map((r, j) => (j === i ? { ...r, name: e.target.value, meaning: '' } : r)))
                  }
                  placeholder="Type a name"
                  aria-label={`Name ${i + 1}`}
                  title={d.meaning ? meaningLine(d.meaning, d.language) : undefined}
                />
                {d.meaning && <span className="sg-draft-meaning">{d.meaning}</span>}
                <button
                  type="button"
                  className="secondary sg-draft-reroll"
                  onClick={() => rerollOne(i)}
                  disabled={!ready}
                  title="Reroll this name"
                >
                  ↻
                </button>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setDraft((rows) => rows.filter((_, j) => j !== i))}
                  aria-label="Remove from batch"
                  title="Remove from batch"
                >
                  ×
                </button>
              </li>
            ))}
          </ol>
          <div className="dm-form-actions">
            <button type="button" onClick={handleCreate} disabled={saving || !toCreate.length || Boolean(tagProblem)}>
              {saving ? 'Creating…' : `Create ${toCreate.length} entr${toCreate.length === 1 ? 'y' : 'ies'}`}
            </button>
            <button type="button" className="secondary" onClick={() => setDraft([])}>
              Discard batch
            </button>
          </div>
        </>
      )}
    </div>
  )
}
