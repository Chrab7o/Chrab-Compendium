import { useCallback, useEffect, useRef, useState } from 'react'
import { DndContext, closestCenter } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, rectSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '../../lib/supabaseClient'
import { WIDGET_TYPES, widgetTypeInfo } from '../../lib/dmScreen'
import NpcNameGeneratorWidget from '../../components/dm/dmscreen/NpcNameGeneratorWidget'
import SessionFlowWidget from '../../components/dm/dmscreen/SessionFlowWidget'
import RemindersWidget from '../../components/dm/dmscreen/RemindersWidget'
import SessionWrapupWidget from '../../components/dm/dmscreen/SessionWrapupWidget'

const WIDGET_COMPONENTS = {
  npc_generator: NpcNameGeneratorWidget,
  session_flow: SessionFlowWidget,
  reminders: RemindersWidget,
  session_wrapup: SessionWrapupWidget,
}

// Widgets sit in a multi-column CSS grid (.world-card-grid), not a vertical
// list - rectSortingStrategy (rather than TagManager.jsx's
// verticalListSortingStrategy) is dnd-kit's own recommended strategy for
// grid layouts, so drag-over insertion points compute correctly across
// rows/columns.
function SortableWidgetCard({ id, title, onRemove, children }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  return (
    <div ref={setNodeRef} style={style} className="dm-panel dm-screen-widget-card">
      <div className="dm-screen-widget-header">
        <span className="drag-handle" {...listeners} {...attributes}>
          ⠿
        </span>
        <strong>{title}</strong>
        <button type="button" className="icon-button" title="Remove widget" aria-label="Remove widget" onClick={onRemove}>
          ✕
        </button>
      </div>
      {children}
    </div>
  )
}

const ACTIVE_SCREEN_STORAGE_KEY = 'chrab-corner-dm-screen-active-id'

export default function DMScreenPage() {
  const [screens, setScreens] = useState([])
  // Persisted so reloading the page (the natural way to check "did that
  // save?") doesn't always jump back to the first screen by sort_order,
  // hiding whichever screen you were actually working on.
  const [activeScreenId, setActiveScreenIdState] = useState(
    () => localStorage.getItem(ACTIVE_SCREEN_STORAGE_KEY) || null
  )
  const activeScreenIdRef = useRef(activeScreenId)
  const [widgets, setWidgets] = useState([])
  const [loadingScreens, setLoadingScreens] = useState(true)
  const [loadingWidgets, setLoadingWidgets] = useState(false)
  const [error, setError] = useState(null)
  const [newScreenName, setNewScreenName] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [addWidgetType, setAddWidgetType] = useState(WIDGET_TYPES[0].key)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  // Widget instances that expose flush() (currently Reminders and
  // Wrap-Up, whichever have debounced local edits) - keyed by widget id so
  // a stale ref from a removed widget can't linger.
  const widgetRefs = useRef({})

  function setActiveScreenId(id) {
    setActiveScreenIdState(id)
    if (id) localStorage.setItem(ACTIVE_SCREEN_STORAGE_KEY, id)
    else localStorage.removeItem(ACTIVE_SCREEN_STORAGE_KEY)
  }

  useEffect(() => {
    activeScreenIdRef.current = activeScreenId
  }, [activeScreenId])

  const loadScreens = useCallback(async () => {
    setLoadingScreens(true)
    const { data } = await supabase.from('dm_screens').select('*').order('sort_order')
    const loaded = data ?? []
    setScreens(loaded)
    // Keep the persisted selection if it still exists; a deleted/stale one
    // falls back to the first screen, same as the original no-selection case.
    const current = activeScreenIdRef.current
    const stillValid = current && loaded.some((s) => s.id === current)
    setActiveScreenId(stillValid ? current : (loaded[0]?.id ?? null))
    setLoadingScreens(false)
  }, [])

  useEffect(() => {
    loadScreens()
  }, [loadScreens])

  const loadWidgets = useCallback(async () => {
    if (!activeScreenId) {
      setWidgets([])
      return
    }
    setLoadingWidgets(true)
    const { data } = await supabase
      .from('dm_screen_widgets')
      .select('*')
      .eq('screen_id', activeScreenId)
      .order('sort_order')
    setWidgets(data ?? [])
    setLoadingWidgets(false)
  }, [activeScreenId])

  useEffect(() => {
    loadWidgets()
  }, [loadWidgets])

  async function handleCreateScreen(e) {
    e.preventDefault()
    if (!newScreenName.trim()) return
    const { data, error: insertError } = await supabase
      .from('dm_screens')
      .insert({ name: newScreenName.trim(), sort_order: screens.length })
      .select()
      .single()
    if (insertError) {
      setError(insertError.message)
      return
    }
    setNewScreenName('')
    setScreens((s) => [...s, data])
    setActiveScreenId(data.id)
  }

  function startRename() {
    const current = screens.find((s) => s.id === activeScreenId)
    setRenameValue(current?.name ?? '')
    setRenaming(true)
  }

  async function handleRename(e) {
    e.preventDefault()
    if (!renameValue.trim()) return
    const { error: updateError } = await supabase
      .from('dm_screens')
      .update({ name: renameValue.trim() })
      .eq('id', activeScreenId)
    if (updateError) {
      setError(updateError.message)
      return
    }
    setRenaming(false)
    loadScreens()
  }

  async function handleDeleteScreen() {
    if (!confirm('Delete this screen? This removes all of its widgets.')) return
    const { error: deleteError } = await supabase.from('dm_screens').delete().eq('id', activeScreenId)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    activeScreenIdRef.current = null
    setActiveScreenId(null)
    loadScreens()
  }

  async function handleAddWidget() {
    const type = widgetTypeInfo(addWidgetType)
    const { data, error: insertError } = await supabase
      .from('dm_screen_widgets')
      .insert({
        screen_id: activeScreenId,
        widget_type: addWidgetType,
        config: type?.defaultConfig ?? {},
        sort_order: widgets.length,
      })
      .select()
      .single()
    if (insertError) {
      setError(insertError.message)
      return
    }
    setWidgets((w) => [...w, data])
  }

  async function handleRemoveWidget(widgetId) {
    const { error: deleteError } = await supabase.from('dm_screen_widgets').delete().eq('id', widgetId)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    setWidgets((w) => w.filter((widget) => widget.id !== widgetId))
  }

  async function handleConfigChange(widgetId, newConfig) {
    setWidgets((w) => w.map((widget) => (widget.id === widgetId ? { ...widget, config: newConfig } : widget)))
    // .select() forces PostgREST to return the updated row(s) - without it,
    // an UPDATE that RLS silently filters down to 0 matching rows (e.g. a
    // stale/expiring session where is_dm() briefly doesn't hold) still
    // reports success with no error, and the change is lost even though
    // nothing looked wrong. Checking the returned rows is the only way to
    // tell "saved" apart from "matched nothing."
    const { data, error: updateError } = await supabase
      .from('dm_screen_widgets')
      .update({ config: newConfig })
      .eq('id', widgetId)
      .select()
    if (updateError) {
      setError(`Could not save: ${updateError.message}`)
    } else if (!data || data.length === 0) {
      setError('Could not save that change (no matching row was updated - try reloading and signing in again).')
    }
  }

  async function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = widgets.findIndex((w) => w.id === active.id)
    const newIndex = widgets.findIndex((w) => w.id === over.id)
    const reordered = arrayMove(widgets, oldIndex, newIndex)
    setWidgets(reordered)
    const results = await Promise.all(
      reordered.map((w, i) => supabase.from('dm_screen_widgets').update({ sort_order: i }).eq('id', w.id).select())
    )
    const failed = results.find((r) => r.error || !r.data || r.data.length === 0)
    if (failed) {
      setError(failed.error ? `Could not save the new order: ${failed.error.message}` : 'Could not save the new order (try reloading and signing in again).')
    }
  }

  // One page-level Save, rather than a save button on every widget - flushes
  // any pending debounced edit (Reminders notes, Wrap-Up text) across every
  // mounted widget on this screen at once. Widgets that don't need it
  // (NPC Generator, Session Flow) just don't expose flush(), so the
  // optional chaining below quietly skips them.
  async function handleSaveView() {
    setSaving(true)
    await Promise.all(Object.values(widgetRefs.current).map((instance) => instance?.flush?.()))
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  if (loadingScreens) return <p className="status-message">Loading...</p>

  const activeScreen = screens.find((s) => s.id === activeScreenId) ?? null

  return (
    <section className="page-wide">
      <div className="view-header">
        <h1>DM Screen</h1>
      </div>

      {error && <p className="status-message error">{error}</p>}

      <nav className="dm-screen-tabs">
        {screens.map((s) => (
          <button
            key={s.id}
            type="button"
            className={s.id === activeScreenId ? 'active' : ''}
            onClick={() => {
              setActiveScreenId(s.id)
              setRenaming(false)
            }}
          >
            {s.name}
          </button>
        ))}
      </nav>

      <form onSubmit={handleCreateScreen} className="dm-form dm-form-row">
        <label>
          New screen
          <input
            value={newScreenName}
            onChange={(e) => setNewScreenName(e.target.value)}
            placeholder="e.g. Combat"
          />
        </label>
        <button type="submit">+ Add screen</button>
      </form>

      {activeScreen && (
        <>
          <div className="dm-form-actions">
            {renaming ? (
              <form onSubmit={handleRename} className="dm-form-row">
                <input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus />
                <button type="submit">Save</button>
                <button type="button" className="secondary" onClick={() => setRenaming(false)}>
                  Cancel
                </button>
              </form>
            ) : (
              <>
                <button type="button" onClick={handleSaveView} disabled={saving}>
                  {saving ? 'Saving...' : 'Save'}
                </button>
                {saved && <span className="save-confirmation">Saved</span>}
                <button type="button" className="secondary" onClick={startRename}>
                  Rename screen
                </button>
                <button type="button" className="danger" onClick={handleDeleteScreen}>
                  Delete screen
                </button>
              </>
            )}
          </div>

          <div className="dm-form-actions">
            <select value={addWidgetType} onChange={(e) => setAddWidgetType(e.target.value)}>
              {WIDGET_TYPES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
            <button type="button" onClick={handleAddWidget}>
              + Add widget
            </button>
          </div>

          {loadingWidgets ? (
            <p className="status-message">Loading...</p>
          ) : widgets.length === 0 ? (
            <p className="status-message">No widgets on this screen yet.</p>
          ) : (
            <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={widgets.map((w) => w.id)} strategy={rectSortingStrategy}>
                <div className="world-card-grid dm-screen-widget-grid">
                  {widgets.map((widget) => {
                    const Widget = WIDGET_COMPONENTS[widget.widget_type]
                    return (
                      <SortableWidgetCard
                        key={widget.id}
                        id={widget.id}
                        title={widgetTypeInfo(widget.widget_type)?.label ?? widget.widget_type}
                        onRemove={() => handleRemoveWidget(widget.id)}
                      >
                        <Widget
                          ref={(instance) => {
                            if (instance) widgetRefs.current[widget.id] = instance
                            else delete widgetRefs.current[widget.id]
                          }}
                          config={widget.config}
                          onConfigChange={(newConfig) => handleConfigChange(widget.id, newConfig)}
                        />
                      </SortableWidgetCard>
                    )
                  })}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </>
      )}

      {!activeScreen && screens.length === 0 && (
        <p className="status-message">No screens yet — add one above.</p>
      )}
    </section>
  )
}
