// Generic { level?, name, description }[] editor - class features, subclass
// features, and (later) race traits/feat benefits all share this shape.
// `allowedLevels` restricts the level field to a fixed select (subclass
// features, which only happen at levels the parent class defines); omit it
// for a free 1-20 number input (class features, which can land on any
// level).
export default function RepeatableRows({
  rows,
  onChange,
  withLevel = false,
  allowedLevels = null,
  withChoiceGroup = false,
  addLabel = '+ Add',
}) {
  function updateRow(index, patch) {
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  function addRow() {
    onChange([
      ...rows,
      {
        level: allowedLevels?.[0] ?? 1,
        name: '',
        description: '',
        sort_order: rows.length,
        choice_group: '',
        choice_count: null,
      },
    ])
  }

  function removeRow(index) {
    onChange(rows.filter((_, i) => i !== index))
  }

  function moveRow(index, direction) {
    const target = index + direction
    if (target < 0 || target >= rows.length) return
    const next = [...rows]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next.map((r, i) => ({ ...r, sort_order: i })))
  }

  return (
    <div className="repeatable-rows">
      {rows.map((row, i) => (
        <div key={i} className="repeatable-row">
          <div className="repeatable-row-controls">
            <button type="button" className="secondary" onClick={() => moveRow(i, -1)} disabled={i === 0}>
              ↑
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => moveRow(i, 1)}
              disabled={i === rows.length - 1}
            >
              ↓
            </button>
            <button type="button" className="danger" onClick={() => removeRow(i)}>
              Remove
            </button>
          </div>
          {withLevel && (
            <label>
              Level
              {allowedLevels ? (
                <select value={row.level} onChange={(e) => updateRow(i, { level: Number(e.target.value) })}>
                  {allowedLevels.map((lvl) => (
                    <option key={lvl} value={lvl}>
                      {lvl}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={row.level}
                  onChange={(e) => updateRow(i, { level: Number(e.target.value) || 1 })}
                />
              )}
            </label>
          )}
          <label>
            Name
            <input value={row.name} onChange={(e) => updateRow(i, { name: e.target.value })} />
          </label>
          <label>
            Description
            <textarea rows={4} value={row.description} onChange={(e) => updateRow(i, { description: e.target.value })} />
          </label>
          {withChoiceGroup && (
            <div className="dm-form-row">
              <label>
                Choice group (optional — e.g. "Dark Arts"; groups this with other options the player picks from)
                <input
                  value={row.choice_group ?? ''}
                  onChange={(e) => updateRow(i, { choice_group: e.target.value })}
                />
              </label>
              {row.choice_group && (
                <label>
                  Choose how many
                  <input
                    type="number"
                    min="1"
                    value={row.choice_count ?? ''}
                    placeholder="1"
                    onChange={(e) =>
                      updateRow(i, { choice_count: e.target.value === '' ? null : Number(e.target.value) })
                    }
                  />
                </label>
              )}
            </div>
          )}
        </div>
      ))}
      <button type="button" onClick={addRow}>
        {addLabel}
      </button>
    </div>
  )
}
