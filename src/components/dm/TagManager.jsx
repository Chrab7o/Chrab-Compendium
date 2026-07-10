import { useState } from 'react'
import { DndContext, closestCenter } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '../../lib/supabaseClient'
import { useTags } from '../../contexts/TagContext'

const emptyForm = { id: null, value: '', label: '' }

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
  const { tags, reload } = useTags()
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  function startEdit(tag) {
    setForm(tag)
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

    if (form.id) {
      const { error: updateError } = await supabase
        .from('tags')
        .update({ label: form.label })
        .eq('id', form.id)
      setSaving(false)
      if (updateError) {
        setError(updateError.message)
        return
      }
    } else {
      const { error: insertError } = await supabase.from('tags').insert({
        value: slugify(form.label),
        label: form.label,
        sort_order: tags.length,
      })
      setSaving(false)
      if (insertError) {
        setError(insertError.message)
        return
      }
    }
    resetForm()
    reload()
  }

  async function handleDelete(tag) {
    if (!confirm(`Delete the "${tag.label}" tag? Entries keep the tag text, but it won't be selectable anymore.`))
      return
    const { error: deleteError } = await supabase.from('tags').delete().eq('id', tag.id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    reload()
  }

  async function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = tags.findIndex((t) => t.id === active.id)
    const newIndex = tags.findIndex((t) => t.id === over.id)
    const reordered = arrayMove(tags, oldIndex, newIndex)
    await Promise.all(reordered.map((t, i) => supabase.from('tags').update({ sort_order: i }).eq('id', t.id)))
    reload()
  }

  return (
    <div className="dm-panel">
      <h2>Tags</h2>
      <p className="view-subtitle">
        The checklist of tags available in the entry editor. Tagging an entry "Location",
        "Person", or "Session Note" also puts it on that nav page, campaign-scoped like
        everywhere else — regardless of which folder it lives in.
      </p>
      <form onSubmit={handleSubmit} className="dm-form">
        <label>
          Label
          <input
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            required
          />
        </label>
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

      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={tags.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <ul className="dm-list">
            {tags.map((t) => (
              <SortableRow key={t.id} id={t.id}>
                <span>{t.label}</span>
                <span className="dm-list-slug">{t.value}</span>
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
            {tags.length === 0 && <li className="status-message">No tags yet.</li>}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  )
}
