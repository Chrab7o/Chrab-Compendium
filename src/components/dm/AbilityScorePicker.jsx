import { ABILITY_SCORES, ABILITY_LABELS } from '../../lib/homebrew'

// Multi-select checkbox list over the six abilities - saving throw
// proficiencies now, race ability increases/feat prerequisites later.
export default function AbilityScorePicker({ selected, onChange, legend }) {
  function toggle(ability) {
    onChange(selected.includes(ability) ? selected.filter((a) => a !== ability) : [...selected, ability])
  }

  return (
    <fieldset className="tag-checklist">
      {legend && <legend>{legend}</legend>}
      {ABILITY_SCORES.map((ability) => (
        <label key={ability} className="tag-checklist-item">
          <input type="checkbox" checked={selected.includes(ability)} onChange={() => toggle(ability)} />
          {ABILITY_LABELS[ability]}
        </label>
      ))}
    </fieldset>
  )
}
