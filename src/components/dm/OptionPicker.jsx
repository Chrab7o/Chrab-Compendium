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
export default function OptionPicker({
  label,
  hint,
  options,
  selected,
  onChange,
  allowCustom = true,
  addPlaceholder = 'Add…',
  customPlaceholder = 'Something else…',
}) {
  const [custom, setCustom] = useState('')

  const groups = options.length > 0 && typeof options[0] === 'object' ? options : [{ group: null, options }]
  const remaining = groups
    .map((g) => ({ ...g, options: g.options.filter((o) => !selected.includes(o)) }))
    .filter((g) => g.options.length > 0)

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
          onChange={(e) => add(e.target.value)}
          disabled={remaining.length === 0}
          aria-label={label ? `Add ${label}` : 'Add option'}
        >
          <option value="">{remaining.length === 0 ? 'All options added' : addPlaceholder}</option>
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
    </div>
  )
}
