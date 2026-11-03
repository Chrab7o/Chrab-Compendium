import { useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { fromEraYear, normalizeCalendar, toEraYear } from '../../../lib/chronicle'
import RichTextEditor from '../../RichTextEditor'
import TagGroupPicker from '../../TagGroupPicker'
import EntryPicker from '../sessionplanner/EntryPicker'

export const emptyEvent = {
  id: null,
  kind: 'event',
  title: '',
  summary: '',
  year: 0,
  month: null,
  day: null,
  branch_id: null,
  tags: [],
  campaign_id: null,
  visibility: 'public',
}

const numberOrNull = (v) => (v === '' || v === null || v === undefined ? null : Number(v))

// One event or date marker. A "date" is just a labelled point on the line;
// an "event" has a summary and can link to entries. Links are rewritten
// wholesale on save - there are only ever a handful per event.
export default function EventEditor({ event, entries, worldId, calendar, branches, campaigns, onSaved, onCancel }) {
  const cal = normalizeCalendar(calendar)
  const [form, setForm] = useState(() => ({ ...emptyEvent, ...event }))
  const [linked, setLinked] = useState(entries ?? [])
  const [picking, setPicking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const { eraIndex, eraYear } = toEraYear(Number(form.year) || 0, cal)

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const month = cal.months[(form.month ?? 0) - 1]

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const payload = {
      world_id: worldId,
      kind: form.kind,
      title: form.title.trim(),
      summary: form.kind === 'event' ? form.summary || null : null,
      year: Number(form.year) || 0,
      month: numberOrNull(form.month),
      day: form.month ? numberOrNull(form.day) : null,
      branch_id: form.branch_id || null,
      tags: form.tags ?? [],
      campaign_id: form.campaign_id || null,
      visibility: form.visibility,
    }
    const { data, error: saveError } = form.id
      ? await supabase.from('chronicle_events').update(payload).eq('id', form.id).select().single()
      : await supabase.from('chronicle_events').insert(payload).select().single()
    if (saveError) {
      setSaving(false)
      setError(saveError.message)
      return
    }
    const { error: clearError } = await supabase.from('chronicle_event_entries').delete().eq('event_id', data.id)
    const rows = form.kind === 'event' ? linked.map((entry) => ({ event_id: data.id, entry_id: entry.id })) : []
    const { error: linkError } = rows.length
      ? await supabase.from('chronicle_event_entries').insert(rows)
      : { error: null }
    setSaving(false)
    if (clearError || linkError) {
      setError((clearError ?? linkError).message)
      return
    }
    onSaved(data)
  }

  return (
    <form className="dm-form chronicle-event-form" onSubmit={handleSubmit}>
      <div className="dm-form-row">
        <label>
          Kind
          <select value={form.kind} onChange={(e) => set({ kind: e.target.value })}>
            <option value="event">Event</option>
            <option value="date">Date marker</option>
          </select>
        </label>
        <label>
          Title
          <input value={form.title} onChange={(e) => set({ title: e.target.value })} required />
        </label>
      </div>

      <div className="dm-form-row">
        {cal.eras.length > 0 && (
          <label>
            Era
            <select
              value={eraIndex}
              onChange={(e) => set({ year: fromEraYear(Number(e.target.value), eraYear, cal) })}
            >
              {cal.eras.map((era, i) => (
                <option key={i} value={i}>
                  {era.name || era.abbr}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Year
          <input
            type="number"
            value={eraYear}
            onChange={(e) => set({ year: fromEraYear(eraIndex, e.target.value, cal) })}
            required
          />
        </label>
        <label>
          Month
          {cal.months.length > 0 ? (
            <select value={form.month ?? ''} onChange={(e) => set({ month: numberOrNull(e.target.value), day: null })}>
              <option value="">(none)</option>
              {cal.months.map((m, i) => (
                <option key={i} value={i + 1}>
                  {m.name}
                </option>
              ))}
            </select>
          ) : (
            <input type="number" min={1} value={form.month ?? ''} onChange={(e) => set({ month: numberOrNull(e.target.value) })} />
          )}
        </label>
        <label>
          Day
          <input
            type="number"
            min={1}
            max={month?.days}
            value={form.day ?? ''}
            disabled={!form.month}
            onChange={(e) => set({ day: numberOrNull(e.target.value) })}
          />
        </label>
      </div>

      <div className="dm-form-row">
        <label>
          Line
          <select value={form.branch_id ?? ''} onChange={(e) => set({ branch_id: e.target.value || null })}>
            <option value="">Canon</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
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
          DM only
        </label>
      </div>

      <fieldset className="tag-checklist">
        <legend>Tags (Region tags drive the Chronicle's filter)</legend>
        <TagGroupPicker value={form.tags} onChange={(tags) => set({ tags })} showRequired={false} />
      </fieldset>

      {form.kind === 'event' && (
        <>
          <label>
            What happened
            <RichTextEditor key={form.id ?? 'new'} content={form.summary ?? ''} onChange={(summary) => set({ summary })} />
          </label>

          <fieldset className="tag-checklist chronicle-rows">
            <legend>Linked entries</legend>
            {linked.length > 0 && (
              <ul className="dm-list">
                {linked.map((entry) => (
                  <li key={entry.id}>
                    <span>{entry.title}</span>
                    <div className="dm-list-actions">
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setLinked((l) => l.filter((x) => x.id !== entry.id))}
                      >
                        Unlink
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {picking ? (
              <EntryPicker
                campaignId={form.campaign_id}
                onSelect={(entry) => {
                  setLinked((l) => (l.some((x) => x.id === entry.id) ? l : [...l, entry]))
                  setPicking(false)
                }}
                onCancel={() => setPicking(false)}
              />
            ) : (
              <button type="button" className="secondary" onClick={() => setPicking(true)}>
                + Link an entry
              </button>
            )}
          </fieldset>
        </>
      )}

      {error && <p className="status-message error">{error}</p>}
      <div className="dm-form-actions">
        <button type="submit" disabled={saving}>
          {form.id ? 'Save changes' : 'Add to the Chronicle'}
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
