import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useTags } from '../contexts/TagContext'
import { tagsByGroup, ungroupedTags } from '../lib/tags'

function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

// One row per tag group. Exclusive groups (Type) behave like radios —
// picking one clears the rest of that group — and multi groups toggle
// independently. Creating a tag happens inline, per group: having to leave a
// half-written entry to go define a tag in the DM dashboard is exactly the
// detour this overhaul exists to remove. The same goes for a whole new group,
// which is created together with its first tag (an empty group has nothing
// to show here, so it would otherwise vanish the moment it was made).
//
// "DM-only" on a new tag or group is the real visibility flag: every entry
// carrying it is hidden from players by RLS (is_tags_public), not just the
// tag's name.
const emptyGroupDraft = { label: '', firstTag: '', exclusive: false, dmOnly: false }

export default function TagGroupPicker({ value, onChange }) {
  const { tags, groups, reload } = useTags()
  const [creatingIn, setCreatingIn] = useState(null)
  const [draft, setDraft] = useState('')
  const [draftDmOnly, setDraftDmOnly] = useState(false)
  const [groupDraft, setGroupDraft] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const selected = new Set(value ?? [])
  const grouped = tagsByGroup(tags, groups)
  const loose = ungroupedTags(tags)

  function toggle(tag, group) {
    const next = new Set(selected)
    if (next.has(tag.value)) {
      next.delete(tag.value)
    } else {
      if (group?.exclusive) {
        for (const t of tags) {
          if (t.group_id === group.id) next.delete(t.value)
        }
      }
      next.add(tag.value)
    }
    onChange([...next])
  }

  async function createTag(group) {
    const label = draft.trim()
    if (!label) return
    setBusy(true)
    setError(null)

    const slug = slugify(label)
    const existing = tags.find((t) => t.value === slug)
    if (existing) {
      // Already defined — treat "create" as "select", rather than failing on
      // the unique constraint and making the DM go find out why.
      setBusy(false)
      setDraft('')
      setDraftDmOnly(false)
      setCreatingIn(null)
      if (!selected.has(existing.value)) toggle(existing, group)
      return
    }

    const { data, error: insertError } = await supabase
      .from('tags')
      .insert({
        value: slug,
        label,
        group_id: group?.id ?? null,
        sort_order: tags.filter((t) => t.group_id === group?.id).length,
        visibility: draftDmOnly ? 'dm' : 'public',
      })
      .select()
      .single()
    setBusy(false)

    if (insertError) {
      setError(insertError.message)
      return
    }
    setDraft('')
    setDraftDmOnly(false)
    setCreatingIn(null)
    await reload()
    toggle(data, group)
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

  function renderGroup(group, groupTags) {
    const key = group?.id ?? 'ungrouped'
    return (
      <div key={key} className="tag-group">
        <div className="tag-group-header">
          <span className="tag-group-label">
            {group?.label ?? 'Other'}
            {group?.required && <span className="tag-group-required"> *</span>}
          </span>
          {group?.exclusive && <span className="tag-group-hint">pick one</span>}
          {group?.visibility === 'dm' && <span className="badge badge-dm">DM only</span>}
        </div>

        <div className="tag-group-chips">
          {groupTags.map((t) => (
            <button
              key={t.value}
              type="button"
              className={selected.has(t.value) ? 'chip chip-tag active' : 'chip chip-tag'}
              style={t.color ? { '--chip-accent': t.color } : undefined}
              aria-pressed={selected.has(t.value)}
              onClick={() => toggle(t, group)}
              title={t.visibility === 'dm' ? 'DM-only: entries with this tag are hidden from players' : undefined}
            >
              {t.label}
              {t.visibility === 'dm' && <span className="tag-chip-dm"> (DM)</span>}
            </button>
          ))}

          {creatingIn === key ? (
            <span className="tag-group-create">
              <input
                autoFocus
                value={draft}
                placeholder={`New ${group?.label ?? 'tag'}...`}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    createTag(group)
                  }
                  if (e.key === 'Escape') {
                    setCreatingIn(null)
                    setDraft('')
                  }
                }}
              />
              {group?.visibility !== 'dm' && (
                <label className="tag-group-dm-toggle" title="Hides every entry carrying this tag from players">
                  <input type="checkbox" checked={draftDmOnly} onChange={(e) => setDraftDmOnly(e.target.checked)} />
                  DM-only
                </label>
              )}
              <button type="button" onClick={() => createTag(group)} disabled={busy}>
                Add
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setCreatingIn(null)
                  setDraft('')
                }}
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="chip chip-new"
              onClick={() => {
                setCreatingIn(key)
                setDraft('')
                setDraftDmOnly(false)
                setError(null)
              }}
            >
              + New
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="tag-group-picker">
      {grouped.map(({ group, tags: groupTags }) => renderGroup(group, groupTags))}
      {loose.length > 0 && renderGroup(null, loose)}
      {groupDraft ? (
        <div className="tag-group tag-group-new">
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
      )}
      {error && <p className="status-message error">{error}</p>}
    </div>
  )
}
