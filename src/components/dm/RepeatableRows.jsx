import { nestFeatureRows, flattenFeatureRows } from '../../lib/homebrew'

// Generic { level?, name, description }[] editor - class features, subclass
// features, and (later) race traits/feat benefits all share this shape.
// `allowedLevels` restricts the level field to a fixed select (subclass
// features, which only happen at levels the parent class defines); omit it
// for a free 1-20 number input (class features, which can land on any
// level).
//
// With `withSubFeatures`, each row also gets its own nested list of
// sub-features - the Metamagic options under Metamagic, the arts under Dark
// Arts. Storage stays flat (a sub-feature is a row tagged with its parent's
// name, see nestFeatureRows), so `rows`/`onChange` still speak the flat
// array every caller and the save path already use; the nesting is built
// and torn down here.
export default function RepeatableRows({
  rows,
  onChange,
  withLevel = false,
  allowedLevels = null,
  withSubFeatures = false,
  addLabel = '+ Add',
}) {
  const nested = withSubFeatures ? nestFeatureRows(rows) : rows.map((r) => ({ ...r, children: [] }))

  function commit(next) {
    onChange(withSubFeatures ? flattenFeatureRows(next) : next.map(({ children, ...r }, i) => ({ ...r, sort_order: i })))
  }

  function updateRow(index, patch) {
    commit(nested.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  function addRow() {
    commit([
      ...nested,
      {
        level: allowedLevels?.[0] ?? 1,
        name: '',
        description: '',
        sort_order: nested.length,
        choice_group: '',
        choice_count: null,
        children: [],
      },
    ])
  }

  function removeRow(index) {
    commit(nested.filter((_, i) => i !== index))
  }

  function moveRow(index, direction) {
    const target = index + direction
    if (target < 0 || target >= nested.length) return
    const next = [...nested]
    ;[next[index], next[target]] = [next[target], next[index]]
    commit(next)
  }

  function updateChildren(index, children) {
    updateRow(index, { children })
  }

  function addChild(index) {
    const row = nested[index]
    updateChildren(index, [
      ...row.children,
      { level: row.level, name: '', description: '', choice_group: row.name, choice_count: row.choice_count ?? 1 },
    ])
  }

  function updateChild(index, childIndex, patch) {
    const row = nested[index]
    updateChildren(
      index,
      row.children.map((c, i) => (i === childIndex ? { ...c, ...patch } : c))
    )
  }

  function removeChild(index, childIndex) {
    updateChildren(
      index,
      nested[index].children.filter((_, i) => i !== childIndex)
    )
  }

  function moveChild(index, childIndex, direction) {
    const children = [...nested[index].children]
    const target = childIndex + direction
    if (target < 0 || target >= children.length) return
    ;[children[childIndex], children[target]] = [children[target], children[childIndex]]
    updateChildren(index, children)
  }

  return (
    <div className="repeatable-rows">
      {nested.map((row, i) => (
        <div key={i} className="repeatable-row">
          <div className="repeatable-row-controls">
            <button type="button" className="secondary" onClick={() => moveRow(i, -1)} disabled={i === 0}>
              ↑
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => moveRow(i, 1)}
              disabled={i === nested.length - 1}
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
          {withSubFeatures && (
            <div className="sub-features">
              <div className="sub-features-header">
                <span className="sub-features-title">
                  Sub-features{row.name ? ` of ${row.name}` : ''}
                  {row.children.length > 0 ? ` (${row.children.length})` : ''}
                </span>
                {row.children.length > 0 && (
                  <label className="sub-features-count">
                    Players
                    <select
                      value={row.choice_count ?? 1}
                      onChange={(e) => updateRow(i, { choice_count: Number(e.target.value) })}
                    >
                      <option value={0}>get all of them</option>
                      {Array.from({ length: row.children.length }, (_, n) => n + 1).map((n) => (
                        <option key={n} value={n}>
                          choose {n}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              {row.children.length === 0 && (
                <p className="sub-features-hint">
                  For features that are really a menu — the Metamagic options under Metamagic, the arts under Dark
                  Arts. Leave empty for an ordinary feature.
                </p>
              )}
              {row.children.map((child, ci) => (
                <div key={ci} className="sub-feature-row">
                  <div className="repeatable-row-controls">
                    <button type="button" className="secondary" onClick={() => moveChild(i, ci, -1)} disabled={ci === 0}>
                      ↑
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => moveChild(i, ci, 1)}
                      disabled={ci === row.children.length - 1}
                    >
                      ↓
                    </button>
                    <button type="button" className="danger" onClick={() => removeChild(i, ci)}>
                      Remove
                    </button>
                  </div>
                  <label>
                    Name
                    <input value={child.name} onChange={(e) => updateChild(i, ci, { name: e.target.value })} />
                  </label>
                  <label>
                    Description
                    <textarea
                      rows={3}
                      value={child.description}
                      onChange={(e) => updateChild(i, ci, { description: e.target.value })}
                    />
                  </label>
                </div>
              ))}
              <button type="button" className="secondary" onClick={() => addChild(i)} disabled={!row.name.trim()}>
                + Add sub-feature
              </button>
              {!row.name.trim() && row.children.length === 0 && (
                <span className="sub-features-hint">Name the feature first — sub-features hang off its name.</span>
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
