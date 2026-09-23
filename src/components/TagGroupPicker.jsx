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
// detour this overhaul exists to remove.
export default function TagGroupPicker({ value, onChange }) {
  const { tags, groups, reload } = useTags()
  const [creatingIn, setCreatingIn] = useState(null)
  const [draft, setDraft] = useState('')
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
      })
      .select()
      .single()
    setBusy(false)

    if (insertError) {
      setError(insertError.message)
      return
    }
    setDraft('')
    setCreatingIn(null)
    await reload()
    toggle(data, group)
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
            >
              {t.label}
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
      {grouped.length === 0 && loose.length === 0 && (
        <p className="status-message">No tags yet — add some from DM Dashboard → Tags.</p>
      )}
      {error && <p className="status-message error">{error}</p>}
    </div>
  )
}
