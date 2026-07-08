import { useState } from 'react'
import { DndContext, closestCenter } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '../../lib/supabaseClient'
import { useCategories } from '../../contexts/CategoryContext'

const emptyForm = { id: null, value: '', label: '', visibility: 'public' }

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

export default function CategoryManager() {
  const { categories, reload } = useCategories()
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  function startEdit(category) {
    setForm(category)
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
        .from('categories')
        .update({ label: form.label, visibility: form.visibility })
        .eq('id', form.id)
      setSaving(false)
      if (updateError) {
        setError(updateError.message)
        return
      }
    } else {
      const { error: insertError } = await supabase.from('categories').insert({
        value: slugify(form.label),
        label: form.label,
        visibility: form.visibility,
        sort_order: categories.length,
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

  async function handleDelete(category) {
    if (!confirm(`Delete the "${category.label}" tab? Only possible if nothing uses it yet.`)) return
    const { error: deleteError } = await supabase.from('categories').delete().eq('id', category.id)
    if (deleteError) {
      setError(
        deleteError.code === '23503'
          ? `Can't delete "${category.label}" — some entries or folders still use it. Move or delete those first.`
          : deleteError.message
      )
      return
    }
    reload()
  }

  async function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = categories.findIndex((c) => c.id === active.id)
    const newIndex = categories.findIndex((c) => c.id === over.id)
    const reordered = arrayMove(categories, oldIndex, newIndex)
    await Promise.all(
      reordered.map((c, i) => supabase.from('categories').update({ sort_order: i }).eq('id', c.id))
    )
    reload()
  }

  return (
    <div className="dm-panel">
      <h2>Category Tabs</h2>
      <p className="view-subtitle">
        The top-level tabs in General's sidebar (World Lore, NPC, Location, etc.). Add as many as
        you want. A "DM only" tab — and everything filed under it — is completely hidden from
        anyone but you, no matter what an individual entry's own visibility says.
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
        {error && <p className="status-message error">{error}</p>}
        <div className="dm-form-actions">
          <button type="submit" disabled={saving}>
            {form.id ? 'Save changes' : 'Add category'}
          </button>
          {form.id && (
            <button type="button" className="secondary" onClick={resetForm}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={categories.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          <ul className="dm-list">
            {categories.map((c) => (
              <SortableRow key={c.id} id={c.id}>
                <span>{c.label}</span>
                <span className="dm-list-slug">{c.value}</span>
                {c.visibility === 'dm' && <span className="badge badge-dm">DM only</span>}
                <div className="dm-list-actions">
                  <button type="button" onClick={() => startEdit(c)}>
                    Edit
                  </button>
                  <button type="button" className="danger" onClick={() => handleDelete(c)}>
                    Delete
                  </button>
                </div>
              </SortableRow>
            ))}
            {categories.length === 0 && <li className="status-message">No categories yet.</li>}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  )
}
