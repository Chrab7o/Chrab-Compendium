import { useState } from 'react'
import { DndContext, closestCenter } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '../../lib/supabaseClient'
import { useTags } from '../../contexts/TagContext'
import { tagsByGroup, ungroupedTags } from '../../lib/tags'

const emptyForm = { id: null, value: '', label: '', group_id: '', visibility: 'public', color: '' }

function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function SortableRow({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  return (
    <li ref={setNodeRef} style={style}>
      <span className="drag-handle" {...listeners} {...attributes}>
        ⠿
      </span>
      {children}
    </li>
  )
}

export default function TagManager() {
  const { tags, groups, reload } = useTags()
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  function startEdit(tag) {
    setForm({ ...emptyForm, ...tag, group_id: tag.group_id ?? '', color: tag.color ?? '' })
    setError(null)
  }

  function resetForm() {
    setForm(emptyForm)
    setError(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const payload = {
      label: form.label,
      group_id: form.group_id || null,
      visibility: form.visibility,
      color: form.color || null,
    }

    const { error: saveError } = form.id
      ? await supabase.from('tags').update(payload).eq('id', form.id)
      : await supabase.from('tags').insert({
          ...payload,
          value: slugify(form.label),
          sort_order: tags.filter((t) => t.group_id === (form.group_id || null)).length,
        })

    setSaving(false)
    if (saveError) {
      setError(saveError.message)
      return
    }
    resetForm()
    reload()
  }

  async function handleDelete(tag) {
    if (
      !confirm(
        `Delete the "${tag.label}" tag? Entries keep the tag text, but it won't be selectable ` +
          `anymore and won't show as a filter.`
      )
    )
      return
    const { error: deleteError } = await supabase.from('tags').delete().eq('id', tag.id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    reload()
  }

  // Reordering is scoped to one group at a time — sort_order is only ever
  // compared within a group, so a cross-group drag has no meaning.
  async function handleDragEnd(groupTags, event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = groupTags.findIndex((t) => t.id === active.id)
    const newIndex = groupTags.findIndex((t) => t.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const reordered = arrayMove(groupTags, oldIndex, newIndex)
    await Promise.all(
      reordered.map((t, i) => supabase.from('tags').update({ sort_order: i }).eq('id', t.id))
    )
    reload()
  }

  const grouped = tagsByGroup(tags, groups)
  const loose = ungroupedTags(tags)

  function renderList(key, groupTags) {
    return (
      <DndContext
        key={key}
        collisionDetection={closestCenter}
        onDragEnd={(e) => handleDragEnd(groupTags, e)}
      >
        <SortableContext items={groupTags.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <ul className="dm-list">
            {groupTags.map((t) => (
              <SortableRow key={t.id} id={t.id}>
                <span
                  className="tag-group-swatch"
                  style={t.color ? { background: t.color } : undefined}
                  aria-hidden="true"
                />
                <span>{t.label}</span>
                <span className="dm-list-slug">{t.value}</span>
                {t.visibility === 'dm' && <span className="badge badge-dm">DM only</span>}
                <div className="dm-list-actions">
                  <button type="button" onClick={() => startEdit(t)}>
                    Edit
                  </button>
                  <button type="button" className="danger" onClick={() => handleDelete(t)}>
                    Delete
                  </button>
                </div>
              </SortableRow>
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    )
  }

  return (
    <div className="dm-panel">
      <h2>Tags</h2>
      <p className="view-subtitle">
        The whole vocabulary entries are organized by. Tagging an entry is how it gets found —
        there are no folders, so a tag is the only thing that puts an entry on a nav page, in a
        search filter, or inside a map region. Most tagging happens straight from the entry
        editor; this page is for renaming, recoloring, regrouping, and hiding.
      </p>

      <form onSubmit={handleSubmit} className="dm-form">
        <div className="dm-form-row">
          <label>
            Label
            <input
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              required
            />
          </label>
          <label>
            Group
            <select
              value={form.group_id}
              onChange={(e) => setForm({ ...form, group_id: e.target.value })}
            >
              <option value="">(no group)</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Color
            <input
              type="color"
              value={form.color || '#7c5cff'}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
            />
          </label>
          <label>
            Visibility
            <select
              value={form.visibility}
              onChange={(e) => setForm({ ...form, visibility: e.target.value })}
            >
              <option value="public">Public</option>
              <option value="dm">DM only</option>
            </select>
          </label>
        </div>

        {form.visibility === 'dm' && (
          <p className="status-message">
            Every entry carrying this tag will be hidden from players, whatever that entry's own
            visibility says — this is the one-toggle-hides-many that DM-only folders used to do.
          </p>
        )}

        {error && <p className="status-message error">{error}</p>}
        <div className="dm-form-actions">
          <button type="submit" disabled={saving}>
            {form.id ? 'Save changes' : 'Add tag'}
          </button>
          {form.id && (
            <button type="button" className="secondary" onClick={resetForm}>
              Cancel
            </button>
          )}
        </div>
      </form>

      {grouped.map(({ group, tags: groupTags }) => (
        <section key={group.id} className="tag-manager-group">
          <h3>
            {group.label}
            {group.exclusive && <span className="dm-list-meta"> single-select</span>}
            {group.required && <span className="dm-list-meta"> required</span>}
          </h3>
          {renderList(group.id, groupTags)}
        </section>
      ))}

      {loose.length > 0 && (
        <section className="tag-manager-group">
          <h3>
            Other <span className="dm-list-meta">no group — won't appear as a filter row</span>
          </h3>
          {renderList('ungrouped', loose)}
        </section>
      )}

      {tags.length === 0 && <p className="status-message">No tags yet.</p>}
    </div>
  )
}
