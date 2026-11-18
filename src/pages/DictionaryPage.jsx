import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { useCampaignContext } from '../contexts/CampaignContext'

// The lore Dictionary: one row per term, laid out like the spreadsheet it
// started as. Public to read; anyone signed in can add or edit a term (RLS in
// 20261117000000_dictionary.sql), only a DM can delete one.

const FIELDS = [
  { key: 'term', label: 'Term' },
  { key: 'definition', label: 'Definition / Description', multiline: true },
  { key: 'category', label: 'Category' },
  { key: 'related_to', label: 'Related To', hint: 'Comma-separated term names' },
  { key: 'examples', label: 'Examples', multiline: true },
  { key: 'additional_info', label: 'Additional Information', multiline: true },
]

const EMPTY = Object.fromEntries(FIELDS.map((f) => [f.key, '']))

function anchorFor(term) {
  return `term-${term.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

function splitRelated(value) {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export default function DictionaryPage() {
  const { session, isDM } = useAuth()
  const { worldId, world } = useCampaignContext()
  const [terms, setTerms] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  // id of the row being edited, or 'new' for the add form.
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState(EMPTY)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setLoading(true)
    supabase
      .from('dictionary_terms')
      .select('*')
      .order('term', { ascending: true })
      .then(({ data, error: err }) => {
        if (err) setError(err.message)
        setTerms(data ?? [])
        setLoading(false)
      })
  }, [])

  // Terms with no world show everywhere; with no world picked, show them all.
  const worldTerms = useMemo(
    () => terms.filter((t) => !worldId || !t.world_id || t.world_id === worldId),
    [terms, worldId]
  )

  const byName = useMemo(
    () => new Map(worldTerms.map((t) => [t.term.trim().toLowerCase(), t])),
    [worldTerms]
  )

  const categories = useMemo(
    () => [...new Set(worldTerms.map((t) => t.category?.trim()).filter(Boolean))].sort(),
    [worldTerms]
  )

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return worldTerms
      .filter((t) => !category || t.category?.trim() === category)
      .filter((t) => !q || FIELDS.some((f) => (t[f.key] ?? '').toLowerCase().includes(q)))
      .sort((a, b) => a.term.localeCompare(b.term))
  }, [worldTerms, query, category])

  function startEdit(term) {
    setError('')
    setEditingId(term ? term.id : 'new')
    setDraft(term ? Object.fromEntries(FIELDS.map((f) => [f.key, term[f.key] ?? ''])) : EMPTY)
  }

  function cancelEdit() {
    setEditingId(null)
    setDraft(EMPTY)
  }

  async function save(e) {
    e.preventDefault()
    const payload = Object.fromEntries(
      FIELDS.map((f) => [f.key, draft[f.key].trim() || null])
    )
    if (!payload.term) {
      setError('A term needs a name.')
      return
    }
    setSaving(true)
    setError('')
    const result =
      editingId === 'new'
        ? await supabase
            .from('dictionary_terms')
            .insert({ ...payload, world_id: worldId || null })
            .select()
            .single()
        : await supabase
            .from('dictionary_terms')
            .update(payload)
            .eq('id', editingId)
            .select()
            .single()
    setSaving(false)
    if (result.error) {
      setError(
        result.error.code === '23505'
          ? `"${payload.term}" is already in the dictionary.`
          : result.error.message
      )
      return
    }
    setTerms((prev) =>
      editingId === 'new'
        ? [...prev, result.data]
        : prev.map((t) => (t.id === editingId ? result.data : t))
    )
    cancelEdit()
  }

  async function remove(term) {
    if (!window.confirm(`Delete "${term.term}" from the dictionary?`)) return
    const { error: err } = await supabase.from('dictionary_terms').delete().eq('id', term.id)
    if (err) {
      setError(err.message)
      return
    }
    setTerms((prev) => prev.filter((t) => t.id !== term.id))
    cancelEdit()
  }

  function renderEditor(term) {
    return (
      <tr className="dictionary-edit-row" key={term ? term.id : 'new'}>
        <td colSpan={FIELDS.length + (session ? 1 : 0)}>
          <form className="dictionary-editor" onSubmit={save}>
            <datalist id="dictionary-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            {FIELDS.map((f) => (
              <label key={f.key} className={f.multiline ? 'is-wide' : undefined}>
                <span>{f.label}</span>
                {f.multiline ? (
                  <textarea
                    rows={3}
                    value={draft[f.key]}
                    onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                  />
                ) : (
                  <input
                    value={draft[f.key]}
                    placeholder={f.hint}
                    list={f.key === 'category' ? 'dictionary-categories' : undefined}
                    autoFocus={f.key === 'term'}
                    onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                  />
                )}
              </label>
            ))}
            <div className="dictionary-editor-actions">
              <button type="submit" disabled={saving}>
                {saving ? 'Saving...' : editingId === 'new' ? 'Add term' : 'Save'}
              </button>
              <button type="button" className="secondary" onClick={cancelEdit}>
                Cancel
              </button>
              {term && isDM && (
                <button type="button" className="danger" onClick={() => remove(term)}>
                  Delete
                </button>
              )}
            </div>
          </form>
        </td>
      </tr>
    )
  }

  function renderRelated(value) {
    const names = splitRelated(value)
    if (names.length === 0) return null
    return (
      <span className="dictionary-related">
        {names.map((name) => {
          const target = byName.get(name.toLowerCase())
          return target ? (
            <a key={name} href={`#${anchorFor(target.term)}`} className="chip chip-tag">
              {name}
            </a>
          ) : (
            <span key={name} className="chip chip-tag is-unlinked">
              {name}
            </span>
          )
        })}
      </span>
    )
  }

  return (
    <section className="page-wide dictionary-page">
      <div className="view-header">
        <h1>{world ? `${world.name} Dictionary` : 'Dictionary'}</h1>
        <p className="view-subtitle">
          {session ? (
            'Terms, places and ideas of the world. Anyone signed in can add or edit a term.'
          ) : (
            <>
              Terms, places and ideas of the world. <Link to="/login">Sign in</Link> to add or edit
              a term.
            </>
          )}
        </p>
      </div>

      <div className="dictionary-toolbar">
        <input
          type="search"
          placeholder="Search terms..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search the dictionary"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Filter by category"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {session && editingId !== 'new' && (
          <button type="button" onClick={() => startEdit(null)}>
            + Add term
          </button>
        )}
      </div>

      {error && <p className="status-message error">{error}</p>}
      {loading && <p className="status-message">Loading...</p>}

      {!loading && (
        <div className="dictionary-table-wrap">
          <table className="dictionary-table">
            <thead>
              <tr>
                {FIELDS.map((f) => (
                  <th key={f.key}>{f.label}</th>
                ))}
                {session && <th aria-label="Actions" />}
              </tr>
            </thead>
            <tbody>
              {editingId === 'new' && renderEditor(null)}
              {visible.map((t) =>
                editingId === t.id ? (
                  renderEditor(t)
                ) : (
                  <tr key={t.id} id={anchorFor(t.term)}>
                    <th scope="row" data-label="Term">
                      {t.term}
                    </th>
                    <td data-label="Definition">{t.definition}</td>
                    <td data-label="Category">{t.category}</td>
                    <td data-label="Related To">{renderRelated(t.related_to)}</td>
                    <td data-label="Examples">{t.examples}</td>
                    <td data-label="Additional Information">{t.additional_info}</td>
                    {session && (
                      <td className="dictionary-row-actions">
                        <button type="button" className="secondary" onClick={() => startEdit(t)}>
                          Edit
                        </button>
                      </td>
                    )}
                  </tr>
                )
              )}
            </tbody>
          </table>
          {visible.length === 0 && (
            <p className="status-message">
              {worldTerms.length === 0 ? 'No terms yet.' : 'No terms match.'}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
