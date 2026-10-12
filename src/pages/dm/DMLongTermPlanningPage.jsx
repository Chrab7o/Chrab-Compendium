import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import RichTextEditor from '../../components/RichTextEditor'

// How long typing has to pause before a note autosaves.
const SAVE_DELAY = 800

const FOCUS_KEY = 'chrab.ltp.focus'
const readFocus = () => {
  try {
    return localStorage.getItem(FOCUS_KEY) === '1'
  } catch {
    return false
  }
}

const firstLine = (markdown) =>
  (markdown ?? '')
    .split(/\r?\n/)
    .map((l) => l.replace(/^[#>*\-\s]+/, '').trim())
    .find(Boolean) ?? ''

// A standing list of things to remember to do at some point in the campaign
// - the long-horizon counterpart to the Session Planner's beat-by-beat prep -
// and a place to brainstorm freely. Notes sit in a list on the left; the open
// one gets a full-height rich editor on the right that autosaves, and a focus
// mode hides the list entirely for long-form writing.
//
// Deliberately unlinked to campaigns or entries (see the migration): the
// whole value is that writing one down costs nothing - "+ New note" opens a
// blank one straight into the editor.
export default function DMLongTermPlanningPage() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [showDone, setShowDone] = useState(false)
  const [focus, setFocus] = useState(readFocus)

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from('long_term_plans')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })
    if (loadError) setError(loadError.message)
    setItems(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    try {
      localStorage.setItem(FOCUS_KEY, focus ? '1' : '0')
    } catch {
      /* private mode */
    }
  }, [focus])

  const open = items.filter((i) => !i.done)
  const done = items.filter((i) => i.done).sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
  const selected = items.find((i) => i.id === selectedId) ?? null

  async function handleNew() {
    setError(null)
    // New notes land at the top: the point of writing one down is seeing it
    // again, and the bottom of a long list is where things go to be missed.
    const topSort = open.length > 0 ? Math.min(...open.map((i) => i.sort_order)) - 1 : 0
    const { data, error: insertError } = await supabase
      .from('long_term_plans')
      .insert({ title: 'Untitled note', timing: '', details: '', sort_order: topSort })
      .select()
      .single()
    if (insertError) {
      setError(insertError.message)
      return
    }
    setItems((rows) => [data, ...rows])
    setSelectedId(data.id)
  }

  // Optimistic: the editor is the source of truth while open, so the list
  // updates immediately and the write follows.
  const patch = useCallback(async (id, changes) => {
    setItems((rows) => rows.map((r) => (r.id === id ? { ...r, ...changes } : r)))
    const { error: updateError } = await supabase.from('long_term_plans').update(changes).eq('id', id)
    if (updateError) setError(updateError.message)
  }, [])

  async function handleDelete(id) {
    if (!confirm('Delete this note?')) return
    const { error: deleteError } = await supabase.from('long_term_plans').delete().eq('id', id)
    if (deleteError) setError(deleteError.message)
    else {
      if (selectedId === id) setSelectedId(null)
      load()
    }
  }

  async function handleClearDone() {
    if (!confirm(`Delete all ${done.length} finished notes?`)) return
    const { error: deleteError } = await supabase
      .from('long_term_plans')
      .delete()
      .in('id', done.map((i) => i.id))
    if (deleteError) setError(deleteError.message)
    else {
      if (done.some((i) => i.id === selectedId)) setSelectedId(null)
      load()
    }
  }

  // Reordering swaps the two rows' sort_order values rather than renumbering
  // the whole list, so a move is two updates no matter how long the list is.
  async function move(index, direction) {
    const target = index + direction
    if (target < 0 || target >= open.length) return
    const a = open[index]
    const b = open[target]
    const aSort = a.sort_order
    const bSort = b.sort_order
    setError(null)
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from('long_term_plans').update({ sort_order: bSort }).eq('id', a.id),
      supabase.from('long_term_plans').update({ sort_order: aSort }).eq('id', b.id),
    ])
    if (e1 || e2) setError((e1 ?? e2).message)
    // Equal sort_order values (everything added before this page had
    // ordering, say) make a swap a no-op - renumber once so the next move
    // has distinct values to trade.
    else if (aSort === bSort) await renumber()
    load()
  }

  async function renumber() {
    await Promise.all(
      open.map((item, i) => supabase.from('long_term_plans').update({ sort_order: i }).eq('id', item.id))
    )
  }

  if (loading) return <p className="status-message">Loading...</p>

  return (
    <section className={`page-wide ltp-page${focus ? ' is-focus' : ''}`}>
      <div className="view-header">
        <h1>Long-Term Planning</h1>
        {!focus && (
          <p className="view-subtitle">
            Things to remember to do at some point, and room to brainstorm the big picture. Session-by-session prep
            lives in the Session Planner; this is everything with no date on it yet.
          </p>
        )}
      </div>

      {error && <p className="status-message error">{error}</p>}

      <div className="ltp-layout">
        {!focus && (
          <aside className="ltp-sidebar">
            <button type="button" className="ltp-new" onClick={handleNew}>
              + New note
            </button>

            <ul className="ltp-index">
              {open.map((item, i) => (
                <li key={item.id} className={item.id === selectedId ? 'is-selected' : ''}>
                  <input
                    type="checkbox"
                    checked={false}
                    onChange={() => patch(item.id, { done: true })}
                    aria-label={`Mark "${item.title}" done`}
                    title="Mark done"
                  />
                  <button type="button" className="ltp-index-open" onClick={() => setSelectedId(item.id)}>
                    <span className="ltp-index-title">{item.title}</span>
                    {item.timing && <span className="ltp-when">{item.timing}</span>}
                    {firstLine(item.details) && <span className="ltp-index-preview">{firstLine(item.details)}</span>}
                  </button>
                  <div className="ltp-index-move">
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      aria-label="Move up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => move(i, 1)}
                      disabled={i === open.length - 1}
                      aria-label="Move down"
                    >
                      ↓
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {open.length === 0 && <p className="status-message">Nothing on the list yet.</p>}

            {done.length > 0 && (
              <div className="ltp-done">
                <div className="ltp-done-header">
                  <button type="button" className="secondary" onClick={() => setShowDone((v) => !v)}>
                    {showDone ? 'Hide' : 'Show'} done ({done.length})
                  </button>
                  {showDone && (
                    <button type="button" className="danger" onClick={handleClearDone}>
                      Delete all done
                    </button>
                  )}
                </div>
                {showDone && (
                  <ul className="ltp-index is-done">
                    {done.map((item) => (
                      <li key={item.id} className={item.id === selectedId ? 'is-selected' : ''}>
                        <input
                          type="checkbox"
                          checked
                          onChange={() => patch(item.id, { done: false })}
                          aria-label={`Reopen "${item.title}"`}
                          title="Reopen"
                        />
                        <button type="button" className="ltp-index-open" onClick={() => setSelectedId(item.id)}>
                          <span className="ltp-index-title">{item.title}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </aside>
        )}

        <div className="ltp-editor-pane">
          {selected ? (
            <PlanEditor
              key={selected.id}
              item={selected}
              focus={focus}
              onToggleFocus={() => setFocus((v) => !v)}
              onPatch={(changes) => patch(selected.id, changes)}
              onDelete={() => handleDelete(selected.id)}
              onClose={() => setSelectedId(null)}
            />
          ) : (
            <div className="ltp-empty">
              <p>Pick a note from the list, or start a new one.</p>
              <button type="button" onClick={handleNew}>
                + New note
              </button>
              {focus && (
                <button type="button" className="secondary" onClick={() => setFocus(false)}>
                  Show the list
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

// The open note. Keyed by id, so switching notes remounts it with fresh
// drafts. The text autosaves after a pause and on switching away; title and
// timing save on blur.
function PlanEditor({ item, focus, onToggleFocus, onPatch, onDelete, onClose }) {
  const [title, setTitle] = useState(item.title)
  const [timing, setTiming] = useState(item.timing)
  const [saveState, setSaveState] = useState('saved')
  const pending = useRef(null)
  const timer = useRef(null)
  const onPatchRef = useRef(onPatch)
  onPatchRef.current = onPatch

  function flush() {
    clearTimeout(timer.current)
    if (pending.current === null) return
    const details = pending.current
    pending.current = null
    Promise.resolve(onPatchRef.current({ details })).then(() => setSaveState((s) => (s === 'saving' ? 'saved' : s)))
  }

  // Save anything still pending when the note closes or another opens.
  useEffect(() => () => flush(), [])

  function handleDetails(markdown) {
    pending.current = markdown
    setSaveState('saving')
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, SAVE_DELAY)
  }

  function saveTitle() {
    const next = title.trim()
    if (!next) {
      setTitle(item.title)
      return
    }
    if (next !== item.title) onPatch({ title: next })
  }

  function saveTiming() {
    const next = timing.trim()
    if (next !== item.timing) onPatch({ timing: next })
  }

  return (
    <div className="ltp-editor">
      <div className="ltp-editor-head">
        <input
          className="ltp-editor-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onFocus={(e) => item.title === 'Untitled note' && e.target.select()}
          aria-label="Title"
        />
        <span className={`sg-save-state is-${saveState}`}>{saveState === 'saving' ? 'Saving…' : 'Saved'}</span>
        <div className="ltp-editor-actions">
          <button type="button" className="secondary" onClick={onToggleFocus} aria-pressed={focus}>
            {focus ? 'Show list' : 'Focus'}
          </button>
          <button type="button" className="danger" onClick={onDelete}>
            Delete
          </button>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close" title="Close">
            ×
          </button>
        </div>
      </div>
      <label className="ltp-editor-when">
        When
        <input
          value={timing}
          onChange={(e) => setTiming(e.target.value)}
          onBlur={saveTiming}
          placeholder="optional - e.g. next session, once they hit level 5, before the wedding arc"
        />
      </label>
      <div className="ltp-editor-body">
        <RichTextEditor content={item.details ?? ''} onChange={handleDetails} />
      </div>
    </div>
  )
}
