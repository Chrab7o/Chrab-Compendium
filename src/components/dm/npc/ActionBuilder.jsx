import { useContext, useMemo } from 'react'
import {
  ACTIVATION_TYPES,
  ACTIVITY_KINDS,
  AREA_TYPES,
  CHANGE_PARAMS,
  CHANGE_TYPES,
  CONDITIONS,
  DAMAGE_TYPES,
  EFFECT_CHANGES,
  ITEM_SECTIONS,
  NPC_ABILITIES,
  SPEND_SOURCES,
  TARGET_TYPES,
  emptyActivity,
  emptyChange,
  emptyEffect,
  emptyNpcItem,
  emptyOverTime,
  emptySpend,
  npcRollData,
  overTimeValue,
  saveDc,
} from '../../../lib/foundryActorBuilder'
import OptionPicker from '../OptionPicker'
import FormulaInput, { NpcSpecContext } from './FormulaInput'

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

const CHANGE_GROUPS = [...new Set(EFFECT_CHANGES.map((c) => c.group))]

function DamageRows({ rows, onChange, withMod, label = 'Damage' }) {
  function update(i, patch) {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }
  return (
    <div className="npc-damage-rows">
      <span className="option-picker-label">{label}</span>
      {rows.map((row, i) => (
        <div key={i} className="npc-damage-row">
          <FormulaInput
            value={row.formula}
            onChange={(formula) => update(i, { formula })}
            placeholder={withMod ? 'e.g. 2d6 + @mod' : 'e.g. 4d8'}
            ariaLabel="Damage formula"
            withMod={withMod}
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
        Affects
        <select value={activity.targetType ?? 'creature'} onChange={(e) => set({ targetType: e.target.value })}>
          {TARGET_TYPES.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Range (ft.)
        <input type="number" min="0" step="5" value={activity.range ?? ''} placeholder="self" onChange={(e) => set({ range: e.target.value === '' ? null : Number(e.target.value) })} />
      </label>
    </>
  )
}

// "Also spends": consumption beyond the item's own uses - a shared pool on
// another feature (Focus, Ki, Spell Points), legendary actions, HP, or any
// attribute path.
function SpendRows({ rows, onChange, itemKey }) {
  const { spec } = useContext(NpcSpecContext)
  const pools = (spec?.items ?? []).filter((i) => i.key !== itemKey && (i.usesMax || i.usesRecovery))
  const update = (i, patch) => onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))

  return (
    <div className="npc-damage-rows">
      {rows.length > 0 && <span className="option-picker-label">Also spends</span>}
      {rows.map((row, i) => (
        <div key={row.key} className="npc-spend-row">
          <input
            type="text"
            inputMode="numeric"
            value={row.amount}
            onChange={(e) => update(i, { amount: e.target.value })}
            aria-label="Amount spent"
            className="npc-spend-amount"
          />
          <select value={row.source} onChange={(e) => update(i, { source: e.target.value, target: '' })} aria-label="Spent from">
            {SPEND_SOURCES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          {row.source === 'item' && (
            <select value={row.target} onChange={(e) => update(i, { target: e.target.value })} aria-label="Which feature">
              <option value="">{pools.length ? 'Pick a feature…' : 'No other feature has uses yet'}</option>
              {pools.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name || 'Unnamed'}
                </option>
              ))}
            </select>
          )}
          {row.source === 'attribute' && (
            <input value={row.target} onChange={(e) => update(i, { target: e.target.value })} placeholder="e.g. resources.primary.value" aria-label="Attribute path" />
          )}
          <button type="button" className="icon-button" onClick={() => onChange(rows.filter((_, idx) => idx !== i))} aria-label="Remove cost">
            ×
          </button>
        </div>
      ))}
      <button type="button" className="secondary npc-small-button" onClick={() => onChange([...rows, emptySpend()])}>
        + Spend a resource
      </button>
    </div>
  )
}

function activityLabel(a, i) {
  const kind = ACTIVITY_KINDS.find((k) => k.key === a.kind)?.label ?? a.kind
  return a.name ? `${a.name} (${kind})` : `Roll ${i + 1}: ${kind}`
}

// Midi-qol: after this roll, roll another of the item's activities against
// the same targets (Stunning Strike style: hit, then the CON save).
function TriggerFields({ activity, set, siblings }) {
  const others = siblings.map((a, i) => ({ a, i })).filter(({ a }) => a.key !== activity.key)
  if (!others.length) return null
  const onlyIf = activity.kind === 'attack' ? { key: 'hit', label: 'Only on a hit' } : activity.kind === 'save' ? { key: 'failedSave', label: 'Only if the save fails' } : null
  return (
    <div className="dm-form-row">
      <label>
        Then roll (midi-qol)
        <select value={activity.triggerKey ?? ''} onChange={(e) => set({ triggerKey: e.target.value, triggerOnlyIf: e.target.value ? activity.triggerOnlyIf || onlyIf?.key || '' : '' })}>
          <option value="">Nothing</option>
          {others.map(({ a, i }) => (
            <option key={a.key} value={a.key}>
              {activityLabel(a, i)}
            </option>
          ))}
        </select>
      </label>
      {activity.triggerKey && onlyIf && (
        <label>
          When
          <select value={activity.triggerOnlyIf ?? ''} onChange={(e) => set({ triggerOnlyIf: e.target.value })}>
            <option value={onlyIf.key}>{onlyIf.label}</option>
            <option value="">Always</option>
          </select>
        </label>
      )}
    </div>
  )
}

function ActivityEditor({ activity, onChange, onRemove, item, index }) {
  const set = (patch) => onChange({ ...activity, ...patch })
  const ctx = useContext(NpcSpecContext)
  const triggeredBy = item.activities.find((a) => a.triggerKey === activity.key)

  // @mod inside an attack's damage is that attack's ability modifier.
  const attackAbility = activity.ability || (activity.attackType === 'ranged' ? 'dex' : 'str')
  const scoped = useMemo(
    () => ({ ...ctx, rollData: { ...ctx.rollData, mod: activity.kind === 'attack' ? ctx.rollData[attackAbility] ?? 0 : 0 } }),
    [ctx, activity.kind, attackAbility]
  )

  return (
    <NpcSpecContext.Provider value={scoped}>
      <div className="npc-activity">
        <div className="npc-activity-head">
          <span className="npc-activity-title">{activityLabel(activity, index)}</span>
          {triggeredBy && <span className="npc-badge">Rolled by {triggeredBy.name || 'another roll'} only</span>}
        </div>
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
          <label>
            Label
            <input value={activity.name ?? ''} onChange={(e) => set({ name: e.target.value })} placeholder="optional, e.g. 30ft Moved" />
          </label>
          <label>
            Takes
            <select value={activity.activation ?? ''} onChange={(e) => set({ activation: e.target.value })}>
              {ACTIVATION_TYPES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="dm-form-row">
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
            </>
          )}

          {activity.kind === 'heal' && (
            <label className="npc-wide-field">
              Healing
              <FormulaInput value={activity.healing} onChange={(healing) => set({ healing })} placeholder="e.g. 2d8 + @abilities.con.mod" ariaLabel="Healing formula" />
            </label>
          )}
        </div>

        {activity.kind !== 'attack' && (
          <div className="dm-form-row">
            <AreaFields activity={activity} set={set} />
          </div>
        )}

        {['attack', 'save', 'damage'].includes(activity.kind) && (
          <DamageRows rows={activity.damage} onChange={(damage) => set({ damage })} withMod={activity.kind === 'attack'} />
        )}

        <SpendRows rows={activity.spend ?? []} onChange={(spend) => set({ spend })} itemKey={item.key} />
        <TriggerFields activity={activity} set={set} siblings={item.activities} />

        <div className="repeatable-row-controls">
          <button type="button" className="danger npc-small-button" onClick={onRemove}>
            Remove roll
          </button>
        </div>
      </div>
    </NpcSpecContext.Provider>
  )
}

function OverTimeFields({ change, set, item, effect }) {
  const { spec } = useContext(NpcSpecContext)
  const ot = change.overTime ?? emptyOverTime()
  const setOt = (patch) => set({ overTime: { ...ot, ...patch } })
  const firstSave = item.activities.find((a) => a.kind === 'save')
  const dcPlaceholder = firstSave && spec ? `${saveDc(spec, firstSave)} (this item's save)` : '10'
  return (
    <div className="npc-overtime">
      <div className="dm-form-row">
        <label>
          At the
          <select value={ot.turn} onChange={(e) => setOt({ turn: e.target.value })}>
            <option value="end">End of the target's turn</option>
            <option value="start">Start of the target's turn</option>
          </select>
        </label>
        <label>
          Save to end it
          <select value={ot.saveAbility} onChange={(e) => setOt({ saveAbility: e.target.value })}>
            <option value="">No save</option>
            {NPC_ABILITIES.map((a) => (
              <option key={a} value={a}>
                {a.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
        {ot.saveAbility && (
          <>
            <label>
              DC
              <input type="number" min="1" value={ot.saveDc} placeholder={dcPlaceholder} onChange={(e) => setOt({ saveDc: e.target.value })} />
            </label>
            <label className="tag-checklist-item">
              <input type="checkbox" checked={ot.saveRemoves !== false} onChange={(e) => setOt({ saveRemoves: e.target.checked })} />
              A success ends the effect
            </label>
          </>
        )}
      </div>
      <div className="npc-damage-row">
        <FormulaInput value={ot.damage} onChange={(damage) => setOt({ damage })} placeholder="damage each turn, e.g. 2d6 (optional)" ariaLabel="Damage each turn" />
        <select value={ot.damageType} onChange={(e) => setOt({ damageType: e.target.value })} aria-label="Damage type">
          <option value="">(no type)</option>
          {DAMAGE_TYPES.map((t) => (
            <option key={t} value={t}>
              {cap(t)}
            </option>
          ))}
        </select>
      </div>
      {spec && (
        <span className="npc-hint">
          Midi reads this on the target, so numbers are baked in: <code>{overTimeValue(spec, item, effect, ot)}</code>
        </span>
      )}
    </div>
  )
}

function ChangeValueInput({ def, change, set }) {
  switch (def.value) {
    case 'flag':
      return <span className="npc-hint npc-change-flag">On while the effect is active</span>
    case 'damageType':
      return (
        <select value={change.value} onChange={(e) => set({ value: e.target.value })} aria-label="Damage type">
          <option value="">Pick a type…</option>
          {DAMAGE_TYPES.map((t) => (
            <option key={t} value={t}>
              {cap(t)}
            </option>
          ))}
        </select>
      )
    case 'condition':
      return (
        <select value={change.value} onChange={(e) => set({ value: e.target.value })} aria-label="Condition">
          <option value="">Pick a condition…</option>
          {CONDITIONS.map((c) => (
            <option key={c} value={c}>
              {cap(c)}
            </option>
          ))}
        </select>
      )
    case 'number':
      return <input type="number" value={change.value} onChange={(e) => set({ value: e.target.value })} aria-label="Value" />
    case 'formula':
      return <FormulaInput value={change.value} onChange={(value) => set({ value })} placeholder={def.placeholder} ariaLabel="Value" />
    default:
      return <input value={change.value} onChange={(e) => set({ value: e.target.value })} placeholder="value" aria-label="Value" />
  }
}

function ChangeRow({ change, onChange, onRemove, item, effect }) {
  const { spec } = useContext(NpcSpecContext)
  const def = EFFECT_CHANGES.find((c) => c.id === change.id) ?? EFFECT_CHANGES[0]
  const set = (patch) => onChange({ ...change, ...patch })
  const types = CHANGE_TYPES.filter((t) => def.types.includes(t.key))

  return (
    <div className="npc-change">
      <div className="npc-change-row">
        <select value={change.id} onChange={(e) => onChange({ ...emptyChange(e.target.value), key: change.key })} aria-label="What changes">
          {CHANGE_GROUPS.map((group) => (
            <optgroup key={group} label={group}>
              {EFFECT_CHANGES.filter((c) => c.group === group).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {def.param && (
          <select value={change.param} onChange={(e) => set({ param: e.target.value })} aria-label="Which">
            {CHANGE_PARAMS[def.param].map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        )}
        {def.id === 'custom' && (
          <input value={change.path} onChange={(e) => set({ path: e.target.value })} placeholder="system.attributes.ac.calc" aria-label="Attribute path" />
        )}
        {types.length > 1 && (
          <select value={change.type} onChange={(e) => set({ type: e.target.value })} aria-label="How">
            {types.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        )}
        {def.value !== 'overTime' && <ChangeValueInput def={def} change={change} set={set} />}
        <button type="button" className="icon-button" onClick={onRemove} aria-label="Remove change">
          ×
        </button>
      </div>
      {def.id === 'ac' && effect.passive && spec && !spec.naturalArmor && (
        <span className="npc-hint">dnd5e ignores AC bonuses on a flat AC - tick “Natural armor” for this to count.</span>
      )}
      {def.value === 'overTime' && <OverTimeFields change={change} set={set} item={item} effect={effect} />}
    </div>
  )
}

function EffectEditor({ effect, onChange, onRemove, item }) {
  const set = (patch) => onChange({ ...effect, ...patch })
  const changes = effect.changes ?? []
  const updateChange = (i, value) => set({ changes: changes.map((c, idx) => (idx === i ? value : c)) })
  return (
    <div className="npc-activity">
      <div className="dm-form-row">
        <label>
          Effect name
          <input value={effect.name} onChange={(e) => set({ name: e.target.value })} placeholder="defaults to the item name" />
        </label>
        <label>
          Applies to
          <select value={effect.passive ? 'self' : 'target'} onChange={(e) => set({ passive: e.target.value === 'self' })}>
            <option value="target">The target, when the roll lands</option>
            <option value="self">This creature, always on</option>
          </select>
        </label>
        {!effect.passive && (
          <label>
            Ends
            <select value={effect.specialDuration?.[0] ?? ''} onChange={(e) => set({ specialDuration: e.target.value ? [e.target.value] : [] })}>
              {SPECIAL_DURATIONS.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {!effect.passive && item.activities.length > 1 && (
        <div className="npc-applied-by">
          <span className="option-picker-label">Applied by</span>
          {item.activities.map((a, i) => {
            const all = !effect.appliedBy?.length
            const checked = all || effect.appliedBy.includes(a.key)
            return (
              <label key={a.key} className="tag-checklist-item">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    const current = all ? item.activities.map((x) => x.key) : effect.appliedBy
                    const next = e.target.checked ? [...current, a.key] : current.filter((k) => k !== a.key)
                    if (!next.length) return // at least one roll applies it; remove the effect instead
                    // Every roll ticked is the same as the default (empty).
                    set({ appliedBy: next.length === item.activities.length ? [] : next })
                  }}
                />
                {activityLabel(a, i)}
              </label>
            )
          })}
        </div>
      )}
      <OptionPicker
        label="Conditions applied"
        options={CONDITIONS.map(cap)}
        selected={(effect.statuses ?? []).map(cap)}
        onChange={(list) => set({ statuses: list.map((s) => s.toLowerCase()) })}
        allowCustom={false}
        addPlaceholder="Add condition…"
      />
      <div className="npc-damage-rows">
        {changes.length > 0 && <span className="option-picker-label">Changes {effect.passive ? 'to this creature' : 'to the target'}</span>}
        {changes.map((change, i) => (
          <ChangeRow
            key={change.key}
            change={change}
            item={item}
            effect={effect}
            onChange={(value) => updateChange(i, value)}
            onRemove={() => set({ changes: changes.filter((_, idx) => idx !== i) })}
          />
        ))}
        <button type="button" className="secondary npc-small-button" onClick={() => set({ changes: [...changes, emptyChange()] })}>
          + Change a stat
        </button>
      </div>
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

  // Removing a roll also clears triggers and "applied by" ticks that pointed at it.
  function removeActivity(i) {
    const gone = item.activities[i].key
    set({
      activities: item.activities
        .filter((_, idx) => idx !== i)
        .map((a) => (a.triggerKey === gone ? { ...a, triggerKey: '', triggerOnlyIf: '' } : a)),
      effects: item.effects.map((e) => (e.appliedBy?.includes(gone) ? { ...e, appliedBy: e.appliedBy.filter((k) => k !== gone) } : e)),
    })
  }

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
            <FormulaInput value={String(item.usesMax ?? '')} onChange={(usesMax) => set({ usesMax })} placeholder="3 or @prof" ariaLabel="Uses" />
          </label>
        )}
        <label className="tag-checklist-item">
          <input type="checkbox" checked={!!item.magical} onChange={(e) => set({ magical: e.target.checked })} />
          Magical (beats nonmagical resistance)
        </label>
      </div>
      {item.usesRecovery && item.usesRecovery !== 'recharge' && !item.activities.length && (
        <p className="npc-hint">A pool with no rolls of its own - other features can spend these uses with “+ Spend a resource”.</p>
      )}

      <label>
        Description (optional - blank uses the generated statblock line)
        <textarea value={item.description} rows={3} onChange={(e) => set({ description: e.target.value })} />
      </label>

      {item.activities.map((activity, i) => (
        <ActivityEditor
          key={activity.key}
          activity={activity}
          item={item}
          index={i}
          onChange={(value) => updateList('activities', i, value)}
          onRemove={() => removeActivity(i)}
        />
      ))}
      {item.effects.map((effect, i) => (
        <EffectEditor
          key={effect.key}
          effect={effect}
          item={item}
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
export default function ActionBuilder({ spec, items, onChange }) {
  const ctx = useMemo(() => ({ spec, rollData: spec ? npcRollData(spec) : {} }), [spec])

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

  // Deleting a feature also drops "also spends" rows that drew on it.
  function remove(key) {
    onChange(
      items
        .filter((x) => x.key !== key)
        .map((i) => ({
          ...i,
          activities: i.activities.map((a) => (a.spend?.some((s) => s.target === key) ? { ...a, spend: a.spend.filter((s) => s.target !== key) } : a)),
        }))
    )
  }

  return (
    <NpcSpecContext.Provider value={ctx}>
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
                    onRemove={() => remove(item.key)}
                    onMove={(dir) => move(item.key, section.key, dir)}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </NpcSpecContext.Provider>
  )
}
