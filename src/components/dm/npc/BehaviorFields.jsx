import { CONDITIONS, DAMAGE_TYPES } from '../../../lib/foundryActorBuilder'
import {
  BEHAVIOR_ACTIONS,
  BEHAVIOR_EVENTS,
  BEHAVIOR_OUTCOMES,
  SELF_CONDITIONS,
  TOGGLE_VISUALS,
  behaviorSummary,
  emptyBehavior,
  emptyBehaviorAction,
  emptyBehaviorRule,
  emptySelfCondition,
  eventForOutcome,
  ruleOutcomeFits,
  ruleSummary,
} from '../../../lib/foundryBehaviors'
import { CARD_COLORS, CARD_COLOR_OPTIONS, cardColor } from '../../../lib/foundryChat'
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
  ['c.level', 'the level tiers count (class or character level)'],
  ['c.incoming', '“would drop to 0”: the damage about to land (midi damage item)'],
  ['c.damageTaken', '“I take damage”: how much'],
  ['c.workflow.isCritical', 'and anything else on the midi workflow'],
]

// Guided checks on the owner ("my HP is below half").
function SelfConditionRows({ rows, onChange }) {
  const update = (i, patch) => onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  return (
    <div className="npc-damage-rows">
      {rows.length > 0 && <span className="option-picker-label">Only if</span>}
      {rows.map((row, i) => (
        <div key={row.key} className="npc-spend-row">
          <select value={row.id} onChange={(e) => update(i, { ...emptySelfCondition(e.target.value), key: row.key })} aria-label="Check">
            {SELF_CONDITIONS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          {(row.id === 'hpAtMost' || row.id === 'resourceAtLeast') && (
            <input type="number" min="0" className="npc-spend-amount" value={row.value} onChange={(e) => update(i, { value: e.target.value })} aria-label="Value" />
          )}
          {row.id === 'resourceAtLeast' && (
            <input className="npc-code-input" value={row.pool} onChange={(e) => update(i, { pool: e.target.value })} placeholder="resource, e.g. darkness" aria-label="Resource" />
          )}
          {(row.id === 'hasStatus' || row.id === 'lacksStatus') && (
            <select value={row.status} onChange={(e) => update(i, { status: e.target.value })} aria-label="Condition">
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {cap(c)}
                </option>
              ))}
            </select>
          )}
          <button type="button" className="icon-button" onClick={() => onChange(rows.filter((_, idx) => idx !== i))} aria-label="Remove check">
            ×
          </button>
        </div>
      ))}
      <button type="button" className="secondary npc-small-button" onClick={() => onChange([...rows, emptySelfCondition()])}>
        + Check on me
      </button>
    </div>
  )
}

// A rule's extra actions, after its main outcome.
function ActionRows({ rows, onChange, effects }) {
  const update = (i, patch) => onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  return (
    <div className="npc-damage-rows">
      {rows.length > 0 && <span className="option-picker-label">Also</span>}
      {rows.map((row, i) => (
        <div key={row.key} className="npc-spend-row">
          <select value={row.type} onChange={(e) => update(i, { ...emptyBehaviorAction(e.target.value), key: row.key })} aria-label="Action">
            {BEHAVIOR_ACTIONS.map((a) => (
              <option key={a.key} value={a.key}>
                {a.label}
              </option>
            ))}
          </select>
          {row.type === 'applyEffect' && (
            <>
              <select
                value={row.effectKey}
                onChange={(e) => update(i, { effectKey: e.target.value, name: effects.find((x) => x.key === e.target.value)?.name ?? '' })}
                aria-label="Effect"
              >
                <option value="">{effects.length ? 'Pick an effect…' : 'Add an effect set to “Applied by a behavior rule” first'}</option>
                {effects.map((x) => (
                  <option key={x.key} value={x.key}>
                    {x.name || 'Unnamed effect'}
                  </option>
                ))}
              </select>
              <select value={row.to} onChange={(e) => update(i, { to: e.target.value })} aria-label="To">
                <option value="self">on me</option>
                <option value="target">on the target</option>
              </select>
              <label className="tag-checklist-item">
                <input type="checkbox" checked={!!row.unique} onChange={(e) => update(i, { unique: e.target.checked })} />
                One creature at a time
              </label>
              <label className="tag-checklist-item">
                <input type="checkbox" checked={!!row.pickAbility} onChange={(e) => update(i, { pickAbility: e.target.checked })} />
                Player picks an ability
              </label>
            </>
          )}
          {row.type === 'resource' && (
            <>
              <select value={row.mode} onChange={(e) => update(i, { mode: e.target.value })} aria-label="Gain or spend">
                <option value="gain">Gain</option>
                <option value="spend">Spend</option>
              </select>
              <input className="npc-spend-amount" value={row.amount} onChange={(e) => update(i, { amount: e.target.value })} aria-label="Amount" />
              <input className="npc-code-input" value={row.pool} onChange={(e) => update(i, { pool: e.target.value })} placeholder="resource, e.g. darkness" aria-label="Resource" />
            </>
          )}
          {row.type === 'store' && (
            <>
              <select value={row.mode} onChange={(e) => update(i, { mode: e.target.value })} aria-label="Set or add">
                <option value="set">Set</option>
                <option value="add">Add to</option>
              </select>
              <input className="npc-code-input" value={row.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="value name, e.g. souls" aria-label="Value name" />
              <FormulaInput value={row.formula} onChange={(formula) => update(i, { formula })} placeholder="e.g. 1 or @damageTaken" ariaLabel="Value" />
            </>
          )}
          {row.type === 'message' && (
            <>
              <select value={row.style} onChange={(e) => update(i, { style: e.target.value })} aria-label="Where">
                <option value="chat">In chat</option>
                <option value="popup">As a popup</option>
              </select>
              <input value={row.text} onChange={(e) => update(i, { text: e.target.value })} placeholder="text; @check, @damageTaken and @abilities… are filled in" aria-label="Message" />
            </>
          )}
          <button type="button" className="icon-button" onClick={() => onChange(rows.filter((_, idx) => idx !== i))} aria-label="Remove action">
            ×
          </button>
        </div>
      ))}
      <button type="button" className="secondary npc-small-button" onClick={() => onChange([...rows, emptyBehaviorAction()])}>
        + Action
      </button>
      {rows.some((r) => r.type === 'store') && (
        <p className="npc-hint">
          Stored values live on the character: any formula can read them as <code>@flags.chrab-sync.stored.&lt;name&gt;</code>.
        </p>
      )}
      {rows.some((r) => r.type === 'applyEffect' && (r.pickAbility || r.unique)) && (
        <p className="npc-hint">
          One at a time: applying it takes it off whoever had it (a mark moves). Picks an ability: the player chooses
          one each time, and <code>{'{ability}'}</code> in the effect&apos;s change keys becomes it, e.g.{' '}
          <code>system.abilities.{'{ability}'}.bonuses.save</code>. Any <code>{'{owner}'}</code> in a change&apos;s value
          becomes this creature, for conditions like <code>workflow?.actor?.uuid === &quot;{'{owner}'}&quot;</code>.
        </p>
      )}
    </div>
  )
}

// "Roll 2d6: it happens on 7 or higher".
function DiceCheck({ dice, onChange }) {
  const d = { formula: '', compare: 'gte', value: '', ...dice }
  return (
    <div className="dm-form-row">
      <label>
        Only if a roll of
        <input className="npc-code-input" value={d.formula} onChange={(e) => onChange({ ...d, formula: e.target.value })} placeholder="e.g. 2d6 (blank = no roll)" />
      </label>
      {d.formula && (
        <>
          <label>
            is
            <select value={d.compare} onChange={(e) => onChange({ ...d, compare: e.target.value })}>
              <option value="gte">at least</option>
              <option value="lte">at most</option>
              <option value="eq">exactly</option>
            </select>
          </label>
          <label>
            Total
            <input type="number" value={d.value} onChange={(e) => onChange({ ...d, value: e.target.value })} />
          </label>
        </>
      )}
    </div>
  )
}

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

// events: the event keys to offer (the Item Forge narrows them by what's being
// made: armor never "hits"); the rule's own event always stays listed.
export function RuleEditor({ rule, toggle, onChange, onRemove, effects = [], events = null }) {
  const set = (patch) => onChange({ ...rule, ...patch })
  const eventOptions = events ? BEHAVIOR_EVENTS.filter((ev) => events.includes(ev.key) || ev.key === rule.event) : BEHAVIOR_EVENTS
  const outcomeOptions = events ? BEHAVIOR_OUTCOMES.filter((o) => !o.events || o.events.some((k) => events.includes(k)) || o.key === rule.outcome) : BEHAVIOR_OUTCOMES
  const event = BEHAVIOR_EVENTS.find((e) => e.key === rule.event) ?? BEHAVIOR_EVENTS[0]
  const attackish = event.attack || rule.event === 'damage' || rule.event === 'dealt'
  // Target-pass events (would drop to 0, a bonded creature is hurt): no attack
  // filters, no prompt, no cost.
  const downed = !!event.outcomes || !!event.target || !!event.turn
  const bonded = rule.event === 'bondedHurt' || rule.event === 'bondedDowned'
  const hasType = rule.outcome === 'bonusDamage' || rule.outcome === 'damageSelf'

  function setOutcome(outcome) {
    // Bonus damage only exists on the damage roll (staying up only when
    // you'd drop), so pick that event for it.
    const damageType = outcome === 'bonusDamage' || outcome === 'damageSelf' ? rule.damageType || 'necrotic' : ''
    const formula = outcome === 'stayUp' && rule.outcome !== 'stayUp' ? emptyBehaviorRule('stayUp').formula : rule.formula
    set({ outcome, event: eventForOutcome(outcome, rule.event), damageType, formula, spendHitDie: outcome === 'stayUp' ? rule.spendHitDie !== false : rule.spendHitDie })
  }

  function setEvent(key) {
    const next = BEHAVIOR_EVENTS.find((e) => e.key === key)
    if (next?.outcomes && !next.outcomes.includes(rule.outcome)) return setOutcome(next.outcomes[0])
    set({ event: key })
  }

  return (
    <div className="npc-activity">
      <div className="dm-form-row">
        <label>
          When
          <select value={rule.event} onChange={(e) => setEvent(e.target.value)}>
            {eventOptions.map((ev) => (
              <option key={ev.key} value={ev.key}>
                {ev.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Then
          <select value={rule.outcome} onChange={(e) => setOutcome(e.target.value)}>
            {outcomeOptions.map((o) => (
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
      <div className="dm-form-row">
        <label className="npc-wide-field">
          Flavor text
          <input
            value={rule.flavor ?? ''}
            onChange={(e) => set({ flavor: e.target.value })}
            placeholder="on its chat card and prompt, e.g. The darkness drinks from the wound…"
          />
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

      {rule.outcome === 'ignoreResistance' ? (
        <fieldset className="tag-checklist">
          <legend>Ignores resistance to</legend>
          {DAMAGE_TYPES.map((t) => (
            <label key={t} className="tag-checklist-item">
              <input
                type="checkbox"
                checked={(rule.ignoreTypes ?? []).includes(t)}
                onChange={(e) => set({ ignoreTypes: e.target.checked ? [...(rule.ignoreTypes ?? []), t] : (rule.ignoreTypes ?? []).filter((x) => x !== t) })}
              />
              {cap(t)}
            </label>
          ))}
        </fieldset>
      ) : rule.outcome === 'refund' ? (
        <div className="dm-form-row">
          <label>
            Give back
            <input className="npc-code-input" value={rule.refundPool ?? ''} onChange={(e) => set({ refundPool: e.target.value })} placeholder="blank = a use of this feature, or a resource identifier" />
          </label>
          {rule.refundPool && (
            <label>
              Amount
              <input type="number" min="1" value={rule.refundAmount ?? '1'} onChange={(e) => set({ refundAmount: e.target.value })} />
            </label>
          )}
        </div>
      ) : rule.outcome === 'shareDamage' ? (
        <div className="dm-form-row">
          <label>
            Share of the damage (%)
            <input type="number" min="1" max="100" value={rule.share ?? '50'} onChange={(e) => set({ share: e.target.value })} />
          </label>
        </div>
      ) : rule.outcome === 'nothing' ? null : (
        <div className="npc-damage-row">
          <FormulaInput
            value={rule.formula}
            onChange={(formula) => set({ formula })}
            placeholder={rule.outcome === 'bonusDamage' ? 'e.g. 1d10' : rule.outcome === 'stayUp' ? 'e.g. @hitDie + @abilities.con.mod' : 'e.g. 1d10 + @abilities.con.mod'}
            ariaLabel={rule.outcome === 'stayUp' ? 'Hit points left' : 'Amount'}
          />
          {hasType ? <DamageTypeSelect value={rule.damageType} onChange={(damageType) => set({ damageType })} /> : <span />}
          <span />
        </div>
      )}
      <ActionRows rows={rule.actions ?? []} onChange={(actions) => set({ actions })} effects={effects} />
      {rule.outcome === 'stayUp' && (
        <div className="dm-form-row">
          <label className="tag-checklist-item">
            <input type="checkbox" checked={!!rule.spendHitDie} onChange={(e) => set({ spendHitDie: e.target.checked })} />
            Spend one of my hit dice (none left: I fall)
          </label>
          <p className="npc-hint">
            The amount is the hit points you&apos;re left with. <code>@hitDie</code> is your biggest unspent hit die
            (1d10 for a d10 class), so <code>@hitDie + @abilities.con.mod</code> is a normal hit die spend.
          </p>
        </div>
      )}
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
        <label>
          From level
          <input type="number" min="1" max="20" value={rule.minLevel ?? ''} placeholder="any" onChange={(e) => set({ minLevel: e.target.value })} />
        </label>
        <label>
          Up to level
          <input type="number" min="1" max="20" value={rule.maxLevel ?? ''} placeholder="any" onChange={(e) => set({ maxLevel: e.target.value })} />
        </label>
        {!bonded && (
          <label className="tag-checklist-item">
            <input type="checkbox" checked={!!rule.ask} onChange={(e) => set({ ask: e.target.checked })} />
            Ask first (the player chooses each time)
          </label>
        )}
        <label className="tag-checklist-item">
          <input type="checkbox" checked={!!rule.oncePerTurn} onChange={(e) => set({ oncePerTurn: e.target.checked })} />
          Once per turn
        </label>
        {toggle && (
          <label className="tag-checklist-item">
            <input type="checkbox" checked={!!rule.oncePerStance} onChange={(e) => set({ oncePerStance: e.target.checked })} />
            Once each time the stance turns on
          </label>
        )}
      </div>
      {!bonded && !event.outcomes && (
        <div className="dm-form-row">
          <label>
            Costs
            <select value={rule.costOwnUses ? 'own' : rule.costPool ? 'pool' : ''} onChange={(e) => set({ costOwnUses: e.target.value === 'own', costPool: e.target.value === 'pool' ? rule.costPool || 'darkness' : '' })}>
              <option value="">Nothing</option>
              <option value="own">Uses of this feature</option>
              <option value="pool">A resource</option>
            </select>
          </label>
          {rule.costOwnUses && (
            <label>
              Uses
              <input type="number" min="1" value={rule.costAmount ?? '1'} onChange={(e) => set({ costAmount: e.target.value })} />
            </label>
          )}
          {!rule.costOwnUses && rule.costPool && (
            <label>
              Resource
              <input className="npc-code-input" value={rule.costPool ?? ''} onChange={(e) => set({ costPool: e.target.value })} placeholder="identifier, e.g. darkness" />
            </label>
          )}
          {!rule.costOwnUses && rule.costPool && (
            <>
              <label>
                Amount
                <input type="number" min="1" value={rule.costAmount ?? '1'} onChange={(e) => set({ costAmount: e.target.value })} />
              </label>
              <label className="tag-checklist-item">
                <input type="checkbox" checked={!!rule.costExtra} onChange={(e) => set({ costExtra: e.target.checked })} />
                Can spend more: +1 die each (asks how much)
              </label>
            </>
          )}
        </div>
      )}
      {downed && !bonded && (
        <p className="npc-hint">
          This runs inside the attacker&apos;s roll, usually on the GM&apos;s screen. “Ask first” still asks the
          player who owns this creature, on their screen (no answer in two minutes counts as no).
          {rule.outcome === 'stayUp' && ' It also catches this feature’s own costs (“I take the same damage”).'}
        </p>
      )}
      {bonded && (
        <p className="npc-hint">
          A creature is linked while it carries one of this item&apos;s effects set to apply to “The target, linked”.
          This runs inside the attacker&apos;s roll, automatically.
        </p>
      )}

      {!downed && <ConditionRows rows={rule.targetConditions ?? []} onChange={(targetConditions) => set({ targetConditions })} slot="use" label="Only if the target" />}
      <SelfConditionRows rows={rule.selfConditions ?? []} onChange={(selfConditions) => set({ selfConditions })} />
      <DiceCheck dice={rule.dice} onChange={(dice) => set({ dice })} />
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
        <p className="npc-hint npc-behavior-warn">
          {rule.outcome === 'bonusDamage'
            ? 'Extra damage only works with “I roll damage”.'
            : bonded || rule.outcome === 'shareDamage' || rule.outcome === 'refund'
              ? 'Sharing damage goes with “A creature bonded to me is about to take damage”, getting the cost back with “A creature I’ve marked drops to 0”.'
              : downed || rule.outcome === 'stayUp'
              ? 'Staying up only goes with “I would drop to 0 hit points”.'
              : 'This outcome doesn’t fit this event.'}{' '}
          This rule is skipped until that changes.
        </p>
      )}
      <div className="repeatable-row-controls">
        <button type="button" className="danger npc-small-button" onClick={onRemove}>
          Remove rule
        </button>
      </div>
    </div>
  )
}

export function ToggleFields({ toggle, set }) {
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
          Lasts (minutes)
          <input type="number" min="0" value={toggle.duration ?? ''} placeholder="until turned off" onChange={(e) => set({ duration: e.target.value })} />
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

// How its chat cards look: a color, and for a stance a line when it starts and ends.
export function FlavorFields({ flavor, toggle, visual, set }) {
  const fallback = toggle && CARD_COLORS[visual] ? visual : 'shadow'
  return (
    <div className="npc-overtime">
      <span className="option-picker-label">Chat cards</span>
      <div className="dm-form-row">
        <label>
          Card color
          <select value={flavor.color ?? ''} onChange={(e) => set({ color: e.target.value })}>
            <option value="">{toggle && CARD_COLORS[visual] ? 'Same as the visual' : 'Shadow (violet)'}</option>
            {CARD_COLOR_OPTIONS.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <span className="npc-behavior-swatch" style={{ background: cardColor(flavor.color || fallback) }} aria-hidden="true" />
      </div>
      {toggle && (
        <div className="dm-form-row">
          <label className="npc-wide-field">
            Flavor when it starts
            <input value={flavor.on ?? ''} onChange={(e) => set({ on: e.target.value })} placeholder="e.g. Darkness floods your veins…" />
          </label>
          <label className="npc-wide-field">
            Flavor when it ends
            <input value={flavor.off ?? ''} onChange={(e) => set({ off: e.target.value })} placeholder="e.g. The darkness ebbs back…" />
          </label>
        </div>
      )}
      <p className="npc-hint">
        Each rule posts one card in chat when it happens: what set it off, anything it spent, the dice and the result.
        Rules set to “Ask first” show the same card to the player who owns the creature, on their screen, before
        anything happens.
      </p>
    </div>
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
          <FlavorFields
            flavor={{ ...emptyBehavior().flavor, ...behavior.flavor }}
            toggle={behavior.mode === 'toggle'}
            visual={behavior.toggle?.visual}
            set={(patch) => set({ flavor: { ...emptyBehavior().flavor, ...behavior.flavor, ...patch } })}
          />
        )}
        {behavior && (
          <>
            {rules.map((rule, i) => (
              <RuleEditor
                key={rule.key}
                rule={rule}
                toggle={behavior.mode === 'toggle'}
                effects={(item.effects ?? []).filter((e) => e.byRule)}
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
              <button type="button" className="secondary npc-small-button" onClick={() => set({ rules: [...rules, emptyBehaviorRule('stayUp')] })}>
                + Rule: refuse to fall
              </button>
            </div>
            {(behavior.levelClass || rules.some((r) => r.minLevel || r.maxLevel)) && (
              <div className="dm-form-row">
                <label className="npc-wide-field">
                  Level tiers count levels in class
                  <input
                    className="npc-code-input"
                    value={behavior.levelClass ?? ''}
                    onChange={(e) => set({ levelClass: e.target.value })}
                    placeholder="character level - or a class identifier, e.g. the-dark-knight"
                  />
                </label>
                <p className="npc-hint">
                  The class&apos;s identifier on its Foundry item (Details tab). If the owner doesn&apos;t have that class,
                  their character level counts instead. NPCs ignore level tiers.
                </p>
              </div>
            )}
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
