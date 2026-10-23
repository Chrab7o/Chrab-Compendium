import { DAMAGE_TYPES } from '../../../lib/foundryActorBuilder'
import {
  BEHAVIOR_EVENTS,
  BEHAVIOR_OUTCOMES,
  TOGGLE_VISUALS,
  behaviorSummary,
  emptyBehavior,
  emptyBehaviorRule,
  ruleOutcomeFits,
  ruleSummary,
} from '../../../lib/foundryBehaviors'
import { ConditionRows } from './AutomationFields'
import FormulaInput from './FormulaInput'

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)

const TOGGLE_ACTIVATIONS = [
  { key: 'bonus', label: 'Bonus action' },
  { key: 'action', label: 'Action' },
  { key: 'reaction', label: 'Reaction' },
  { key: 'special', label: 'Free / no action' },
]

const WHEN_HELP = [
  ['c.natural', 'the natural d20 of the attack roll'],
  ['c.hits, c.dealt', 'targets hit / HP damage dealt (after it lands)'],
  ['c.target.actor', 'the first target hit (a token)'],
  ['c.actor, c.item, c.activity', 'the owner, this feature, the roll being made'],
  ['c.workflow.isCritical', 'and anything else on the midi workflow'],
]

function DamageTypeSelect({ value, onChange, allowNone = true }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Damage type">
      {allowNone && <option value="">(no type)</option>}
      {DAMAGE_TYPES.map((t) => (
        <option key={t} value={t}>
          {cap(t)}
        </option>
      ))}
    </select>
  )
}

function RuleEditor({ rule, onChange, onRemove }) {
  const set = (patch) => onChange({ ...rule, ...patch })
  const event = BEHAVIOR_EVENTS.find((e) => e.key === rule.event) ?? BEHAVIOR_EVENTS[0]
  const attackish = event.attack || rule.event === 'damage' || rule.event === 'dealt'
  const hasType = rule.outcome === 'bonusDamage' || rule.outcome === 'damageSelf'

  function setOutcome(outcome) {
    // Bonus damage only exists on the damage roll, so pick that event for it.
    set({ outcome, event: outcome === 'bonusDamage' ? 'damage' : rule.event, damageType: outcome === 'bonusDamage' || outcome === 'damageSelf' ? rule.damageType || 'necrotic' : '' })
  }

  return (
    <div className="npc-activity">
      <div className="dm-form-row">
        <label>
          When
          <select value={rule.event} onChange={(e) => set({ event: e.target.value })}>
            {BEHAVIOR_EVENTS.map((ev) => (
              <option key={ev.key} value={ev.key}>
                {ev.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Then
          <select value={rule.outcome} onChange={(e) => setOutcome(e.target.value)}>
            {BEHAVIOR_OUTCOMES.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Label
          <input value={rule.label} onChange={(e) => set({ label: e.target.value })} placeholder="shown in chat, e.g. Blood Harvest" />
        </label>
      </div>

      {attackish && (
        <div className="dm-form-row">
          <label>
            Attack
            <select value={rule.attackRange} onChange={(e) => set({ attackRange: e.target.value })}>
              <option value="any">{event.attack ? 'Any attack' : 'Any roll'}</option>
              <option value="melee">Melee only</option>
              <option value="ranged">Ranged only</option>
            </select>
          </label>
          <label>
            Made with
            <select value={rule.attackSource} onChange={(e) => set({ attackSource: e.target.value })}>
              <option value="any">Anything</option>
              <option value="weapon">A weapon (or unarmed)</option>
              <option value="spell">A spell</option>
            </select>
          </label>
          {(event.attack || rule.event === 'damage') && (
            <label>
              Natural d20 at least
              <input type="number" min="2" max="20" value={rule.naturalMin} placeholder="any" onChange={(e) => set({ naturalMin: e.target.value })} />
            </label>
          )}
          <label className="tag-checklist-item">
            <input type="checkbox" checked={!!rule.critOnly} onChange={(e) => set({ critOnly: e.target.checked })} />
            Critical hits only
          </label>
        </div>
      )}

      <div className="npc-damage-row">
        <FormulaInput
          value={rule.formula}
          onChange={(formula) => set({ formula })}
          placeholder={rule.outcome === 'bonusDamage' ? 'e.g. 1d10' : 'e.g. 1d10 + @abilities.con.mod'}
          ariaLabel="Amount"
        />
        {hasType ? <DamageTypeSelect value={rule.damageType} onChange={(damageType) => set({ damageType })} /> : <span />}
        <span />
      </div>
      {rule.outcome === 'bonusDamage' && (
        <div className="dm-form-row">
          <label>
            Cost
            <select value={rule.selfCost} onChange={(e) => set({ selfCost: e.target.value })}>
              <option value="none">Free</option>
              <option value="same">I take the same damage</option>
            </select>
          </label>
          <label className="tag-checklist-item">
            <input type="checkbox" checked={rule.critDoubles !== false} onChange={(e) => set({ critDoubles: e.target.checked })} />
            Dice double on a critical hit
          </label>
        </div>
      )}

      <div className="dm-form-row">
        <label className="tag-checklist-item">
          <input type="checkbox" checked={!!rule.ask} onChange={(e) => set({ ask: e.target.checked })} />
          Ask first (the player chooses each time)
        </label>
        <label className="tag-checklist-item">
          <input type="checkbox" checked={!!rule.oncePerTurn} onChange={(e) => set({ oncePerTurn: e.target.checked })} />
          Once per turn
        </label>
      </div>

      <ConditionRows rows={rule.targetConditions ?? []} onChange={(targetConditions) => set({ targetConditions })} slot="use" label="Only if the target" />
      <details className="npc-cheatsheet">
        <summary>Custom condition (JavaScript){rule.when ? ': on' : ''}</summary>
        <input
          className="npc-code-input npc-behavior-when"
          value={rule.when ?? ''}
          onChange={(e) => set({ when: e.target.value })}
          placeholder="e.g. c.natural >= 18 && c.actor.system.attributes.hp.value < c.actor.system.attributes.hp.max"
          aria-label="Custom condition"
        />
        <dl>
          {WHEN_HELP.map(([code, text]) => (
            <div key={code}>
              <dt>
                <code>{code}</code>
              </dt>
              <dd>{text}</dd>
            </div>
          ))}
        </dl>
      </details>

      {ruleOutcomeFits(rule) ? (
        <p className="npc-hint">{ruleSummary(rule)}</p>
      ) : (
        <p className="npc-hint npc-behavior-warn">Extra damage only works with “I roll damage”. This rule is skipped until the event changes.</p>
      )}
      <div className="repeatable-row-controls">
        <button type="button" className="danger npc-small-button" onClick={onRemove}>
          Remove rule
        </button>
      </div>
    </div>
  )
}

function ToggleFields({ toggle, set }) {
  const visual = TOGGLE_VISUALS.find((v) => v.key === toggle.visual)
  return (
    <>
      <div className="dm-form-row">
        <label>
          Turning it on or off takes
          <select value={toggle.activation} onChange={(e) => set({ activation: e.target.value })}>
            {TOGGLE_ACTIVATIONS.map((a) => (
              <option key={a.key} value={a.key}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Button name
          <input value={toggle.label} onChange={(e) => set({ label: e.target.value })} placeholder="Toggle" />
        </label>
        <label>
          Visual while on
          <select value={toggle.visual} onChange={(e) => set({ visual: e.target.value })}>
            {TOGGLE_VISUALS.map((v) => (
              <option key={v.key} value={v.key}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
        {visual?.color && <span className="npc-behavior-swatch" style={{ background: visual.color }} aria-hidden="true" />}
      </div>
      <div className="dm-form-row">
        <label className="npc-wide-field">
          Sequencer file (optional)
          <input
            className="npc-code-input"
            value={toggle.sequencerFile}
            onChange={(e) => set({ sequencerFile: e.target.value })}
            placeholder="e.g. jb2a.energy_strands.overlay.dark_red - copy one from Sequencer's Database Viewer"
          />
        </label>
      </div>
      <div className="dm-form-row">
        <label className="tag-checklist-item">
          <input type="checkbox" checked={toggle.freeOff !== false} onChange={(e) => set({ freeOff: e.target.checked })} />
          Turning it off gives back its use
        </label>
        <label className="tag-checklist-item">
          <input type="checkbox" checked={toggle.announce !== false} onChange={(e) => set({ announce: e.target.checked })} />
          Say so in chat
        </label>
      </div>
      <p className="npc-hint">
        Using the item puts its stance on the owner (an effect with this item&apos;s icon), and using it again takes it
        off. To change stats while it&apos;s on (AC, resistances…), add an effect below and set it to apply “While
        toggled on”. The visual plays through Sequencer when it&apos;s installed; otherwise the token glows.
      </p>
    </>
  )
}

// "Behavior": a toggle (stance) and/or rules that react to the owner's OTHER
// items - "when I make a melee attack roll... I regain hit points". Compiled by
// lib/foundryBehaviors.js into one midi-qol macro plus the effect that hooks it.
export default function BehaviorFields({ item, onChange }) {
  const behavior = item.behavior
  const set = (patch) => onChange({ ...behavior, ...patch })
  const rules = behavior?.rules ?? []
  const badge = behavior
    ? [behavior.mode === 'toggle' ? 'toggle' : 'always on', rules.length && `${rules.length} rule${rules.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ')
    : ''

  function setMode(mode) {
    if (!mode) return onChange(null)
    onChange(behavior ? { ...behavior, mode } : emptyBehavior(mode))
  }

  return (
    <details className="npc-automation npc-behavior" open={!!behavior || undefined}>
      <summary>
        Behavior: stances and reactions{badge ? <span className="npc-badge">{badge}</span> : null}
      </summary>
      <div className="npc-automation-body">
        <label className="npc-script-pick">
          Mode
          <select value={behavior?.mode ?? ''} onChange={(e) => setMode(e.target.value)}>
            <option value="">None</option>
            <option value="toggle">Toggle on / off (a stance)</option>
            <option value="passive">Always on</option>
          </select>
        </label>
        {!behavior && (
          <p className="npc-hint">
            Behaviors react to everything the owner does, not just this item: “while in this stance, a melee hit can
            deal extra necrotic damage”.
          </p>
        )}
        {behavior?.mode === 'toggle' && <ToggleFields toggle={{ ...emptyBehavior().toggle, ...behavior.toggle }} set={(patch) => set({ toggle: { ...behavior.toggle, ...patch } })} />}
        {behavior && (
          <>
            {rules.map((rule, i) => (
              <RuleEditor
                key={rule.key}
                rule={rule}
                onChange={(value) => set({ rules: rules.map((r, idx) => (idx === i ? value : r)) })}
                onRemove={() => set({ rules: rules.filter((_, idx) => idx !== i) })}
              />
            ))}
            <div className="dm-form-actions">
              <button type="button" className="secondary npc-small-button" onClick={() => set({ rules: [...rules, emptyBehaviorRule('healSelf')] })}>
                + Rule: heal or protect me
              </button>
              <button type="button" className="secondary npc-small-button" onClick={() => set({ rules: [...rules, emptyBehaviorRule('bonusDamage')] })}>
                + Rule: extra damage
              </button>
            </div>
            {(rules.length > 0 || behavior.mode === 'toggle') && (
              <div className="npc-overtime">
                <span className="option-picker-label">Rules text</span>
                <p className="npc-behavior-preview">{behaviorSummary(behavior, item.name)}</p>
              </div>
            )}
          </>
        )}
      </div>
    </details>
  )
}
