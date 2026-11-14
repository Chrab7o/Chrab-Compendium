import { addOption, choicePatch, choiceValue, earlierGroups, findRow, moveRow, removeRow, updateRow } from '../../../lib/levelRows'
import FeatureMechanics from './FeatureMechanics'

const LEVELS = Array.from({ length: 20 }, (_, i) => i + 1)

// One feature (or one of a feature's options) of the Levels step, beside the
// table: its words, its level, its options and how players get them, and its
// Foundry mechanics. Edits go straight into the class form; Save Class saves
// them, as before.
// lane: { label, rows, setRows, levels } (levels: the allowed ones, or null for 1-20)
export default function FeaturePanel({ lane, rowKey, onSelect, linkable, onRefreshLinks, campaignId }) {
  const found = findRow(lane.rows, rowKey)
  if (!found) return null
  const { row, parent } = found
  const set = (patch) => lane.setRows(updateRow(lane.rows, rowKey, patch))
  const name = row.name.trim()
  const levels = lane.levels ?? LEVELS
  const count = row.choice_count ?? 1

  function remove() {
    const what = parent ? 'this option' : row.children.length ? `${name || 'this feature'} and its ${row.children.length} option${row.children.length === 1 ? '' : 's'}` : name || 'this feature'
    if (!confirm(`Remove ${what}? Nothing is deleted until you save the class.`)) return
    lane.setRows(removeRow(lane.rows, rowKey))
    onSelect(parent ? parent.key : null)
  }

  function newOption() {
    const { rows, key } = addOption(lane.rows, rowKey)
    lane.setRows(rows)
    onSelect(key)
  }

  return (
    // Enter in a field mustn't submit the page's form (the standalone subclass
    // editor's saves it).
    <aside className="feature-panel" aria-label="Feature" onKeyDown={(e) => e.key === 'Enter' && e.target.tagName === 'INPUT' && e.preventDefault()}>
      <header className="feature-panel-head">
        <div className="feature-panel-trail">
          <span>{lane.label}</span>
          {parent && (
            <>
              {' › '}
              <button type="button" className="link-button" onClick={() => onSelect(parent.key)}>
                {parent.name.trim() || 'Unnamed feature'}
              </button>
            </>
          )}
        </div>
        <button type="button" className="secondary npc-small-button" onClick={() => onSelect(null)}>
          Close
        </button>
      </header>

      <div className="dm-form">
        <label>
          {parent ? 'Option name' : 'Name'}
          <input value={row.name} onChange={(e) => set({ name: e.target.value })} autoFocus={!name} placeholder={parent ? 'e.g. Shadow Lance' : 'e.g. Dark Arts'} />
        </label>
        {!parent && (
          <label>
            Level
            <select value={row.level} onChange={(e) => set({ level: Number(e.target.value) })}>
              {levels.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Text
          <textarea rows={8} value={row.description} onChange={(e) => set({ description: e.target.value })} />
        </label>

        {!parent && (
          <section className="feature-panel-section">
            <h3>Options</h3>
            {row.children.length === 0 && (
              <p className="sub-features-hint">For a feature that is really a menu: the Metamagic options, the Dark Arts. Leave empty for an ordinary feature.</p>
            )}
            {row.children.length > 0 && (
              <ul className="feature-panel-options">
                {row.children.map((c) => (
                  <li key={c.key}>
                    <button type="button" className="feature-chip" onClick={() => onSelect(c.key)}>
                      {c.name.trim() || 'Unnamed option'}
                      {(c.mechanics || c.feature_draft_id) && <span className="feature-chip-mark" title="Has Foundry mechanics" aria-label="Has Foundry mechanics">⚙</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" className="secondary" onClick={newOption} disabled={!name}>
              + Add option
            </button>
            {!name && <span className="sub-features-hint"> Name the feature first: options hang off its name.</span>}
            {row.children.length > 0 && (
              <div className="dm-form-row">
                <label>
                  Players
                  <select value={choiceValue(row)} onChange={(e) => set(choicePatch(e.target.value))}>
                    <option value="0">get all of them</option>
                    {row.children.map((_, n) => (
                      <option key={n} value={String(n + 1)}>
                        choose {n + 1}
                      </option>
                    ))}
                    {earlierGroups(lane.rows, rowKey).map((g) => (
                      <option key={g} value={`into:${g}`}>
                        add these to {g}
                      </option>
                    ))}
                  </select>
                </label>
                {!row.choice_into && count > 0 && (
                  <label className="tag-checklist-item">
                    <input type="checkbox" checked={!!row.choice_swap} onChange={(e) => set({ choice_swap: e.target.checked })} />
                    can swap one on each level-up
                  </label>
                )}
              </div>
            )}
            {row.choice_swap && !row.choice_into && (
              <p className="sub-features-hint">
                In Foundry these are one choice: options unlock at their own level (add later ones with “add these to {name || 'this'}”), and the
                number known follows the class table’s “{name} Known” column if there is one.
              </p>
            )}
            {row.choice_into && <p className="sub-features-hint">More options for {row.choice_into}, from level {row.level}. Players don’t pick extra here.</p>}
          </section>
        )}

        <section className="feature-panel-section">
          <h3>Foundry mechanics</h3>
          <FeatureMechanics row={row} onChange={set} linkable={linkable} onRefreshLinks={onRefreshLinks} campaignId={campaignId} />
        </section>

        <div className="dm-form-actions">
          <button type="button" className="secondary" onClick={() => lane.setRows(moveRow(lane.rows, rowKey, -1))} title={parent ? 'Earlier among the options' : 'Earlier among this level’s features'}>
            ↑ Earlier
          </button>
          <button type="button" className="secondary" onClick={() => lane.setRows(moveRow(lane.rows, rowKey, 1))} title={parent ? 'Later among the options' : 'Later among this level’s features'}>
            ↓ Later
          </button>
          <span className="npc-item-actions-spacer" />
          <button type="button" className="danger" onClick={remove}>
            Remove
          </button>
        </div>
      </div>
    </aside>
  )
}
