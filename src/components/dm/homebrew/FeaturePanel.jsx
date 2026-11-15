import { addOption, choicePatch, choiceValue, earlierGroups, findRow, laterAdditions, levelRows, moveOption, moveRow, optionHomes, removeRow, updateRow } from '../../../lib/levelRows'
import FeatureMechanics from './FeatureMechanics'

const levelRowsRoot = (rows, name) => {
  const key = String(name ?? '').trim().toLowerCase()
  return levelRows(rows).find((n) => !n.choice_into && n.name.trim().toLowerCase() === key) ?? null
}

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
  const later = parent || row.choice_into ? [] : laterAdditions(lane.rows, rowKey)
  const homes = parent ? optionHomes(lane.rows, rowKey) : []
  const home = homes.find((h) => h.key === parent?.key)
  // The feature a later one adds to, for its hint: its swap decides how the
  // added options are picked.
  const intoRoot = row.choice_into ? levelRowsRoot(lane.rows, row.choice_into) : null

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
        {homes.length > 1 && (
          <label>
            Unlocks at
            <select value={parent.key} onChange={(e) => lane.setRows(moveOption(lane.rows, rowKey, e.target.value))}>
              {homes.map((h) => (
                <option key={h.key} value={h.key}>
                  level {h.level}
                  {h.own ? ` (${h.name})` : `, with ${h.name || 'unnamed feature'}`}
                </option>
              ))}
            </select>
          </label>
        )}
        {parent && home && !home.own && (
          <p className="sub-features-hint">
            An option of {parent.choice_into}, unlocked at level {home.level} by {home.name || 'an unnamed feature'}.
          </p>
        )}
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
            {row.choice_into && (
              <p className="sub-features-hint">
                More options for {row.choice_into}, unlocked at level {row.level}.{' '}
                {intoRoot?.choice_swap
                  ? `They join ${row.choice_into}’s choices; how many players know follows the “${row.choice_into} Known” column.`
                  : intoRoot?.choice_count === 0
                    ? `Players get all of them at level ${row.level}, like the rest of ${row.choice_into}.`
                    : `At level ${row.level} players choose 1 of these, besides their earlier ${row.choice_into} picks. To make them one growing list, tick “can swap one on each level-up” on ${row.choice_into}.`}
              </p>
            )}
            {later.length > 0 && (
              <div className="feature-panel-later">
                <h4>Unlock later</h4>
                {later.map((l) => (
                  <div key={l.key} className="feature-panel-later-level">
                    <button type="button" className="link-button" onClick={() => onSelect(l.key)} title={`Open ${l.name.trim() || 'the feature'} that adds these`}>
                      Level {l.level}, with {l.name.trim() || 'an unnamed feature'}
                    </button>
                    <ul className="feature-panel-options">
                      {l.children.map((c) => (
                        <li key={c.key}>
                          <button type="button" className="feature-chip" onClick={() => onSelect(c.key)}>
                            {c.name.trim() || 'Unnamed option'}
                            <span className="feature-chip-note">lv {l.level}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                <p className="sub-features-hint">Open an option to change the level it unlocks at.</p>
              </div>
            )}
            {!row.choice_into && row.children.length > 0 && later.length === 0 && (
              <p className="sub-features-hint">
                To unlock more of these at a higher level, add a feature at that level, give it options and set its Players to “add these to {name || 'this'}”.
              </p>
            )}
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
