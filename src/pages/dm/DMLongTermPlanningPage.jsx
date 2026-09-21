import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

const emptyDraft = { title: '', timing: '', details: '' }

// A standing list of things to remember to do at some point in the campaign
// - the long-horizon counterpart to the Session Planner's beat-by-beat prep.
// Deliberately unlinked to campaigns or entries (see the migration): the
// whole value is that writing one down costs nothing.
export default function DMLongTermPlanningPage() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [draft, setDraft] = useState(emptyDraft)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState(emptyDraft)
  const [showDone, setShowDone] = useState(false)

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

  const open = items.filter((i) => !i.done)
  const done = items.filter((i) => i.done).sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))

  async function handleAdd(e) {
    e.preventDefault()
    if (!draft.title.trim()) return
    setSaving(true)
    setError(null)
    // New notes land at the top: the point of writing one down is seeing it
    // again, and the bottom of a long list is where things go to be missed.
    const topSort = open.length > 0 ? Math.min(...open.map((i) => i.sort_order)) - 1 : 0
    const { error: insertError } = await supabase.from('long_term_plans').insert({
      title: draft.title.trim(),
      timing: draft.timing.trim(),
      details: draft.details.trim(),
      sort_order: topSort,
    })
    setSaving(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    setDraft(emptyDraft)
    load()
  }

  async function patch(id, changes) {
    setError(null)
    const { error: updateError } = await supabase.from('long_term_plans').update(changes).eq('id', id)
    if (updateError) setError(updateError.message)
    else load()
  }

  async function handleDelete(id) {
    if (!confirm('Delete this note?')) return
    const { error: deleteError } = await supabase.from('long_term_plans').delete().eq('id', id)
    if (deleteError) setError(deleteError.message)
    else load()
  }

  async function handleClearDone() {
    if (!confirm(`Delete all ${done.length} finished notes?`)) return
    const { error: deleteError } = await supabase
      .from('long_term_plans')
      .delete()
      .in('id', done.map((i) => i.id))
    if (deleteError) setError(deleteError.message)
    else load()
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

  function startEdit(item) {
    setEditingId(item.id)
    setEditDraft({ title: item.title, timing: item.timing, details: item.details })
  }

  async function saveEdit(id) {
    if (!editDraft.title.trim()) return
    await patch(id, {
      title: editDraft.title.trim(),
      timing: editDraft.timing.trim(),
      details: editDraft.details.trim(),
    })
    setEditingId(null)
  }

  if (loading) return <p className="status-message">Loading...</p>

  return (
    <section className="page">
      <div className="view-header">
        <h1>Long-Term Planning</h1>
        <p className="view-subtitle">
          Things to remember to do at some point — the payoff you planted three sessions ago, the NPC who still owes
          the party a favor, the rule you keep meaning to change. Session-by-session prep lives in the Session
          Planner; this is everything with no date on it yet.
        </p>
      </div>

      <div className="dm-panel">
        <h2>Add a note</h2>
        <form onSubmit={handleAdd} className="dm-form">
          <div className="dm-form-row">
            <label>
              What do you want to remember?
              <input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="e.g. Have the innkeeper recognize Mani"
                required
              />
            </label>
            <label>
              When (optional)
              <input
                value={draft.timing}
                onChange={(e) => setDraft({ ...draft, timing: e.target.value })}
                placeholder="e.g. next session, once they hit level 5"
              />
            </label>
          </div>
          <label>
            Details (optional)
            <textarea
              rows={3}
              value={draft.details}
              onChange={(e) => setDraft({ ...draft, details: e.target.value })}
            />
          </label>
          <div className="dm-form-actions">
            <button type="submit" disabled={saving || !draft.title.trim()}>
              {saving ? 'Adding...' : '+ Add note'}
            </button>
          </div>
        </form>
      </div>

      {error && <p className="status-message error">{error}</p>}

      <div className="ltp-list">
        {open.map((item, i) => (
          <article key={item.id} className="ltp-item">
            {editingId === item.id ? (
              <div className="dm-form ltp-edit">
                <div className="dm-form-row">
                  <label>
                    What do you want to remember?
                    <input
                      value={editDraft.title}
                      onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value })}
                      autoFocus
                    />
                  </label>
                  <label>
                    When
                    <input
                      value={editDraft.timing}
                      onChange={(e) => setEditDraft({ ...editDraft, timing: e.target.value })}
                    />
                  </label>
                </div>
                <label>
                  Details
                  <textarea
                    rows={3}
                    value={editDraft.details}
                    onChange={(e) => setEditDraft({ ...editDraft, details: e.target.value })}
                  />
                </label>
                <div className="dm-form-actions">
                  <button type="button" onClick={() => saveEdit(item.id)} disabled={!editDraft.title.trim()}>
                    Save
                  </button>
                  <button type="button" className="secondary" onClick={() => setEditingId(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <label className="ltp-check">
                  <input type="checkbox" checked={false} onChange={() => patch(item.id, { done: true })} />
                  <span className="ltp-title">{item.title}</span>
                </label>
                {item.timing && <span className="ltp-when">{item.timing}</span>}
                {item.details && <p className="ltp-details">{item.details}</p>}
                <div className="ltp-actions">
                  <button type="button" className="secondary" onClick={() => move(i, -1)} disabled={i === 0}>
                    ↑
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => move(i, 1)}
                    disabled={i === open.length - 1}
                  >
                    ↓
                  </button>
                  <button type="button" className="secondary" onClick={() => startEdit(item)}>
                    Edit
                  </button>
                  <button type="button" className="danger" onClick={() => handleDelete(item.id)}>
                    Delete
                  </button>
                </div>
              </>
            )}
          </article>
        ))}
        {open.length === 0 && <p className="status-message">Nothing on the list. Add the first thing above.</p>}
      </div>

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
          {showDone &&
            done.map((item) => (
              <article key={item.id} className="ltp-item is-done">
                <label className="ltp-check">
                  <input type="checkbox" checked onChange={() => patch(item.id, { done: false })} />
                  <span className="ltp-title">{item.title}</span>
                </label>
                {item.timing && <span className="ltp-when">{item.timing}</span>}
                <div className="ltp-actions">
                  <button type="button" className="secondary" onClick={() => patch(item.id, { done: false })}>
                    Reopen
                  </button>
                  <button type="button" className="danger" onClick={() => handleDelete(item.id)}>
                    Delete
                  </button>
                </div>
              </article>
            ))}
        </div>
      )}
    </section>
  )
}
