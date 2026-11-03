import { useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { branchProblems, compareDates, formatDate, sortEvents } from '../../../lib/chronicle'

export const emptyBranch = {
  id: null,
  name: '',
  description: '',
  color: '#2f5233',
  parent_branch_id: null,
  fork_event_id: null,
  rejoin_event_id: null,
  campaign_id: null,
  visibility: 'public',
}

// Ids of a branch and every branch under it - none of them can be its parent.
function selfAndBelow(branchId, branches) {
  const ids = new Set(branchId ? [branchId] : [])
  let grew = true
  while (grew) {
    grew = false
    for (const b of branches) {
      if (b.parent_branch_id && ids.has(b.parent_branch_id) && !ids.has(b.id)) {
        ids.add(b.id)
        grew = true
      }
    }
  }
  return ids
}

// A branch: where it splits off its parent line, which of that line's later
// events happened in the branch instead, and (optionally) where the parent
// line "corrects itself" and the branch rejoins. Ticking an event moves it
// into the branch on save; unticking one moves it back to the parent line.
export default function BranchEditor({ branch, events, branches, campaigns, worldId, calendar, onSaved, onCancel }) {
  const [form, setForm] = useState(() => ({ ...emptyBranch, ...branch }))
  const original = useMemo(
    () => new Set(branch?.id ? events.filter((e) => e.branch_id === branch.id).map((e) => e.id) : []),
    [branch, events]
  )
  const [members, setMembers] = useState(original)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  const parentLine = form.parent_branch_id || null
  const blocked = selfAndBelow(form.id, branches)
  const parentChoices = branches.filter((b) => !blocked.has(b.id))
  const onParent = sortEvents(events.filter((e) => (e.branch_id || null) === parentLine && !original.has(e.id)))
  const fork = events.find((e) => e.id === form.fork_event_id)
  const rejoin = events.find((e) => e.id === form.rejoin_event_id)

  // Candidates: the parent line between split and rejoin, plus whatever is
  // already in this branch.
  const candidates = sortEvents([
    ...onParent.filter(
      (e) =>
        fork &&
        e.id !== fork.id &&
        e.id !== rejoin?.id &&
        compareDates(e, fork) > 0 &&
        (!rejoin || compareDates(e, rejoin) < 0)
    ),
    ...events.filter((e) => original.has(e.id)),
  ])
  const rejoinChoices = onParent.filter((e) => fork && e.id !== fork.id && compareDates(e, fork) > 0 && !members.has(e.id))

  const problems = branchProblems(form, { events, branches, memberIds: members })

  function toggleMember(id) {
    setMembers((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (problems.length > 0) return
    setSaving(true)
    setError(null)
    const payload = {
      world_id: worldId,
      name: form.name.trim(),
      description: form.description || null,
      color: form.color || null,
      parent_branch_id: parentLine,
      fork_event_id: form.fork_event_id,
      rejoin_event_id: form.rejoin_event_id || null,
      campaign_id: form.campaign_id || null,
      visibility: form.visibility,
    }
    const { data, error: saveError } = form.id
      ? await supabase.from('chronicle_branches').update(payload).eq('id', form.id).select().single()
      : await supabase.from('chronicle_branches').insert(payload).select().single()
    if (saveError) {
      setSaving(false)
      setError(saveError.message)
      return
    }
    const moveIn = [...members].filter((id) => !original.has(id))
    const moveOut = [...original].filter((id) => !members.has(id))
    const results = await Promise.all([
      moveIn.length ? supabase.from('chronicle_events').update({ branch_id: data.id }).in('id', moveIn) : { error: null },
      moveOut.length ? supabase.from('chronicle_events').update({ branch_id: parentLine }).in('id', moveOut) : { error: null },
    ])
    setSaving(false)
    const failed = results.find((r) => r.error)
    if (failed) {
      setError(failed.error.message)
      return
    }
    onSaved(data)
  }

  const label = (ev) => `${formatDate(ev, calendar)}: ${ev.title}`

  return (
    <form className="dm-form chronicle-branch-form" onSubmit={handleSubmit}>
      <div className="dm-form-row">
        <label>
          Name
          <input value={form.name} onChange={(e) => set({ name: e.target.value })} required />
        </label>
        <label>
          Color
          <input type="color" value={form.color || '#2f5233'} onChange={(e) => set({ color: e.target.value })} />
        </label>
        <label>
          Splits off
          <select
            value={parentLine ?? ''}
            onChange={(e) => {
              set({ parent_branch_id: e.target.value || null, fork_event_id: null, rejoin_event_id: null })
              setMembers(original)
            }}
          >
            <option value="">Canon</option>
            {parentChoices.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="dm-form-row">
        <label>
          Splits at
          <select
            value={form.fork_event_id ?? ''}
            onChange={(e) => {
              set({ fork_event_id: e.target.value || null, rejoin_event_id: null })
              setMembers(original)
            }}
            required
          >
            <option value="">Pick an event</option>
            {onParent.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {label(ev)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Rejoins at
          <select
            value={form.rejoin_event_id ?? ''}
            onChange={(e) => set({ rejoin_event_id: e.target.value || null })}
            disabled={!fork}
          >
            <option value="">Never rejoins</option>
            {rejoinChoices.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {label(ev)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="tag-checklist chronicle-members">
        <legend>Events in this branch</legend>
        {!fork && <p className="status-message">Pick where it splits off first.</p>}
        {fork && candidates.length === 0 && (
          <p className="status-message">
            Nothing on the parent line after the split yet. Add events to this branch from the event form instead.
          </p>
        )}
        {candidates.map((ev) => (
          <label key={ev.id} className="tag-checklist-item">
            <input type="checkbox" checked={members.has(ev.id)} onChange={() => toggleMember(ev.id)} />
            {label(ev)}
          </label>
        ))}
      </fieldset>

      <div className="dm-form-row">
        <label>
          Campaign
          <select value={form.campaign_id ?? ''} onChange={(e) => set({ campaign_id: e.target.value || null })}>
            <option value="">Every campaign</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="tag-checklist-item">
          <input
            type="checkbox"
            checked={form.visibility === 'dm'}
            onChange={(e) => set({ visibility: e.target.checked ? 'dm' : 'public' })}
          />
          DM only (hides its events and sub-branches too)
        </label>
      </div>

      <label>
        Description
        <textarea value={form.description ?? ''} onChange={(e) => set({ description: e.target.value })} rows={3} />
      </label>

      {problems.length > 0 && (
        <ul className="chronicle-problems">
          {problems.map((p) => (
            <li key={p} className="status-message error">
              {p}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="status-message error">{error}</p>}
      <div className="dm-form-actions">
        <button type="submit" disabled={saving || problems.length > 0}>
          {form.id ? 'Save branch' : 'Create branch'}
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
