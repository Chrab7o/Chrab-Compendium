// "Break points from a base class": fills a homebrew class's Ability Score
// Improvement rows, Epic Boon and subclass feature levels from a base D&D
// class, 2024 rules (lib/baseClassBreakpoints). Adds only what's missing, so it's safe on a
// class that already has some of them.
import { useState } from 'react'
import { applyBreakpoints, breakpointsOf, BASE_CLASSES } from '../../../lib/baseClassBreakpoints'

const list = (levels) => levels.join(', ')

export default function BaseClassBreakpoints({ form, setForm, subclassLabel }) {
  const [base, setBase] = useState('')
  const [parts, setParts] = useState({ asi: true, boon: true, subclass: true })
  const [result, setResult] = useState(null)
  const bp = base ? breakpointsOf(base) : null
  const label = subclassLabel || 'Subclass'

  function apply() {
    const { form: next, added } = applyBreakpoints(form, base, parts)
    setForm(next)
    const bits = [
      added.asi.length && `Ability Score Improvement at ${list(added.asi)}`,
      added.boon && `Epic Boon at ${added.boon}`,
      added.subclass.length && `${label} levels ${list(added.subclass)}`,
    ].filter(Boolean)
    setResult(bits.length ? `Added ${bits.join('; ')}.` : 'Nothing to add: the class already has these.')
  }

  const toggle = (key) => (e) => {
    setParts({ ...parts, [key]: e.target.checked })
    setResult(null)
  }

  return (
    <fieldset className="tag-checklist base-breakpoints">
      <legend>Break points from a base class</legend>
      <label>
        Base class (2024 rules)
        <select
          value={base}
          onChange={(e) => {
            setBase(e.target.value)
            setResult(null)
          }}
        >
          <option value="">Choose…</option>
          {BASE_CLASSES.map((c) => (
            <option key={c.key} value={c.key}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {bp && (
        <>
          <label className="tag-checklist-item">
            <input type="checkbox" checked={parts.asi} onChange={toggle('asi')} />
            Ability Score Improvement at {list(bp.asi)}
          </label>
          <label className="tag-checklist-item">
            <input type="checkbox" checked={parts.boon} onChange={toggle('boon')} />
            Epic Boon at {bp.boon}
          </label>
          <label className="tag-checklist-item">
            <input type="checkbox" checked={parts.subclass} onChange={toggle('subclass')} />
            {label} feature levels {list(bp.subclass)}
          </label>
        </>
      )}
      <div className="chip-add">
        <button type="button" className="secondary" onClick={apply} disabled={!bp || !(parts.asi || parts.boon || parts.subclass)}>
          Fill in
        </button>
        <span className="option-picker-hint">
          {result ?? 'Adds only what’s missing. Your own features stay; edit or remove the added rows in Levels & Features.'}
        </span>
      </div>
    </fieldset>
  )
}
