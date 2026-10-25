import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AREA_TYPES,
  NPC_ABILITIES,
  SPELL_METHODS,
  SPELL_SCHOOLS,
  emptyActivity,
  emptyEffect,
  emptyNpcSpell,
  emptySpellcasting,
  npcRollData,
  signedNumber,
  spellAttackBonus,
  spellLevelLabel,
  spellSaveDc,
} from '../../../lib/foundryActorBuilder'
import { fiveToolsSpellList, prepareFiveToolsSpell, spellRecordToNpcSpell } from '../../../lib/fiveToolsSpells'
import { ActivityEditor, EffectEditor } from './ActionBuilder'
import FormulaInput, { NpcSpecContext } from './FormulaInput'

const ABILITY_NAMES = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' }
const CAST_TIMES = [
  { key: 'action', label: 'Action' },
  { key: 'bonus', label: 'Bonus action' },
  { key: 'reaction', label: 'Reaction' },
  { key: 'minute', label: 'Minute(s)' },
  { key: 'hour', label: 'Hour(s)' },
  { key: 'special', label: 'Special' },
]
const RANGE_UNITS = [
  { key: 'ft', label: 'Feet' },
  { key: 'mi', label: 'Miles' },
  { key: 'self', label: 'Self' },
  { key: 'touch', label: 'Touch' },
  { key: 'spec', label: 'Special / sight' },
  { key: 'any', label: 'Unlimited' },
]
const DURATION_UNITS = [
  { key: 'inst', label: 'Instantaneous' },
  { key: 'round', label: 'Round(s)' },
  { key: 'minute', label: 'Minute(s)' },
  { key: 'hour', label: 'Hour(s)' },
  { key: 'day', label: 'Day(s)' },
  { key: 'perm', label: 'Until dispelled' },
  { key: 'spec', label: 'Special' },
]
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)

// A new spell's casting method follows the NPC's style: slots if it uses
// them, otherwise 2024 innate - cantrips at will, leveled spells 1/day.
function defaultMethod(spellcasting, level) {
  if (spellcasting?.slots) return 'slots'
  return Number(level) === 0 ? 'atwill' : 'perDay'
}

function useCatalog(open) {
  const [catalog, setCatalog] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!open || catalog) return
    // ~1 MB of spell text: loaded only when the picker opens.
    import('../../../data/spells/catalog.json')
      .then((m) => setCatalog(m.default))
      .catch((e) => setError(e.message))
  }, [open, catalog])
  return { catalog, error }
}

// Search 5etools spells (the bundled catalog, or an uploaded homebrew file's
// spells) and add them. Stays open so several can be added in a row.
function SpellPicker({ records, title, onAdd, onClose, takenKeys }) {
  const [query, setQuery] = useState('')
  const [level, setLevel] = useState('')
  const [klass, setKlass] = useState('')
  const classes = useMemo(() => [...new Set((records ?? []).flatMap((r) => r.classes ?? []))].sort(), [records])
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const shown = (records ?? []).filter(
    (r) =>
      (level === '' || r.level === Number(level)) &&
      (!klass || (r.classes ?? []).includes(klass)) &&
      words.every((w) => `${r.name} ${r.source} ${SPELL_SCHOOLS[r.school] ?? ''}`.toLowerCase().includes(w))
  )

  return (
    <div className="npc-spell-picker">
      <div className="dm-panel-header">
        <h4>{title}</h4>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close spell picker">
          ×
        </button>
      </div>
      {!records ? (
        <p className="npc-hint">Loading spells…</p>
      ) : (
        <>
          <div className="dm-form-row">
            <label>
              Search
              <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="fireball, necromancy, xge…" />
            </label>
            <label>
              Level
              <select value={level} onChange={(e) => setLevel(e.target.value)}>
                <option value="">Any</option>
                {Array.from({ length: 10 }, (_, i) => (
                  <option key={i} value={i}>
                    {spellLevelLabel(i)}
                  </option>
                ))}
              </select>
            </label>
            {classes.length > 0 && (
              <label>
                Class list
                <select value={klass} onChange={(e) => setKlass(e.target.value)}>
                  <option value="">Any</option>
                  {classes.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <ul className="npc-spell-results">
            {shown.slice(0, 80).map((r) => {
              const taken = takenKeys.has(r.key)
              return (
                <li key={r.key}>
                  <span className="npc-spell-result-name">{r.name}</span>
                  <span className="npc-hint">
                    {spellLevelLabel(r.level)} {SPELL_SCHOOLS[r.school] ?? ''} · {r.source}
                  </span>
                  <button type="button" className="secondary npc-small-button" disabled={taken} onClick={() => onAdd(r)}>
                    {taken ? 'Added' : 'Add'}
                  </button>
                </li>
              )
            })}
            {shown.length > 80 && <li className="npc-hint">{shown.length - 80} more - narrow the search.</li>}
            {!shown.length && <li className="npc-hint">No spells match.</li>}
          </ul>
        </>
      )}
    </div>
  )
}

// The pieces of a spell's card. SpellCard stacks them; the guided Feature
// Forge (feature/FeatureWizard.jsx) splits them over its Basics and "How it's
// used" steps.

// Name, level, school, and for an NPC how it casts it.
export function SpellNameFields({ spell, set, standalone = false }) {
  return (
    <div className="dm-form-row">
      <label>
        Name
        <input value={spell.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Hellfire Lance" />
      </label>
      <label>
        Level
        <select value={spell.level} onChange={(e) => set({ level: Number(e.target.value) })}>
          {Array.from({ length: 10 }, (_, i) => (
            <option key={i} value={i}>
              {spellLevelLabel(i)}
            </option>
          ))}
        </select>
      </label>
      <label>
        School
        <select value={spell.school} onChange={(e) => set({ school: e.target.value })}>
          {Object.entries(SPELL_SCHOOLS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      {!standalone && (
        <label>
          Cast
          <select value={spell.method} onChange={(e) => set({ method: e.target.value })}>
            {SPELL_METHODS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {!standalone && spell.method === 'perDay' && (
        <label>
          Times per day
          <input type="number" min="1" value={spell.usesPerDay} onChange={(e) => set({ usesPerDay: Number(e.target.value) || 1 })} />
        </label>
      )}
    </div>
  )
}

// Casting time, range, area and duration.
export function SpellCastingFields({ spell, set }) {
  const setIn = (field, patch) => set({ [field]: { ...spell[field], ...patch } })
  return (
    <div className="dm-form-row">
      <label>
        Casting time
        <select value={spell.activation.type} onChange={(e) => setIn('activation', { type: e.target.value })}>
          {CAST_TIMES.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      {['minute', 'hour'].includes(spell.activation.type) && (
        <label>
          How many
          <input type="number" min="1" value={spell.activation.value} onChange={(e) => setIn('activation', { value: Number(e.target.value) || 1 })} />
        </label>
      )}
      <label>
        Range
        <select value={spell.range.units} onChange={(e) => setIn('range', { units: e.target.value })}>
          {RANGE_UNITS.map((u) => (
            <option key={u.key} value={u.key}>
              {u.label}
            </option>
          ))}
        </select>
      </label>
      {['ft', 'mi'].includes(spell.range.units) && (
        <label>
          Distance
          <input type="number" min="0" value={spell.range.value} onChange={(e) => setIn('range', { value: e.target.value })} />
        </label>
      )}
      <label>
        Area
        <select value={spell.area.type} onChange={(e) => setIn('area', { type: e.target.value })}>
          <option value="">None</option>
          {AREA_TYPES.map((t) => (
            <option key={t} value={t}>
              {cap(t)}
            </option>
          ))}
        </select>
      </label>
      {spell.area.type && (
        <label>
          Area size (ft.)
          <input type="number" min="0" step="5" value={spell.area.size} onChange={(e) => setIn('area', { size: e.target.value })} />
        </label>
      )}
      <label>
        Duration
        <select value={spell.duration.units} onChange={(e) => setIn('duration', { units: e.target.value })}>
          {DURATION_UNITS.map((u) => (
            <option key={u.key} value={u.key}>
              {u.label}
            </option>
          ))}
        </select>
      </label>
      {['round', 'minute', 'hour', 'day'].includes(spell.duration.units) && (
        <label>
          How long
          <input type="number" min="1" value={spell.duration.value} onChange={(e) => setIn('duration', { value: e.target.value })} />
        </label>
      )}
    </div>
  )
}

// Components, concentration and ritual.
export function SpellComponentFields({ spell, set }) {
  const setIn = (field, patch) => set({ [field]: { ...spell[field], ...patch } })
  return (
    <>
      <div className="dm-form-row">
        <label className="tag-checklist-item">
          <input type="checkbox" checked={!!spell.components.v} onChange={(e) => setIn('components', { v: e.target.checked })} />
          Verbal
        </label>
        <label className="tag-checklist-item">
          <input type="checkbox" checked={!!spell.components.s} onChange={(e) => setIn('components', { s: e.target.checked })} />
          Somatic
        </label>
        <label className="tag-checklist-item">
          <input type="checkbox" checked={!!spell.components.m} onChange={(e) => setIn('components', { m: e.target.checked })} />
          Material
        </label>
        <label className="tag-checklist-item">
          <input type="checkbox" checked={!!spell.concentration} onChange={(e) => set({ concentration: e.target.checked })} />
          Concentration
        </label>
        <label className="tag-checklist-item">
          <input type="checkbox" checked={!!spell.ritual} onChange={(e) => set({ ritual: e.target.checked })} />
          Ritual
        </label>
      </div>
      {spell.components.m && (
        <label>
          Materials
          <input value={spell.materials} onChange={(e) => set({ materials: e.target.value })} placeholder="a pinch of sulfur" />
        </label>
      )}
    </>
  )
}

export function SpellUpcastField({ spell, set }) {
  if (!(Number(spell.level) > 0)) return null
  return (
    <label>
      Each slot level above {spellLevelLabel(spell.level)} adds
      <FormulaInput value={spell.upcast} onChange={(upcast) => set({ upcast })} placeholder="e.g. 1d6 (blank = no upcasting)" ariaLabel="Upcast step" showHint={false} />
    </label>
  )
}

// standalone: a player's spell on its own (the Feature Forge) - always cast
// with slots, so there's no NPC casting method to pick and nothing to remove.
export function SpellCard({ spell, onChange, onRemove, standalone = false }) {
  const [open, setOpen] = useState(standalone || !spell.name)
  const set = (patch) => onChange({ ...spell, ...patch })
  const updateList = (field, i, value) => set({ [field]: spell[field].map((x, idx) => (idx === i ? value : x)) })

  function removeActivity(i) {
    const gone = spell.activities[i].key
    set({
      activities: spell.activities
        .filter((_, idx) => idx !== i)
        .map((a) => (a.triggerKey === gone ? { ...a, triggerKey: '', triggerOnlyIf: '', triggerConditions: [] } : a))
        .map((a) => (a.otherKey === gone ? { ...a, otherKey: '' } : a)),
      effects: spell.effects.map((e) => (e.appliedBy?.includes(gone) ? { ...e, appliedBy: e.appliedBy.filter((k) => k !== gone) } : e)),
    })
  }

  const tags = [spell.concentration && 'C', spell.ritual && 'R'].filter(Boolean).join(', ')
  const methodLabel = spell.method === 'perDay' ? `${Number(spell.usesPerDay) || 1}/day` : SPELL_METHODS.find((m) => m.key === spell.method)?.label

  return (
    <div className="repeatable-row npc-spell-card">
      <button type="button" className="npc-spell-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="npc-spell-name">{spell.name || 'Unnamed spell'}</span>
        <span className="npc-hint">
          {spellLevelLabel(spell.level)} {SPELL_SCHOOLS[spell.school] ?? ''}
          {tags ? ` (${tags})` : ''}
        </span>
        {!standalone && <span className="npc-badge">{methodLabel}</span>}
      </button>
      {open && (
        <div className="npc-spell-body">
          <SpellNameFields spell={spell} set={set} standalone={standalone} />
          <SpellCastingFields spell={spell} set={set} />
          <SpellComponentFields spell={spell} set={set} />
          <SpellUpcastField spell={spell} set={set} />
          <label>
            Description (HTML or plain text - blank uses the generated roll text)
            <textarea rows={4} value={spell.description} onChange={(e) => set({ description: e.target.value })} />
          </label>

          {spell.activities.map((activity, i) => (
            <ActivityEditor
              key={activity.key}
              activity={activity}
              item={spell}
              index={i}
              inSpell
              onChange={(value) => updateList('activities', i, value)}
              onRemove={() => removeActivity(i)}
            />
          ))}
          {spell.effects.map((effect, i) => (
            <EffectEditor
              key={effect.key}
              effect={effect}
              item={spell}
              onChange={(value) => updateList('effects', i, value)}
              onRemove={() => set({ effects: spell.effects.filter((_, idx) => idx !== i) })}
            />
          ))}
          <div className="dm-form-actions npc-item-actions">
            <button
              type="button"
              className="secondary npc-small-button"
              onClick={() => set({ activities: [...spell.activities, { ...emptyActivity('save'), dcAbility: 'spellcasting' }] })}
            >
              + Roll
            </button>
            <button type="button" className="secondary npc-small-button" onClick={() => set({ effects: [...spell.effects, emptyEffect()] })}>
              + Effect / condition
            </button>
            {!standalone && (
              <>
                <span className="npc-item-actions-spacer" />
                <button type="button" className="danger npc-small-button" onClick={onRemove}>
                  Remove spell
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function spellGroups(spells, spellcasting) {
  const groups = []
  const atWill = spells.filter((s) => s.method === 'atwill')
  if (atWill.length) groups.push({ label: 'At will', spells: atWill })
  const perDay = spells.filter((s) => s.method === 'perDay')
  for (const n of [...new Set(perDay.map((s) => Number(s.usesPerDay) || 1))].sort((a, b) => b - a)) {
    groups.push({ label: `${n}/day each`, spells: perDay.filter((s) => (Number(s.usesPerDay) || 1) === n) })
  }
  const slotted = spells.filter((s) => s.method === 'slots')
  for (let level = 0; level <= 9; level++) {
    const inLevel = slotted.filter((s) => (Number(s.level) || 0) === level)
    if (!inLevel.length) continue
    const slots = Number(spellcasting.slotCounts?.[level]) || 0
    groups.push({ label: level === 0 ? 'Cantrips' : `${spellLevelLabel(level)} level (${slots} slot${slots === 1 ? '' : 's'})`, spells: inLevel })
  }
  return groups
}

// The NPC's spells: casting ability, optional slots, and the spell list,
// fed from the 5etools catalog, a homebrew 5etools file, or by hand.
export default function SpellcastingPanel({ spec, onChange }) {
  const spellcasting = { ...emptySpellcasting(), ...(spec.spellcasting ?? {}) }
  const spells = spec.spells ?? []
  const ctx = useMemo(() => ({ spec, rollData: npcRollData(spec) }), [spec])
  const [picker, setPicker] = useState(null) // null | 'catalog' | { title, records }
  const [uploadError, setUploadError] = useState('')
  const fileRef = useRef(null)
  const { catalog, error } = useCatalog(picker === 'catalog')

  const setCasting = (patch) => onChange({ spellcasting: { ...spellcasting, ...patch } })
  const setSpells = (next) => onChange({ spells: next })
  const takenKeys = new Set(spells.map((s) => s.fiveTools).filter(Boolean))

  function addRecord(record) {
    const spell = spellRecordToNpcSpell(record)
    setSpells([...spells, { ...spell, method: defaultMethod(spellcasting, spell.level) }])
  }

  async function onUpload(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const list = fiveToolsSpellList(JSON.parse(await file.text()))
      if (!list.length) throw new Error('No spells found - expected a 5etools file with a "spell" array.')
      setUploadError('')
      setPicker({ title: `Spells in ${file.name}`, records: list.map((raw) => prepareFiveToolsSpell(raw)) })
    } catch (err) {
      setUploadError(err.message)
    }
  }

  return (
    <NpcSpecContext.Provider value={ctx}>
      <div className="npc-spellcasting">
        <div className="dm-form-row">
          <label>
            Spellcasting ability
            <select value={spellcasting.ability} onChange={(e) => setCasting({ ability: e.target.value })}>
              {NPC_ABILITIES.map((a) => (
                <option key={a} value={a}>
                  {ABILITY_NAMES[a]}
                </option>
              ))}
            </select>
          </label>
          {!spellcasting.slots && (
            <label>
              Statblock entry under
              <select value={spellcasting.section} onChange={(e) => setCasting({ section: e.target.value })}>
                <option value="action">Actions (2024 style)</option>
                <option value="trait">Traits</option>
              </select>
            </label>
          )}
          <label className="tag-checklist-item">
            <input type="checkbox" checked={!!spellcasting.slots} onChange={(e) => setCasting({ slots: e.target.checked })} />
            Uses spell slots
          </label>
          {spellcasting.slots && (
            <label>
              Caster level
              <input type="number" min="1" max="20" value={spellcasting.casterLevel} onChange={(e) => setCasting({ casterLevel: Number(e.target.value) || 1 })} />
            </label>
          )}
        </div>
        <p className="npc-hint">
          Spell save DC {spellSaveDc(spec)}, {signedNumber(spellAttackBonus(spec))} to hit with spell attacks.
        </p>
        {spellcasting.slots && (
          <div className="npc-slot-grid">
            {Array.from({ length: 9 }, (_, i) => i + 1).map((level) => (
              <label key={level}>
                {spellLevelLabel(level)}
                <input
                  type="number"
                  min="0"
                  max="9"
                  value={spellcasting.slotCounts?.[level] ?? 0}
                  onChange={(e) => setCasting({ slotCounts: { ...spellcasting.slotCounts, [level]: Number(e.target.value) || 0 } })}
                />
              </label>
            ))}
          </div>
        )}

        <div className="dm-form-actions npc-item-actions">
          <button type="button" className="secondary npc-small-button" onClick={() => setPicker(picker === 'catalog' ? null : 'catalog')}>
            + From 5etools
          </button>
          <button type="button" className="secondary npc-small-button" onClick={() => fileRef.current?.click()}>
            Import homebrew spells…
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onUpload} />
          <button
            type="button"
            className="secondary npc-small-button"
            onClick={() => setSpells([...spells, { ...emptyNpcSpell(), method: defaultMethod(spellcasting, 1) }])}
          >
            + Custom spell
          </button>
        </div>
        {uploadError && <p className="status-message error">{uploadError}</p>}
        {error && <p className="status-message error">Couldn&apos;t load the spell list: {error}</p>}
        {picker && (
          <SpellPicker
            title={picker === 'catalog' ? '5etools spells (2024 versions where reprinted)' : picker.title}
            records={picker === 'catalog' ? catalog : picker.records}
            takenKeys={takenKeys}
            onAdd={addRecord}
            onClose={() => setPicker(null)}
          />
        )}

        {spellGroups(spells, spellcasting).map((group) => (
          <div key={group.label} className="npc-spell-group">
            <h4>{group.label}</h4>
            <div className="repeatable-rows">
              {group.spells.map((spell) => (
                <SpellCard
                  key={spell.key}
                  spell={spell}
                  onChange={(value) => setSpells(spells.map((s) => (s.key === spell.key ? value : s)))}
                  onRemove={() => setSpells(spells.filter((s) => s.key !== spell.key))}
                />
              ))}
            </div>
          </div>
        ))}
        {!spells.length && <p className="npc-hint">No spells yet.</p>}
      </div>
    </NpcSpecContext.Provider>
  )
}
