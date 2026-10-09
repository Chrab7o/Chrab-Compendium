import { useEffect, useMemo, useRef, useState } from 'react'
import { generateOne, generatorLabel } from '../../../lib/nameSchemes'
import { drawFromPool, resolveTag } from '../../../lib/storyEngine'

// Same lazy loading as the Name Generator: syllable data only loads once a
// scheme is actually picked.
const SCHEME_MODULES = import.meta.glob('../../../data/name-schemes/*.json')
const MANIFEST = import.meta.glob('../../../data/name-schemes/manifest.json', { eager: true })
const manifest = Object.values(MANIFEST)[0]?.default ?? { races: [] }
const pathFor = (id) => `../../../data/name-schemes/${id}.json`

const MAX_COUNT = 20

// The generation loop: pick a generator and a count, get a draft batch,
// reroll all or one at a time (or type over any name), then create the lot in
// one press. Everything is drawn from curated pools or the installed syllable
// schemes - nothing is invented.
export default function GeneratorPanel({ tags, tagsByValue, pools, existingNames, selectedSpheres, onCreate }) {
  const [source, setSource] = useState('')
  const [scheme, setScheme] = useState(null)
  const [schemeGen, setSchemeGen] = useState('')
  const [count, setCount] = useState(5)
  const [tagInput, setTagInput] = useState('')
  const [draft, setDraft] = useState([])
  const [notice, setNotice] = useState(null)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const nextKey = useRef(0)

  const pool = source.startsWith('pool:') ? pools.find((p) => p.id === source.slice(5)) : null
  const schemeId = source.startsWith('scheme:') ? source.slice(7) : null

  // A pool tied to a tag makes that tag the default for what it generates.
  useEffect(() => {
    if (pool?.tag) setTagInput(tagsByValue.get(pool.tag)?.label ?? '')
  }, [pool, tagsByValue])

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

  const ready = Boolean(pool || (scheme && schemeGen))

  function draw(n, exclude) {
    if (pool) return drawFromPool(pool.names, n, exclude)
    if (!scheme || !schemeGen) return []
    const skip = new Set(exclude.map((x) => x.trim().toLowerCase()))
    const out = []
    for (let attempt = 0; attempt < n * 50 && out.length < n; attempt++) {
      const name = generateOne(scheme, schemeGen, { row: out.length % 10 })
      const key = name.toLowerCase()
      if (!name || skip.has(key)) continue
      skip.add(key)
      out.push(name)
    }
    return out
  }

  const row = (name) => ({ key: nextKey.current++, name })

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
    const [name] = draw(1, exclude)
    if (!name) {
      setNotice('Nothing unused left to reroll into.')
      return
    }
    setDraft((rows) => rows.map((r, i) => (i === index ? { ...r, name } : r)))
  }

  const tagCheck = useMemo(() => resolveTag(tagInput, tags), [tagInput, tags])
  const toCreate = draft.map((d) => d.name.trim()).filter(Boolean)

  async function handleCreate() {
    if (tagCheck.error || !toCreate.length) return
    setSaving(true)
    setError(null)
    const err = await onCreate(toCreate, tagCheck.value)
    setSaving(false)
    if (err) setError(err)
    else {
      setDraft([])
      setNotice(`Created ${toCreate.length} sphere(s).`)
    }
  }

  return (
    <div className="se-generate">
      <p className="se-context">
        {selectedSpheres.length ? (
          <>
            New spheres link to{' '}
            <strong>{selectedSpheres.length === 1 ? selectedSpheres[0].name : `${selectedSpheres.length} selected spheres`}</strong>.
          </>
        ) : (
          <>Nothing selected — new spheres start unlinked.</>
        )}
      </p>

      <div className="dm-form">
        <label>
          Generator
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">— Pick a generator —</option>
            {pools.length > 0 && (
              <optgroup label="Your pools">
                {pools.map((p) => (
                  <option key={p.id} value={`pool:${p.id}`}>
                    {p.name} ({p.names.length})
                  </option>
                ))}
              </optgroup>
            )}
            {manifest.races?.length > 0 && (
              <optgroup label="Name schemes">
                {manifest.races.map((r) => (
                  <option key={r.key} value={`scheme:${r.scheme}`}>
                    {r.label}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
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
          <label>
            Tag for the batch
            <input list="se-tag-options" value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="Untagged" />
          </label>
        </div>
        {tagCheck.error && <p className="status-message error">{tagCheck.error}</p>}
        <div className="dm-form-actions">
          <button type="button" onClick={generate} disabled={!ready}>
            {draft.length ? 'Reroll all' : 'Generate'}
          </button>
          <button type="button" className="secondary" onClick={() => setDraft((rows) => [...rows, row('')])}>
            Add a name by hand
          </button>
        </div>
      </div>

      {notice && <p className="status-message">{notice}</p>}
      {error && <p className="status-message error">{error}</p>}

      {draft.length > 0 && (
        <>
          <ol className="se-draft">
            {draft.map((d, i) => (
              <li key={d.key}>
                <input
                  value={d.name}
                  onChange={(e) => setDraft((rows) => rows.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)))}
                  placeholder="Type a name"
                  aria-label={`Name ${i + 1}`}
                />
                <button
                  type="button"
                  className="secondary se-draft-reroll"
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
            <button type="button" onClick={handleCreate} disabled={saving || !toCreate.length || Boolean(tagCheck.error)}>
              {saving ? 'Creating…' : `Create ${toCreate.length} sphere${toCreate.length === 1 ? '' : 's'}`}
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
