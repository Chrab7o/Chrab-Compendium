import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { CONDITIONS, DAMAGE_TYPES, NPC_ABILITIES } from '../../../lib/foundryActorBuilder'
import { CREATURE_TYPES, SIZE_LABELS, SIZE_ORDER, conditionPresets, emptyCondition } from '../../../lib/foundryAutomation'
import { SELF_CONDITIONS, emptySelfCondition } from '../../../lib/foundryBehaviors'
import { CARD_COLOR_OPTIONS } from '../../../lib/foundryChat'
import {
  COMPARE_OPS,
  FLOW_CHECKS,
  FLOW_STEPS,
  FLOW_VALUES,
  checksFor,
  emptyCheck,
  emptyLine,
  emptySection,
  flowCode,
  flowProblems,
  flowTrigger,
  lineWords,
  mathFormula,
  scriptMemories,
  scriptScopes,
  stepsFor,
  toScript,
  triggersFor,
  valuesFor,
} from '../../../lib/automationFlow'
import OptionPicker from '../OptionPicker'

// The Automation Builder: a roll's macro, written like a short script. Each
// point in the roll ("After the attack roll") holds lines run top to bottom:
// set a variable, a remembered number, if / otherwise (nested as deep as you
// like), or a step that does something. A folded line reads like code; click
// it to fill in its boxes. The model and the code it becomes are in
// lib/automationFlow.js.

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)

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
          <span className="npc-hint">No variables yet: set one on a line above, or use numbers, dice and @references.</span>
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
// One line's boxes (every kind but if)

function StepFields({ step, onChange, vars, ctx, effects, featureName, memories }) {
  const def = FLOW_STEPS.find((s) => s.key === step.type)
  const set = (patch) => onChange({ ...step, ...patch })
  const value = FLOW_VALUES.find((v) => v.key === step.source)
  const values = valuesFor(ctx)
  const groups = [...new Set(values.map((v) => v.group))]
  // "Every picked creature" lines also know picks: how many times that one was picked.
  const each = step.to === 'each'
  const amountVars = each ? [...vars, 'picks'] : vars
  const amount = (label, placeholder = 'e.g. dmg, or 2d6 + @prof') => (
    <label className="npc-wide-field">
      {label}
      <MathField value={step.amount} onChange={(v) => set({ amount: v })} vars={amountVars} placeholder={placeholder} label={label} />
    </label>
  )
  const onWho = (withSelf) => (
    <label>
      On
      <select value={step.to} onChange={(e) => set({ to: e.target.value })}>
        <option value="target">The target</option>
        <option value="each">Every picked creature (else every target)</option>
        {withSelf && <option value="self">You</option>}
      </select>
    </label>
  )
  const eachHint = each && (
    <span className="npc-hint">
      Runs once for each creature a “Pick targets on the map” line above chose (with no such line, each of the roll’s targets). <code>picks</code> is how many
      times that creature was picked, e.g. <code>(picks)d6 + picks</code> for 1d6 + 1 a missile.
    </span>
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

  const nameField = (
    <input className="npc-code-input aw-var-input" value={step.name} onChange={(e) => set({ name: e.target.value.replace(/\s+/g, '_') })} aria-label="Variable name" placeholder="name" />
  )

  return (
    <>
      {def?.help && <span className="npc-hint">{def.help}</span>}

      {step.type === 'value' && (
        <>
          <div className="aw-equation">
            <span className="aw-keyword">set</span>
            {nameField}
            <span className="aw-equals">=</span>
          </div>
          <div className="dm-form-row">
            <label>
              The value
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
            <span className="aw-keyword">set</span>
            {nameField}
            <span className="aw-equals">=</span>
            <MathField value={step.expr} onChange={(expr) => set({ expr })} vars={vars} placeholder="e.g. CritAt - 1, or floor(hp / 2) + @prof" label="Math" />
          </div>
          {memories.has(step.name) && <span className="npc-hint">{step.name} is a remembered number: this is saved for next time.</span>}
          {!memories.has(step.name) &&
            [...memories.keys()]
              .filter((m) => new RegExp(`\\b${m}\\b`).test(step.expr ?? ''))
              .map((m) => (
                <span key={m} className="aw-copy-warning">
                  {step.name || 'This'} is a copy of {m}: changing {step.name || 'it'} later isn’t saved. To keep a change for the next use, set {m} itself (e.g. “set {m} = {m} - 1”).
                </span>
              ))}
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

      {step.type === 'popup' && (
        <>
          <textarea rows={2} value={step.text} onChange={(e) => set({ text: e.target.value })} placeholder="Ravenous: roll critical damage!" aria-label="Pop-up text" />
          <div className="aw-chips">
            {['target', 'me', ...vars].map((v) => (
              <button key={v} type="button" className="aw-chip" onClick={() => set({ text: `${step.text}{${v}}` })}>
                {`{${v}}`}
              </button>
            ))}
          </div>
          <label className="tag-checklist-item">
            <input type="checkbox" checked={!!step.gm} onChange={(e) => set({ gm: e.target.checked })} />
            The GM sees it too
          </label>
          {step.gm && <span className="npc-hint">The GM’s pop-up needs Chrab Sync 0.2.1 or later. Without it, the GM gets it as a whisper in chat.</span>}
        </>
      )}

      {step.type === 'memory' && (
        <>
          <div className="aw-equation">
            <span className="aw-keyword">remembered</span>
            {nameField}
          </div>
          <div className="dm-form-row">
            <label className="npc-wide-field">
              Starts at (and goes back to when forgotten)
              <MathField value={step.start} onChange={(start) => set({ start })} vars={vars} placeholder="e.g. 20" label="Starting value" />
            </label>
            <label>
              Forget after (minutes)
              <input type="number" min="0" step="0.1" value={step.forget} onChange={(e) => set({ forget: e.target.value })} placeholder="never" />
            </label>
          </div>
          <span className="npc-hint">
            Kept on this item. Use it like any variable below; “set {step.name || 'it'} = …” saves the new value. Forgetting counts game time
            since the last change: a combat round is 6 seconds, so 1 minute is 10 rounds.
          </span>
        </>
      )}

      {step.type === 'forget' && (
        <label className="aw-inline">
          Forget
          <select value={step.name} onChange={(e) => set({ name: e.target.value })}>
            <option value="">Pick one…</option>
            {[...memories.keys()].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      )}

      {step.type === 'makeCrit' && (
        <span className="npc-hint">
          A crit always hits, so a roll that missed becomes a hit too: don’t require “The attack hit” for it. Midi rolls the damage once, as a crit.
        </span>
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

      {step.type === 'pickTargets' && (
        <>
          <div className="dm-form-row">
            <label>
              Range (ft.)
              <input type="number" min="5" step="5" value={step.range} onChange={(e) => set({ range: e.target.value })} placeholder="its own" />
            </label>
            <label>
              Who can be picked
              <select value={step.who} onChange={(e) => set({ who: e.target.value })}>
                <option value="any">Any creature</option>
                <option value="enemies">Enemies (not your side)</option>
                <option value="allies">Allies (your side)</option>
              </select>
            </label>
            <label className="tag-checklist-item">
              <input type="checkbox" checked={!!step.stack} onChange={(e) => set({ stack: e.target.checked })} />
              One creature can be picked more than once
            </label>
          </div>
          {amount('How many picks', 'e.g. 3, or 3 + upcast')}
          <span className="npc-hint">
            {ctx.trigger === 'use'
              ? 'They become this roll’s targets, so its attack, save and damage go to them. The spell slot isn’t chosen yet here: for more picks when upcast, pick after it’s all done.'
              : 'The roll is done, so they don’t change its targets: use “every picked creature” lines below (damage, healing, conditions, effects).'}{' '}
            Esc cancels{ctx.trigger === 'use' ? ' the use' : ''}; Enter finishes with fewer. A blank range is the spell’s or feature’s own when it’s used (touch is 5 ft;
            self, any or special draw no ring and have no limit), so the same line works on anything.
          </span>
        </>
      )}

      {(step.type === 'damageTarget' || step.type === 'hurtMe') && (
        <>
          {step.type === 'damageTarget' && <div className="dm-form-row">{onWho(false)}</div>}
          {amount('How much')}
          {eachHint}
          <label className="aw-inline">
            Damage type
            <DamageTypeSelect value={step.damageType} onChange={(damageType) => set({ damageType })} emptyLabel="No type" />
          </label>
        </>
      )}

      {step.type === 'healTarget' && (
        <>
          <div className="dm-form-row">{onWho(false)}</div>
          {amount('How much')}
          {eachHint}
        </>
      )}

      {['healMe', 'tempMe'].includes(step.type) && amount('How much')}

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
          {onWho(true)}
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
    </>
  )
}

// ---------------------------------------------------------------------------
// The script

// What every line needs to know about the whole script: the variables it can
// see (scopes), the remembered numbers, problems by line, which lines are
// unfolded, and the item's effects.
const ScriptContext = createContext(null)

const stripWhere = (text) => (text.includes('”: ') ? text.slice(text.indexOf('”: ') + 3) : text)

// The "+ Add a line" menu: variables first, then if, then everything else
// that works at this point of the roll.
function AddLine({ ctx, onAdd }) {
  const steps = stepsFor(ctx)
  const groups = [...new Set(steps.map((s) => s.group))]
  const group = (g) => (
    <optgroup key={g} label={g}>
      {steps
        .filter((s) => s.group === g)
        .map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
    </optgroup>
  )
  return (
    <select className="aw-add-line" value="" onChange={(e) => e.target.value && onAdd(e.target.value)} aria-label="Add a line">
      <option value="">+ Add a line</option>
      {groups.filter((g) => g === 'Variables').map(group)}
      <optgroup label="Logic">
        <option value="if">If… (otherwise…)</option>
      </optgroup>
      {groups.filter((g) => g !== 'Variables').map(group)}
    </select>
  )
}

// A list of lines: a section's, or one branch of an if. owner: the key its
// end is known by in the scopes ("<section key>", "<if key>:then"...).
function LineList({ lines, owner, onChange }) {
  const sc = useContext(ScriptContext)
  const end = sc.scopes.get(`${owner}:end`) ?? { vars: [], ctx: sc.defaultCtx }
  const add = (type) => {
    let line
    if (type === 'value') {
      const base = valuesFor(end.ctx)[0]
      line = emptyLine('value', { suggestName: freeName(base?.name ?? 'value', end.vars) })
      if (base) line.source = base.key
    } else if (type === 'math') {
      line = { ...emptyLine('math', { suggestName: freeName('total', end.vars) }), show: false }
    } else {
      line = emptyLine(type)
    }
    sc.open(line.key)
    onChange([...lines, line])
  }
  return (
    <div className="aw-lines">
      {lines.map((line, i) => (
        <LineItem
          key={line.key}
          line={line}
          first={i === 0}
          last={i === lines.length - 1}
          onChange={(next) => onChange(lines.map((x, j) => (j === i ? next : x)))}
          onRemove={() => onChange(lines.filter((_, j) => j !== i))}
          onMove={(d) => {
            const next = [...lines]
            ;[next[i], next[i + d]] = [next[i + d], next[i]]
            onChange(next)
          }}
        />
      ))}
      <AddLine ctx={end.ctx} onAdd={add} />
    </div>
  )
}

// An if's boxes: what it checks, and whether all or any of it must hold.
function IfFields({ line, onChange, vars, ctx }) {
  const sc = useContext(ScriptContext)
  const checks = line.checks ?? []
  const set = (patch) => onChange({ ...line, ...patch })
  return (
    <>
      {checks.length > 1 && (
        <label className="aw-inline">
          Runs when
          <select value={line.join === 'any' ? 'any' : 'all'} onChange={(e) => set({ join: e.target.value })}>
            <option value="all">all of these are true</option>
            <option value="any">any one of these is true</option>
          </select>
        </label>
      )}
      {checks.length > 0 && (
        <div className="aw-pieces">
          {checks.map((c, i) => (
            <div key={c.key}>
              {i > 0 && <span className="aw-and">{line.join === 'any' ? 'or' : 'and'}</span>}
              <CheckEditor
                check={c}
                vars={vars}
                featureName={sc.featureName}
                onChange={(next) => set({ checks: checks.map((x, j) => (j === i ? next : x)) })}
                onRemove={() => set({ checks: checks.filter((_, j) => j !== i) })}
              />
            </div>
          ))}
        </div>
      )}
      <select className="aw-add-line" value="" onChange={(e) => e.target.value && set({ checks: [...checks, emptyCheck(e.target.value)] })} aria-label="Add a check">
        <option value="">{checks.length ? '+ Another check' : '+ What it checks'}</option>
        {checksFor(ctx).map((c) => (
          <option key={c.key} value={c.key}>
            {c.label}
          </option>
        ))}
      </select>
    </>
  )
}

function LineItem({ line, onChange, onRemove, onMove, first, last }) {
  const sc = useContext(ScriptContext)
  const { vars, ctx } = sc.scopes.get(line.key) ?? { vars: [], ctx: sc.defaultCtx }
  const open = sc.isOpen(line.key)
  const problems = sc.problems.get(line.key) ?? []
  const isIf = line.type === 'if'
  const elseKey = `${line.key}:else`
  return (
    <div className={`aw-line${isIf ? ' is-if' : ''}`}>
      <div className="aw-line-row">
        <button type="button" className={`aw-line-text${problems.length ? ' is-bad' : ''}`} onClick={() => sc.toggle(line.key)} aria-expanded={open}>
          <code>
            {lineWords(line)}
            {isIf ? ':' : ''}
          </code>
          {problems.length > 0 && <span className="aw-line-flag">needs a fix</span>}
        </button>
        <span className="aw-piece-tools">
          <button type="button" className="icon-button" onClick={() => onMove(-1)} disabled={first} aria-label="Move up">
            ↑
          </button>
          <button type="button" className="icon-button" onClick={() => onMove(1)} disabled={last} aria-label="Move down">
            ↓
          </button>
          <button type="button" className="icon-button" onClick={onRemove} aria-label="Remove line">
            ×
          </button>
        </span>
      </div>
      {open && (
        <div className="aw-line-fields">
          {isIf ? (
            <IfFields line={line} onChange={onChange} vars={vars} ctx={ctx} />
          ) : (
            <StepFields step={line} onChange={onChange} vars={vars} ctx={ctx} effects={sc.effects} featureName={sc.featureName} memories={sc.memories} />
          )}
          {problems.map((p) => (
            <p key={p} className="status-message error">
              {stripWhere(p)}
            </p>
          ))}
          <button type="button" className="secondary npc-small-button fw-self-start" onClick={() => sc.toggle(line.key)}>
            Done
          </button>
        </div>
      )}
      {isIf && (
        <>
          <div className="aw-branch">
            <LineList lines={line.then ?? []} owner={`${line.key}:then`} onChange={(then) => onChange({ ...line, then })} />
          </div>
          {line.else?.length || sc.isOpen(elseKey) ? (
            <>
              <code className="aw-line-else">otherwise:</code>
              <div className="aw-branch">
                <LineList lines={line.else ?? []} owner={elseKey} onChange={(next) => onChange({ ...line, else: next })} />
              </div>
            </>
          ) : (
            <button type="button" className="secondary npc-small-button aw-add-else" onClick={() => sc.open(elseKey)}>
              + otherwise
            </button>
          )}
        </>
      )}
    </div>
  )
}

function SectionEditor({ section, kind, onChange, onRemove, canRemove }) {
  const sc = useContext(ScriptContext)
  const trig = flowTrigger(section.trigger)
  return (
    <section className="aw-section">
      <div className="aw-section-head">
        <select value={section.trigger} onChange={(e) => onChange({ ...section, trigger: e.target.value })} aria-label="When this part runs">
          {triggersFor(kind).map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
        {canRemove && (
          <button type="button" className="icon-button" onClick={onRemove} aria-label="Remove this part">
            ×
          </button>
        )}
      </div>
      <span className="npc-hint">{trig.help}</span>
      <LineList lines={section.lines} owner={section.key} onChange={(lines) => onChange({ ...section, lines })} />
      {!section.lines.length && sc.hasLines && <span className="npc-hint">Nothing here yet. It’s left out when you save.</span>}
    </section>
  )
}

// ---------------------------------------------------------------------------
// The builder

// activity: the roll being automated; item: its item (for effects).
// onAccept(flow) gets the finished script, or null to remove the automation.
export default function AutomationWizard({ activity, item, onAccept, onClose }) {
  const kind = activity.kind
  const featureName = item?.name ?? ''
  const effects = item?.effects ?? []
  const ref = useRef(null)
  const [flow, setFlow] = useState(() => {
    const start = toScript(activity.flow ? structuredClone(activity.flow) : null)
    if (!start.sections.length) start.sections = [emptySection(KIND_DEFAULT_TRIGGER[kind] ?? 'done')]
    return start
  })
  const [openKeys, setOpenKeys] = useState(() => new Set())
  const [showCode, setShowCode] = useState(false)

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  // What gets saved: parts with no lines are left out.
  const saved = useMemo(() => ({ ...flow, sections: flow.sections.filter((x) => x.lines.length) }), [flow])
  const hasLines = saved.sections.length > 0
  const scopes = useMemo(() => scriptScopes(flow, kind), [flow, kind])
  const memories = useMemo(() => scriptMemories(flow), [flow])
  const problemList = useMemo(() => flowProblems(saved, kind), [saved, kind])
  const problems = useMemo(() => {
    const byKey = new Map()
    for (const p of problemList) byKey.set(p.key, [...(byKey.get(p.key) ?? []), p.text])
    return byKey
  }, [problemList])
  const code = useMemo(() => (showCode ? flowCode(saved, { itemName: featureName }) : ''), [showCode, saved, featureName])

  const setSections = (sections) => setFlow((f) => toScript({ ...f, sections }))
  const toggle = (key) =>
    setOpenKeys((keys) => {
      const next = new Set(keys)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  const context = {
    scopes,
    memories,
    problems,
    effects,
    featureName,
    hasLines,
    defaultCtx: { trigger: flow.sections[0]?.trigger, kind },
    isOpen: (key) => openKeys.has(key),
    open: (key) => setOpenKeys((keys) => new Set(keys).add(key)),
    toggle,
  }
  const used = new Set(flow.sections.map((x) => x.trigger))
  const free = triggersFor(kind).filter((t) => !used.has(t.key))

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
          <p className="dm-list-meta">{featureName || 'Untitled feature'}</p>
        </div>
        <button type="button" className="secondary" onClick={() => ref.current?.close()}>
          Close
        </button>
      </header>
      <div className="item-dialog-body aw-body">
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
        <p className="npc-hint">
          Lines run top to bottom, like code. Each can use the variables set above it. Click a line to fill in its boxes.
        </p>
        <ScriptContext.Provider value={context}>
          {flow.sections.map((section, i) => (
            <SectionEditor
              key={section.key}
              section={section}
              kind={kind}
              canRemove={flow.sections.length > 1}
              onChange={(next) => setSections(flow.sections.map((x, j) => (j === i ? next : x)))}
              onRemove={() => setSections(flow.sections.filter((_, j) => j !== i))}
            />
          ))}
        </ScriptContext.Provider>
        {free.length > 0 && (
          <select className="aw-add-line" value="" onChange={(e) => e.target.value && setSections([...flow.sections, emptySection(e.target.value)])} aria-label="Add another point in the roll">
            <option value="">+ Another point in the roll…</option>
            {free.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        )}
        {problemList.length > 0 && (
          <div className="aw-problems">
            <strong>
              {problemList.length} thing{problemList.length === 1 ? '' : 's'} to fix before saving
            </strong>
            <ul>
              {problemList.map((p, i) => (
                <li key={i}>{p.text}</li>
              ))}
            </ul>
          </div>
        )}
        {!hasLines && <p className="npc-hint">No lines yet. Accepting with none removes the automation from this roll.</p>}
        <details className="npc-cheatsheet" onToggle={(e) => setShowCode(e.currentTarget.open)}>
          <summary>The macro this builds (runs in Foundry)</summary>
          <pre className="npc-code feature-macro">{code}</pre>
        </details>
      </div>
      <div className="item-dialog-actions">
        <span className="npc-item-actions-spacer" />
        <button
          type="button"
          disabled={problemList.length > 0}
          title={problemList.length ? 'Fix the problems above first' : ''}
          onClick={() => {
            onAccept(hasLines ? saved : null)
            ref.current?.close()
          }}
        >
          Accept &amp; save
        </button>
      </div>
    </dialog>
  )
}
