import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useTags } from '../../contexts/TagContext'
import { collectionCounts, oldFolderPath, tagLabel } from '../../lib/tags'
import BulkEditBar from '../../components/dm/BulkEditBar'

// Groups that say nothing about what an entry *is*: Collection is the old
// folder stamped on during the migration, Campaign mirrors campaign_id.
const NON_SORTING_GROUPS = new Set(['type', 'collection', 'campaign'])

// What counts as "still needs sorting". Each test gets the entry's tag
// values already resolved to the group they belong to.
const MODES = [
  {
    key: 'no-type',
    label: 'Missing a Type',
    test: (groupsOwned) => !groupsOwned.has('type'),
  },
  {
    key: 'folder-only',
    label: 'Only old-folder tags',
    test: (groupsOwned) => [...groupsOwned].every((g) => NON_SORTING_GROUPS.has(g)),
  },
  {
    key: 'any-folder',
    label: 'Still in an old folder',
    test: (groupsOwned) => groupsOwned.has('collection'),
  },
]

const NO_FOLDER = '__none__'

// The migration turned every folder into a Collection tag but left entries
// otherwise unsorted. This lists the ones still missing tags, laid out by the
// folder they came from, so a whole old folder can be sorted in one go.
export default function DMSortPage() {
  const { tags, groups, typeTags } = useTags()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [modeKey, setModeKey] = useState('no-type')
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [savingId, setSavingId] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: loadError } = await supabase
      .from('entries')
      .select('id, title, tags, visibility, parent_entry_id')
      .order('title', { ascending: true })
    if (loadError) setError(loadError.message)
    setEntries(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // tag value -> its group's slug ('type', 'collection', ...), so every check
  // below is a lookup rather than a search through the tag list.
  const groupOfTag = useMemo(() => {
    const slugById = new Map(groups.map((g) => [g.id, g.value]))
    return new Map(tags.map((t) => [t.value, slugById.get(t.group_id) ?? 'ungrouped']))
  }, [tags, groups])

  const counts = useMemo(() => {
    const collectionValues = tags
      .filter((t) => groupOfTag.get(t.value) === 'collection')
      .map((t) => t.value)
    return collectionCounts(entries, collectionValues)
  }, [entries, tags, groupOfTag])

  const mode = MODES.find((m) => m.key === modeKey)

  const unsorted = useMemo(
    () =>
      entries.filter((e) => {
        const groupsOwned = new Set((e.tags ?? []).map((t) => groupOfTag.get(t) ?? 'ungrouped'))
        return mode.test(groupsOwned)
      }),
    [entries, groupOfTag, mode]
  )

  // Bucket by the folder each entry sat in (the last step of its path), and
  // keep the full path alongside for the heading.
  const folders = useMemo(() => {
    const byLeaf = new Map()
    for (const entry of unsorted) {
      const path = oldFolderPath(entry.tags, counts)
      const leaf = path.at(-1) ?? NO_FOLDER
      if (!byLeaf.has(leaf)) byLeaf.set(leaf, { leaf, path, entries: [] })
      byLeaf.get(leaf).entries.push(entry)
    }
    const labelOf = (f) => f.path.map((v) => tagLabel(tags, v)).join(' / ')
    return [...byLeaf.values()].sort((a, b) => {
      if (a.leaf === NO_FOLDER) return 1
      if (b.leaf === NO_FOLDER) return -1
      return labelOf(a).localeCompare(labelOf(b))
    })
  }, [unsorted, counts, tags])

  const unsortedIds = useMemo(() => new Set(unsorted.map((e) => e.id)), [unsorted])
  // Same rule as search: once an entry is sorted it leaves the list, and a
  // bulk edit shouldn't keep reaching rows that are no longer on screen.
  const activeSelection = [...selectedIds].filter((id) => unsortedIds.has(id))

  function toggleSelected(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleFolder(folderEntries) {
    const ids = folderEntries.map((e) => e.id)
    setSelectedIds((prev) => {
      const next = new Set(prev)
      const allIn = ids.every((id) => next.has(id))
      for (const id of ids) {
        if (allIn) next.delete(id)
        else next.add(id)
      }
      return next
    })
  }

  // Type is exclusive, so setting it swaps out any Type already there rather
  // than adding a second one. Patches the one row locally instead of
  // reloading, so the list doesn't jump while you work down it.
  async function setType(entry, typeValue) {
    const typeValues = new Set(typeTags.map((t) => t.value))
    const next = (entry.tags ?? []).filter((t) => !typeValues.has(t))
    if (typeValue) next.push(typeValue)

    setSavingId(entry.id)
    setError(null)
    const { error: saveError } = await supabase
      .from('entries')
      .update({ tags: next })
      .eq('id', entry.id)
    setSavingId(null)

    if (saveError) {
      setError(saveError.message)
      return
    }
    setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, tags: next } : e)))
  }

  // Some of what the migration left behind is just junk worth throwing out.
  // Sub-entries cascade with their parent, so the confirm says so - and a
  // full reload afterwards picks up those vanished children too.
  async function deleteEntry(entry) {
    const children = entries.filter((e) => e.parent_entry_id === entry.id).length
    const parts = [`Delete "${entry.title}" from the wiki?`]
    if (children) parts.push(`It has ${children} sub-entr${children === 1 ? 'y' : 'ies'}, which will be deleted too.`)
    parts.push('This cannot be undone.')
    if (!confirm(parts.join(' '))) return

    setSavingId(entry.id)
    setError(null)
    const { error: deleteError } = await supabase.from('entries').delete().eq('id', entry.id)
    setSavingId(null)

    if (deleteError) {
      setError(deleteError.message)
      return
    }
    load()
  }

  return (
    <section className="page">
      <div className="view-header">
        <h1>Sort Entries</h1>
        <p className="view-subtitle">
          Entries the folder migration left without real tags, grouped by the folder they used
          to live in.
        </p>
      </div>

      <div className="sort-toolbar">
        <div className="entry-search-chips" role="group" aria-label="What counts as unsorted">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              className={m.key === modeKey ? 'chip chip-tag active' : 'chip chip-tag'}
              aria-pressed={m.key === modeKey}
              onClick={() => setModeKey(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>
        {!loading && (
          <p className="sort-progress">
            <strong>{unsorted.length}</strong> of {entries.length} entries left
          </p>
        )}
      </div>

      {error && <p className="status-message error">{error}</p>}

      {activeSelection.length > 0 && (
        <BulkEditBar
          entryIds={activeSelection}
          onDone={() => {
            setSelectedIds(new Set())
            load()
          }}
          onCancel={() => setSelectedIds(new Set())}
        />
      )}

      {loading && (
        <div className="browse-loading" role="status">
          <span className="browse-loading-spinner" aria-hidden="true" />
          Loading...
        </div>
      )}

      {!loading && unsorted.length === 0 && (
        <div className="browse-empty">
          <p className="browse-empty-title">All sorted</p>
          <p>Nothing matches “{mode.label}”.</p>
        </div>
      )}

      {folders.map((folder) => {
        const allSelected = folder.entries.every((e) => selectedIds.has(e.id))
        return (
          <details key={folder.leaf} className="sort-folder" open>
            <summary>
              <span className="sort-folder-path">
                {folder.leaf === NO_FOLDER
                  ? 'Not from a folder'
                  : folder.path.map((v, i) => (
                      <span key={v} className={i === folder.path.length - 1 ? 'is-leaf' : ''}>
                        {tagLabel(tags, v)}
                      </span>
                    ))}
              </span>
              <span className="sort-folder-count">{folder.entries.length}</span>
            </summary>

            <button
              type="button"
              className="secondary sort-select-folder"
              onClick={() => toggleFolder(folder.entries)}
            >
              {allSelected ? 'Deselect folder' : 'Select whole folder'}
            </button>

            <ul className="dm-list">
              {folder.entries.map((entry) => {
                const type = (entry.tags ?? []).find((t) => groupOfTag.get(t) === 'type') ?? ''
                const otherTags = (entry.tags ?? []).filter((t) => {
                  const g = groupOfTag.get(t)
                  return g !== 'collection' && g !== 'type'
                })
                return (
                  <li key={entry.id} className={selectedIds.has(entry.id) ? 'is-selected' : ''}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(entry.id)}
                      onChange={() => toggleSelected(entry.id)}
                      aria-label={`Select ${entry.title}`}
                    />
                    <Link
                      to={`/entry/${entry.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="sort-entry-title"
                    >
                      {entry.title}
                    </Link>
                    {entry.visibility === 'dm' && <span className="badge badge-dm">DM only</span>}
                    {otherTags.map((t) => (
                      <span key={t} className="tag">
                        {tagLabel(tags, t)}
                      </span>
                    ))}
                    <select
                      className="sort-type-select"
                      value={type}
                      disabled={savingId === entry.id}
                      onChange={(e) => setType(entry, e.target.value)}
                      aria-label={`Type for ${entry.title}`}
                    >
                      <option value="">Type...</option>
                      {typeTags.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="danger sort-delete"
                      disabled={savingId === entry.id}
                      onClick={() => deleteEntry(entry)}
                      aria-label={`Delete ${entry.title}`}
                    >
                      Delete
                    </button>
                  </li>
                )
              })}
            </ul>
          </details>
        )
      })}
    </section>
  )
}
