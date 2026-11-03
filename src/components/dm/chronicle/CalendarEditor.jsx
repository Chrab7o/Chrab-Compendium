import { useEffect, useState } from 'react'
import { eraSpans, formatDate, formatYear, normalizeCalendar } from '../../../lib/chronicle'

// A world's calendar (worlds.calendar): eras and months. Years are stored
// absolute, so changing an era here rewrites how every date reads without
// touching a single event.
export default function CalendarEditor({ calendar, onSave }) {
  const [draft, setDraft] = useState(() => normalizeCalendar(calendar))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    setDraft(normalizeCalendar(calendar))
  }, [calendar])

  const setEra = (i, patch) => setDraft((d) => ({ ...d, eras: d.eras.map((e, j) => (j === i ? { ...e, ...patch } : e)) }))
  const setMonth = (i, patch) =>
    setDraft((d) => ({ ...d, months: d.months.map((m, j) => (j === i ? { ...m, ...patch } : m)) }))

  async function save() {
    setSaving(true)
    setError(null)
    const message = await onSave(normalizeCalendar(draft))
    setSaving(false)
    if (message) setError(message)
  }

  // What will be saved, in the order it'll be saved.
  const sortedDraft = normalizeCalendar(draft)
  const spans = eraSpans(sortedDraft)

  const sample = draft.eras.length
    ? formatDate({ year: draft.eras[draft.eras.length - 1].start_year + 12, month: draft.months.length ? 1 : null, day: draft.months.length ? 3 : null }, draft)
    : null

  return (
    <div className="dm-form chronicle-calendar">
      <fieldset className="tag-checklist chronicle-rows">
        <legend>Eras</legend>
        <p className="status-message">
          Each era starts at an absolute year, and eras are ordered by that year: anything before year 0 is negative.
          An era that counts down runs to the next era's start, like "50 BC".
        </p>
        {draft.eras.map((era, i) => (
          <div key={i} className="chronicle-row">
            <label>
              Abbreviation
              <input value={era.abbr} onChange={(e) => setEra(i, { abbr: e.target.value })} placeholder="AC" />
            </label>
            <label>
              Name
              <input value={era.name} onChange={(e) => setEra(i, { name: e.target.value })} placeholder="After the Cataclysm" />
            </label>
            <label>
              Starts at year
              <input type="number" value={era.start_year} onChange={(e) => setEra(i, { start_year: e.target.value })} />
            </label>
            <label className="tag-checklist-item">
              <input type="checkbox" checked={era.backward} onChange={(e) => setEra(i, { backward: e.target.checked })} />
              Counts down
            </label>
            <button
              type="button"
              className="icon-button"
              aria-label={`Remove era ${era.abbr || era.name}`}
              onClick={() => setDraft((d) => ({ ...d, eras: d.eras.filter((_, j) => j !== i) }))}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          className="secondary"
          onClick={() => setDraft((d) => ({ ...d, eras: [...d.eras, { abbr: '', name: '', start_year: 0, backward: false }] }))}
        >
          + Add era
        </button>
        {spans.length > 0 && (
          <ol className="chronicle-era-spans" aria-label="Eras in order">
            {spans.map(({ era, start, end, problems }, i) => (
              <li key={i}>
                <strong>{era.name || era.abbr}</strong>{' '}
                <span className="status-message">
                  {end === null
                    ? `from year ${start} (${formatYear(start, sortedDraft)}) onward`
                    : `years ${start} to ${end} (${formatYear(start, sortedDraft)} to ${formatYear(end, sortedDraft)})`}
                </span>
                {problems.map((p) => (
                  <p key={p} className="status-message error">
                    {p}
                  </p>
                ))}
              </li>
            ))}
          </ol>
        )}
      </fieldset>

      <fieldset className="tag-checklist chronicle-rows">
        <legend>Months</legend>
        {draft.months.map((month, i) => (
          <div key={i} className="chronicle-row">
            <label>
              Month {i + 1}
              <input value={month.name} onChange={(e) => setMonth(i, { name: e.target.value })} />
            </label>
            <label>
              Days
              <input type="number" min={1} value={month.days} onChange={(e) => setMonth(i, { days: e.target.value })} />
            </label>
            <button
              type="button"
              className="icon-button"
              aria-label={`Remove ${month.name || `month ${i + 1}`}`}
              onClick={() => setDraft((d) => ({ ...d, months: d.months.filter((_, j) => j !== i) }))}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          className="secondary"
          onClick={() => setDraft((d) => ({ ...d, months: [...d.months, { name: '', days: 30 }] }))}
        >
          + Add month
        </button>
      </fieldset>

      {sample && <p className="status-message">Dates read like: {sample}</p>}
      {error && <p className="status-message error">{error}</p>}
      <div className="dm-form-actions">
        <button type="button" onClick={save} disabled={saving}>
          Save calendar
        </button>
      </div>
    </div>
  )
}
