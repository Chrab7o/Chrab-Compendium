import { useState } from 'react'
import { nestFeatureRows, flattenFeatureRows } from '../../lib/homebrew'

// The start of a row's text for its folded line.
function preview(text, max = 140) {
  const plain = String(text ?? '')
    .replace(/[#*_>`[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return plain.length > max ? `${plain.slice(0, max).trimEnd()}…` : plain
}

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
//
// `renderRowExtra(row, patch)` renders extra editing under every row and
// sub-feature - the class editors' Foundry mechanics. `patch(fields)` merges
// into that row.
//
// `renderAddExtra(add, parent)` renders another way to add, next to the add
// buttons - the class editors' "+ Add from the Item Forge". `add(fields)`
// adds a row (parent null) or a sub-feature of `parent` with those fields.
//
// `collapsible`: each row and sub-feature is one line (level, name, the start
// of its text) that opens to its fields - the class editors' feature list.
// `onCreate(add, parent)` replaces what the add buttons do (the class editors
// open the chain builder in another tab); a row added with a `forge_key`
// starts open. `untitled` labels a row with no name yet.
export default function RepeatableRows({
  rows,
  onChange,
  withLevel = false,
  allowedLevels = null,
  withSubFeatures = false,
  addLabel = '+ Add',
  renderRowExtra = null,
  renderAddExtra = null,
  collapsible = false,
  onCreate = null,
  untitled = 'Unnamed',
}) {
  const nested = withSubFeatures ? nestFeatureRows(rows) : rows.map((r) => ({ ...r, children: [] }))
  const [openKeys, setOpenKeys] = useState(() => new Set())
  const keyOf = (r, fallback) => r.id ?? r.forge_key ?? fallback
  const isOpen = (key) => !collapsible || openKeys.has(key)
  const toggle = (key) =>
    setOpenKeys((keys) => {
      const next = new Set(keys)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  const openNew = (fields) => fields.forge_key && setOpenKeys((keys) => new Set(keys).add(fields.forge_key))

  function commit(next) {
    onChange(withSubFeatures ? flattenFeatureRows(next) : next.map(({ children, ...r }, i) => ({ ...r, sort_order: i })))
  }

  function updateRow(index, patch) {
    // Renaming a group's feature keeps the later features that add to it.
    const from = nested[index].name.trim()
    const renamed = patch.name !== undefined && from && patch.name.trim() !== from
    commit(
      nested.map((r, i) =>
        i === index ? { ...r, ...patch } : renamed && r.choice_into === from ? { ...r, choice_into: patch.name.trim() } : r
      )
    )
  }

  // The "Players" menu: pick some, get all, or (from a later level) add the
  // options to an earlier group - Dark Arts Continued's arts are more Dark
  // Arts, not a new choice.
  function setChoice(index, value) {
    if (value.startsWith('into:')) updateRow(index, { choice_into: value.slice(5), choice_count: null, choice_swap: false })
    else updateRow(index, { choice_into: '', choice_count: Number(value) })
  }
  const earlierGroups = (row) =>
    withLevel ? nested.filter((r) => r !== row && r.children.length && !r.choice_into && r.name.trim() && r.level < row.level) : []

  function addRow(fields = {}) {
    openNew(fields)
    commit([
      ...nested,
      {
        level: allowedLevels?.[0] ?? 1,
        name: '',
        description: '',
        sort_order: nested.length,
        choice_group: '',
        choice_count: null,
        ...fields,
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

  function addChild(index, fields = {}) {
    openNew(fields)
    const row = nested[index]
    updateChildren(index, [
      ...row.children,
      { name: '', description: '', ...fields, level: row.level, choice_group: row.name, choice_count: row.choice_count ?? 1 },
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

  // Up, down, remove.
  function controls(onMove, first, last, onRemove) {
    return (
      <div className="repeatable-row-controls">
        <button type="button" className="secondary" onClick={() => onMove(-1)} disabled={first}>
          ↑
        </button>
        <button type="button" className="secondary" onClick={() => onMove(1)} disabled={last}>
          ↓
        </button>
        <button type="button" className="danger" onClick={onRemove}>
          Remove
        </button>
      </div>
    )
  }

  // The folded line: click to open. Collapsible only.
  function line(r, key, tools) {
    const open = openKeys.has(key)
    const name = String(r.name ?? '').trim()
    const text = preview(r.description)
    return (
      <div className="feature-line">
        <button type="button" className="feature-line-head" onClick={() => toggle(key)} aria-expanded={open}>
          <span className="feature-line-caret" aria-hidden="true">
            {open ? '▾' : '▸'}
          </span>
          {withLevel && <span className="feature-line-level">Lv {r.level}</span>}
          <span className={`feature-line-name${name ? '' : ' is-untitled'}`}>{name || untitled}</span>
          {!open && text && <span className="feature-line-text">{text}</span>}
        </button>
        {tools}
      </div>
    )
  }

  const add = (parentIndex) => {
    if (parentIndex == null) return onCreate ? onCreate((fields) => addRow(fields), null) : addRow()
    return onCreate ? onCreate((fields) => addChild(parentIndex, fields), nested[parentIndex]) : addChild(parentIndex)
  }

  return (
    <div className={`repeatable-rows${collapsible ? ' is-collapsible' : ''}`}>
      {nested.map((row, i) => {
        const key = keyOf(row, `row:${i}`)
        const open = isOpen(key)
        const rowControls = controls((d) => moveRow(i, d), i === 0, i === nested.length - 1, () => removeRow(i))
        return (
          <div key={key} className={`repeatable-row${open && collapsible ? ' is-open' : ''}`}>
            {collapsible ? line(row, key, rowControls) : rowControls}
            {open && (
              <>
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
                {renderRowExtra?.(row, (patch) => updateRow(i, patch))}
              </>
            )}
            {withSubFeatures && (open || row.children.length > 0) && (
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
                        value={row.choice_into ? `into:${row.choice_into}` : String(row.choice_count ?? 1)}
                        onChange={(e) => setChoice(i, e.target.value)}
                      >
                        <option value="0">get all of them</option>
                        {Array.from({ length: row.children.length }, (_, n) => n + 1).map((n) => (
                          <option key={n} value={String(n)}>
                            choose {n}
                          </option>
                        ))}
                        {earlierGroups(row).map((g) => (
                          <option key={g.name} value={`into:${g.name.trim()}`}>
                            add these to {g.name.trim()}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {withLevel && row.children.length > 0 && !row.choice_into && (row.choice_count ?? 1) > 0 && (
                    <label className="tag-checklist-item">
                      <input
                        type="checkbox"
                        checked={!!row.choice_swap}
                        onChange={(e) => updateRow(i, { choice_swap: e.target.checked })}
                      />
                      can swap one on each level-up
                    </label>
                  )}
                </div>
                {open && row.choice_swap && !row.choice_into && (
                  <p className="sub-features-hint">
                    In Foundry these are one choice: options unlock at their own level (add later ones with “add these to{' '}
                    {row.name.trim() || 'this'}”), and the number known follows the class table’s “{row.name.trim()} Known”
                    column if there is one.
                  </p>
                )}
                {row.choice_into && (
                  <p className="sub-features-hint">
                    More options for {row.choice_into}, from level {row.level}. Players don’t pick extra here.
                  </p>
                )}
                {open && row.children.length === 0 && (
                  <p className="sub-features-hint">
                    For features that are really a menu — the Metamagic options under Metamagic, the arts under Dark
                    Arts. Leave empty for an ordinary feature.
                  </p>
                )}
                {row.children.map((child, ci) => {
                  const childKey = keyOf(child, `child:${i}:${ci}`)
                  const childOpen = isOpen(childKey)
                  const childControls = controls(
                    (d) => moveChild(i, ci, d),
                    ci === 0,
                    ci === row.children.length - 1,
                    () => removeChild(i, ci)
                  )
                  return (
                    <div key={childKey} className={`sub-feature-row${childOpen && collapsible ? ' is-open' : ''}`}>
                      {collapsible ? line(child, childKey, childControls) : childControls}
                      {childOpen && (
                        <>
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
                          {renderRowExtra?.(child, (patch) => updateChild(i, ci, patch))}
                        </>
                      )}
                    </div>
                  )
                })}
                {open && (
                  <div className="repeatable-add">
                    <button type="button" className="secondary" onClick={() => add(i)} disabled={!row.name.trim()}>
                      + Add sub-feature
                    </button>
                    {row.name.trim() && renderAddExtra?.((fields) => addChild(i, fields), row)}
                  </div>
                )}
                {open && !row.name.trim() && row.children.length === 0 && (
                  <span className="sub-features-hint">Name the feature first — sub-features hang off its name.</span>
                )}
              </div>
            )}
          </div>
        )
      })}
      <div className="repeatable-add">
        <button type="button" onClick={() => add(null)}>
          {addLabel}
        </button>
        {renderAddExtra?.((fields) => addRow(fields), null)}
      </div>
    </div>
  )
}
