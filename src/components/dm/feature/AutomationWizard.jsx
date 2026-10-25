import { useEffect, useMemo, useRef, useState } from 'react'
import { CONDITIONS, DAMAGE_TYPES, NPC_ABILITIES } from '../../../lib/foundryActorBuilder'
import { CREATURE_TYPES, SIZE_LABELS, SIZE_ORDER, conditionPresets, emptyCondition } from '../../../lib/foundryAutomation'
import { SELF_CONDITIONS, emptySelfCondition } from '../../../lib/foundryBehaviors'
import { CARD_COLOR_OPTIONS } from '../../../lib/foundryChat'
import {
  COMPARE_OPS,
  FLOW_CHECKS,
  FLOW_STEPS,
  FLOW_VALUES,
  blockSummary,
  checksFor,
  emptyBlock,
  emptyCheck,
  emptyFlow,
  emptyStep,
  flowCode,
  flowProblems,
  flowTrigger,
  mathFormula,
  sortBlocks,
  stepsFor,
  triggersFor,
  valuesFor,
  varsBefore,
} from '../../../lib/automationFlow'
import OptionPicker from '../OptionPicker'

// The Automation Builder: a roll's macro, put together one question at a
// time. Each block walks When -> If -> Then -> Otherwise -> Anything else?,
// and the loop repeats until Review, where it's accepted. The pieces and the
// code they become are in lib/automationFlow.js.

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)

const SCREENS = [
  { key: 'when', label: 'When' },
  { key: 'if', label: 'If' },
  { key: 'then', label: 'Then' },
  { key: 'else', label: 'Otherwise' },
  { key: 'more', label: 'Anything else?' },
  { key: 'review', label: 'Review' },
]

const KIND_DEFAULT_TRIGGER = { attack: 'damage', save: 'damage', damage: 'damage', heal: 'damage' }

// A variable name not taken yet: hp, hp2, hp3...
function freeName(base, taken) {
  if (!taken.includes(base)) return base
  let n = 2
  while (taken.includes(`${base}${n}`)) n++
  return `${base}${n}`
}

// ---------------------------------------------------------------------------
// Fields

// Math with the variables it can use as click-to-add chips, and a live check.
function MathField({ value, onChange, vars, placeholder, label }) {
  const { formula, error } = mathFormula(value, vars)
  return (
    <div className="aw-math">
      <input className="npc-code-input" value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label} spellCheck={false} />
      <div className="aw-chips">
        {vars.length ? (
          vars.map((v) => (
            <button key={v} type="button" className="aw-chip" onClick={() => onChange(`${String(value ?? '').trimEnd()}${String(value ?? '').trim() ? ' ' : ''}${v}`)}>
              {v}
            </button>
          ))
        ) : (
          <span className="npc-hint">No variables yet: grab a value first, or use numbers, dice and @references.</span>
        )}
      </div>
      {String(value ?? '').trim() && (
        <span className={error ? 'aw-check is-bad' : 'aw-check'}>{error || <>Foundry rolls: <code>{formula}</code></>}</span>
      )}
    </div>
  )
}

function DamageTypeSelect({ value, onChange, emptyLabel }) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} aria-label="Damage type">
      <option value="">{emptyLabel}</option>
      {DAMAGE_TYPES.map((t) => (
        <option key={t} value={t}>
          {cap(t)}
        </option>
      ))}
    </select>
  )
}

function AbilitySelect({ value, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Ability">
      {NPC_ABILITIES.map((a) => (
        <option key={a} value={a}>
          {a.toUpperCase()}
        </option>
      ))}
    </select>
  )
}

// ---------------------------------------------------------------------------
// If: one condition

function TargetCheckFields({ row, onChange }) {
  const set = (patch) => onChange({ ...row, ...patch })
  return (
    <>
      <div className="dm-form-row">
        <label>
          The target
          <select value={row.id} onChange={(e) => onChange({ ...emptyCondition(e.target.value), key: row.key })}>
            {conditionPresets('trigger').map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        {(row.id === 'hpAtMost' || row.id === 'failedBy') && (
          <label>
            Value
            <input type="number" min="0" value={row.value} onChange={(e) => set({ value: e.target.value })} />
          </label>
        )}
        {(row.id === 'sizeAtLeast' || row.id === 'sizeAtMost') && (
          <label>
            Size
            <select value={row.size} onChange={(e) => set({ size: e.target.value })}>
              {SIZE_ORDER.map((s) => (
                <option key={s} value={s}>
                  {SIZE_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
        )}
        {(row.id === 'hasStatus' || row.id === 'lacksStatus') && (
          <label>
            Condition
            <select value={row.status} onChange={(e) => set({ status: e.target.value })}>
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {cap(c)}
                </option>
              ))}
            </select>
          </label>
        )}
        {row.id === 'raw' && (
          <label className="npc-wide-field">
            Midi expression
            <input className="npc-code-input" value={row.text} onChange={(e) => set({ text: e.target.value })} placeholder="target.attributes.ac.value < 15" />
          </label>
        )}
      </div>
      {(row.id === 'typeIs' || row.id === 'typeIsNot') && (
        <OptionPicker
          options={CREATURE_TYPES.map(cap)}
          selected={(row.types ?? []).map(cap)}
          onChange={(list) => set({ types: list.map((t) => t.toLowerCase()) })}
          addPlaceholder="Add a creature type…"
          customPlaceholder="Other type…"
        />
      )}
    </>
  )
}

function SelfCheckFields({ row, onChange }) {
  const set = (patch) => onChange({ ...row, ...patch })
  return (
    <div className="dm-form-row">
      <label>
        You
        <select value={row.id} onChange={(e) => onChange({ ...emptySelfCondition(e.target.value), key: row.key })}>
          {SELF_CONDITIONS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      {(row.id === 'hpAtMost' || row.id === 'resourceAtLeast') && (
        <label>
          Value
          <input type="number" min="0" value={row.value} onChange={(e) => set({ value: e.target.value })} />
        </label>
      )}
      {row.id === 'resourceAtLeast' && (
        <label>
          Resource
          <input value={row.pool} onChange={(e) => set({ pool: e.target.value })} placeholder="identifier, e.g. darkness" />
        </label>
      )}
      {(row.id === 'hasStatus' || row.id === 'lacksStatus') && (
        <label>
          Condition
          <select value={row.status} onChange={(e) => set({ status: e.target.value })}>
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {cap(c)}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  )
}

function CheckEditor({ check, onChange, onRemove, vars, featureName }) {
  const def = FLOW_CHECKS.find((c) => c.key === check.type)
  const set = (patch) => onChange({ ...check, ...patch })
  return (
    <div className="aw-piece">
      <div className="aw-piece-head">
        <strong>{def?.label ?? check.type}</strong>
        <button type="button" className="icon-button" onClick={onRemove} aria-label="Remove condition">
          ×
        </button>
      </div>
      {(check.type === 'natural' || check.type === 'level') && (
        <label className="aw-inline">
          {check.type === 'natural' ? 'At least' : 'Level'}
          <input type="number" min="1" max={check.type === 'natural' ? 20 : 30} value={check.value} onChange={(e) => set({ value: e.target.value })} />
        </label>
      )}
      {check.type === 'compare' && (
        <div className="aw-compare">
          <MathField value={check.left} onChange={(left) => set({ left })} vars={vars} placeholder="e.g. hp" label="Left side" />
          <select value={check.op} onChange={(e) => set({ op: e.target.value })} aria-label="Compare">
            {COMPARE_OPS.map(([k, words]) => (
              <option key={k} value={k}>
                is {words}
              </option>
            ))}
          </select>
          <MathField value={check.right} onChange={(right) => set({ right })} vars={vars} placeholder="e.g. 20, or maxHp / 2" label="Right side" />
        </div>
      )}
      {check.type === 'target' && <TargetCheckFields row={check.target ?? emptyCondition('hpAtMost')} onChange={(target) => set({ target })} />}
      {check.type === 'self' && <SelfCheckFields row={check.self ?? emptySelfCondition()} onChange={(self) => set({ self })} />}
      {check.type === 'ask' && (
        <label>
          The question
          <input value={check.question} onChange={(e) => set({ question: e.target.value })} placeholder={`Use ${featureName || 'it'}?`} />
          <span className="npc-hint">Asked on the screen of the player who owns the creature. {'{name}'} fills in a variable.</span>
        </label>
      )}
      {check.type === 'code' && (
        <label>
          JavaScript expression
          <input className="npc-code-input" value={check.code} onChange={(e) => set({ code: e.target.value })} placeholder='V.hp > 10 && !tA()?.statuses?.has("prone")' spellCheck={false} />
          <span className="npc-hint">
            True or false. <code>V.name</code> is a variable, <code>tA()</code> the target’s actor, <code>workflow</code> midi’s workflow.
          </span>
        </label>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Then: one step

function StepEditor({ step, onChange, onRemove, onMove, index, count, vars, ctx, effects, featureName }) {
  const def = FLOW_STEPS.find((s) => s.key === step.type)
  const set = (patch) => onChange({ ...step, ...patch })
  const value = FLOW_VALUES.find((v) => v.key === step.source)
  const values = valuesFor(ctx)
  const groups = [...new Set(values.map((v) => v.group))]
  const amount = (label, placeholder = 'e.g. dmg, or 2d6 + @prof') => (
    <label className="npc-wide-field">
      {label}
      <MathField value={step.amount} onChange={(v) => set({ amount: v })} vars={vars} placeholder={placeholder} label={label} />
    </label>
  )
  const showFields = (
    <div className="dm-form-row">
      <label className="tag-checklist-item">
        <input type="checkbox" checked={!!step.show} onChange={(e) => set({ show: e.target.checked })} />
        Show it on the chat card
      </label>
      {step.show && (
        <label>
          As
          <input value={step.showLabel} onChange={(e) => set({ showLabel: e.target.value })} placeholder={step.type === 'math' ? step.name : 'the value’s name'} />
        </label>
      )}
    </div>
  )

  return (
    <div className="aw-piece">
      <div className="aw-piece-head">
        <span className="aw-step-number">{index + 1}</span>
        <strong>{def?.label ?? step.type}</strong>
        <span className="aw-piece-tools">
          <button type="button" className="icon-button" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Move up">
            ↑
          </button>
          <button type="button" className="icon-button" onClick={() => onMove(1)} disabled={index === count - 1} aria-label="Move down">
            ↓
          </button>
          <button type="button" className="icon-button" onClick={onRemove} aria-label="Remove step">
            ×
          </button>
        </span>
      </div>
      {def?.help && <span className="npc-hint">{def.help}</span>}

      {step.type === 'value' && (
        <>
          <div className="dm-form-row">
            <label>
              Grab
              <select
                value={step.source}
                onChange={(e) => {
                  const next = FLOW_VALUES.find((v) => v.key === e.target.value)
                  // A suggested name follows the value until it's been typed over.
                  const auto = FLOW_VALUES.some((v) => step.name === v.name || new RegExp(`^${v.name}\\d+$`).test(step.name))
                  set({ source: e.target.value, ...(auto && next ? { name: freeName(next.name, vars) } : {}) })
                }}
              >
                {groups.map((g) => (
                  <optgroup key={g} label={g}>
                    {values
                      .filter((v) => v.group === g)
                      .map((v) => (
                        <option key={v.key} value={v.key}>
                          {v.label}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </label>
            {value?.param === 'ability' && (
              <label>
                Ability
                <AbilitySelect value={step.ability} onChange={(ability) => set({ ability })} />
              </label>
            )}
            {value?.param === 'path' && (
              <label>
                Stat path
                <input className="npc-code-input" value={step.path} onChange={(e) => set({ path: e.target.value })} placeholder="attributes.movement.walk" />
              </label>
            )}
            {value?.param === 'pool' && (
              <label>
                Resource
                <input value={step.pool} onChange={(e) => set({ pool: e.target.value })} placeholder="identifier, e.g. darkness" />
              </label>
            )}
            {value?.param === 'question' && (
              <label className="npc-wide-field">
                The question
                <input value={step.question} onChange={(e) => set({ question: e.target.value })} placeholder="How many points do you spend?" />
              </label>
            )}
            <label>
              Save it as
              <input className="npc-code-input" value={step.name} onChange={(e) => set({ name: e.target.value.replace(/\s+/g, '_') })} aria-label="Variable name" />
            </label>
          </div>
          {value?.param === 'formula' && (
            <label>
              Dice
              <MathField value={step.formula} onChange={(formula) => set({ formula })} vars={vars} placeholder="e.g. 1d20, or 2d6 + @prof" label="Dice" />
            </label>
          )}
          {showFields}
        </>
      )}

      {step.type === 'math' && (
        <>
          <div className="aw-equation">
            <input className="npc-code-input aw-var-input" value={step.name} onChange={(e) => set({ name: e.target.value.replace(/\s+/g, '_') })} aria-label="Variable name" />
            <span className="aw-equals">=</span>
            <MathField value={step.expr} onChange={(expr) => set({ expr })} vars={vars} placeholder="e.g. floor(hp / 2) + @prof" label="Math" />
          </div>
          <span className="npc-hint">
            + − * / and brackets, dice like 2d6, <code>floor()</code> <code>ceil()</code> <code>round()</code> <code>min(a, b)</code> <code>max(a, b)</code>, and your stats as @references (<code>@prof</code>,{' '}
            <code>@abilities.con.mod</code>).
          </span>
          {showFields}
        </>
      )}

      {step.type === 'flavor' && (
        <>
          <textarea rows={2} value={step.text} onChange={(e) => set({ text: e.target.value })} placeholder="Shadows coil around {target} as the blade drinks deep…" aria-label="Flavor text" />
          <div className="aw-chips">
            {['target', 'me', ...vars].map((v) => (
              <button key={v} type="button" className="aw-chip" onClick={() => set({ text: `${step.text}{${v}}` })}>
                {`{${v}}`}
              </button>
            ))}
          </div>
          <label className="aw-inline">
            Style
            <select value={step.style} onChange={(e) => set({ style: e.target.value })}>
              <option value="flavor">Flavor (italic)</option>
              <option value="plain">Plain line</option>
            </select>
          </label>
        </>
      )}

      {step.type === 'damageRoll' && (
        <>
          <div className="dm-form-row">
            <label>
              How
              <select value={step.mode} onChange={(e) => set({ mode: e.target.value })}>
                <option value="replace">Replace the rolled damage</option>
                <option value="add">Add it on top</option>
              </select>
            </label>
            <label>
              Damage type
              <DamageTypeSelect value={step.damageType} onChange={(damageType) => set({ damageType })} emptyLabel="Same as the roll" />
            </label>
          </div>
          {amount('The number', 'e.g. dmg')}
          {step.mode === 'replace' && <span className="npc-hint">Rounded down. The roll’s own dice (and crit doubling) are swapped out for this number.</span>}
        </>
      )}

      {(step.type === 'damageTarget' || step.type === 'hurtMe') && (
        <>
          {amount('How much')}
          <label className="aw-inline">
            Damage type
            <DamageTypeSelect value={step.damageType} onChange={(damageType) => set({ damageType })} emptyLabel="No type" />
          </label>
        </>
      )}

      {['healTarget', 'healMe', 'tempMe'].includes(step.type) && amount('How much')}

      {step.type === 'advantage' && (
        <label className="aw-inline">
          The attack has
          <select value={step.mode === 'disadvantage' ? 'disadvantage' : 'advantage'} onChange={(e) => set({ mode: e.target.value })}>
            <option value="advantage">Advantage</option>
            <option value="disadvantage">Disadvantage</option>
          </select>
        </label>
      )}

      {step.type === 'cancel' && <span className="npc-hint">Put a flavor step before it to say why. Steps after it don’t run.</span>}

      {(step.type === 'condition' || step.type === 'effect') && (
        <div className="dm-form-row">
          <label>
            On
            <select value={step.to} onChange={(e) => set({ to: e.target.value })}>
              <option value="target">The target</option>
              <option value="self">You</option>
            </select>
          </label>
          {step.type === 'condition' ? (
            <>
              <label>
                Condition
                <select value={step.status} onChange={(e) => set({ status: e.target.value })}>
                  {CONDITIONS.map((c) => (
                    <option key={c} value={c}>
                      {cap(c)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                For (rounds)
                <input type="number" min="0" value={step.rounds} onChange={(e) => set({ rounds: e.target.value })} placeholder="until removed" />
              </label>
            </>
          ) : effects.length ? (
            <label>
              Effect
              <select value={step.effectKey} onChange={(e) => set({ effectKey: e.target.value })}>
                <option value="">Pick one…</option>
                {effects.map((e) => (
                  <option key={e.key} value={e.key}>
                    {e.name || 'Unnamed effect'}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <span className="npc-hint">This item has no effects yet. Add one in the item’s Effects section, then pick it here.</span>
          )}
        </div>
      )}

      {(step.type === 'resource' || step.type === 'featureUses') && (
        <>
          <div className="dm-form-row">
            <label>
              Do
              <select value={step.mode === 'gain' ? 'gain' : 'spend'} onChange={(e) => set({ mode: e.target.value })}>
                <option value="spend">Spend</option>
                <option value="gain">Regain</option>
              </select>
            </label>
            {step.type === 'resource' && (
              <label>
                Resource
                <input value={step.pool} onChange={(e) => set({ pool: e.target.value })} placeholder="identifier, e.g. darkness" />
              </label>
            )}
          </div>
          {amount('How much', 'e.g. 1')}
          {step.type === 'featureUses' && <span className="npc-hint">Uses of {featureName || 'this feature'} (set in the item’s Uses).</span>}
        </>
      )}

      {step.type === 'code' && (
        <textarea
          className="npc-code"
          rows={Math.min(14, Math.max(4, String(step.code ?? '').split('\n').length + 1))}
          spellCheck={false}
          value={step.code}
          onChange={(e) => set({ code: e.target.value })}
          placeholder={'// V.hp is a variable; say("text") adds a card line\nif (V.hp > 30) V.dmg += 5;'}
          aria-label="Custom code"
        />
      )}
    </div>
  )
}

// Grouped "add a step" buttons, only the ones that work at this point.
function StepPalette({ ctx, onAdd }) {
  const steps = stepsFor(ctx)
  const groups = [...new Set(steps.map((s) => s.group))]
  return (
    <div className="aw-palette">
      {groups.map((g) => (
        <div key={g} className="aw-palette-group">
          <span className="aw-palette-label">{g}</span>
          <div className="aw-palette-buttons">
            {steps
              .filter((s) => s.group === g)
              .map((s) => (
                <button key={s.key} type="button" className="secondary npc-small-button" onClick={() => onAdd(s.key)} title={s.help ?? ''}>
                  + {s.label}
                </button>
              ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function StepList({ flow, blockIndex, branch, ctx, effects, featureName, onChange }) {
  const block = flow.blocks[blockIndex]
  const steps = block[branch] ?? []
  const setSteps = (next) => onChange({ ...block, [branch]: next })
  const add = (type) => {
    const taken = varsBefore(flow, { block: blockIndex, branch, step: steps.length })
    const base = type === 'value' ? valuesFor(ctx)[0] : null
    const step = emptyStep(type, { suggestName: type === 'value' ? freeName(base?.name ?? 'value', taken) : type === 'math' ? freeName('total', taken) : '' })
    if (base) step.source = base.key
    setSteps([...steps, step])
  }
  return (
    <>
      {steps.length > 0 && (
        <div className="aw-pieces">
          {steps.map((s, i) => (
            <StepEditor
              key={s.key}
              step={s}
              index={i}
              count={steps.length}
              ctx={ctx}
              effects={effects}
              featureName={featureName}
              vars={varsBefore(flow, { block: blockIndex, branch, step: i })}
              onChange={(next) => setSteps(steps.map((x, idx) => (idx === i ? next : x)))}
              onRemove={() => setSteps(steps.filter((_, idx) => idx !== i))}
              onMove={(d) => {
                const next = [...steps]
                ;[next[i], next[i + d]] = [next[i + d], next[i]]
                setSteps(next)
              }}
            />
          ))}
        </div>
      )}
      <p className="aw-question-small">{steps.length ? 'Next step?' : 'Pick the first step:'}</p>
      <StepPalette ctx={ctx} onAdd={add} />
    </>
  )
}

// ---------------------------------------------------------------------------
// The builder

// activity: the roll being automated; item: its item (for effects).
// onAccept(flow) gets the finished flow; a flow with no blocks means "remove it".
export default function AutomationWizard({ activity, item, onAccept, onClose }) {
  const kind = activity.kind
  const featureName = item?.name ?? ''
  const effects = item?.effects ?? []
  const ref = useRef(null)
  const [flow, setFlow] = useState(() => {
    const start = activity.flow ? structuredClone(activity.flow) : emptyFlow()
    if (!start.blocks.length) start.blocks.push(emptyBlock(KIND_DEFAULT_TRIGGER[kind] ?? 'done'))
    return start
  })
  const [blockKey, setBlockKey] = useState(() => (activity.flow?.blocks?.length ? null : flow.blocks[0].key))
  const [screen, setScreen] = useState(activity.flow?.blocks?.length ? 'review' : 'when')
  const [pickingCheck, setPickingCheck] = useState(false)
  const [wantsElse, setWantsElse] = useState(false)

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  const bi = Math.max(0, flow.blocks.findIndex((b) => b.key === blockKey))
  const block = flow.blocks[bi]
  const ctx = { trigger: block?.trigger, kind }
  const setBlock = (next) => setFlow((f) => ({ ...f, blocks: f.blocks.map((b) => (b.key === next.key ? next : b)) }))
  const problems = useMemo(() => flowProblems(flow, kind), [flow, kind])
  const code = useMemo(() => (screen === 'review' ? flowCode(flow, { itemName: featureName }) : ''), [screen, flow, featureName])

  const go = (next) => {
    setPickingCheck(false)
    setScreen(next)
  }
  const openBlock = (key, next = 'when') => {
    setBlockKey(key)
    setWantsElse(!!flow.blocks.find((b) => b.key === key)?.otherwise?.length)
    go(next)
  }
  const newBlock = (trigger, next) => {
    const b = emptyBlock(trigger)
    setFlow((f) => ({ ...f, blocks: sortBlocks([...f.blocks, b]) }))
    setBlockKey(b.key)
    setWantsElse(false)
    go(next)
  }
  // Blocks stay in the order midi runs them, so variables flow forward.
  const pickTrigger = (trigger) => setFlow((f) => ({ ...f, blocks: sortBlocks(f.blocks.map((b) => (b.key === block.key ? { ...b, trigger } : b))) }))

  const blockProblems = problems.filter((p) => p.block === bi)
  const screenIndex = SCREENS.findIndex((s) => s.key === screen)
  const trig = block ? flowTrigger(block.trigger) : null

  let body
  if (screen === 'when') {
    body = (
      <>
        <h3 className="aw-question">When does it happen?</h3>
        <p className="npc-hint">The point in {featureName || 'this feature'}’s roll where this part runs.</p>
        <div className="aw-choices">
          {triggersFor(kind).map((t) => (
            <button key={t.key} type="button" className={`aw-choice${block.trigger === t.key ? ' is-selected' : ''}`} onClick={() => pickTrigger(t.key)}>
              <strong>{t.label}</strong>
              <span>{t.help}</span>
            </button>
          ))}
        </div>
      </>
    )
  } else if (screen === 'if') {
    const checks = block.checks ?? []
    const vars = varsBefore(flow, { block: bi, branch: 'checks' })
    const palette = (
      <div className="aw-choices aw-choices-compact">
        {checksFor(ctx).map((c) => (
          <button
            key={c.key}
            type="button"
            className="aw-choice"
            onClick={() => {
              setBlock({ ...block, checks: [...checks, emptyCheck(c.key)] })
              setPickingCheck(false)
            }}
          >
            <strong>{c.label}</strong>
          </button>
        ))}
      </div>
    )
    body = (
      <>
        <h3 className="aw-question">Is there a condition?</h3>
        <p className="npc-hint">
          {trig.short}. Only conditions that are known by then are listed.
        </p>
        {!checks.length && !pickingCheck ? (
          <div className="aw-yes-no">
            <button type="button" className="secondary" onClick={() => go('then')}>
              No, it always happens
            </button>
            <button type="button" onClick={() => setPickingCheck(true)}>
              Yes, only if…
            </button>
          </div>
        ) : (
          <>
            <div className="aw-pieces">
              {checks.map((c, i) => (
                <div key={c.key}>
                  {i > 0 && <span className="aw-and">and</span>}
                  <CheckEditor
                    check={c}
                    vars={vars}
                    featureName={featureName}
                    onChange={(next) => setBlock({ ...block, checks: checks.map((x, idx) => (idx === i ? next : x)) })}
                    onRemove={() => setBlock({ ...block, checks: checks.filter((_, idx) => idx !== i) })}
                  />
                </div>
              ))}
            </div>
            {pickingCheck || !checks.length ? (
              <>
                <p className="aw-question-small">{checks.length ? 'And also…' : 'Only if…'}</p>
                {palette}
              </>
            ) : (
              <button type="button" className="secondary npc-small-button" onClick={() => setPickingCheck(true)}>
                + Another condition (all must be true)
              </button>
            )}
          </>
        )}
      </>
    )
  } else if (screen === 'then' || (screen === 'else' && wantsElse)) {
    const branch = screen === 'then' ? 'steps' : 'otherwise'
    body = (
      <>
        <h3 className="aw-question">{screen === 'then' ? 'What happens?' : 'What happens instead?'}</h3>
        <p className="npc-hint">
          {blockSummary({ ...block, steps: [], otherwise: [] }).replace(/: nothing happens\.$/, '')}
          {screen === 'else' ? ', and the condition isn’t met' : ''}. Steps run top to bottom; each can use the variables made above it.
        </p>
        <StepList flow={flow} blockIndex={bi} branch={branch} ctx={ctx} effects={effects} featureName={featureName} onChange={setBlock} />
      </>
    )
  } else if (screen === 'else') {
    body = (
      <>
        <h3 className="aw-question">If the condition isn’t met, should anything happen instead?</h3>
        <div className="aw-yes-no">
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setBlock({ ...block, otherwise: [] })
              go('more')
            }}
          >
            No, nothing happens
          </button>
          <button type="button" onClick={() => setWantsElse(true)}>
            Yes, otherwise…
          </button>
        </div>
      </>
    )
  } else if (screen === 'more') {
    body = (
      <>
        <h3 className="aw-question">Anything else?</h3>
        <p className="aw-summary">{blockSummary(block)}</p>
        {blockProblems.map((p) => (
          <p key={p.text} className="status-message error">
            {p.text}
          </p>
        ))}
        <div className="aw-choices">
          <button type="button" className="aw-choice" onClick={() => newBlock(block.trigger, 'if')}>
            <strong>Another conditional, at the same time</strong>
            <span>{trig.short}, if something else is true…</span>
          </button>
          <button type="button" className="aw-choice" onClick={() => newBlock(block.trigger, 'when')}>
            <strong>Something at a different time</strong>
            <span>Before the attack, after it’s all done…</span>
          </button>
          <button type="button" className="aw-choice is-selected" onClick={() => go('review')}>
            <strong>No, that’s everything</strong>
            <span>Review it, then accept and save.</span>
          </button>
        </div>
      </>
    )
  } else {
    body = (
      <>
        <h3 className="aw-question">Review</h3>
        <div className="dm-form-row">
          <label>
            Chat card title
            <input value={flow.name} onChange={(e) => setFlow({ ...flow, name: e.target.value })} placeholder={featureName || 'The feature’s name'} />
          </label>
          <label>
            Card color
            <select value={flow.color} onChange={(e) => setFlow({ ...flow, color: e.target.value })}>
              {CARD_COLOR_OPTIONS.map(([key, label]) => (
                <option key={key} value={key === 'shadow' ? '' : key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {flow.blocks.length ? (
          <ol className="aw-review">
            {flow.blocks.map((b, i) => (
              <li key={b.key}>
                <p>{blockSummary(b)}</p>
                {problems
                  .filter((p) => p.block === i)
                  .map((p) => (
                    <p key={p.text} className="status-message error">
                      {p.text}
                    </p>
                  ))}
                <div className="dm-list-actions">
                  <button type="button" className="secondary npc-small-button" onClick={() => openBlock(b.key, 'when')}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="danger npc-small-button"
                    onClick={() => setFlow({ ...flow, blocks: flow.blocks.filter((x) => x.key !== b.key) })}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="npc-hint">Nothing left. Accepting removes the automation from this roll.</p>
        )}
        <button type="button" className="secondary npc-small-button" onClick={() => newBlock(KIND_DEFAULT_TRIGGER[kind] ?? 'done', 'when')}>
          + Add another part
        </button>
        <details className="npc-cheatsheet">
          <summary>The macro this builds (runs in Foundry)</summary>
          <pre className="npc-code feature-macro">{code}</pre>
        </details>
      </>
    )
  }

  const next = { when: 'if', if: 'then', then: (block?.checks ?? []).length ? 'else' : 'more', else: 'more' }[screen]
  const back = {
    if: 'when',
    then: 'if',
    else: 'then',
    more: (block?.checks ?? []).length ? 'else' : 'then',
    review: flow.blocks.length ? 'more' : null,
  }[screen]
  const canNext =
    screen === 'then' ? (block.steps ?? []).length > 0 : screen === 'else' ? !wantsElse || (block.otherwise ?? []).length > 0 : screen === 'if' ? !pickingCheck || (block.checks ?? []).length > 0 : true

  return (
    <dialog
      ref={ref}
      className="item-dialog aw-dialog"
      onClose={onClose}
      onCancel={(e) => {
        if (!confirm('Close the builder? Changes since the last accept are lost.')) e.preventDefault()
      }}
    >
      <header className="item-dialog-header">
        <div>
          <h2>Build automation</h2>
          <p className="dm-list-meta">{featureName || 'Untitled feature'}{flow.blocks.length > 1 && screen !== 'review' ? ` · part ${bi + 1} of ${flow.blocks.length}` : ''}</p>
        </div>
        <button type="button" className="secondary" onClick={() => ref.current?.close()}>
          Close
        </button>
      </header>
      <ol className="aw-progress">
        {SCREENS.map((s, i) => (
          <li key={s.key} className={i === screenIndex ? 'is-current' : i < screenIndex ? 'is-done' : ''}>
            {s.label}
          </li>
        ))}
      </ol>
      <div className="item-dialog-body aw-body">{body}</div>
      <div className="item-dialog-actions">
        {back && (
          <button type="button" className="secondary" onClick={() => (screen === 'review' ? openBlock(flow.blocks.at(-1).key, 'more') : go(back))}>
            Back
          </button>
        )}
        <span className="npc-item-actions-spacer" />
        {screen === 'review' ? (
          <button
            type="button"
            disabled={problems.length > 0}
            title={problems.length ? 'Fix the problems above first' : ''}
            onClick={() => {
              onAccept({ ...flow, blocks: sortBlocks(flow.blocks) })
              ref.current?.close()
            }}
          >
            Accept &amp; save
          </button>
        ) : next ? (
          <button type="button" onClick={() => go(next)} disabled={!canNext}>
            Next
          </button>
        ) : null}
      </div>
    </dialog>
  )
}
