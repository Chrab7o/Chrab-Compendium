import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useCampaignContext } from '../../contexts/CampaignContext'
import { useWorlds } from '../../hooks/useWorlds'
import { useChronicle } from '../../hooks/useChronicle'
import { formatDate, sortEvents } from '../../lib/chronicle'
import ChronicleBoard from '../../components/chronicle/ChronicleBoard'
import CalendarEditor from '../../components/dm/chronicle/CalendarEditor'
import EventEditor, { emptyEvent } from '../../components/dm/chronicle/EventEditor'
import BranchEditor, { emptyBranch } from '../../components/dm/chronicle/BranchEditor'

// Writing a world's Chronicle: its calendar, its events, and its branches.
// The preview at the top is the public view; clicking an event there opens
// it for editing.
export default function DMChroniclePage() {
  const { worldId: activeWorldId, campaigns } = useCampaignContext()
  const { worlds, reload: reloadWorlds } = useWorlds()
  const [worldId, setWorldId] = useState(activeWorldId)
  const { events, branches, entriesByEvent, loading, reload } = useChronicle(worldId)
  // { kind: 'event' | 'branch', value } - the one form open at a time.
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!worldId && worlds.length > 0) setWorldId(activeWorldId || worlds[0].id)
  }, [worldId, worlds, activeWorldId])

  const world = worlds.find((w) => w.id === worldId)
  const calendar = world?.calendar
  const worldCampaigns = campaigns.filter((c) => c.world_id === worldId)
  const branchName = (id) => branches.find((b) => b.id === id)?.name ?? 'Canon'

  async function saveCalendar(next) {
    const { error: saveError } = await supabase.from('worlds').update({ calendar: next }).eq('id', worldId)
    if (saveError) return saveError.message
    reloadWorlds()
    return null
  }

  function saved() {
    setEditing(null)
    reload()
  }

  async function deleteEvent(event) {
    const anchored = branches.filter((b) => b.fork_event_id === event.id || b.rejoin_event_id === event.id)
    const warning = anchored.length
      ? ` ${anchored.map((b) => b.name).join(', ')} split or rejoin here and will lose that point.`
      : ''
    if (!confirm(`Delete "${event.title}"?${warning}`)) return
    const { error: deleteError } = await supabase.from('chronicle_events').delete().eq('id', event.id)
    if (deleteError) setError(deleteError.message)
    else reload()
  }

  // A branch's events and sub-branches go back to its parent line rather
  // than disappearing with it.
  async function deleteBranch(branch) {
    if (!confirm(`Delete the branch "${branch.name}"? Its events go back to ${branchName(branch.parent_branch_id)}.`)) return
    const parent = branch.parent_branch_id || null
    const steps = [
      () => supabase.from('chronicle_events').update({ branch_id: parent }).eq('branch_id', branch.id),
      () => supabase.from('chronicle_branches').update({ parent_branch_id: parent }).eq('parent_branch_id', branch.id),
      () => supabase.from('chronicle_branches').delete().eq('id', branch.id),
    ]
    for (const step of steps) {
      const { error: stepError } = await step()
      if (stepError) {
        setError(stepError.message)
        return
      }
    }
    reload()
  }

  const sorted = sortEvents(events)

  return (
    <section className="page chronicle-page">
      <div className="view-header">
        <h1>Chronicle</h1>
        <Link to="/chronicle" className="button-link">
          View public page
        </Link>
      </div>
      <p className="view-subtitle">
        A world's history. Canon is the main line; a branch splits off at an event, takes the events that happened
        differently, and can rejoin canon later.
      </p>

      <div className="map-picker">
        <select
          value={worldId}
          onChange={(e) => {
            setWorldId(e.target.value)
            setEditing(null)
          }}
          aria-label="World"
        >
          {worlds.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="status-message error">{error}</p>}
      {!worldId && <p className="status-message">Add a world first.</p>}

      {worldId && (
        <>
          {!loading && events.length > 0 && (
            <div className="dm-panel">
              <ChronicleBoard
                events={events}
                branches={branches}
                entriesByEvent={entriesByEvent}
                calendar={calendar}
                campaignId=""
                selectedId={editing?.kind === 'event' ? editing.value.id : null}
                showPanel={false}
                onSelect={(id) => {
                  const event = events.find((e) => e.id === id)
                  setEditing(event ? { kind: 'event', value: event } : null)
                }}
              />
            </div>
          )}

          {editing && (
            <div className="dm-panel">
              <h2>
                {editing.kind === 'event'
                  ? editing.value.id
                    ? `Edit "${editing.value.title}"`
                    : 'New entry in the Chronicle'
                  : editing.value.id
                    ? `Edit branch "${editing.value.name}"`
                    : 'New branch'}
              </h2>
              {editing.kind === 'event' ? (
                <EventEditor
                  key={editing.value.id ?? `new-${editing.value.kind}`}
                  event={editing.value}
                  entries={editing.value.id ? entriesByEvent.get(editing.value.id) : []}
                  worldId={worldId}
                  calendar={calendar}
                  branches={branches}
                  campaigns={worldCampaigns}
                  onSaved={saved}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <BranchEditor
                  key={editing.value.id ?? `new-${editing.value.fork_event_id}`}
                  branch={editing.value}
                  events={events}
                  branches={branches}
                  campaigns={worldCampaigns}
                  worldId={worldId}
                  calendar={calendar}
                  onSaved={saved}
                  onCancel={() => setEditing(null)}
                />
              )}
            </div>
          )}

          <div className="dm-panel">
            <div className="region-panel-header">
              <h2>Events</h2>
              <div className="dm-list-actions">
                <button type="button" onClick={() => setEditing({ kind: 'event', value: { ...emptyEvent } })}>
                  + Event
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setEditing({ kind: 'event', value: { ...emptyEvent, kind: 'date' } })}
                >
                  + Date marker
                </button>
              </div>
            </div>
            {loading && <p className="status-message">Loading...</p>}
            <ul className="dm-list">
              {sorted.map((ev) => (
                <li key={ev.id} className={editing?.value?.id === ev.id ? 'is-editing' : undefined}>
                  <span className="dm-list-meta chronicle-list-date">{formatDate(ev, calendar)}</span>
                  <span>{ev.title}</span>
                  {ev.kind === 'date' && <span className="badge">Date</span>}
                  {ev.visibility === 'dm' && <span className="badge badge-dm">DM only</span>}
                  <span className="dm-list-meta">{branchName(ev.branch_id)}</span>
                  <div className="dm-list-actions">
                    <button type="button" onClick={() => setEditing({ kind: 'event', value: ev })}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() =>
                        setEditing({
                          kind: 'branch',
                          value: { ...emptyBranch, parent_branch_id: ev.branch_id, fork_event_id: ev.id },
                        })
                      }
                    >
                      Branch from here
                    </button>
                    <button type="button" className="danger" onClick={() => deleteEvent(ev)}>
                      Delete
                    </button>
                  </div>
                </li>
              ))}
              {!loading && sorted.length === 0 && <li className="status-message">Nothing in this Chronicle yet.</li>}
            </ul>
          </div>

          <div className="dm-panel">
            <h2>Branches</h2>
            <ul className="dm-list">
              {branches.map((b) => {
                const fork = events.find((e) => e.id === b.fork_event_id)
                const rejoin = events.find((e) => e.id === b.rejoin_event_id)
                return (
                  <li key={b.id} className={editing?.value?.id === b.id ? 'is-editing' : undefined}>
                    <span className="chronicle-swatch" style={{ background: b.color || 'var(--accent-2)' }} aria-hidden="true" />
                    <span>{b.name}</span>
                    {b.visibility === 'dm' && <span className="badge badge-dm">DM only</span>}
                    <span className="dm-list-meta">
                      off {branchName(b.parent_branch_id)} at {fork ? fork.title : '(missing event)'}
                      {rejoin ? `, rejoins at ${rejoin.title}` : ', never rejoins'}
                    </span>
                    <div className="dm-list-actions">
                      <button type="button" onClick={() => setEditing({ kind: 'branch', value: b })}>
                        Edit
                      </button>
                      <button type="button" className="danger" onClick={() => deleteBranch(b)}>
                        Delete
                      </button>
                    </div>
                  </li>
                )
              })}
              {branches.length === 0 && (
                <li className="status-message">No branches yet. Use "Branch from here" on an event to start one.</li>
              )}
            </ul>
          </div>

          <details className="dm-panel">
            <summary>
              <h2 className="chronicle-summary-heading">Calendar</h2>
            </summary>
            <CalendarEditor calendar={calendar} onSave={saveCalendar} />
          </details>
        </>
      )}
    </section>
  )
}
