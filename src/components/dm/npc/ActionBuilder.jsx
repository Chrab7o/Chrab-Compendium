import { useContext, useMemo, useState } from 'react'
import {
  ACTIVATION_TYPES,
  REACTION_TRIGGERS,
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
  identifierFor,
  spellSaveDc,
  spellcastingAbility,
  TARGET_TYPES,
  AURA_ACTIONS,
  AURA_TRIGGERS,
  emptyAura,
  TRANSFORM_PRESETS,
  activitySummary,
  emptyActivity,
  emptyChange,
  emptyEffect,
  emptyOverTime,
  emptySpend,
  npcRollData,
  overTimeValue,
  saveDc,
} from '../../../lib/foundryActorBuilder'
import OptionPicker from '../OptionPicker'
import FormulaInput, { AttributePathInput, NpcSpecContext } from './FormulaInput'
import { ConditionRows, OverTimeRollFields, ScriptEditor } from './AutomationFields'
import BehaviorFields from './BehaviorFields'
import AutomationWizard from '../feature/AutomationWizard'
import { flowSummary, hasFlow } from '../../../lib/automationFlow'
import { isLinked } from '../../../lib/itemLibrary'
import { mechanicsSummary } from '../../../lib/foundryFeatures'

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
  { key: 'isAttacked', label: 'Target is next attacked' },
  { key: 'longRest', label: 'A long rest' },
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

function AreaFields({ activity, set, inSpell = false }) {
  if (inSpell) {
    return (
      <>
        <label>
          Targets
          <input type="number" min="1" value={activity.targetCount} placeholder="any" onChange={(e) => set({ targetCount: e.target.value })} />
        </label>
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
      </>
    )
  }
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
            <AttributePathInput value={row.target} onChange={(target) => update(i, { target })} use="spend" placeholder="e.g. spells.spell1.value" ariaLabel="Attribute path" />
          )}
          {row.source === 'pool' && (
            <input
              className="npc-code-input"
              value={row.target}
              onChange={(e) => update(i, { target: e.target.value })}
              placeholder="the resource's identifier, e.g. darkness"
              aria-label="Resource identifier"
            />
          )}
          <label className="tag-checklist-item" title="Each extra point spent adds a die to the first damage roll (or the healing)">
            <input type="checkbox" checked={!!row.extra} onChange={(e) => update(i, { extra: e.target.checked })} />
            Can spend more: +1 die each
          </label>
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

export function activityLabel(a, i) {
  const kind = ACTIVITY_KINDS.find((k) => k.key === a.kind)?.label ?? a.kind
  return a.name ? `${a.name} (${kind})` : `Roll ${i + 1}: ${kind}`
}

// Midi-qol: after this roll, roll another of the item's activities against
// the same targets (Stunning Strike style: hit, then the CON save).
function TriggerFields({ activity, set, siblings }) {
  const others = siblings.map((a, i) => ({ a, i })).filter(({ a }) => a.key !== activity.key && !a.overTime)
  if (!others.length) return null
  const onlyIf = activity.kind === 'attack' ? { key: 'hit', label: 'Only on a hit' } : activity.kind === 'save' ? { key: 'failedSave', label: 'Only if the save fails' } : null
  return (
    <>
      <div className="dm-form-row">
        <label>
          Then roll
          <select
            value={activity.triggerKey ?? ''}
            onChange={(e) => set({ triggerKey: e.target.value, triggerOnlyIf: e.target.value ? activity.triggerOnlyIf || onlyIf?.key || '' : '', triggerConditions: e.target.value ? activity.triggerConditions ?? [] : [] })}
          >
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
        {['attack', 'save'].includes(activity.kind) && (
          <label>
            Extra damage roll per {activity.kind === 'attack' ? 'hit' : 'target'}
            <select value={activity.otherKey ?? ''} onChange={(e) => set({ otherKey: e.target.value })}>
              <option value="">None</option>
              {others.filter(({ a }) => a.kind === 'damage').map(({ a, i }) => (
                <option key={a.key} value={a.key}>
                  {activityLabel(a, i)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {activity.triggerKey && (
        <ConditionRows rows={activity.triggerConditions ?? []} onChange={(triggerConditions) => set({ triggerConditions })} slot="trigger" label="…and only for targets that" />
      )}
    </>
  )
}

// A midi region that follows this creature: what happens to the creatures in it.
function AuraFields({ activity, set, item }) {
  if (!activity.aura) {
    return (
      <button type="button" className="secondary npc-small-button" onClick={() => set({ aura: emptyAura(), durationMinutes: activity.durationMinutes || '1' })}>
        + Make this an aura
      </button>
    )
  }
  const aura = activity.aura
  const setAura = (patch) => set({ aura: { ...aura, ...patch } })
  const rules = aura.rules ?? []
  const setRule = (i, patch) => setAura({ rules: rules.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) })
  const rolls = item.activities.map((a, i) => ({ a, i })).filter(({ a }) => a.key !== activity.key)
  const effects = item.effects.filter((e) => e.aura && !e.passive)
  return (
    <div className="npc-aura">
      <div className="dm-form-row">
        <label>
          Aura radius (ft.)
          <input type="number" min="5" step="5" value={aura.radius} onChange={(e) => setAura({ radius: e.target.value })} />
        </label>
        <label>
          Affects
          <select value={aura.affects} onChange={(e) => setAura({ affects: e.target.value })}>
            <option value="enemy">Enemies</option>
            <option value="ally">Allies</option>
            <option value="all">Everyone</option>
          </select>
        </label>
        <label>
          Lasts (minutes)
          <input value={activity.durationMinutes ?? ''} onChange={(e) => set({ durationMinutes: e.target.value })} placeholder="1, 10, or perm" />
        </label>
        <label className="tag-checklist-item">
          <input type="checkbox" checked={aura.oncePerTurn !== false} onChange={(e) => setAura({ oncePerTurn: e.target.checked })} />
          Once per turn per creature
        </label>
      </div>
      {rules.map((r, i) => (
        <div className="dm-form-row" key={i}>
          <label>
            When a creature
            <select value={r.trigger} onChange={(e) => setRule(i, { trigger: e.target.value })}>
              {AURA_TRIGGERS.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Do
            <select value={r.action} onChange={(e) => setRule(i, { action: e.target.value, target: '' })}>
              {AURA_ACTIONS.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            {r.action === 'useActivity' ? 'Roll' : 'Effect'}
            <select value={r.target ?? ''} onChange={(e) => setRule(i, { target: e.target.value })}>
              <option value="">Pick one</option>
              {r.action === 'useActivity'
                ? rolls.map(({ a, i: idx }) => (
                    <option key={a.key} value={a.key}>
                      {activityLabel(a, idx)}
                    </option>
                  ))
                : effects.map((e) => (
                    <option key={e.key} value={e.key}>
                      {e.name || 'Unnamed effect'}
                    </option>
                  ))}
            </select>
          </label>
          <button type="button" className="secondary npc-small-button" onClick={() => setAura({ rules: rules.filter((_, idx) => idx !== i) })}>
            Remove
          </button>
        </div>
      ))}
      {!effects.length && <p className="npc-hint">Effects for apply / remove rules: add one and set Applies to → “Creatures in the aura”.</p>}
      <div className="dm-form-row">
        <button type="button" className="secondary npc-small-button" onClick={() => setAura({ rules: [...rules, { trigger: 'entry', action: 'useActivity', target: '' }] })}>
          + Aura rule
        </button>
        <button type="button" className="secondary npc-small-button" onClick={() => set({ aura: null })}>
          Not an aura
        </button>
      </div>
    </div>
  )
}

// A built flow (the Automation Builder) for one roll. While a roll has one it
// replaces the recipe script, so the script picker is hidden.
function FlowField({ activity, set, item }) {
  const [open, setOpen] = useState(false)
  const built = hasFlow(activity)
  return (
    <div className="npc-flow">
      {built ? (
        <>
          <span className="npc-flow-label">Built automation</span>
          <pre className="npc-flow-summary">{flowSummary(activity.flow).join('\n')}</pre>
        </>
      ) : (
        <span className="npc-hint">Build this roll’s macro like a short script: set variables, if / otherwise, and what happens.</span>
      )}
      <div className="repeatable-row-controls">
        <button type="button" className="secondary npc-small-button" onClick={() => setOpen(true)}>
          {built ? 'Edit automation' : 'Build automation…'}
        </button>
        {built && (
          <button
            type="button"
            className="danger npc-small-button"
            onClick={() => confirm('Remove the built automation from this roll?') && set({ flow: null })}
          >
            Remove
          </button>
        )}
      </div>
      {open && (
        <AutomationWizard
          activity={activity}
          item={item}
          onAccept={(flow) => set({ flow })}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}

// Midi-qol automation for one roll, collapsed until used.
// bare: just the fields, no collapsible wrapper (the guided roll steps).
export function AutomationSection({ activity, set, item, bare = false }) {
  const active = [
    activity.triggerKey && 'trigger',
    activity.otherKey && 'extra damage',
    activity.useConditions?.length && 'use condition',
    activity.effectConditions?.length && 'effect condition',
    activity.overTime && 'over time',
    activity.aura && 'aura',
    hasFlow(activity) ? 'built' : activity.script && 'script',
  ].filter(Boolean)
  const hasEffects = item.effects.some((e) => !e.passive)
  const fields = (
    <>
      <FlowField activity={activity} set={set} item={item} />
      <TriggerFields activity={activity} set={set} siblings={item.activities} />
      <ConditionRows rows={activity.useConditions ?? []} onChange={(useConditions) => set({ useConditions })} slot="use" label="Can only be used if the target" />
      {activity.useConditions?.length > 0 && (
        <label>
          Message when it can't be used
          <input value={activity.useConditionReason ?? ''} onChange={(e) => set({ useConditionReason: e.target.value })} placeholder="e.g. Only works on undead." />
        </label>
      )}
      {hasEffects && (
        <ConditionRows rows={activity.effectConditions ?? []} onChange={(effectConditions) => set({ effectConditions })} slot="effect" label="Effects only land on targets that" />
      )}
      <OverTimeRollFields activity={activity} set={set} item={item} />
      {!activity.overTime && <AuraFields activity={activity} set={set} item={item} />}
      {!hasFlow(activity) && <ScriptEditor activity={activity} set={set} />}
    </>
  )
  if (bare) return <div className="npc-automation-body">{fields}</div>
  return (
    <details className="npc-automation" open={active.length > 0 || undefined}>
      <summary>
        Midi-qol automation{active.length ? <span className="npc-badge">{active.join(' · ')}</span> : null}
      </summary>
      <div className="npc-automation-body">{fields}</div>
    </details>
  )
}

// The pieces of one roll's editor. ActivityEditor stacks them all; the guided
// Feature Forge (feature/FeatureWizard.jsx) shows them one step at a time.
// Each expects to sit inside an ActivityScope.

// Which ability "Auto" and @mod mean for this roll.
function rollAbilities(ctx, activity, inSpell) {
  const castingAbility = spellcastingAbility(ctx.spec)
  const autoAbility = activity.classification === 'spell' || inSpell ? castingAbility : activity.attackType === 'ranged' ? 'dex' : 'str'
  return { castingAbility, autoAbility }
}

// @mod: an attack's ability modifier, or in a spell the spellcasting one.
export function ActivityScope({ activity, inSpell = false, children }) {
  const ctx = useContext(NpcSpecContext)
  const { castingAbility, autoAbility } = rollAbilities(ctx, activity, inSpell)
  const modAbility = activity.kind === 'attack' ? activity.ability || autoAbility : inSpell ? castingAbility : null
  const scoped = useMemo(
    () => ({ ...ctx, rollData: { ...ctx.rollData, mod: modAbility ? ctx.rollData[modAbility] ?? 0 : 0 } }),
    [ctx, modAbility]
  )
  return <NpcSpecContext.Provider value={scoped}>{children}</NpcSpecContext.Provider>
}

// Kind, label, the action it takes, and for a reaction when midi offers it.
// showKind: false when the kind was already picked (the guided roll steps).
export function ActivityBasics({ activity, set, item, inSpell = false, showKind = true }) {
  return (
    <div className="dm-form-row">
      {showKind && (
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
      )}
      <label>
        Label
        <input value={activity.name ?? ''} onChange={(e) => set({ name: e.target.value })} placeholder="optional, e.g. 30ft Moved" />
      </label>
      {!inSpell && (
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
      )}
      {(activity.activation || item.section) === 'reaction' && (
        <label>
          Midi offers it when
          <select value={activity.reactionTrigger ?? ''} onChange={(e) => set({ reactionTrigger: e.target.value })}>
            {REACTION_TRIGGERS.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  )
}

// How it reaches its targets: the creature it summons, the attack or save,
// and the area or number of targets.
export function ActivityTargetFields({ activity, set, inSpell = false }) {
  const ctx = useContext(NpcSpecContext)
  const { castingAbility, autoAbility } = rollAbilities(ctx, activity, inSpell)
  return (
    <>
      {(activity.kind === 'summon' || activity.kind === 'transform') && (
        <div className="dm-form-row">
          <label>
            Creature UUID
            <input
              value={activity.creatureUuid ?? ''}
              onChange={(e) => set({ creatureUuid: e.target.value })}
              placeholder="Compendium.world.x.Actor.id (blank: player picks)"
            />
          </label>
          <label>
            Name
            <input value={activity.creatureName ?? ''} onChange={(e) => set({ creatureName: e.target.value })} placeholder="e.g. Shadow Image" />
          </label>
          {!String(activity.creatureUuid ?? '').trim() && (
            <label>
              Up to CR
              <input value={activity.crMax ?? ''} onChange={(e) => set({ crMax: e.target.value })} placeholder="e.g. 1 or @prof" />
            </label>
          )}
          {activity.kind === 'summon' ? (
            <label>
              How many
              <input value={activity.creatureCount ?? '1'} onChange={(e) => set({ creatureCount: e.target.value })} placeholder="1" />
            </label>
          ) : (
            <label>
              Keeps
              <select value={activity.transformPreset ?? 'polymorph'} onChange={(e) => set({ transformPreset: e.target.value })}>
                {TRANSFORM_PRESETS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      {activity.kind === 'attack' && (
        <div className="dm-form-row">
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
              <option value="">
                {activity.classification === 'spell' || inSpell ? `Spellcasting (${castingAbility.toUpperCase()})` : `Auto (${autoAbility.toUpperCase()})`}
              </option>
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
          {inSpell ? null : activity.attackType === 'ranged' ? (
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
        </div>
      )}

      {activity.kind === 'save' && (
        <div className="dm-form-row">
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
              <option value="">Number or formula</option>
              <option value="spellcasting">Spellcasting DC ({spellSaveDc(ctx.spec ?? {})})</option>
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
              <FormulaInput value={String(activity.dc ?? '')} onChange={(dc) => set({ dc })} placeholder="14, or 10 + @prof + @abilities.con.mod" ariaLabel="DC" />
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
        </div>
      )}

      {activity.kind !== 'attack' && (
        <div className="dm-form-row">
          <AreaFields activity={activity} set={set} inSpell={inSpell} />
        </div>
      )}
    </>
  )
}

// What it does when it lands: healing, or damage rows.
export function ActivityDamageFields({ activity, set, inSpell = false }) {
  return (
    <>
      {activity.kind === 'heal' && (
        <div className="dm-form-row">
          <label className="npc-wide-field">
            {activity.healType === 'temphp' ? 'Temporary hit points' : 'Healing'}
            <FormulaInput value={activity.healing} onChange={(healing) => set({ healing })} placeholder={inSpell ? 'e.g. 2d8 + @mod' : 'e.g. 2d8 + @abilities.con.mod'} ariaLabel="Healing formula" withMod={inSpell} />
          </label>
          <label>
            Gives
            <select value={activity.healType ?? 'healing'} onChange={(e) => set({ healType: e.target.value })}>
              <option value="healing">Hit points</option>
              <option value="temphp">Temporary hit points</option>
            </select>
          </label>
        </div>
      )}

      {['attack', 'save', 'damage'].includes(activity.kind) && (
        <>
          <DamageRows rows={activity.damage} onChange={(damage) => set({ damage })} withMod={activity.kind === 'attack' || inSpell} />
          <label className="tag-checklist-item">
            <input
              type="checkbox"
              checked={(activity.ignoreTraits ?? []).includes('idr')}
              onChange={(e) => set({ ignoreTraits: e.target.checked ? ['idr', 'idi'] : [] })}
            />
            Ignores resistance and immunity
          </label>
        </>
      )}
    </>
  )
}

// What it costs on top of the item's own uses.
export function ActivityCostFields({ activity, set, item }) {
  return <SpendRows rows={activity.spend ?? []} onChange={(spend) => set({ spend })} itemKey={item.key} />
}

// inSpell: a roll inside a spell - the spell owns activation, range and
// area, and @mod / "Auto" mean the spellcasting ability.
export function ActivityEditor({ activity, onChange, onRemove, item, index, inSpell = false }) {
  const set = (patch) => onChange({ ...activity, ...patch })
  const triggeredBy = item.activities.find((a) => a.triggerKey === activity.key)
  const extraFor = item.activities.find((a) => a.otherKey === activity.key)

  return (
    <ActivityScope activity={activity} inSpell={inSpell}>
      <div className="npc-activity">
        <div className="npc-activity-head">
          <span className="npc-activity-title">{activityLabel(activity, index)}</span>
          {triggeredBy && <span className="npc-badge">Rolled by {triggeredBy.name || 'another roll'} only</span>}
          {extraFor && <span className="npc-badge">Extra damage for {extraFor.name || 'another roll'}</span>}
          {activity.overTime && <span className="npc-badge">Repeats each turn</span>}
        </div>
        <ActivityBasics activity={activity} set={set} item={item} inSpell={inSpell} />
        <ActivityTargetFields activity={activity} set={set} inSpell={inSpell} />
        <ActivityDamageFields activity={activity} set={set} inSpell={inSpell} />
        <ActivityCostFields activity={activity} set={set} item={item} />
        <AutomationSection activity={activity} set={set} item={item} />

        <div className="repeatable-row-controls">
          <button type="button" className="danger npc-small-button" onClick={onRemove}>
            Remove roll
          </button>
        </div>
      </div>
    </ActivityScope>
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
          <AttributePathInput value={change.path} onChange={(path) => set({ path })} use="effect" placeholder="system.attributes.ac.calc" ariaLabel="Attribute path" />
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

export function EffectEditor({ effect, onChange, onRemove, item }) {
  const set = (patch) => onChange({ ...effect, ...patch })
  const changes = effect.changes ?? []
  const updateChange = (i, value) => set({ changes: changes.map((c, idx) => (idx === i ? value : c)) })
  // "While toggled on" only means something when the item has a toggle behavior.
  const canStance = item.behavior?.mode === 'toggle'
  const stance = canStance && !!effect.stance
  // "A bonded creature": a target effect that also runs the item's bonded-creature rules.
  const canBond = (item.behavior?.rules ?? []).some((r) => r.event === 'bondedHurt' || r.event === 'bondedDowned')
  const bond = canBond && !!effect.bond && !effect.passive && !stance
  // "Applied by a behavior rule": only a rule's "apply an effect" action places it.
  const canRule = (item.behavior?.rules ?? []).length > 0
  const byRule = canRule && !!effect.byRule && !effect.passive && !stance
  // "While inside an aura": only an aura's apply / remove rules place it.
  const canAura = item.activities.some((a) => a.aura)
  const aura = canAura && !!effect.aura && !effect.passive && !stance
  const appliesTo = stance ? 'stance' : effect.passive ? 'self' : bond ? 'bond' : byRule ? 'rule' : aura ? 'aura' : 'target'
  return (
    <div className="npc-activity">
      <div className="dm-form-row">
        <label>
          Effect name
          <input value={effect.name} onChange={(e) => set({ name: e.target.value })} placeholder="defaults to the item name" />
        </label>
        <label>
          Applies to
          <select
            value={appliesTo}
            onChange={(e) => set({ passive: e.target.value === 'self', stance: e.target.value === 'stance', bond: e.target.value === 'bond', byRule: e.target.value === 'rule', aura: e.target.value === 'aura' })}
          >
            <option value="target">The target, when the roll lands</option>
            {canAura && <option value="aura">Creatures in the aura (its apply / remove rules)</option>}
            {canRule && <option value="rule">Applied by a behavior rule (its “Apply an effect” action)</option>}
            {canBond && <option value="bond">The target, linked (runs this item’s bonded / marked rules)</option>}
            <option value="self">This creature, always on</option>
            {canStance && <option value="stance">This creature, while toggled on</option>}
          </select>
        </label>
        {!effect.passive && !stance && (
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
      {!effect.passive && !stance && item.activities.length > 1 && (
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
        {changes.length > 0 && <span className="option-picker-label">Changes {effect.passive || stance ? 'to this creature' : 'to the target'}</span>}
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

// Removing a roll also clears triggers and "applied by" ticks that pointed at
// it. Returns the patch for the item (or spell).
export function withoutActivity(item, i) {
  const gone = item.activities[i].key
  return {
    activities: item.activities
      .filter((_, idx) => idx !== i)
      .map((a) => (a.triggerKey === gone ? { ...a, triggerKey: '', triggerOnlyIf: '', triggerConditions: [] } : a))
      .map((a) => (a.otherKey === gone ? { ...a, otherKey: '' } : a)),
    effects: item.effects.map((e) => (e.appliedBy?.includes(gone) ? { ...e, appliedBy: e.appliedBy.filter((k) => k !== gone) } : e)),
  }
}

// An over-time roll tied to the removed effect falls back to the first one.
export function withoutEffect(item, i) {
  const gone = item.effects[i].key
  return {
    effects: item.effects.filter((_, idx) => idx !== i),
    activities: item.activities.map((a) => (a.overTime?.effectKey === gone ? { ...a, overTime: { ...a.overTime, effectKey: '' } } : a)),
  }
}

// standalone: one feature on its own (the Feature Forge) - no statblock-only
// sections or natural weapons, and nothing to reorder or delete.
// hideText: the name and description come from somewhere else (a homebrew
// class's feature row), so only the mechanics are edited here.
// extraActions: more buttons for the card's action row (the NPC Forge's "Move to library").
export function ItemCard({ item, onChange, onRemove, onMove, isFirst, isLast, standalone = false, hideText = false, extraActions = null }) {
  const set = (patch) => onChange({ ...item, ...patch })
  const updateList = (field, i, value) => set({ [field]: item[field].map((x, idx) => (idx === i ? value : x)) })

  return (
    <div className="repeatable-row npc-item-card">
      <div className="dm-form-row">
        {!hideText && (
          <label>
            Name
            <input value={item.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Bite" />
          </label>
        )}
        <label>
          {standalone ? 'Rolls default to' : 'Section'}
          <select value={item.section} onChange={(e) => set({ section: e.target.value })}>
            {ITEM_SECTIONS.filter((s) => !standalone || !['legendary', 'lair'].includes(s.key)).map((s) => (
              <option key={s.key} value={s.key}>
                {standalone && s.key === 'trait' ? 'Passive / special' : s.label}
              </option>
            ))}
          </select>
        </label>
        {!standalone && (
          <label>
            Shows in Foundry as
            <select value={item.itemType} onChange={(e) => set({ itemType: e.target.value })}>
              <option value="feat">Feature</option>
              <option value="weapon">Natural weapon</option>
            </select>
          </label>
        )}
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
      {standalone && item.usesRecovery && item.usesRecovery !== 'recharge' && (
        <label className="npc-wide-field">
          Resource identifier (other features spend these uses by it)
          <input
            className="npc-code-input"
            value={item.identifier ?? ''}
            onChange={(e) => set({ identifier: e.target.value })}
            placeholder={`from the name${item.name ? `: ${identifierFor(item.name)}` : ''}, or e.g. darkness`}
          />
        </label>
      )}

      {!hideText && (
        <label>
          Description (optional - blank uses the generated {standalone ? 'rules text' : 'statblock line'})
          <textarea value={item.description} rows={3} onChange={(e) => set({ description: e.target.value })} />
        </label>
      )}

      {item.activities.map((activity, i) => (
        <ActivityEditor
          key={activity.key}
          activity={activity}
          item={item}
          index={i}
          onChange={(value) => updateList('activities', i, value)}
          onRemove={() => set(withoutActivity(item, i))}
        />
      ))}
      {item.effects.map((effect, i) => (
        <EffectEditor
          key={effect.key}
          effect={effect}
          item={item}
          onChange={(value) => updateList('effects', i, value)}
          onRemove={() => set(withoutEffect(item, i))}
        />
      ))}

      <BehaviorFields item={item} onChange={(behavior) => set({ behavior })} />

      <div className="dm-form-actions npc-item-actions">
        <button type="button" className="secondary npc-small-button" onClick={() => set({ activities: [...item.activities, emptyActivity(item.activities.length ? 'damage' : 'attack')] })}>
          + Roll
        </button>
        <button type="button" className="secondary npc-small-button" onClick={() => set({ effects: [...item.effects, emptyEffect()] })}>
          + Effect / condition
        </button>
        {!standalone && (
          <>
            <span className="npc-item-actions-spacer" />
            {extraActions}
            <button type="button" className="icon-button" disabled={isFirst} onClick={() => onMove(-1)} aria-label="Move up">
              ↑
            </button>
            <button type="button" className="icon-button" disabled={isLast} onClick={() => onMove(1)} aria-label="Move down">
              ↓
            </button>
            <button type="button" className="danger npc-small-button" onClick={onRemove}>
              Delete
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// A library item on this NPC: what it does (from the Item Forge, with this
// NPC's numbers) and where it sits. The item itself is edited in the library.
// link: the stored entry; item: it resolved (null when its draft is missing);
// row: the library row; sentAt: when this NPC was last sent to Foundry.
function LinkedItemCard({ link, item, row, sentAt, onChange, onRemove, onMove, isFirst, isLast, library }) {
  const { spec } = useContext(NpcSpecContext)
  const set = (patch) => onChange({ ...link, ...patch })
  const changed = row && sentAt && new Date(row.spec_updated_at) > new Date(sentAt)
  const summary = item ? mechanicsSummary({ item }) : ''
  return (
    <div className="repeatable-row npc-item-card npc-linked-item">
      <div className="npc-linked-head">
        <strong>{item?.name || row?.name || 'Missing library item'}</strong>
        <span className="npc-badge">Library</span>
        {changed && <span className="npc-badge npc-badge-warn">Changed since this NPC was sent</span>}
      </div>
      {item ? (
        <>
          {summary && <span className="npc-hint">{summary}</span>}
          {item.activities.map((a) => (
            <p key={a.key} className="npc-linked-line">
              {activitySummary(spec, a) || ACTIVITY_KINDS.find((k) => k.key === a.kind)?.label}
            </p>
          ))}
        </>
      ) : (
        <p className="npc-hint npc-behavior-warn">Its library item couldn’t be loaded (deleted, or no access). It’s left out of the statblock.</p>
      )}
      <div className="dm-form-row">
        <label>
          Section
          <select value={link.section} onChange={(e) => set({ section: e.target.value })}>
            {ITEM_SECTIONS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        {link.section === 'legendary' && (
          <label>
            Costs (actions)
            <input type="number" min="1" max="3" value={link.legendaryCost ?? 1} onChange={(e) => set({ legendaryCost: Number(e.target.value) || 1 })} />
          </label>
        )}
        <label>
          Shows in Foundry as
          <select value={link.itemType || 'feat'} onChange={(e) => set({ itemType: e.target.value })}>
            <option value="feat">Feature</option>
            <option value="weapon">Natural weapon</option>
          </select>
        </label>
      </div>
      <div className="dm-form-actions npc-item-actions">
        {item && (
          <>
            <button type="button" className="secondary npc-small-button" onClick={() => library.onEdit(link)}>
              Edit item
            </button>
            <button type="button" className="secondary npc-small-button" onClick={() => library.onCopy(link)}>
              Make a private copy
            </button>
          </>
        )}
        <span className="npc-item-actions-spacer" />
        <button type="button" className="icon-button" disabled={isFirst} onClick={() => onMove(-1)} aria-label="Move up">
          ↑
        </button>
        <button type="button" className="icon-button" disabled={isLast} onClick={() => onMove(1)} aria-label="Move down">
          ↓
        </button>
        <button type="button" className="danger npc-small-button" onClick={onRemove}>
          Remove
        </button>
      </div>
    </div>
  )
}

// Statblock items grouped by section (Traits, Actions, ... Lair Actions). Order
// within a section is the order Foundry lists them in.
// spec: the NPC with its links resolved (itemLibrary.js); items: the stored
// entries, inline items and library links; onChange(items) stores them.
// library: { rows (Map id -> library row), sentAt, onAdd(section), onEdit(link),
// onCopy(link), onMoveToLibrary(item) } - see NpcEditor.
export default function ActionBuilder({ spec, items, onChange, library }) {
  const ctx = useMemo(() => ({ spec, rollData: spec ? npcRollData(spec) : {} }), [spec])
  const resolved = useMemo(() => new Map((spec?.items ?? []).map((i) => [i.key, i])), [spec])

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
        .map((i) =>
          isLinked(i)
            ? i
            : { ...i, activities: i.activities.map((a) => (a.spend?.some((s) => s.target === key) ? { ...a, spend: a.spend.filter((s) => s.target !== key) } : a)) }
        )
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
                <button type="button" className="secondary npc-small-button" onClick={() => library.onAdd(section.key)}>
                  + Add
                </button>
              </div>
              <div className="repeatable-rows">
                {inSection.map((item, i) =>
                  isLinked(item) ? (
                    <LinkedItemCard
                      key={item.key}
                      link={item}
                      item={resolved.get(item.key) ?? null}
                      row={library.rows.get(item.draftId)}
                      sentAt={library.sentAt}
                      library={library}
                      isFirst={i === 0}
                      isLast={i === inSection.length - 1}
                      onChange={(value) => update(item.key, value)}
                      onRemove={() => remove(item.key)}
                      onMove={(dir) => move(item.key, section.key, dir)}
                    />
                  ) : (
                    <ItemCard
                      key={item.key}
                      item={item}
                      isFirst={i === 0}
                      isLast={i === inSection.length - 1}
                      onChange={(value) => update(item.key, value)}
                      onRemove={() => remove(item.key)}
                      onMove={(dir) => move(item.key, section.key, dir)}
                      extraActions={
                        <button type="button" className="secondary npc-small-button" onClick={() => library.onMoveToLibrary(item)} title="Save it to the Item Forge so other creatures can use it">
                          Move to library
                        </button>
                      }
                    />
                  )
                )}
              </div>
            </div>
          )
        })}
      </div>
    </NpcSpecContext.Provider>
  )
}
