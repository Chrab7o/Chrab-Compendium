import { useState } from 'react'
import { DndContext, closestCenter } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '../../lib/supabaseClient'
import { useTags } from '../../contexts/TagContext'

const emptyForm = {
  id: null,
  label: '',
  exclusive: false,
  required: false,
  visibility: 'public',
  color: '#7c5cff',
}

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

export default function TagGroupManager() {
  const { tags, groups, reload } = useTags()
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  function startEdit(group) {
    setForm({ ...emptyForm, ...group })
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
      exclusive: form.exclusive,
      required: form.required,
      visibility: form.visibility,
      color: form.color,
    }

    const { error: saveError } = form.id
      ? await supabase.from('tag_groups').update(payload).eq('id', form.id)
      : await supabase.from('tag_groups').insert({
          ...payload,
          value: slugify(form.label),
          sort_order: groups.length,
        })

    setSaving(false)
    if (saveError) {
      setError(saveError.message)
      return
    }
    resetForm()
    reload()
  }

  async function handleDelete(group) {
    const count = tags.filter((t) => t.group_id === group.id).length
    if (
      !confirm(
        `Delete the "${group.label}" group? Its ${count} tag(s) stay on their entries but become ` +
          `ungrouped, showing under "Other" until you reassign them.`
      )
    )
      return
    const { error: deleteError } = await supabase.from('tag_groups').delete().eq('id', group.id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    reload()
  }

  async function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = groups.findIndex((g) => g.id === active.id)
    const newIndex = groups.findIndex((g) => g.id === over.id)
    const reordered = arrayMove(groups, oldIndex, newIndex)
    await Promise.all(
      reordered.map((g, i) => supabase.from('tag_groups').update({ sort_order: i }).eq('id', g.id))
    )
    reload()
  }

  return (
    <div className="dm-panel">
      <h2>Tag Groups</h2>
      <p className="view-subtitle">
        Groups are what folders used to be. Each one becomes its own filter row in search, and
        picking tags from two different groups narrows the results the way a folder path did —
        "Type: NPC" plus "Region: Ashfall" — except an entry can sit in as many groups as it
        likes. Order here is the order the filter rows appear in.
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
            Color
            <input
              type="color"
              value={form.color ?? '#7c5cff'}
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

        <div className="dm-form-row">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={form.exclusive}
              onChange={(e) => setForm({ ...form, exclusive: e.target.checked })}
            />
            Single-select — picking one tag clears the others in this group
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={form.required}
              onChange={(e) => setForm({ ...form, required: e.target.checked })}
            />
            Required — an entry can't be saved without a tag from this group
          </label>
        </div>

        {form.visibility === 'dm' && (
          <p className="status-message">
            Every entry carrying a tag from this group will be hidden from players, whatever that
            entry's own visibility says.
          </p>
        )}

        {error && <p className="status-message error">{error}</p>}
        <div className="dm-form-actions">
          <button type="submit" disabled={saving}>
            {form.id ? 'Save changes' : 'Add group'}
          </button>
          {form.id && (
            <button type="button" className="secondary" onClick={resetForm}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={groups.map((g) => g.id)} strategy={verticalListSortingStrategy}>
          <ul className="dm-list">
            {groups.map((g) => (
              <SortableRow key={g.id} id={g.id}>
                <span
                  className="tag-group-swatch"
                  style={g.color ? { background: g.color } : undefined}
                  aria-hidden="true"
                />
                <span>{g.label}</span>
                <span className="dm-list-slug">{g.value}</span>
                <span className="dm-list-meta">
                  {tags.filter((t) => t.group_id === g.id).length} tags
                  {g.exclusive && ' · single-select'}
                  {g.required && ' · required'}
                  {g.visibility === 'dm' && ' · DM only'}
                </span>
                <div className="dm-list-actions">
                  <button type="button" onClick={() => startEdit(g)}>
                    Edit
                  </button>
                  <button type="button" className="danger" onClick={() => handleDelete(g)}>
                    Delete
                  </button>
                </div>
              </SortableRow>
            ))}
            {groups.length === 0 && <li className="status-message">No groups yet.</li>}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  )
}
