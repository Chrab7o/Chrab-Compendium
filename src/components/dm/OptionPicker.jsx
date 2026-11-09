import { useState } from 'react'

// Dropdown-plus-chips multi-select for the homebrew builder's list fields
// (armor/weapon/tool proficiencies, skill choices, primary ability). Picking
// from the select adds a chip immediately — there's no "add" step to forget —
// and already-picked options drop out of the list so the same proficiency
// can't be added twice.
//
// `options` takes either a flat array of strings or an array of
// { group, options } objects, which render as <optgroup>s. Anything the 5e
// lists don't cover still goes in through the custom-entry box when
// `allowCustom` is on, so homebrew never hits a wall the picker can't
// express.
//
// `choiceCounts` (e.g. [1, 2]) adds "One of…"/"Two of…" to the list: picking
// one opens a checklist of the options and adds the ticked ones as a single
// "Two of: Arcana, History, Nature" chip - the text the Foundry pack reads as
// a pick. `anyOptions` adds ready-made "of your choice" chips beside them.
const COUNT_WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five']
const PICK = '__pick:'

export function pickChip(count, picked) {
  return `${COUNT_WORDS[count] ?? count} of: ${picked.join(', ')}`
}

export default function OptionPicker({
  label,
  hint,
  options,
  selected,
  onChange,
  allowCustom = true,
  addPlaceholder = 'Add…',
  customPlaceholder = 'Something else…',
  choiceCounts = [],
  anyOptions = [],
}) {
  const [custom, setCustom] = useState('')
  // The open "N of…" checklist: { count, picked }.
  const [pick, setPick] = useState(null)

  const groups = options.length > 0 && typeof options[0] === 'object' ? options : [{ group: null, options }]
  const remaining = groups
    .map((g) => ({ ...g, options: g.options.filter((o) => !selected.includes(o)) }))
    .filter((g) => g.options.length > 0)
  const choiceOptions = anyOptions.filter((o) => !selected.includes(o))
  const hasChoices = choiceCounts.length > 0 || choiceOptions.length > 0
  // The checklist offers the named options, not "Any one gaming set".
  const pickGroups = groups
    .map((g) => ({ ...g, options: g.options.filter((o) => !/^any/i.test(o)) }))
    .filter((g) => g.options.length > 0)

  function choose(value) {
    if (value.startsWith(PICK)) setPick({ count: Number(value.slice(PICK.length)), picked: [] })
    else add(value)
  }

  function togglePicked(option) {
    setPick((p) => ({
      ...p,
      picked: p.picked.includes(option) ? p.picked.filter((o) => o !== option) : [...p.picked, option],
    }))
  }

  function addPick() {
    // Kept in list order, whatever order they were ticked in.
    const order = pickGroups.flatMap((g) => g.options)
    add(pickChip(pick.count, order.filter((o) => pick.picked.includes(o))))
    setPick(null)
  }

  function add(value) {
    const trimmed = value.trim()
    if (!trimmed || selected.includes(trimmed)) return
    onChange([...selected, trimmed])
  }

  function remove(value) {
    onChange(selected.filter((v) => v !== value))
  }

  function addCustom() {
    add(custom)
    setCustom('')
  }

  return (
    <div className="option-picker">
      {label && <span className="option-picker-label">{label}</span>}
      {hint && <span className="option-picker-hint">{hint}</span>}
      {selected.length > 0 && (
        <div className="chip-list">
          {selected.map((value) => (
            <span key={value} className="chip">
              {value}
              <button type="button" onClick={() => remove(value)} aria-label={`Remove ${value}`}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="option-picker-controls">
        <select
          value=""
          onChange={(e) => choose(e.target.value)}
          disabled={remaining.length === 0 && !hasChoices}
          aria-label={label ? `Add ${label}` : 'Add option'}
        >
          <option value="">{remaining.length === 0 && !hasChoices ? 'All options added' : addPlaceholder}</option>
          {hasChoices && (
            <optgroup label="Player chooses">
              {choiceCounts.map((n) => (
                <option key={`${PICK}${n}`} value={`${PICK}${n}`}>
                  {COUNT_WORDS[n] ?? n} of… (pick the list)
                </option>
              ))}
              {choiceOptions.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </optgroup>
          )}
          {remaining.map((g, i) =>
            g.group ? (
              <optgroup key={g.group} label={g.group}>
                {g.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </optgroup>
            ) : (
              g.options.map((o) => (
                <option key={`${i}-${o}`} value={o}>
                  {o}
                </option>
              ))
            )
          )}
        </select>
        {allowCustom && (
          <span className="chip-add">
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder={customPlaceholder}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                // Enter in a chip-adder means "add this chip", not "submit
                // the whole wizard" — the save button is the only way out.
                e.preventDefault()
                addCustom()
              }}
            />
            <button type="button" className="secondary" onClick={addCustom} disabled={!custom.trim()}>
              + Add
            </button>
          </span>
        )}
      </div>
      {pick && (
        <div className="option-picker-choice">
          <span className="option-picker-hint">
            The player picks {(COUNT_WORDS[pick.count] ?? String(pick.count)).toLowerCase()} of the ones you tick.
          </span>
          {pickGroups.map((g, i) => (
            <div key={g.group ?? i} className="option-picker-choice-group">
              {g.group && <span className="option-picker-label">{g.group}</span>}
              <div className="option-picker-choice-options">
                {g.options.map((o) => (
                  <label key={o} className="tag-checklist-item">
                    <input type="checkbox" checked={pick.picked.includes(o)} onChange={() => togglePicked(o)} />
                    {o}
                  </label>
                ))}
              </div>
            </div>
          ))}
          <div className="option-picker-controls">
            <button type="button" onClick={addPick} disabled={pick.picked.length <= pick.count}>
              Add “{COUNT_WORDS[pick.count] ?? pick.count} of” ({pick.picked.length} ticked)
            </button>
            <button type="button" className="secondary" onClick={() => setPick(null)}>
              Cancel
            </button>
            {pick.picked.length <= pick.count && (
              <span className="option-picker-hint">Tick at least {pick.count + 1}, so there's a choice.</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
