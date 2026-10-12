import { useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useTags } from '../contexts/TagContext'

function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

const MAX_SUGGESTIONS = 10

// Tag picking as a search box: the chosen tags sit above it as removable
// chips, and typing suggests matching tags from every group. Listing every
// tag as a chip stopped scaling once the folder conversion left dozens of
// Collection tags behind.
//
// Group rules still apply - picking a tag from an exclusive group (Type)
// replaces the one already chosen there. A required group with nothing picked
// is called out under the box only where it is actually enforced (the entry
// editor, which refuses to save without it); pass showRequired={false}
// elsewhere, e.g. the Sphere Grid, where a sphere's kind does that job.
//
// Creating happens inline, so a half-written entry never has to be abandoned
// to go define a tag: the last suggestion is always "Create ...", and a whole
// new group is created together with its first tag (an empty group would
// have nothing to show). "DM-only" on either is the real visibility flag:
// every entry carrying it is hidden from players by RLS (is_tags_public), not
// just the tag's name.
const emptyGroupDraft = { label: '', firstTag: '', exclusive: false, dmOnly: false }

export default function TagGroupPicker({ value, onChange, showRequired = true }) {
  const { tags, groups, reload } = useTags()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [creating, setCreating] = useState(null) // { label, groupId, dmOnly }
  const [groupDraft, setGroupDraft] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const inputRef = useRef(null)

  const selected = new Set(value ?? [])
  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups])
  const groupOrder = (t) => groupById.get(t.group_id)?.sort_order ?? Infinity

  const chosen = (value ?? [])
    .map((v) => tags.find((t) => t.value === v) ?? { value: v, label: v, group_id: null })
    .sort((a, b) => groupOrder(a) - groupOrder(b) || a.label.localeCompare(b.label))

  const missingRequired = groups.filter((g) => g.required && !chosen.some((t) => t.group_id === g.id))

  const q = query.trim().toLowerCase()
  const matches = q
    ? tags
        .filter((t) => !selected.has(t.value) && t.label.toLowerCase().includes(q))
        .sort((a, b) => {
          const aStarts = a.label.toLowerCase().startsWith(q)
          const bStarts = b.label.toLowerCase().startsWith(q)
          return Number(bStarts) - Number(aStarts) || a.label.localeCompare(b.label)
        })
        .slice(0, MAX_SUGGESTIONS)
    : []

  const exact = q && tags.some((t) => t.label.toLowerCase() === q)
  const options = [
    ...matches.map((tag) => ({ kind: 'tag', tag })),
    ...(q && !exact ? [{ kind: 'create', label: query.trim() }] : []),
  ]

  function select(tag) {
    const next = new Set(selected)
    const group = groupById.get(tag.group_id)
    if (group?.exclusive) {
      for (const t of tags) if (t.group_id === group.id) next.delete(t.value)
    }
    next.add(tag.value)
    onChange([...next])
  }

  function remove(tagValue) {
    onChange((value ?? []).filter((v) => v !== tagValue))
  }

  function choose(option) {
    if (!option) return
    setError(null)
    if (option.kind === 'tag') {
      select(option.tag)
      setQuery('')
      setActive(0)
    } else {
      setCreating({ label: option.label, groupId: '', dmOnly: false })
      setOpen(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive((i) => Math.min(i + 1, options.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      if (!q) return
      e.preventDefault()
      choose(options[active])
    } else if (e.key === 'Escape') {
      setOpen(false)
    } else if (e.key === 'Backspace' && !query && chosen.length) {
      remove(chosen[chosen.length - 1].value)
    }
  }

  async function createTag() {
    const label = creating.label.trim()
    if (!label) return
    const groupId = creating.groupId || null
    const slug = slugify(label)
    const existing = tags.find((t) => t.value === slug)
    if (existing) {
      // Already defined under that slug - treat "create" as "select", rather
      // than failing on the unique constraint.
      select(existing)
      setCreating(null)
      setQuery('')
      return
    }
    setBusy(true)
    setError(null)
    const { data, error: insertError } = await supabase
      .from('tags')
      .insert({
        value: slug,
        label,
        group_id: groupId,
        sort_order: tags.filter((t) => t.group_id === groupId).length,
        visibility: creating.dmOnly ? 'dm' : 'public',
      })
      .select()
      .single()
    setBusy(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    setCreating(null)
    setQuery('')
    await reload()
    select(data)
    inputRef.current?.focus()
  }

  async function createGroup() {
    const label = groupDraft.label.trim()
    const tagLabel = groupDraft.firstTag.trim()
    if (!label || !tagLabel) return
    const groupSlug = slugify(label)
    const tagSlug = slugify(tagLabel)
    if (groups.some((g) => g.value === groupSlug)) {
      setError(`There is already a "${label}" group.`)
      return
    }
    if (tags.some((t) => t.value === tagSlug)) {
      setError(`A tag called "${tagLabel}" already exists in another group.`)
      return
    }
    setBusy(true)
    setError(null)
    const visibility = groupDraft.dmOnly ? 'dm' : 'public'
    const { data: group, error: groupError } = await supabase
      .from('tag_groups')
      .insert({ value: groupSlug, label, exclusive: groupDraft.exclusive, visibility, sort_order: groups.length })
      .select()
      .single()
    if (groupError) {
      setBusy(false)
      setError(groupError.message)
      return
    }
    const { data: tag, error: tagError } = await supabase
      .from('tags')
      .insert({ value: tagSlug, label: tagLabel, group_id: group.id, sort_order: 0 })
      .select()
      .single()
    setBusy(false)
    if (tagError) {
      setError(tagError.message)
      await reload()
      return
    }
    setGroupDraft(null)
    await reload()
    onChange([...selected, tag.value])
  }

  const createGroupIsDm = creating && groupById.get(creating.groupId)?.visibility === 'dm'

  return (
    <div className="tag-group-picker tag-picker">
      {chosen.length > 0 && (
        <div className="tag-picker-chosen">
          {chosen.map((t) => {
            const group = groupById.get(t.group_id)
            return (
              <span
                key={t.value}
                className="tag-picker-chip"
                style={t.color ? { '--chip-accent': t.color } : undefined}
                title={t.visibility === 'dm' ? 'DM-only: entries with this tag are hidden from players' : undefined}
              >
                {group && <span className="tag-picker-chip-group">{group.label}</span>}
                {t.label}
                {t.visibility === 'dm' && <span className="tag-chip-dm"> (DM)</span>}
                <button
                  type="button"
                  className="tag-picker-remove"
                  onClick={() => remove(t.value)}
                  aria-label={`Remove ${t.label}`}
                >
                  ×
                </button>
              </span>
            )
          })}
        </div>
      )}

      <div className="tag-picker-search">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
            setActive(0)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={handleKeyDown}
          placeholder={`Search ${tags.length} tags…`}
          aria-label="Search tags"
          role="combobox"
          aria-expanded={open && options.length > 0}
          aria-autocomplete="list"
        />
        {open && options.length > 0 && (
          <ul className="tag-picker-options" role="listbox">
            {options.map((option, i) => {
              const isActive = i === active
              if (option.kind === 'create') {
                return (
                  <li key="__create" role="option" aria-selected={isActive}>
                    <button
                      type="button"
                      className={`tag-picker-option is-create${isActive ? ' is-active' : ''}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => choose(option)}
                    >
                      + Create “{option.label}”
                    </button>
                  </li>
                )
              }
              const group = groupById.get(option.tag.group_id)
              return (
                <li key={option.tag.value} role="option" aria-selected={isActive}>
                  <button
                    type="button"
                    className={`tag-picker-option${isActive ? ' is-active' : ''}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => choose(option)}
                  >
                    <span>
                      {option.tag.label}
                      {option.tag.visibility === 'dm' && <span className="tag-chip-dm"> (DM)</span>}
                    </span>
                    <span className="tag-picker-option-group">
                      {group?.label ?? 'Other'}
                      {group?.exclusive ? ' · pick one' : ''}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {showRequired && missingRequired.length > 0 && (
        <p className="tag-picker-missing">Needs a {missingRequired.map((g) => g.label).join(' and a ')} tag.</p>
      )}

      {creating && (
        <div className="tag-group-new">
          <div className="tag-group-new-fields">
            <input
              autoFocus
              value={creating.label}
              onChange={(e) => setCreating({ ...creating, label: e.target.value })}
              aria-label="New tag name"
            />
            <select
              value={creating.groupId}
              onChange={(e) => setCreating({ ...creating, groupId: e.target.value })}
              aria-label="Group for the new tag"
            >
              <option value="">No group (Other)</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
          </div>
          <div className="tag-group-new-fields">
            {!createGroupIsDm && (
              <label className="tag-group-dm-toggle" title="Hides every entry carrying this tag from players">
                <input
                  type="checkbox"
                  checked={creating.dmOnly}
                  onChange={(e) => setCreating({ ...creating, dmOnly: e.target.checked })}
                />
                DM-only
              </label>
            )}
            <button type="button" onClick={createTag} disabled={busy || !creating.label.trim()}>
              Create tag
            </button>
            <button type="button" className="secondary" onClick={() => setCreating(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {groupDraft ? (
        <div className="tag-group-new">
          <div className="tag-group-header">
            <span className="tag-group-label">New group</span>
          </div>
          <div className="tag-group-new-fields">
            <input
              autoFocus
              value={groupDraft.label}
              onChange={(e) => setGroupDraft({ ...groupDraft, label: e.target.value })}
              placeholder="Group name, e.g. Plot Threads"
              aria-label="New group name"
            />
            <input
              value={groupDraft.firstTag}
              onChange={(e) => setGroupDraft({ ...groupDraft, firstTag: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  createGroup()
                }
              }}
              placeholder="Its first tag, e.g. Missing Heir"
              aria-label="First tag in the new group"
            />
          </div>
          <div className="tag-group-new-fields">
            <label className="tag-group-dm-toggle">
              <input
                type="checkbox"
                checked={groupDraft.exclusive}
                onChange={(e) => setGroupDraft({ ...groupDraft, exclusive: e.target.checked })}
              />
              Pick one only
            </label>
            <label className="tag-group-dm-toggle" title="Hides the group, its tags, and every entry tagged from it">
              <input
                type="checkbox"
                checked={groupDraft.dmOnly}
                onChange={(e) => setGroupDraft({ ...groupDraft, dmOnly: e.target.checked })}
              />
              DM-only
            </label>
            <button
              type="button"
              onClick={createGroup}
              disabled={busy || !groupDraft.label.trim() || !groupDraft.firstTag.trim()}
            >
              Create group
            </button>
            <button type="button" className="secondary" onClick={() => setGroupDraft(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        !creating && (
          <button
            type="button"
            className="chip chip-new tag-group-add"
            onClick={() => {
              setGroupDraft(emptyGroupDraft)
              setError(null)
            }}
          >
            + New group
          </button>
        )
      )}

      {error && <p className="status-message error">{error}</p>}
    </div>
  )
}
