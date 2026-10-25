import { useState } from 'react'
import { GEAR_TYPES, RARITIES, WEAPON_PROPERTIES, emptyGear } from '../../../lib/foundryFeatures'
import { descriptionHtml, emptyAbilityBlock, emptyTextBlock } from '../../../lib/itemDescription'

// Item Forge gear (lib/foundryFeatures.js, kind 'gear'): its kind, rarity
// and stats, and its written description in the Item Maker's blocks. Used by
// the guided steps (FeatureWizard) and the All fields form (FeatureEditor).

// gear / setGear(patch): spec.gear. showType: false when the wizard already
// asked for the kind with its big choice buttons.
export function GearStatFields({ gear, setGear, showType = true }) {
  const type = GEAR_TYPES.find((t) => t.key === gear.type) ?? GEAR_TYPES[2]
  const toggleProperty = (key, on) => setGear({ properties: on ? [...(gear.properties ?? []), key] : (gear.properties ?? []).filter((p) => p !== key) })
  return (
    <>
      <div className="dm-form-row">
        {showType && (
          <label>
            Kind
            <select value={type.key} onChange={(e) => setGear(gearTypePatch(e.target.value))}>
              {GEAR_TYPES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Type
          <select value={gear.subtype} onChange={(e) => setGear({ subtype: e.target.value })}>
            {type.subtypes.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Rarity
          <select value={gear.rarity} onChange={(e) => setGear({ rarity: e.target.value })}>
            {RARITIES.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Weight (lb.)
          <input type="number" min="0" step="0.1" value={gear.weight} onChange={(e) => setGear({ weight: e.target.value })} />
        </label>
        {(type.key === 'weapon' || type.key === 'armor') && (
          <label>
            Magic bonus
            <select value={String(gear.magicalBonus || '')} onChange={(e) => setGear({ magicalBonus: e.target.value })}>
              <option value="">None</option>
              {['1', '2', '3'].map((n) => (
                <option key={n} value={n}>
                  +{n}
                </option>
              ))}
            </select>
          </label>
        )}
        {type.key !== 'consumable' && (
          <label className="tag-checklist-item">
            <input type="checkbox" checked={!!gear.attunement} onChange={(e) => setGear({ attunement: e.target.checked })} />
            Requires attunement
          </label>
        )}
      </div>

      {(type.key === 'weapon' || type.key === 'armor') && (
        <label>
          Base item (optional)
          <input
            className="npc-code-input"
            value={gear.baseItem}
            onChange={(e) => setGear({ baseItem: e.target.value.trim().toLowerCase() })}
            placeholder={type.key === 'weapon' ? 'dnd5e base item, e.g. longsword - for proficiency and mastery' : 'e.g. chainmail, breastplate, shield'}
          />
        </label>
      )}

      {type.key === 'weapon' && (
        <div className="npc-applied-by">
          <span className="option-picker-label">Properties</span>
          {WEAPON_PROPERTIES.map(([key, label]) => (
            <label key={key} className="tag-checklist-item">
              <input type="checkbox" checked={(gear.properties ?? []).includes(key)} onChange={(e) => toggleProperty(key, e.target.checked)} />
              {label}
            </label>
          ))}
        </div>
      )}

      {type.key === 'armor' && (
        <div className="dm-form-row">
          <label>
            {gear.subtype === 'shield' ? 'AC bonus' : 'Base AC'}
            <input type="number" min="0" value={gear.armorValue} onChange={(e) => setGear({ armorValue: e.target.value })} placeholder={gear.subtype === 'shield' ? '2' : 'e.g. 14'} />
          </label>
          {gear.subtype === 'medium' && (
            <label>
              Max DEX bonus
              <input type="number" min="0" value={gear.dexCap} onChange={(e) => setGear({ dexCap: e.target.value })} placeholder="2" />
            </label>
          )}
          {gear.subtype === 'heavy' && (
            <label>
              Strength needed
              <input type="number" min="0" value={gear.strength} onChange={(e) => setGear({ strength: e.target.value })} placeholder="e.g. 15" />
            </label>
          )}
          {gear.subtype !== 'shield' && (
            <label className="tag-checklist-item">
              <input type="checkbox" checked={!!gear.stealthDisadvantage} onChange={(e) => setGear({ stealthDisadvantage: e.target.checked })} />
              Disadvantage on Stealth
            </label>
          )}
        </div>
      )}

      {type.key === 'consumable' && (
        <label className="tag-checklist-item">
          <input type="checkbox" checked={gear.autoDestroy !== false} onChange={(e) => setGear({ autoDestroy: e.target.checked })} />
          Used up when its last use is spent
        </label>
      )}
    </>
  )
}

// Switching kind picks that kind's first type and keeps everything else.
export function gearTypePatch(key) {
  const fresh = emptyGear(key)
  return { type: fresh.type, subtype: fresh.subtype }
}

const SYNTAX = [
  ['**bold**, *italic*', 'emphasis'],
  ['[[Name]]', 'a link'],
  ['## Heading', 'a named section, with a bold run-in title'],
  ['- item', 'a list (every line)'],
  ['> text', 'a quote (every line)'],
  ['a blank line', 'a new paragraph'],
]

function AbilityBlockFields({ block, set }) {
  const [more, setMore] = useState(!!(block.leadIn || block.source || block.castingTime || block.range || block.components || block.duration))
  return (
    <>
      <div className="dm-form-row">
        <label>
          Name
          <input value={block.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Drink Deep" />
        </label>
        <label>
          Subtitle
          <input value={block.subtitle} onChange={(e) => set({ subtitle: e.target.value })} placeholder="e.g. 1/day, or Bonus Action" />
        </label>
      </div>
      {more ? (
        <div className="dm-form-row">
          <label>
            Lead-in
            <input value={block.leadIn} onChange={(e) => set({ leadIn: e.target.value })} placeholder="before the name" />
          </label>
          <label>
            Source
            <input value={block.source} onChange={(e) => set({ source: e.target.value })} placeholder="after the name, in italics" />
          </label>
          <label>
            Casting time
            <input value={block.castingTime} onChange={(e) => set({ castingTime: e.target.value })} />
          </label>
          <label>
            Range
            <input value={block.range} onChange={(e) => set({ range: e.target.value })} />
          </label>
          <label>
            Components
            <input value={block.components} onChange={(e) => set({ components: e.target.value })} />
          </label>
          <label>
            Duration
            <input value={block.duration} onChange={(e) => set({ duration: e.target.value })} />
          </label>
        </div>
      ) : (
        <button type="button" className="secondary npc-small-button fw-self-start" onClick={() => setMore(true)}>
          + Lead-in, source, casting time…
        </button>
      )}
      <label>
        Text
        <textarea rows={4} value={block.description} onChange={(e) => set({ description: e.target.value })} />
      </label>
    </>
  )
}

// The written description: named abilities and prose, a live preview, and the
// HTML to paste into a wiki entry or tooltip.
export function DescriptionBlocks({ blocks, onChange }) {
  const [copied, setCopied] = useState(false)
  const [help, setHelp] = useState(false)
  const list = blocks ?? []
  const html = descriptionHtml(list)
  const update = (i, patch) => onChange(list.map((b, idx) => (idx === i ? { ...b, ...patch } : b)))
  const move = (i, d) => {
    const next = [...list]
    ;[next[i], next[i + d]] = [next[i + d], next[i]]
    onChange(next)
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(html)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="fw-description">
      <div className="aw-pieces">
        {list.map((block, i) => (
          <div key={i} className="aw-piece">
            <div className="aw-piece-head">
              <strong>{block.type === 'feature' ? block.name || 'Named ability' : 'Text'}</strong>
              <span className="aw-piece-tools">
                <button type="button" className="icon-button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                  ↑
                </button>
                <button type="button" className="icon-button" onClick={() => move(i, 1)} disabled={i === list.length - 1} aria-label="Move down">
                  ↓
                </button>
                <button type="button" className="icon-button" onClick={() => onChange(list.filter((_, idx) => idx !== i))} aria-label="Remove block">
                  ×
                </button>
              </span>
            </div>
            {block.type === 'feature' ? (
              <AbilityBlockFields block={block} set={(patch) => update(i, patch)} />
            ) : (
              <textarea rows={4} value={block.content ?? ''} onChange={(e) => update(i, { content: e.target.value })} aria-label="Text" />
            )}
          </div>
        ))}
      </div>
      <div className="dm-form-actions">
        <button type="button" className="secondary npc-small-button" onClick={() => onChange([...list, emptyAbilityBlock()])}>
          + Named ability
        </button>
        <button type="button" className="secondary npc-small-button" onClick={() => onChange([...list, emptyTextBlock()])}>
          + Text
        </button>
        <button type="button" className="secondary npc-small-button" onClick={() => setHelp((h) => !h)} aria-expanded={help}>
          Formatting help
        </button>
      </div>
      {help && (
        <ul className="fw-syntax">
          {SYNTAX.map(([code, what]) => (
            <li key={code}>
              <code>{code}</code> {what}
            </li>
          ))}
        </ul>
      )}
      {html && (
        <div className="fw-description-preview">
          <div className="aw-piece-head">
            <strong>Preview</strong>
            <button type="button" className="secondary npc-small-button" onClick={copy}>
              {copied ? 'Copied' : 'Copy HTML'}
            </button>
          </div>
          {/* The renderer escapes everything typed, then adds only its own tags. */}
          <div className="fw-description-html" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      )}
    </div>
  )
}
