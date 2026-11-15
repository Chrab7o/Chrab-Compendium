import { useState } from 'react'
import { addFeature, byLevel, choiceSummary, findRow, laterAdditions } from '../../../lib/levelRows'
import FeaturePanel from './FeaturePanel'

const LEVELS = Array.from({ length: 20 }, (_, i) => i + 1)
const proficiency = (level) => 2 + Math.floor((level - 1) / 4)

// The Levels step: one row per level, with the class table's columns edited in
// their cells and a lane of features per class or subclass. Clicking a feature
// opens it in the panel beside the table (FeaturePanel); "+" adds one at that
// level. Rows stay in the class form's flat shape (lib/levelRows.js).
//
// lanes: [{ key, label, rows, setRows, levels }]: levels is the levels the lane
//   can add features at (a subclass's), or null for any.
// columns / onColumnsChange: the class table's extra columns, or null for none
//   (a standalone subclass).
// above: what goes over the table (the subclass tabs).
export default function LevelsBoard({ lanes, columns = null, onColumnsChange = null, above = null, linkable = [], onRefreshLinks = null, campaignId = null }) {
  const [selected, setSelected] = useState(null) // { lane, key }
  const lane = selected && lanes.find((l) => l.key === selected.lane)
  const open = lane && findRow(lane.rows, selected.key) ? selected : null
  const levelsOf = lanes.map((l) => byLevel(l.rows))

  function add(l, level) {
    const { rows, key } = addFeature(l.rows, { level })
    l.setRows(rows)
    setSelected({ lane: l.key, key })
  }

  const setColumn = (i, patch) => onColumnsChange(columns.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  function removeColumn(i) {
    const col = columns[i]
    const filled = Object.values(col.valuesByLevel ?? {}).some((v) => v !== '')
    if (filled && !confirm(`Remove the “${col.name || 'unnamed'}” column and its values? Nothing is deleted until you save the class.`)) return
    onColumnsChange(columns.filter((_, j) => j !== i))
  }

  return (
    <div className={`levels-layout${open ? ' has-panel' : ''}`}>
      <div className="levels-main">
        {above}
        <div className="levels-scroll">
          <table className="levels-table">
            <thead>
              <tr>
                <th scope="col" className="levels-level">Lv</th>
                <th scope="col" className="levels-prof" title="Proficiency bonus">
                  Prof
                </th>
                {columns?.map((col, i) => (
                  <th scope="col" key={i} className="levels-column">
                    <span className="levels-column-head">
                      <input value={col.name} onChange={(e) => setColumn(i, { name: e.target.value })} placeholder="Column" aria-label={`Column ${i + 1} name`} />
                      <button type="button" className="levels-x" onClick={() => removeColumn(i)} aria-label={`Remove the ${col.name || 'unnamed'} column`}>
                        ×
                      </button>
                    </span>
                  </th>
                ))}
                {columns && (
                  <th scope="col" className="levels-add-column">
                    <button type="button" className="secondary npc-small-button" onClick={() => onColumnsChange([...columns, { id: null, name: '', valuesByLevel: {} }])} title="A per-level number: Sneak Attack dice, Rages, Darkness points">
                      + Column
                    </button>
                  </th>
                )}
                {lanes.map((l) => (
                  <th scope="col" key={l.key} className="levels-lane">
                    {l.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {LEVELS.map((level) => (
                <tr key={level}>
                  <th scope="row" className="levels-level">
                    {level}
                  </th>
                  <td className="levels-prof">+{proficiency(level)}</td>
                  {columns?.map((col, i) => (
                    <td key={i} className="levels-column">
                      <input
                        value={col.valuesByLevel?.[level] ?? ''}
                        onChange={(e) => setColumn(i, { valuesByLevel: { ...col.valuesByLevel, [level]: e.target.value } })}
                        aria-label={`${col.name || 'Column'} at level ${level}`}
                      />
                    </td>
                  ))}
                  {columns && <td className="levels-add-column" />}
                  {lanes.map((l, li) => {
                    const here = levelsOf[li].get(level) ?? []
                    const canAdd = !l.levels || l.levels.includes(level)
                    return (
                      <td key={l.key} className={`levels-lane${canAdd ? '' : ' is-closed'}`}>
                        <div className="levels-chips">
                          {here.map((row) => {
                            const isOpen = open?.lane === l.key && (open.key === row.key || row.children.some((c) => c.key === open.key))
                            const summary = choiceSummary(row, row.children.length && !row.choice_into ? laterAdditions(l.rows, row.key) : [])
                            return (
                              <button
                                type="button"
                                key={row.key}
                                className={`feature-chip${isOpen ? ' is-selected' : ''}`}
                                onClick={() => setSelected({ lane: l.key, key: row.key })}
                                aria-pressed={isOpen}
                              >
                                <span className={row.name.trim() ? '' : 'is-untitled'}>{row.name.trim() || 'Unnamed feature'}</span>
                                {summary && <span className="feature-chip-note">{summary}</span>}
                                {(row.mechanics || row.feature_draft_id) && (
                                  <span className="feature-chip-mark" title="Has Foundry mechanics" aria-label="Has Foundry mechanics">
                                    ⚙
                                  </span>
                                )}
                              </button>
                            )
                          })}
                          {canAdd && (
                            <button type="button" className="levels-add" onClick={() => add(l, level)} aria-label={`Add a ${l.label} feature at level ${level}`} title="Add a feature at this level">
                              +
                            </button>
                          )}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {open && (
        <FeaturePanel
          key={`${open.lane}:${open.key}`}
          lane={lane}
          rowKey={open.key}
          onSelect={(key) => setSelected(key ? { lane: open.lane, key } : null)}
          linkable={linkable}
          onRefreshLinks={onRefreshLinks}
          campaignId={campaignId}
        />
      )}
    </div>
  )
}
