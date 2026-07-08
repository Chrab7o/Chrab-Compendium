import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { DndContext, closestCenter } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { useCampaignContext } from '../contexts/CampaignContext'
import CategorySidebar from './CategorySidebar'
import EntryCard from './EntryCard'
import { entriesInFolder, topLevelEntries, folderPath, flattenFolders, mergePlacements } from '../lib/folders'
import { categoryLabel } from '../lib/categories'

// A record's stable identity for dnd-kit/React keys — an entry can appear
// more than once (its primary spot, plus any extra placements), so the raw
// entry id alone isn't unique within a single folder's listing.
function recordKey(record) {
  return record.__placementId ? `placement-${record.__placementId}` : `entry-${record.id}`
}

function SortableEntry({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  return (
    <div ref={setNodeRef} style={style} className="sortable-row">
      <span className="drag-handle" {...listeners} {...attributes}>
        ⠿
      </span>
      {children}
    </div>
  )
}

// The full category/folder/entry browser+organizer. `editable` gates all
// the organize tools (drag handles, +/rename/delete/move, add-entry) —
// General uses this in read-only mode even for the DM, since editing now
// lives exclusively on /dm/organize.
export default function CategoryBrowser({ compact = false, editable = true }) {
  const { isDM } = useAuth()
  const canEdit = isDM && editable
  const { campaignId } = useCampaignContext()
  const [folders, setFolders] = useState([])
  const [entries, setEntries] = useState([])
  const [placements, setPlacements] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState({ category: null, folderId: null })

  // Separate from the initial/campaign-switch load: mutation-triggered
  // refreshes (rename, move, reorder, ...) call this directly so they just
  // swap data in place instead of unmounting the whole tree behind a
  // blocking "Loading..." — that was making every click feel like a reload.
  const fetchData = useCallback(async () => {
    let folderQuery = supabase.from('folders').select('*')
    let entryQuery = supabase.from('entries').select('*')
    if (campaignId) {
      folderQuery = folderQuery.or(`campaign_id.eq.${campaignId},campaign_id.is.null`)
      entryQuery = entryQuery.or(`campaign_id.eq.${campaignId},campaign_id.is.null`)
    }
    const [{ data: folderData }, { data: entryData }, { data: placementData }] = await Promise.all([
      folderQuery,
      entryQuery,
      supabase.from('entry_placements').select('*'),
    ])
    setFolders(folderData ?? [])
    setEntries(entryData ?? [])
    setPlacements(placementData ?? [])
  }, [campaignId])

  useEffect(() => {
    setLoading(true)
    fetchData().then(() => setLoading(false))
  }, [fetchData])

  useEffect(() => {
    setSelected({ category: null, folderId: null })
  }, [campaignId])

  if (loading) return <p className="status-message">Loading...</p>

  const placedEntries = mergePlacements(entries, placements)
  const currentEntries = selected.folderId
    ? entriesInFolder(placedEntries, selected.folderId)
    : selected.category
      ? topLevelEntries(placedEntries, selected.category)
      : []

  const breadcrumb = selected.folderId ? folderPath(folders, selected.folderId) : []

  async function moveEntry(record, folderId) {
    if (record.__placementId) {
      await supabase.from('entry_placements').update({ folder_id: folderId || null }).eq('id', record.__placementId)
    } else {
      await supabase.from('entries').update({ folder_id: folderId || null }).eq('id', record.id)
    }
    fetchData()
  }

  async function handleEntryDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = currentEntries.findIndex((e) => recordKey(e) === active.id)
    const newIndex = currentEntries.findIndex((e) => recordKey(e) === over.id)
    const reordered = arrayMove(currentEntries, oldIndex, newIndex)
    await Promise.all(
      reordered.map((record, i) =>
        record.__placementId
          ? supabase.from('entry_placements').update({ sort_order: i }).eq('id', record.__placementId)
          : supabase.from('entries').update({ sort_order: i }).eq('id', record.id)
      )
    )
    fetchData()
  }

  return (
    <div className={compact ? 'browse-layout browse-layout-compact' : 'browse-layout'}>
      <CategorySidebar
        folders={folders}
        entries={placedEntries}
        isDM={canEdit}
        selected={selected}
        onSelect={(category, folderId) => setSelected({ category, folderId })}
        onChange={fetchData}
        campaignId={campaignId}
      />

      <div className="browse-content">
        {!selected.category ? (
          <p className="status-message">Pick a category from the sidebar to start browsing.</p>
        ) : (
          <>
            <nav className="breadcrumb">
              <button
                type="button"
                className="link-button"
                onClick={() => setSelected({ category: selected.category, folderId: null })}
              >
                {categoryLabel(selected.category)}
              </button>
              {breadcrumb.map((f) => (
                <span key={f.id}>
                  {' '}
                  /{' '}
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => setSelected({ category: selected.category, folderId: f.id })}
                  >
                    {f.name}
                  </button>
                </span>
              ))}
            </nav>

            {canEdit && (
              <div className="browser-toolbar">
                <Link
                  to={`/dm/entries/new?category=${selected.category}${selected.folderId ? `&folder=${selected.folderId}` : ''}`}
                  className="button-link"
                >
                  + New entry here
                </Link>
              </div>
            )}

            {currentEntries.length === 0 && <p className="status-message">Nothing here yet.</p>}

            {canEdit ? (
              <DndContext collisionDetection={closestCenter} onDragEnd={handleEntryDragEnd}>
                <SortableContext items={currentEntries.map(recordKey)} strategy={verticalListSortingStrategy}>
                  <div className="entry-grid">
                    {currentEntries.map((record) => (
                      <SortableEntry key={recordKey(record)} id={recordKey(record)}>
                        <div className="entry-with-move">
                          <EntryCard entry={record} />
                          {record.__placementId && <span className="badge badge-placement">also placed here</span>}
                          <select
                            className="entry-move-select"
                            value={record.folder_id ?? ''}
                            onChange={(e) => moveEntry(record, e.target.value)}
                            title="Move to folder"
                          >
                            <option value="">(top level of {categoryLabel(selected.category)})</option>
                            {flattenFolders(folders, selected.category).map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </SortableEntry>
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            ) : (
              <div className="entry-grid">
                {currentEntries.map((record) => (
                  <EntryCard key={recordKey(record)} entry={record} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
