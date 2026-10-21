import {
  ACTIVITY_KINDS,
  AREA_TYPES,
  CONDITIONS,
  DAMAGE_TYPES,
  ITEM_SECTIONS,
  NPC_ABILITIES,
  emptyActivity,
  emptyEffect,
  emptyNpcItem,
} from '../../../lib/foundryActorBuilder'
import OptionPicker from '../OptionPicker'

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)

// DAE special durations - the ones statblocks actually say ("until the start
// of the kraken's next turn" is turnStartSource).
const SPECIAL_DURATIONS = [
  { key: '', label: 'Until removed' },
  { key: 'turnStart', label: "Start of the target's next turn" },
  { key: 'turnEnd', label: "End of the target's next turn" },
  { key: 'turnStartSource', label: "Start of this creature's next turn" },
  { key: 'turnEndSource', label: "End of this creature's next turn" },
  { key: 'isDamaged', label: 'Target takes damage' },
]

function DamageRows({ rows, onChange, label = 'Damage' }) {
  function update(i, patch) {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }
  return (
    <div className="npc-damage-rows">
      <span className="option-picker-label">{label}</span>
      {rows.map((row, i) => (
        <div key={i} className="npc-damage-row">
          <input
            value={row.formula}
            onChange={(e) => update(i, { formula: e.target.value })}
            placeholder="e.g. 2d6 + @mod"
            aria-label="Damage formula"
          />
          <select value={row.types[0] ?? ''} onChange={(e) => update(i, { types: e.target.value ? [e.target.value] : [] })} aria-label="Damage type">
            <option value="">(no type)</option>
            {DAMAGE_TYPES.map((t) => (
              <option key={t} value={t}>
                {cap(t)}
              </option>
            ))}
          </select>
          {rows.length > 1 && (
            <button type="button" className="icon-button" onClick={() => onChange(rows.filter((_, idx) => idx !== i))} aria-label="Remove damage">
              ×
            </button>
          )}
        </div>
      ))}
      <button type="button" className="secondary npc-small-button" onClick={() => onChange([...rows, { formula: '', types: [] }])}>
        + Damage
      </button>
    </div>
  )
}

function AreaFields({ activity, set }) {
  return (
    <>
      <label>
        Area
        <select value={activity.areaType} onChange={(e) => set({ areaType: e.target.value })}>
          <option value="">None (targets)</option>
          {AREA_TYPES.map((t) => (
            <option key={t} value={t}>
              {cap(t)}
            </option>
          ))}
        </select>
      </label>
      {activity.areaType ? (
        <label>
          Area size (ft.)
          <input type="number" min="0" step="5" value={activity.areaSize} onChange={(e) => set({ areaSize: e.target.value })} />
        </label>
      ) : (
        <label>
          Targets
          <input type="number" min="1" value={activity.targetCount} placeholder="any" onChange={(e) => set({ targetCount: e.target.value })} />
        </label>
      )}
      <label>
        Range (ft.)
        <input type="number" min="0" step="5" value={activity.range ?? ''} placeholder="self" onChange={(e) => set({ range: e.target.value === '' ? null : Number(e.target.value) })} />
      </label>
    </>
  )
}

function ActivityEditor({ activity, onChange, onRemove }) {
  const set = (patch) => onChange({ ...activity, ...patch })

  return (
    <div className="npc-activity">
      <div className="dm-form-row">
        <label>
          Kind
          <select value={activity.kind} onChange={(e) => set({ kind: e.target.value })}>
            {ACTIVITY_KINDS.map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </select>
        </label>

        {activity.kind === 'attack' && (
          <>
            <label>
              Attack
              <select value={activity.attackType} onChange={(e) => set({ attackType: e.target.value })}>
                <option value="melee">Melee</option>
                <option value="ranged">Ranged</option>
              </select>
            </label>
            <label>
              Uses
              <select value={activity.classification} onChange={(e) => set({ classification: e.target.value })}>
                <option value="weapon">Weapon</option>
                <option value="spell">Spell</option>
              </select>
            </label>
            <label>
              Ability
              <select value={activity.ability} onChange={(e) => set({ ability: e.target.value })}>
                <option value="">Auto ({activity.attackType === 'ranged' ? 'DEX' : 'STR'})</option>
                {NPC_ABILITIES.map((a) => (
                  <option key={a} value={a}>
                    {a.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
            <label>
              To-hit override
              <input type="number" value={activity.toHit} placeholder="auto" onChange={(e) => set({ toHit: e.target.value })} />
            </label>
            {activity.attackType === 'ranged' ? (
              <>
                <label>
                  Range (ft.)
                  <input type="number" min="0" step="5" value={activity.range ?? ''} onChange={(e) => set({ range: Number(e.target.value) || null })} />
                </label>
                <label>
                  Long range (ft.)
                  <input type="number" min="0" step="5" value={activity.longRange ?? ''} onChange={(e) => set({ longRange: Number(e.target.value) || null })} />
                </label>
              </>
            ) : (
              <label>
                Reach (ft.)
                <input type="number" min="0" step="5" value={activity.reach ?? 5} onChange={(e) => set({ reach: Number(e.target.value) || 5 })} />
              </label>
            )}
          </>
        )}

        {activity.kind === 'save' && (
          <>
            <label>
              Save
              <select value={activity.saveAbility} onChange={(e) => set({ saveAbility: e.target.value })}>
                {NPC_ABILITIES.map((a) => (
                  <option key={a} value={a}>
                    {a.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
            <label>
              DC from
              <select value={activity.dcAbility} onChange={(e) => set({ dcAbility: e.target.value })}>
                <option value="">Fixed number</option>
                {NPC_ABILITIES.map((a) => (
                  <option key={a} value={a}>
                    8 + prof + {a.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
            {!activity.dcAbility && (
              <label>
                DC
                <input type="number" min="1" value={activity.dc} onChange={(e) => set({ dc: e.target.value })} />
              </label>
            )}
            <label>
              On a success
              <select value={activity.onSave} onChange={(e) => set({ onSave: e.target.value })}>
                <option value="half">Half damage</option>
                <option value="none">No damage</option>
                <option value="full">Full damage</option>
              </select>
            </label>
            <AreaFields activity={activity} set={set} />
          </>
        )}

        {activity.kind === 'damage' && <AreaFields activity={activity} set={set} />}

        {activity.kind === 'heal' && (
          <label>
            Healing
            <input value={activity.healing} placeholder="e.g. 2d8 + 4" onChange={(e) => set({ healing: e.target.value })} />
          </label>
        )}
      </div>

      {['attack', 'save', 'damage'].includes(activity.kind) && (
        <DamageRows rows={activity.damage} onChange={(damage) => set({ damage })} />
      )}

      <div className="repeatable-row-controls">
        <button type="button" className="danger npc-small-button" onClick={onRemove}>
          Remove roll
        </button>
      </div>
    </div>
  )
}

function EffectEditor({ effect, onChange, onRemove }) {
  const set = (patch) => onChange({ ...effect, ...patch })
  return (
    <div className="npc-activity">
      <div className="dm-form-row">
        <label>
          Effect name
          <input value={effect.name} onChange={(e) => set({ name: e.target.value })} placeholder="defaults to the item name" />
        </label>
        <label>
          Ends
          <select
            value={effect.specialDuration?.[0] ?? ''}
            onChange={(e) => set({ specialDuration: e.target.value ? [e.target.value] : [] })}
          >
            {SPECIAL_DURATIONS.map((d) => (
              <option key={d.key} value={d.key}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <label className="tag-checklist-item">
          <input type="checkbox" checked={!!effect.passive} onChange={(e) => set({ passive: e.target.checked })} />
          Always on (applies to this creature)
        </label>
      </div>
      <OptionPicker
        label="Conditions applied"
        options={CONDITIONS.map(cap)}
        selected={(effect.statuses ?? []).map(cap)}
        onChange={(list) => set({ statuses: list.map((s) => s.toLowerCase()) })}
        allowCustom={false}
        addPlaceholder="Add condition…"
      />
      <div className="repeatable-row-controls">
        <button type="button" className="danger npc-small-button" onClick={onRemove}>
          Remove effect
        </button>
      </div>
    </div>
  )
}

function ItemCard({ item, onChange, onRemove, onMove, isFirst, isLast }) {
  const set = (patch) => onChange({ ...item, ...patch })
  const updateList = (field, i, value) => set({ [field]: item[field].map((x, idx) => (idx === i ? value : x)) })

  return (
    <div className="repeatable-row npc-item-card">
      <div className="dm-form-row">
        <label>
          Name
          <input value={item.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Bite" />
        </label>
        <label>
          Section
          <select value={item.section} onChange={(e) => set({ section: e.target.value })}>
            {ITEM_SECTIONS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Shows in Foundry as
          <select value={item.itemType} onChange={(e) => set({ itemType: e.target.value })}>
            <option value="feat">Feature</option>
            <option value="weapon">Natural weapon</option>
          </select>
        </label>
        {item.section === 'legendary' && (
          <label>
            Costs (actions)
            <input type="number" min="1" max="3" value={item.legendaryCost} onChange={(e) => set({ legendaryCost: Number(e.target.value) || 1 })} />
          </label>
        )}
        <label>
          Limited use
          <select value={item.usesRecovery} onChange={(e) => set({ usesRecovery: e.target.value })}>
            <option value="">Unlimited</option>
            <option value="recharge">Recharge</option>
            <option value="day">Per day</option>
            <option value="lr">Per long rest</option>
            <option value="sr">Per short rest</option>
          </select>
        </label>
        {item.usesRecovery === 'recharge' && (
          <label>
            Recharges on
            <select value={item.rechargeOn} onChange={(e) => set({ rechargeOn: Number(e.target.value) })}>
              {[2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n === 6 ? '6' : `${n}–6`}
                </option>
              ))}
            </select>
          </label>
        )}
        {['day', 'lr', 'sr'].includes(item.usesRecovery) && (
          <label>
            Uses
            <input type="number" min="1" value={item.usesMax} onChange={(e) => set({ usesMax: e.target.value })} />
          </label>
        )}
      </div>

      <label>
        Description (optional - blank uses the generated statblock line)
        <textarea value={item.description} rows={3} onChange={(e) => set({ description: e.target.value })} />
      </label>

      {item.activities.map((activity, i) => (
        <ActivityEditor
          key={activity.key}
          activity={activity}
          onChange={(value) => updateList('activities', i, value)}
          onRemove={() => set({ activities: item.activities.filter((_, idx) => idx !== i) })}
        />
      ))}
      {item.effects.map((effect, i) => (
        <EffectEditor
          key={effect.key}
          effect={effect}
          onChange={(value) => updateList('effects', i, value)}
          onRemove={() => set({ effects: item.effects.filter((_, idx) => idx !== i) })}
        />
      ))}

      <div className="dm-form-actions npc-item-actions">
        <button type="button" className="secondary npc-small-button" onClick={() => set({ activities: [...item.activities, emptyActivity(item.activities.length ? 'damage' : 'attack')] })}>
          + Roll
        </button>
        <button type="button" className="secondary npc-small-button" onClick={() => set({ effects: [...item.effects, emptyEffect()] })}>
          + Effect / condition
        </button>
        <span className="npc-item-actions-spacer" />
        <button type="button" className="icon-button" disabled={isFirst} onClick={() => onMove(-1)} aria-label="Move up">
          ↑
        </button>
        <button type="button" className="icon-button" disabled={isLast} onClick={() => onMove(1)} aria-label="Move down">
          ↓
        </button>
        <button type="button" className="danger npc-small-button" onClick={onRemove}>
          Delete
        </button>
      </div>
    </div>
  )
}

// Statblock items grouped by section (Traits, Actions, ... Lair Actions), each
// an item card with its rolls and effects. Order within a section is the
// order Foundry lists them in.
export default function ActionBuilder({ items, onChange }) {
  function update(key, value) {
    onChange(items.map((i) => (i.key === key ? value : i)))
  }

  function move(key, section, dir) {
    const inSection = items.filter((i) => i.section === section)
    const idx = inSection.findIndex((i) => i.key === key)
    const swapWith = inSection[idx + dir]
    if (!swapWith) return
    const a = items.findIndex((i) => i.key === key)
    const b = items.findIndex((i) => i.key === swapWith.key)
    const next = [...items]
    ;[next[a], next[b]] = [next[b], next[a]]
    onChange(next)
  }

  return (
    <div className="npc-action-builder">
      {ITEM_SECTIONS.map((section) => {
        const inSection = items.filter((i) => i.section === section.key)
        return (
          <div key={section.key} className="npc-section">
            <div className="dm-panel-header">
              <h3>{section.label}</h3>
              <button type="button" className="secondary npc-small-button" onClick={() => onChange([...items, emptyNpcItem(section.key)])}>
                + Add
              </button>
            </div>
            <div className="repeatable-rows">
              {inSection.map((item, i) => (
                <ItemCard
                  key={item.key}
                  item={item}
                  isFirst={i === 0}
                  isLast={i === inSection.length - 1}
                  onChange={(value) => update(item.key, value)}
                  onRemove={() => onChange(items.filter((x) => x.key !== item.key))}
                  onMove={(dir) => move(item.key, section.key, dir)}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
