import { useState } from 'react'
import { DndContext, closestCorners, PointerSensor, useDroppable, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '../lib/supabaseClient'
import { useCategories } from '../contexts/CategoryContext'
import { childFolders, foldersWithVisibleContent, descendantFolderIds } from '../lib/folders'

const CATEGORY_DROP_PREFIX = 'category:'

function FolderNode({ folder, depth, ctx }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: folder.id,
    disabled: !ctx.isDM,
  })
  const style = ctx.isDM ? { transform: CSS.Transform.toString(transform), transition } : undefined

  const allChildren = childFolders(
    ctx.folders.filter((f) => f.category === folder.category),
    folder.id
  )
  const children = ctx.isDM ? allChildren : allChildren.filter((f) => ctx.visibleFolderIds.has(f.id))
  const isExpanded = ctx.expanded.has(folder.id)
  const isSelected = ctx.selected.folderId === folder.id
  const [moving, setMoving] = useState(false)
  const [movingCategory, setMovingCategory] = useState(false)

  return (
    <div ref={setNodeRef} style={style}>
      <div className="tree-row" style={{ paddingLeft: `${depth}rem` }}>
        {ctx.isDM && (
          <span className="drag-handle" {...listeners} {...attributes}>
            ⠿
          </span>
        )}
        <button
          type="button"
          className="tree-toggle"
          onClick={() => ctx.toggle(folder.id)}
          disabled={children.length === 0}
        >
          {children.length > 0 ? (isExpanded ? '▾' : '▸') : '·'}
        </button>
        <button
          type="button"
          className={`tree-label${isSelected ? ' selected' : ''}`}
          onClick={() => ctx.onSelect(folder.category, folder.id)}
        >
          {folder.name}
        </button>
        {ctx.isDM && (
          <span className="tree-actions">
            <button type="button" title="New subfolder" onClick={() => ctx.createFolder(folder.category, folder.id)}>
              +
            </button>
            <button type="button" title="Rename" onClick={() => ctx.renameFolder(folder)}>
              ✎
            </button>
            <button type="button" title="Move" onClick={() => setMoving((v) => !v)}>
              ⇄
            </button>
            <button
              type="button"
              title="Move to a different category (brings its whole subtree and entries with it)"
              onClick={() => setMovingCategory((v) => !v)}
            >
              ⇒
            </button>
            <button type="button" title="Delete" className="danger" onClick={() => ctx.deleteFolder(folder)}>
              ✕
            </button>
          </span>
        )}
      </div>
      {moving && (
        <div className="tree-move" style={{ paddingLeft: `${depth + 1}rem` }}>
          <select
            defaultValue=""
            onChange={(e) => {
              ctx.moveFolder(folder, e.target.value === 'root' ? null : e.target.value)
              setMoving(false)
            }}
          >
            <option value="" disabled>
              Move to...
            </option>
            <option value="root">(top level of {folder.category})</option>
            {ctx.folders
              .filter(
                (f) =>
                  f.category === folder.category &&
                  f.id !== folder.id &&
                  !descendantFolderIds(ctx.folders, folder.id).has(f.id)
              )
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
          </select>
        </div>
      )}
      {movingCategory && (
        <div className="tree-move" style={{ paddingLeft: `${depth + 1}rem` }}>
          <select
            defaultValue=""
            onChange={(e) => {
              ctx.moveFolderToCategory(folder, e.target.value)
              setMovingCategory(false)
            }}
          >
            <option value="" disabled>
              Move "{folder.name}" (and its subfolders/entries) to category...
            </option>
            {ctx.categories
              .filter((c) => c.value !== folder.category)
              .map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
          </select>
        </div>
      )}
      {isExpanded && children.length > 0 && (
        <SortableContext items={children.map((f) => f.id)} strategy={verticalListSortingStrategy}>
          {children.map((child) => (
            <FolderNode key={child.id} folder={child} depth={depth + 1} ctx={ctx} />
          ))}
        </SortableContext>
      )}
    </div>
  )
}

// A droppable (not draggable) target so folders can be dragged back up to a
// category's top level, same as dropping one folder onto another nests it.
function CategoryRoot({ cat, ctx }) {
  const { setNodeRef, isOver } = useDroppable({ id: `${CATEGORY_DROP_PREFIX}${cat.value}` })
  const allTopFolders = childFolders(
    ctx.folders.filter((f) => f.category === cat.value),
    null
  )
  const topFolders = ctx.isDM ? allTopFolders : allTopFolders.filter((f) => ctx.visibleFolderIds.has(f.id))
  const isExpanded = ctx.expanded.has(cat.value)
  const isSelected = ctx.selected.category === cat.value && !ctx.selected.folderId

  return (
    <div>
      <div ref={setNodeRef} className={`tree-row${isOver ? ' drop-target' : ''}`}>
        <button
          type="button"
          className="tree-toggle"
          onClick={() => ctx.toggle(cat.value)}
          disabled={topFolders.length === 0}
        >
          {topFolders.length > 0 ? (isExpanded ? '▾' : '▸') : '·'}
        </button>
        <button
          type="button"
          className={`tree-label${isSelected ? ' selected' : ''}`}
          onClick={() => ctx.onSelect(cat.value, null)}
        >
          {cat.label}
        </button>
        {cat.visibility === 'dm' && <span className="badge badge-dm">DM</span>}
        {ctx.isDM && (
          <span className="tree-actions">
            <button type="button" title="New folder" onClick={() => ctx.createFolder(cat.value, null)}>
              +
            </button>
          </span>
        )}
      </div>
      {isExpanded && topFolders.length > 0 && (
        <SortableContext items={topFolders.map((f) => f.id)} strategy={verticalListSortingStrategy}>
          {topFolders.map((folder) => (
            <FolderNode key={folder.id} folder={folder} depth={1} ctx={ctx} />
          ))}
        </SortableContext>
      )}
    </div>
  )
}

export default function CategorySidebar({ folders, entries, isDM, selected, onSelect, onChange, campaignId }) {
  const { categories } = useCategories()
  const [expanded, setExpanded] = useState(new Set())
  // A small activation distance stops an ordinary click from being read as
  // a drag, and closestCorners (over closestCenter) resolves collisions
  // more predictably once folders nest at different nearby depths.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  function toggle(id) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function createFolder(category, parentId) {
    const name = prompt('Folder name:')
    if (!name) return
    const siblingCount = childFolders(
      folders.filter((f) => f.category === category),
      parentId
    ).length
    await supabase.from('folders').insert({
      name,
      category,
      parent_folder_id: parentId,
      campaign_id: campaignId || null,
      sort_order: siblingCount,
    })
    if (parentId) setExpanded((prev) => new Set(prev).add(parentId))
    else setExpanded((prev) => new Set(prev).add(category))
    onChange()
  }

  async function renameFolder(folder) {
    const name = prompt('Rename folder:', folder.name)
    if (!name) return
    await supabase.from('folders').update({ name }).eq('id', folder.id)
    onChange()
  }

  async function deleteFolder(folder) {
    if (!confirm(`Delete folder "${folder.name}"? Its contents move up to the parent folder.`)) return
    await supabase
      .from('folders')
      .update({ parent_folder_id: folder.parent_folder_id })
      .eq('parent_folder_id', folder.id)
    await supabase.from('entries').update({ folder_id: folder.parent_folder_id }).eq('folder_id', folder.id)
    await supabase.from('folders').delete().eq('id', folder.id)
    onChange()
  }

  async function moveFolder(folder, newParentId) {
    await supabase.from('folders').update({ parent_folder_id: newParentId }).eq('id', folder.id)
    onChange()
  }

  // Moves a folder AND its whole subtree to a new category/parent. Every
  // folder in the subtree and every entry (and placement) filed directly in
  // one of them gets its category updated too, or they'd vanish from both
  // the old and new category trees. Used by both the explicit ⇒ action and
  // by dragging a folder across categories.
  async function moveFolderToCategory(folder, newCategory, newParentId = null) {
    if (newCategory === folder.category && newParentId === (folder.parent_folder_id ?? null)) return
    const affectedFolderIds = [folder.id, ...descendantFolderIds(folders, folder.id)]
    const siblingCount = childFolders(
      folders.filter((f) => f.category === newCategory),
      newParentId
    ).length
    await supabase.from('folders').update({ category: newCategory }).in('id', affectedFolderIds)
    await supabase
      .from('folders')
      .update({ parent_folder_id: newParentId, sort_order: siblingCount })
      .eq('id', folder.id)
    await supabase.from('entries').update({ category: newCategory }).in('folder_id', affectedFolderIds)
    await supabase.from('entry_placements').update({ category: newCategory }).in('folder_id', affectedFolderIds)
    onChange()
  }

  async function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const activeFolder = folders.find((f) => f.id === active.id)
    if (!activeFolder) return

    // Dropped on a category root -> send to that category's top level
    // (cascades category + everything filed in the subtree, same as ⇒).
    if (typeof over.id === 'string' && over.id.startsWith(CATEGORY_DROP_PREFIX)) {
      const targetCategory = over.id.slice(CATEGORY_DROP_PREFIX.length)
      await moveFolderToCategory(activeFolder, targetCategory, null)
      return
    }

    const overFolder = folders.find((f) => f.id === over.id)
    if (!overFolder) return

    if (activeFolder.category === overFolder.category && activeFolder.parent_folder_id === overFolder.parent_folder_id) {
      // Same category, same parent — reorder among siblings.
      const siblings = childFolders(
        folders.filter((f) => f.category === activeFolder.category),
        activeFolder.parent_folder_id
      )
      const oldIndex = siblings.findIndex((f) => f.id === active.id)
      const newIndex = siblings.findIndex((f) => f.id === over.id)
      const reordered = arrayMove(siblings, oldIndex, newIndex)
      await Promise.all(reordered.map((f, i) => supabase.from('folders').update({ sort_order: i }).eq('id', f.id)))
      onChange()
      return
    }

    // Dropped onto a folder elsewhere — nest inside it, cascading category
    // if it's a different one. Never allowed into your own subtree.
    if (activeFolder.category === overFolder.category && descendantFolderIds(folders, activeFolder.id).has(overFolder.id)) {
      return
    }
    await moveFolderToCategory(activeFolder, overFolder.category, overFolder.id)
  }

  const visibleFolderIds = isDM ? null : foldersWithVisibleContent(folders, entries)
  const ctx = {
    folders,
    categories,
    isDM,
    expanded,
    toggle,
    selected,
    onSelect,
    createFolder,
    renameFolder,
    deleteFolder,
    moveFolder,
    moveFolderToCategory,
    visibleFolderIds,
  }

  return (
    <nav className="category-sidebar">
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
        {categories.map((cat) => (
          <CategoryRoot key={cat.value} cat={cat} ctx={ctx} />
        ))}
      </DndContext>
    </nav>
  )
}
