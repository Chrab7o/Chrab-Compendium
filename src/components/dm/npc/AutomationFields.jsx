import { CONDITIONS, DAMAGE_TYPES, emptyOverTimeRoll } from '../../../lib/foundryActorBuilder'
import {
  CREATURE_TYPES,
  SCRIPT_PASSES,
  SCRIPT_RECIPES,
  SIZE_LABELS,
  SIZE_ORDER,
  conditionPresets,
  emptyCondition,
  emptyScript,
  scriptCode,
} from '../../../lib/foundryAutomation'
import OptionPicker from '../OptionPicker'
import FormulaInput, { AttributePathInput } from './FormulaInput'

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)

function SizeSelect({ value, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Size">
      {SIZE_ORDER.map((s) => (
        <option key={s} value={s}>
          {SIZE_LABELS[s]}
        </option>
      ))}
    </select>
  )
}

function DamageTypeSelect({ value, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Damage type">
      <option value="">Same as the roll</option>
      {DAMAGE_TYPES.map((t) => (
        <option key={t} value={t}>
          {cap(t)}
        </option>
      ))}
    </select>
  )
}

// Guided midi-qol conditions on the target, all of which must hold.
// slot: 'use' | 'effect' | 'trigger' (some presets only fit after a save).
export function ConditionRows({ rows, onChange, slot, label }) {
  const presets = conditionPresets(slot)
  const update = (i, patch) => onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  return (
    <div className="npc-damage-rows">
      {rows.length > 0 && <span className="option-picker-label">{label}</span>}
      {rows.map((row, i) => (
        <div key={row.key} className="npc-condition">
          <div className="npc-change-row">
            <select value={row.id} onChange={(e) => onChange(rows.map((r, idx) => (idx === i ? { ...emptyCondition(e.target.value), key: r.key } : r)))} aria-label="Condition">
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            {(row.id === 'hpAtMost' || row.id === 'failedBy') && (
              <input type="number" min="0" value={row.value} onChange={(e) => update(i, { value: e.target.value })} aria-label="Value" />
            )}
            {(row.id === 'sizeAtLeast' || row.id === 'sizeAtMost') && <SizeSelect value={row.size} onChange={(size) => update(i, { size })} />}
            {(row.id === 'hasStatus' || row.id === 'lacksStatus') && (
              <select value={row.status} onChange={(e) => update(i, { status: e.target.value })} aria-label="Condition">
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {cap(c)}
                  </option>
                ))}
              </select>
            )}
            {row.id === 'raw' && (
              <input value={row.text} onChange={(e) => update(i, { text: e.target.value })} placeholder='e.g. target.attributes.ac.value < 15' aria-label="Expression" className="npc-code-input" />
            )}
            <button type="button" className="icon-button" onClick={() => onChange(rows.filter((_, idx) => idx !== i))} aria-label="Remove condition">
              ×
            </button>
          </div>
          {(row.id === 'typeIs' || row.id === 'typeIsNot') && (
            <OptionPicker
              options={CREATURE_TYPES.map(cap)}
              selected={(row.types ?? []).map(cap)}
              onChange={(list) => update(i, { types: list.map((t) => t.toLowerCase()) })}
              addPlaceholder="Add a creature type…"
              customPlaceholder="Other type…"
            />
          )}
        </div>
      ))}
      <button type="button" className="secondary npc-small-button" onClick={() => onChange([...rows, emptyCondition(slot === 'use' ? 'typeIs' : presets[0].id)])}>
        + Target condition
      </button>
    </div>
  )
}

// Midi activity over time: this roll repeats on each turn of whoever carries
// one of the item's effects, until a save ends it (or after one tick).
export function OverTimeRollFields({ activity, set, item }) {
  const targetEffects = item.effects.filter((e) => !e.passive)
  const ot = activity.overTime
  return (
    <div className="npc-damage-rows">
      <label className="tag-checklist-item">
        <input type="checkbox" checked={!!ot} onChange={(e) => set({ overTime: e.target.checked ? emptyOverTimeRoll() : null })} />
        Repeats each turn on whoever has this item's effect
      </label>
      {ot && (
        <div className="npc-overtime">
          <div className="dm-form-row">
            <label>
              Rolls at the
              <select value={ot.turn} onChange={(e) => set({ overTime: { ...ot, turn: e.target.value } })}>
                <option value="end">End of their turn</option>
                <option value="start">Start of their turn</option>
              </select>
            </label>
            <label>
              While they have
              <select value={ot.effectKey} onChange={(e) => set({ overTime: { ...ot, effectKey: e.target.value } })}>
                <option value="">{targetEffects[0]?.name ? `${targetEffects[0].name} (first effect)` : 'The first target effect'}</option>
                {targetEffects.slice(1).map((e) => (
                  <option key={e.key} value={e.key}>
                    {e.name || 'Unnamed effect'}
                  </option>
                ))}
              </select>
            </label>
            {activity.kind === 'save' && (
              <label className="tag-checklist-item">
                <input type="checkbox" checked={ot.saveEnds !== false} onChange={(e) => set({ overTime: { ...ot, saveEnds: e.target.checked } })} />
                A successful save ends it
              </label>
            )}
            <label className="tag-checklist-item">
              <input type="checkbox" checked={!!ot.once} onChange={(e) => set({ overTime: { ...ot, once: e.target.checked } })} />
              Only once, then the effect ends
            </label>
          </div>
          {!targetEffects.length && <span className="npc-hint">Add an effect that lands on the target - this roll repeats while it lasts.</span>}
          <span className="npc-hint">
            Rolled by this creature each turn (its DC and bonuses), never spends uses, and doesn&apos;t show as a choice when the item is used.
          </span>
        </div>
      )}
    </div>
  )
}

function RecipeParams({ script, setParams }) {
  const p = script.params ?? {}
  const set = (patch) => setParams({ ...p, ...patch })
  switch (script.recipe) {
    case 'targetStatDamage':
      return (
        <div className="dm-form-row">
          <label className="npc-wide-field">
            Target stat
            <AttributePathInput value={p.stat} onChange={(stat) => set({ stat: stat.replace(/^@/, '') })} use="formula" placeholder="abilities.con.mod" ariaLabel="Target stat" />
          </label>
          <label>
            Times
            <input type="number" step="0.5" value={p.multiplier} onChange={(e) => set({ multiplier: e.target.value })} />
          </label>
          <label>
            At least
            <input type="number" value={p.minimum} onChange={(e) => set({ minimum: e.target.value })} />
          </label>
          <label>
            Damage type
            <DamageTypeSelect value={p.damageType} onChange={(damageType) => set({ damageType })} />
          </label>
          <label>
            Chat label
            <input value={p.label} onChange={(e) => set({ label: e.target.value })} placeholder="Bonus damage" />
          </label>
        </div>
      )
    case 'sizeDamage':
      return (
        <div className="dm-form-row">
          <label>
            When the target is
            <select value={p.compare} onChange={(e) => set({ compare: e.target.value })}>
              <option value="atLeast">At least</option>
              <option value="atMost">At most</option>
            </select>
          </label>
          <label>
            Size
            <SizeSelect value={p.size} onChange={(size) => set({ size })} />
          </label>
          <label>
            Extra damage
            <FormulaInput value={p.formula} onChange={(formula) => set({ formula })} placeholder="2d6" ariaLabel="Extra damage" />
          </label>
          <label>
            Damage type
            <DamageTypeSelect value={p.damageType} onChange={(damageType) => set({ damageType })} />
          </label>
        </div>
      )
    case 'drain':
      return (
        <div className="dm-form-row">
          <label>
            Heals for (% of damage dealt)
            <input type="number" min="1" max="100" value={p.percent} onChange={(e) => set({ percent: e.target.value })} />
          </label>
        </div>
      )
    case 'push':
      return (
        <div className="dm-form-row">
          <label>
            Distance (ft.)
            <input type="number" min="5" step="5" value={p.distance} onChange={(e) => set({ distance: e.target.value })} />
          </label>
          <label>
            Pushes
            <select value={p.who} onChange={(e) => set({ who: e.target.value })}>
              <option value="hit">Every target hit</option>
              <option value="failed">Every target that failed its save</option>
            </select>
          </label>
        </div>
      )
    default:
      return null
  }
}

const CHEAT_SHEET = [
  ['workflow.hitTargets / failedSaves / saves / targets', 'Sets of tokens - .first(), for (const t of …)'],
  ['target.actor.system.abilities.con.mod', 'a target token’s stats (or target.actor.getRollData())'],
  ['actor, token, item', 'this NPC, its token, the item being used'],
  ['workflow.damageTotal, workflow.damageList', 'damage rolled / per-target damage applied (hpDamage)'],
  ['workflow.saveDC, workflow.tokenSaves[t.document.uuid].total', 'the DC and each target’s save total'],
  ['await workflow.setDamageRolls([roll])', 'replace the damage (postDamageRoll)'],
  ['return { damageRoll: "2d6", damageType: "fire" }', 'add damage (damageBonus pass)'],
  ['MidiQOL.moveTokenAwayFromPoint(t, 10, token.center)', 'push a token'],
  ['MidiQOL.findNearby(-1, token, 10)', 'tokens of a disposition within 10 ft.'],
  ['MidiQOL.socket().executeAsGM("createEffects", { actorUuid, effects })', 'add effects as the GM'],
]

// Recipes + editable code. Until the code is edited it's regenerated from the
// recipe's fields; once edited, the hand-written code is what exports.
export function ScriptEditor({ activity, set }) {
  const script = activity.script
  const recipe = SCRIPT_RECIPES.find((r) => r.id === script?.recipe)
  const setScript = (patch) => set({ script: { ...script, ...patch } })

  return (
    <div className="npc-damage-rows">
      <label className="npc-script-pick">
        Script
        <select
          value={script?.recipe ?? ''}
          onChange={(e) => set({ script: e.target.value ? emptyScript(e.target.value) : null })}
        >
          <option value="">None</option>
          {SCRIPT_RECIPES.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      </label>
      {script && (
        <div className="npc-script">
          {recipe?.help && <span className="npc-hint">{recipe.help}</span>}
          {!script.edited && <RecipeParams script={script} setParams={(params) => setScript({ params })} />}
          {script.recipe === 'custom' && (
            <label>
              Runs
              <select value={script.pass} onChange={(e) => setScript({ pass: e.target.value })}>
                {SCRIPT_PASSES.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Code{script.edited ? ' (edited by hand - recipe fields are off)' : ''}
            <textarea
              className="npc-code"
              rows={Math.min(18, Math.max(6, scriptCode(script).split('\n').length + 1))}
              spellCheck={false}
              value={scriptCode(script)}
              onChange={(e) => setScript({ code: e.target.value, edited: true })}
            />
          </label>
          {script.edited && recipe && recipe.id !== 'custom' && (
            <div className="repeatable-row-controls">
              <button type="button" className="secondary npc-small-button" onClick={() => setScript({ edited: false, code: '' })}>
                Back to the recipe
              </button>
            </div>
          )}
          <details className="npc-cheatsheet">
            <summary>What the script can use</summary>
            <dl>
              {CHEAT_SHEET.map(([code, text]) => (
                <div key={code}>
                  <dt>
                    <code>{code}</code>
                  </dt>
                  <dd>{text}</dd>
                </div>
              ))}
            </dl>
          </details>
        </div>
      )}
    </div>
  )
}
