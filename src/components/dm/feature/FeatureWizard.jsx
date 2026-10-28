import { useRef, useState } from 'react'
import { ACTIVITY_KINDS, emptyActivity, emptyChange, emptyEffect, emptyOverTimeRoll, identifierFor } from '../../../lib/foundryActorBuilder'
import { FEAT_TYPES, GEAR_TYPES, gearType, rarityLabel } from '../../../lib/foundryFeatures'
import {
  FORGE_KINDS,
  allowedEffects,
  allowedLimits,
  canTickEachTurn,
  fitToKind,
  forgeKind,
  landingRolls,
  limitOf,
  newForgeSpec,
  ruleEventFor,
  usageOf,
} from '../../../lib/forgeKinds'
import { descriptionMarkdown, hasDescription } from '../../../lib/itemDescription'
import { behaviorSummary, emptyBehavior, emptyBehaviorRule } from '../../../lib/foundryBehaviors'
import { flowProblems, flowSummary, hasFlow } from '../../../lib/automationFlow'
import {
  ActivityBasics,
  ActivityCostFields,
  ActivityDamageFields,
  ActivityScope,
  ActivityTargetFields,
  AutomationSection,
  EffectEditor,
  activityLabel,
  withoutActivity,
  withoutEffect,
} from '../npc/ActionBuilder'
import { FlavorFields, RuleEditor, ToggleFields } from '../npc/BehaviorFields'
import { SpellCastingFields, SpellComponentFields, SpellNameFields, SpellUpcastField } from '../npc/SpellcastingPanel'
import FormulaInput from '../npc/FormulaInput'
import TemplatePicker from './TemplatePicker'
import { DescriptionBlocks, GearStatFields, gearTypePatch } from './GearFields'

// The guided Feature Forge: the same spec FeatureEditor's "All fields" form
// edits, asked one question at a time in the Automation Builder's style.
// Every step is optional, so the step bar jumps anywhere. The fields
// themselves are the shared NPC Forge pieces (npc/ActionBuilder.jsx,
// npc/BehaviorFields.jsx, npc/SpellcastingPanel.jsx).

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

const STEPS = [
  { key: 'start', label: 'Start' },
  { key: 'basics', label: 'Basics' },
  { key: 'description', label: 'Description', gear: true },
  { key: 'use', label: 'How it’s used' },
  { key: 'rolls', label: 'Rolls' },
  { key: 'effects', label: 'Effects' },
  { key: 'reactions', label: 'Reactions', rules: true },
  { key: 'review', label: 'Review' },
]

const FEAT_TYPE_HELP = {
  class: 'Gained from a class or subclass level.',
  feat: 'Taken instead of an ability score increase, or at 1st level.',
  race: 'Part of a species or lineage.',
  background: 'Granted by a background.',
  monster: 'A creature’s trait, attack or ability.',
}

const USES = [
  { key: 'action', label: 'An action', help: 'They spend their action on their turn.' },
  { key: 'bonus', label: 'A bonus action', help: 'They spend their bonus action.' },
  { key: 'reaction', label: 'A reaction', help: 'Midi offers it when its trigger happens.' },
  { key: 'passive', label: 'Always on', help: 'Nothing to click: a trait, or rules that react on their own.' },
  { key: 'stance', label: 'A stance they toggle', help: 'Using it turns it on, using it again turns it off. Bonuses and rules can apply only while it’s on.' },
]

const LIMITS = [
  { key: '', label: 'As often as they like', help: 'No uses to track.' },
  { key: 'uses', label: 'A number of times', help: 'Per long rest, per short rest or per day.' },
  { key: 'recharge', label: 'Recharges on a d6', help: 'Rolled at the start of each turn, like a dragon’s breath.' },
]

const RECOVERY = [
  { key: 'lr', label: 'Per long rest' },
  { key: 'sr', label: 'Per short rest' },
  { key: 'day', label: 'Per day' },
  { key: 'dawn', label: 'At dawn' },
  { key: 'dusk', label: 'At dusk' },
  { key: 'none', label: 'Never (used up)' },
]

const ROLL_KIND_HELP = {
  attack: 'Rolls to hit against AC, then damage.',
  save: 'Targets roll a saving throw against a DC.',
  damage: 'Damage with no roll to hit or save, e.g. extra damage another roll sets off.',
  heal: 'Restores hit points, or gives temporary ones.',
  utility: 'A button that rolls nothing: applies an effect, runs an automation.',
  summon: 'Brings creatures onto the map.',
  transform: 'Turns the user into another creature.',
}

const ROLL_STEPS = [
  { key: 'kind', label: 'Kind' },
  { key: 'targets', label: 'Targets' },
  { key: 'lands', label: 'Damage', kinds: ['attack', 'save', 'damage', 'heal'] },
  { key: 'cost', label: 'Cost' },
  { key: 'automation', label: 'Automation' },
]

// Which ones a kind offers: forgeKinds.js allowedEffects().
const EFFECT_STARTS = [
  { key: 'condition', label: 'A condition on the target', help: 'Prone, frightened, grappled… when a roll lands.', make: () => emptyEffect() },
  { key: 'debuff', label: 'A change to the target', help: 'Lower AC, a vulnerability, a penalty… when a roll lands.', make: () => ({ ...emptyEffect(), changes: [emptyChange()] }) },
  { key: 'onUser', label: 'A bonus on whoever it’s used on', help: 'Lands when a roll targets them: the caster of Shield, whoever drinks the potion.', make: () => ({ ...emptyEffect(), changes: [emptyChange()] }) },
  { key: 'self', label: 'A bonus on them, always on', help: 'AC, a resistance, speed… for as long as they have it.', gearLabel: 'A bonus while it’s equipped', gearHelp: 'AC, a resistance, speed… while it’s equipped (and attuned, if it needs it).', make: () => ({ ...emptyEffect(), passive: true, changes: [emptyChange()] }) },
  { key: 'stance', label: 'A bonus while the stance is on', help: 'Only while the stance is toggled on.', make: () => ({ ...emptyEffect(), stance: true, changes: [emptyChange('advAttack')] }) },
]

// Each kind's allowed choices in its own order (armor: always on first), plus
// the current one if a saved item already has it (marked, last, so nothing is
// lost by opening an old item).
function fitting(options, allowed, current, article) {
  const rank = (o) => (allowed.includes(o.key) ? allowed.indexOf(o.key) : allowed.length)
  return options
    .filter((o) => allowed.includes(o.key) || o.key === current)
    .sort((a, b) => rank(a) - rank(b))
    .map((o) => (allowed.includes(o.key) ? o : { ...o, help: `Doesn’t usually fit ${article}.` }))
}

const RULE_STARTS = [
  { key: 'healSelf', label: 'Heal or protect them', help: 'When they hit or roll a natural 19-20, they regain hit points.' },
  { key: 'bonusDamage', label: 'Extra damage when they hit', help: 'Adds damage to their attacks, maybe at a cost.' },
  { key: 'stayUp', label: 'Refuse to fall', help: 'The first time they would drop to 0, they stay up instead.' },
  { key: 'tempHpSelf', label: 'Temporary hit points', help: 'When something happens, they gain temporary hit points.' },
]

const sectionFor = (activation) => (activation === 'special' ? 'trait' : activation || 'bonus')

// Effects a repeat-each-turn roll rides on: they need no changes of their own.
const tickCarriers = (item) => new Set(item.activities.map((a) => a.overTime?.effectKey).filter(Boolean))

function limitText(item) {
  if (item.usesRecovery === 'recharge') return `Recharge ${item.rechargeOn === 6 ? '6' : `${item.rechargeOn}-6`}`
  const recovery = RECOVERY.find((r) => r.key === item.usesRecovery)
  if (!recovery) return 'Unlimited'
  if (item.usesRecovery === 'none') return `${item.usesMax || '?'} uses, not regained`
  const back = String(item.usesRecoverFormula ?? '').trim()
  return `${item.usesMax || '?'} uses, ${back ? `${back} back` : 'all back'} ${recovery.label.toLowerCase()}`
}

// "Melee weapon attack · 1d8 + @mod slashing · 5 ft. reach"
function rollSummary(a) {
  const damage = (a.damage ?? [])
    .filter((d) => String(d.formula ?? '').trim())
    .map((d) => [d.formula, d.types?.[0]].filter(Boolean).join(' '))
    .join(' + ')
  const area = a.areaType ? `${a.areaSize || '?'}-ft. ${a.areaType}` : a.targetCount ? plural(Number(a.targetCount) || 1, 'target') : ''
  const parts = {
    attack: [`${cap(a.attackType || 'melee')} ${a.classification === 'spell' ? 'spell' : 'weapon'} attack`, damage, a.attackType === 'ranged' ? `${a.range || 30} ft.` : `${a.reach || 5} ft. reach`],
    save: [`${String(a.saveAbility || 'dex').toUpperCase()} save${a.dcAbility === 'spellcasting' ? ' against the spell DC' : a.dc ? `, DC ${a.dc}` : ''}`, damage && `${damage}${a.onSave === 'half' ? ', half on a success' : ''}`, area],
    damage: ['Damage', damage, area],
    heal: [a.healType === 'temphp' ? 'Temporary hit points' : 'Healing', a.healing, area],
    utility: ['No roll', area],
    summon: [`Summons ${a.creatureName || 'a creature'}`],
    transform: [`Transforms into ${a.creatureName || 'a creature'}`],
  }[a.kind] ?? [a.kind]
  return parts.filter(Boolean).join(' · ')
}

function effectSummary(e, item) {
  const where = e.stance ? 'while the stance is on' : e.passive ? 'always on' : e.byRule ? 'placed by a reaction rule' : e.aura ? 'in the aura' : e.bond ? 'on a bonded target' : 'on the target'
  const ticks = item.activities.filter((a) => a.overTime?.effectKey === e.key)
  const what = [
    (e.statuses ?? []).map(cap).join(', '),
    e.changes?.length ? plural(e.changes.length, 'change') : '',
    ...ticks.map((a) => `runs ${a.name || 'a roll'} at the ${a.overTime.turn === 'start' ? 'start' : 'end'} of each turn`),
  ]
    .filter(Boolean)
    .join(' and ')
  return `${e.name || item.name || 'Effect'}: ${where}${what ? `, ${what}` : ', nothing yet'}`
}

function rollProblems(a, i) {
  const name = activityLabel(a, i)
  const out = []
  if (['attack', 'save', 'damage'].includes(a.kind) && !(a.damage ?? []).some((d) => String(d.formula ?? '').trim())) out.push(`${name} deals no damage yet.`)
  if (a.kind === 'heal' && !String(a.healing ?? '').trim()) out.push(`${name} has no healing amount yet.`)
  if (hasFlow(a)) out.push(...flowProblems(a.flow, a.kind).map((p) => `${name}, built automation: ${p.text}`))
  return out
}

// Big answer buttons, the Automation Builder's .aw-choice.
function Choices({ options, value, onPick, compact = false }) {
  return (
    <div className={`aw-choices${compact ? ' aw-choices-compact' : ''}`}>
      {options.map((o) => (
        <button key={o.key} type="button" className={`aw-choice${value === o.key ? ' is-selected' : ''}`} onClick={() => onPick(o.key)}>
          <strong>{o.label}</strong>
          {o.help && <span>{o.help}</span>}
        </button>
      ))}
    </div>
  )
}

function Question({ title, children }) {
  return (
    <>
      <h3 className="aw-question">{title}</h3>
      {children && <p className="npc-hint">{children}</p>}
    </>
  )
}

// ---------------------------------------------------------------------------
// Rolls: a list of cards, and one roll walked through its own steps.

function RollSteps({ activity, item, inSpell, kinds, initialStep = 'kind', onChange, onDone }) {
  const [step, setStep] = useState(initialStep)
  const set = (patch) => onChange({ ...activity, ...patch })
  const steps = ROLL_STEPS.filter((s) => !s.kinds || s.kinds.includes(activity.kind)).map((s) =>
    s.key === 'lands' && activity.kind === 'heal' ? { ...s, label: 'Healing' } : s,
  )
  const at = Math.max(0, steps.findIndex((s) => s.key === step))
  const current = steps[at]
  const index = item.activities.findIndex((a) => a.key === activity.key)

  let body
  if (current.key === 'kind') {
    body = (
      <>
        <Question title="What kind of roll is it?" />
        <Choices options={kinds(activity.kind)} value={activity.kind} onPick={(kind) => set({ kind })} compact />
        <ActivityBasics activity={activity} set={set} item={item} inSpell={inSpell} showKind={false} />
      </>
    )
  } else if (current.key === 'targets') {
    const title = { attack: 'How does it attack?', save: 'What do they save against?', summon: 'What does it summon?', transform: 'What does it become?' }[activity.kind] ?? 'Who does it affect?'
    body = (
      <>
        <Question title={title}>{inSpell ? 'Range and area come from the spell (How it’s used).' : null}</Question>
        <ActivityTargetFields activity={activity} set={set} inSpell={inSpell} />
      </>
    )
  } else if (current.key === 'lands') {
    body = (
      <>
        <Question title={activity.kind === 'heal' ? 'How much does it heal?' : 'What damage does it deal?'}>
          Formulas use the owner’s stats: <code>@mod</code> is the roll’s ability modifier, <code>@prof</code> their proficiency bonus.
        </Question>
        <ActivityDamageFields activity={activity} set={set} inSpell={inSpell} />
      </>
    )
  } else if (current.key === 'cost') {
    body = (
      <>
        <Question title="Does it cost anything else?">
          The feature’s own uses (How it’s used) are spent on their own. Add a cost here for a shared pool (Ki, Focus,
          a resource), hit points, or anything else.
        </Question>
        <ActivityCostFields activity={activity} set={set} item={item} />
      </>
    )
  } else {
    body = (
      <>
        <Question title="Automate it?">
          Build what happens step by step with the Automation Builder, roll another of its rolls after this one, limit
          who it works on, or make it repeat each turn.
        </Question>
        <AutomationSection activity={activity} set={set} item={item} bare />
      </>
    )
  }

  return (
    <div className="fw-roll">
      <div className="fw-roll-head">
        <span className="aw-step-number">{index + 1}</span>
        <strong>{activityLabel(activity, index)}</strong>
        <ol className="aw-progress fw-roll-progress">
          {steps.map((s, i) => (
            <li key={s.key} className={i === at ? 'is-current' : i < at ? 'is-done' : ''}>
              <button type="button" onClick={() => setStep(s.key)}>
                {s.label}
              </button>
            </li>
          ))}
        </ol>
      </div>
      <ActivityScope activity={activity} inSpell={inSpell}>
        <div className="aw-body">{body}</div>
      </ActivityScope>
      <div className="fw-roll-actions">
        {at > 0 && (
          <button type="button" className="secondary" onClick={() => setStep(steps[at - 1].key)}>
            Back
          </button>
        )}
        <span className="npc-item-actions-spacer" />
        {at < steps.length - 1 && (
          <button type="button" className="secondary" onClick={() => setStep(steps[at + 1].key)}>
            Next
          </button>
        )}
        <button type="button" onClick={onDone}>
          Done with this roll
        </button>
      </div>
    </div>
  )
}

function RollsStep({ spec, item, inSpell, setItem }) {
  const kind = forgeKind(spec)
  const usage = usageOf(item)
  const passive = usage === 'passive' && !inSpell
  // Worn and always-on things often roll nothing: don't push them to add one.
  const [editing, setEditing] = useState(null)
  const [openAt, setOpenAt] = useState('kind')
  const [adding, setAdding] = useState(!item.activities.length && !passive && kind.key !== 'armor')
  const open = item.activities.find((a) => a.key === editing)
  const kinds = (current) => fitting(ACTIVITY_KINDS.map((k) => ({ ...k, help: ROLL_KIND_HELP[k.key] })), kind.rolls, current, kind.article)
  const tick = canTickEachTurn(spec, item)
  const choices = [
    tick && {
      key: 'everyTurn',
      label: 'Something every turn',
      help: `At the start (or end) of each of their turns ${usage === 'stance' ? 'while the stance is on' : 'while they have it'}: run an automation, deal damage, heal…`,
    },
    ...kinds(''),
  ].filter(Boolean)

  if (open) {
    return (
      <RollSteps
        key={open.key}
        activity={open}
        item={item}
        inSpell={inSpell}
        kinds={kinds}
        initialStep={openAt}
        onChange={(next) => setItem({ activities: item.activities.map((a) => (a.key === next.key ? next : a)) })}
        onDone={() => setEditing(null)}
      />
    )
  }

  // "Something every turn": a roll midi repeats on the owner's turns while
  // the always-on (or stance) effect is on them; its automation runs each time.
  function addTick() {
    const stance = usage === 'stance'
    let effects = item.effects
    let carrier = effects.find((e) => (stance ? e.stance : e.passive))
    if (!carrier) {
      carrier = { ...emptyEffect(), name: item.name || (stance ? 'Stance' : 'Always on'), ...(stance ? { stance: true } : { passive: true }) }
      effects = [...effects, carrier]
    }
    const a = { ...emptyActivity('utility'), name: 'Each turn', targetType: 'self', overTime: { ...emptyOverTimeRoll(), turn: 'start', effectKey: carrier.key } }
    setItem({ activities: [...item.activities, a], effects })
    setAdding(false)
    setOpenAt('automation')
    setEditing(a.key)
  }

  function add(key) {
    if (key === 'everyTurn') return addTick()
    const a = inSpell && key === 'save' ? { ...emptyActivity('save'), dcAbility: 'spellcasting' } : emptyActivity(key)
    setItem({ activities: [...item.activities, a] })
    setAdding(false)
    setOpenAt('kind')
    setEditing(a.key)
  }

  return (
    <>
      <Question title="Does it roll anything?">
        {passive
          ? ['Rolls are buttons they click.', tick && 'For something that happens by itself, pick “Something every turn”.', kind.gear ? 'Most worn things have none.' : 'Many always-on traits have none.'].filter(Boolean).join(' ')
          : 'Each roll is a button on the sheet: an attack, a save, healing… Passive traits often have none.'}
      </Question>
      {item.activities.length > 0 && (
        <div className="aw-pieces">
          {item.activities.map((a, i) => (
            <div key={a.key} className="aw-piece">
              <div className="aw-piece-head">
                <span className="aw-step-number">{i + 1}</span>
                <strong>{activityLabel(a, i)}</strong>
                <span className="aw-piece-tools">
                  <button type="button" className="secondary npc-small-button" onClick={() => setEditing(a.key)}>
                    Edit
                  </button>
                  <button type="button" className="icon-button" onClick={() => setItem(withoutActivity(item, i))} aria-label="Remove roll">
                    ×
                  </button>
                </span>
              </div>
              <span>{rollSummary(a)}</span>
              {hasFlow(a) && (
                <pre className="npc-flow-summary">{flowSummary(a.flow).join('\n')}</pre>
              )}
            </div>
          ))}
        </div>
      )}
      {adding ? (
        <>
          <p className="aw-question-small">{item.activities.length ? 'What kind of roll?' : 'Add one:'}</p>
          <Choices options={choices} onPick={add} compact />
          {item.activities.length > 0 && (
            <button type="button" className="secondary npc-small-button fw-self-start" onClick={() => setAdding(false)}>
              Cancel
            </button>
          )}
        </>
      ) : (
        <button type="button" className="secondary npc-small-button fw-self-start" onClick={() => setAdding(true)}>
          + Add a roll
        </button>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Effects

function EffectsStep({ spec, item, setItem }) {
  const [open, setOpen] = useState(null)
  const [adding, setAdding] = useState(false)
  const kind = forgeKind(spec)
  const allowed = allowedEffects(spec, item)
  const starts = EFFECT_STARTS.filter((s) => allowed.includes(s.key)).map((s) => (kind.gear && s.gearLabel ? { ...s, label: s.gearLabel, help: s.gearHelp } : s))
  const needsRoll = kind.effects.some((k) => ['condition', 'debuff', 'onUser'].includes(k)) && !landingRolls(item).length

  function add(key) {
    const effect = starts.find((s) => s.key === key).make()
    setItem({ effects: [...item.effects, effect] })
    setAdding(false)
    setOpen(effect.key)
  }

  return (
    <>
      <Question title="Does it leave anything lasting?">
        Conditions and stat changes. Ones on the target land when one of its rolls does
        {needsRoll ? ', so add a roll first for those' : ''}.
      </Question>
      {item.effects.length > 0 && (
        <div className="aw-pieces">
          {item.effects.map((e, i) =>
            open === e.key ? (
              <div key={e.key} className="fw-effect-open">
                <EffectEditor
                  effect={e}
                  item={item}
                  onChange={(next) => setItem({ effects: item.effects.map((x) => (x.key === next.key ? next : x)) })}
                  onRemove={() => setItem(withoutEffect(item, i))}
                />
                <button type="button" className="secondary npc-small-button fw-self-start" onClick={() => setOpen(null)}>
                  Done with this effect
                </button>
              </div>
            ) : (
              <div key={e.key} className="aw-piece">
                <div className="aw-piece-head">
                  <strong>{effectSummary(e, item)}</strong>
                  <span className="aw-piece-tools">
                    <button type="button" className="secondary npc-small-button" onClick={() => setOpen(e.key)}>
                      Edit
                    </button>
                    <button type="button" className="icon-button" onClick={() => setItem(withoutEffect(item, i))} aria-label="Remove effect">
                      ×
                    </button>
                  </span>
                </div>
              </div>
            ),
          )}
        </div>
      )}
      {!starts.length ? (
        !item.effects.length && <p className="npc-hint">Nothing to add yet: add a roll first, and its effects land when it does.</p>
      ) : adding || !item.effects.length ? (
        <>
          <p className="aw-question-small">{item.effects.length ? 'What kind of effect?' : 'Add one:'}</p>
          <Choices options={starts} onPick={add} />
          {item.effects.length > 0 && (
            <button type="button" className="secondary npc-small-button fw-self-start" onClick={() => setAdding(false)}>
              Cancel
            </button>
          )}
        </>
      ) : (
        <button type="button" className="secondary npc-small-button fw-self-start" onClick={() => setAdding(true)}>
          + Add an effect
        </button>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Reactions (behavior rules)

function ReactionsStep({ spec, item, setItem }) {
  const behavior = item.behavior
  const rules = behavior?.rules ?? []
  const events = forgeKind(spec).events
  const setBehavior = (patch) => setItem({ behavior: { ...behavior, ...patch } })
  // A start whose outcome has no event this kind allows isn't offered (armor gets no "when I hit").
  const starts = RULE_STARTS.filter((s) => ruleEventFor(s.key, emptyBehaviorRule(s.key).event, events))
  function addRule(outcome) {
    const fresh = emptyBehaviorRule(outcome)
    const rule = { ...fresh, event: ruleEventFor(outcome, fresh.event, events) }
    setItem({ behavior: behavior ? { ...behavior, rules: [...rules, rule] } : { ...emptyBehavior('passive'), rules: [rule] } })
  }

  return (
    <>
      <Question title="Does it react to other things they do?">
        Reactions watch everything the owner does, not just this feature: “when I hit with a melee attack, I regain
        1d10 hit points”.{behavior?.mode === 'toggle' ? ' On a stance, they only fire while it’s on.' : ''}
      </Question>
      {rules.length > 0 && (
        <div className="aw-pieces">
          {rules.map((rule, i) => (
            <RuleEditor
              key={rule.key}
              rule={rule}
              toggle={behavior.mode === 'toggle'}
              events={events}
              effects={item.effects.filter((e) => e.byRule)}
              onChange={(value) => setBehavior({ rules: rules.map((r, idx) => (idx === i ? value : r)) })}
              onRemove={() => {
                const next = rules.filter((_, idx) => idx !== i)
                // A passive behavior is only its rules: none left, none needed.
                setItem({ behavior: !next.length && behavior.mode === 'passive' ? null : { ...behavior, rules: next } })
              }}
            />
          ))}
        </div>
      )}
      <p className="aw-question-small">{rules.length ? 'Another reaction?' : 'Start one:'}</p>
      <Choices options={starts} onPick={addRule} compact />
      {behavior && behavior.mode !== 'toggle' && (
        <FlavorFields
          flavor={{ ...emptyBehavior().flavor, ...behavior.flavor }}
          toggle={false}
          set={(patch) => setBehavior({ flavor: { ...emptyBehavior().flavor, ...behavior.flavor, ...patch } })}
        />
      )}
      {(behavior?.levelClass || rules.some((r) => r.minLevel || r.maxLevel)) && (
        <label className="npc-wide-field">
          Level tiers count levels in class
          <input
            className="npc-code-input"
            value={behavior.levelClass ?? ''}
            onChange={(e) => setBehavior({ levelClass: e.target.value })}
            placeholder="character level - or a class identifier, e.g. the-dark-knight"
          />
        </label>
      )}
      {rules.length > 0 && <p className="aw-summary">{behaviorSummary(behavior, item.name)}</p>}
    </>
  )
}

// ---------------------------------------------------------------------------
// The wizard

// spec / set(patch): the feature spec (lib/foundryFeatures.js).
// replace(spec): start over with a whole new spec (the Start step).
// onImport(file event) -> Promise<boolean>: load a Foundry item export.
// showStart: a new, untouched feature, so offer the Start step.
// linkedText: the name and description belong to a homebrew class row.
// allowSpell / allowGear: false where only features fit (an NPC's library items).
export default function FeatureWizard({ spec, set, replace, onImport, showStart = false, linkedText = false, allowSpell = true, allowGear = true }) {
  const ref = useRef(null)
  const [step, setStep] = useState(showStart ? 'start' : 'basics')
  const [started, setStarted] = useState(!showStart)
  const [templating, setTemplating] = useState(false)
  const isSpell = spec.kind === 'spell'
  const isGear = spec.kind === 'gear'
  const setGear = (patch) => set({ gear: { ...spec.gear, ...patch } })
  const item = isSpell ? spec.spell : spec.item
  const setItem = (patch) => set(isSpell ? { spell: { ...spec.spell, ...patch } } : { item: { ...spec.item, ...patch } })
  const name = item.name

  const kind = forgeKind(spec)
  const fit = fitToKind(spec)
  // Reactions: kinds with rule events, or an old item that already has rules.
  const steps = STEPS.filter((s) => (s.key !== 'start' || !started) && (!s.rules || kind.events.length || item.behavior?.rules?.length) && (!s.gear || isGear))
  const at = Math.max(0, steps.findIndex((s) => s.key === step))
  const current = steps[at]
  const go = (key) => {
    setStep(key)
    // Works on the page and inside a dialog.
    ref.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
  }

  function begin(next) {
    replace(next)
    setStarted(true)
    setTemplating(false)
    go('basics')
  }

  function pickUse(key) {
    const b = item.behavior
    if (key === 'stance') {
      const behavior = b ? { ...b, mode: 'toggle', toggle: { ...emptyBehavior().toggle, ...b.toggle } } : emptyBehavior('toggle')
      return setItem({ behavior, section: sectionFor(behavior.toggle.activation) })
    }
    const patch = { section: key === 'passive' ? 'trait' : key }
    if (b?.mode === 'toggle') {
      // Rules outlive the stance as always-on rules; stance bonuses become always on.
      patch.behavior = b.rules?.length ? { ...b, mode: 'passive' } : null
      if (item.effects.some((e) => e.stance)) {
        if (!confirm('Bonuses set to “while the stance is on” become always on. Continue?')) return
        patch.effects = item.effects.map((e) => (e.stance ? { ...e, stance: false, passive: true } : e))
      }
    }
    setItem(patch)
  }

  function pickLimit(key) {
    if (key === '') return setItem({ usesRecovery: '' })
    if (key === 'recharge') return setItem({ usesRecovery: 'recharge' })
    setItem({ usesRecovery: RECOVERY.some((r) => r.key === item.usesRecovery) ? item.usesRecovery : isGear ? 'dawn' : 'lr', usesMax: item.usesMax || '1' })
  }

  // A different kind of gear: whatever the new kind doesn't allow is changed
  // or dropped (fitToKind), after saying what.
  function pickGearType(key) {
    const next = fitToKind({ ...spec, gear: { ...spec.gear, ...gearTypePatch(key) } })
    if (next.changes.length && !confirm(`Changing it to ${forgeKind(next.spec).article}:\n\n${next.changes.map((c) => `• ${c.text}`).join('\n')}\n\nContinue?`)) return
    set({ gear: next.spec.gear, item: next.spec.item })
  }

  const carriers = tickCarriers(item)
  const problems = [
    !linkedText && !String(name ?? '').trim() && { step: 'basics', text: 'It has no name yet.' },
    limitOf(item) === 'uses' && !String(item.usesMax ?? '').trim() && { step: 'use', text: 'It’s limited but has no number of uses.' },
    ...item.activities.flatMap((a, i) => rollProblems(a, i).map((text) => ({ step: 'rolls', text }))),
    ...item.effects
      .filter((e) => !e.statuses?.length && !e.changes?.length && !carriers.has(e.key))
      .map((e) => ({ step: 'effects', text: `${e.name || 'An effect'} doesn’t do anything yet.` })),
    isGear && spec.gear.type === 'weapon' && !item.activities.some((a) => a.kind === 'attack') && { step: 'rolls', text: 'A weapon needs an attack roll to be swung in Foundry.' },
    ...fit.changes,
  ].filter(Boolean)

  let body
  if (current.key === 'start') {
    body = (
      <>
        <Question title="What are you making?">From here on, it only asks what fits that kind of thing.</Question>
        <Choices
          options={[
            ...FORGE_KINDS.filter((k) => (k.key !== 'spell' || allowSpell) && (!k.gear || allowGear)),
            { key: 'template', label: 'From a template', help: 'A ready-made mechanic with a few settings: a stance, a resource pool, an aura…' },
          ]}
          value={templating ? 'template' : ''}
          onPick={(key) => (key === 'template' ? setTemplating(true) : begin(newForgeSpec(key, { featType: spec.featType })))}
        />
        {onImport && (
          <label className="button-link secondary fw-self-start">
            Load a Foundry item export…
            <input
              type="file"
              accept="application/json"
              style={{ display: 'none' }}
              onChange={async (e) => {
                if (await onImport(e)) {
                  setStarted(true)
                  go('basics')
                }
              }}
            />
          </label>
        )}
        {templating && (
          <div className="dm-panel">
            <TemplatePicker createLabel="Use this template" onCreate={begin} />
          </div>
        )}
      </>
    )
  } else if (current.key === 'basics' && isGear) {
    const type = gearType(spec)
    body = (
      <>
        <Question title="What is it?" />
        <label>
          Name
          <input value={item.name} onChange={(e) => setItem({ name: e.target.value })} placeholder="e.g. Cloak of the Hollow Moon" />
        </label>
        <p className="aw-question-small">What kind of item?</p>
        <Choices options={GEAR_TYPES} value={type.key} onPick={pickGearType} compact />
        <GearStatFields gear={spec.gear} setGear={setGear} showType={false} />
        <div className="dm-form-row">
          <label className="npc-wide-field">
            Icon
            <input value={item.img} onChange={(e) => setItem({ img: e.target.value })} placeholder="Foundry path, e.g. icons/equipment/back/cloak-hooded-blue.webp" />
          </label>
          <label className="tag-checklist-item">
            <input type="checkbox" checked={!!item.magical} onChange={(e) => setItem({ magical: e.target.checked })} />
            Magical (beats resistance to nonmagical damage)
          </label>
        </div>
      </>
    )
  } else if (current.key === 'description') {
    body = (
      <>
        <Question title="What does it say?">
          Named abilities and prose, as the Item Maker wrote them. It&apos;s the item&apos;s description in Foundry, and
          what a shop copies when you stock it. Copy the HTML for a wiki entry or tooltip.
        </Question>
        <DescriptionBlocks blocks={spec.gear.blocks} onChange={(blocks) => setGear({ blocks })} />
      </>
    )
  } else if (current.key === 'basics') {
    body = isSpell ? (
      <>
        <Question title="What’s the spell?" />
        <SpellNameFields spell={item} set={setItem} standalone />
        <SpellComponentFields spell={item} set={setItem} />
        <label>
          Description (blank uses the generated roll text)
          <textarea rows={5} value={item.description} onChange={(e) => setItem({ description: e.target.value })} />
        </label>
      </>
    ) : (
      <>
        <Question title="What is it?" />
        {!linkedText && (
          <label>
            Name
            <input value={item.name} onChange={(e) => setItem({ name: e.target.value })} placeholder="e.g. Death Stance" />
          </label>
        )}
        <p className="aw-question-small">Where does it come from?</p>
        <Choices options={FEAT_TYPES.map((t) => ({ ...t, help: FEAT_TYPE_HELP[t.key] }))} value={spec.featType} onPick={(featType) => set({ featType })} compact />
        <div className="dm-form-row">
          <label>
            Requirements
            <input value={spec.requirements} onChange={(e) => set({ requirements: e.target.value })} placeholder="e.g. Fighter 3" />
          </label>
          <label className="npc-wide-field">
            Icon
            <input value={item.img} onChange={(e) => setItem({ img: e.target.value })} placeholder="Foundry path, e.g. icons/svg/skull.svg" />
          </label>
        </div>
        {linkedText ? (
          <p className="npc-hint">The name and description come from the class it’s part of (see the banner above).</p>
        ) : (
          <label>
            Description (blank uses the generated rules text)
            <textarea rows={5} value={item.description} onChange={(e) => setItem({ description: e.target.value })} />
          </label>
        )}
        <label className="tag-checklist-item">
          <input type="checkbox" checked={!!item.magical} onChange={(e) => setItem({ magical: e.target.checked })} />
          Magical (beats resistance to nonmagical damage)
        </label>
      </>
    )
  } else if (current.key === 'use') {
    if (isSpell) {
      body = (
        <>
          <Question title="How is it cast?" />
          <SpellCastingFields spell={item} set={setItem} />
          <SpellUpcastField spell={item} set={setItem} />
        </>
      )
    } else {
      const usage = usageOf(item)
      const limit = limitOf(item)
      const behavior = item.behavior
      const uses = USES.map((u) => (isGear && u.key === 'passive' ? { ...u, label: 'Always on while equipped', help: 'Nothing to click: its bonuses apply while it’s equipped (and attuned, if it needs it).' } : u))
      // Always on with nothing to use: there's nothing to count uses of.
      const showLimits = usage !== 'passive' || landingRolls(item).length > 0 || limit !== ''
      body = (
        <>
          <Question title={isGear ? 'How is it used?' : 'How do they use it?'}>
            {kind.key === 'weapon' ? 'Its attack is the action. Pick a bonus action or a stance if using its power works that way (Flame Tongue’s ignite is a stance).' : null}
          </Question>
          <Choices options={fitting(uses, kind.uses, usage, kind.article)} value={usage} onPick={pickUse} />
          {usage === 'stance' && (
            <div className="aw-piece">
              <strong>The stance</strong>
              <ToggleFields
                toggle={{ ...emptyBehavior().toggle, ...behavior.toggle }}
                set={(patch) =>
                  setItem({
                    behavior: { ...behavior, toggle: { ...behavior.toggle, ...patch } },
                    ...(patch.activation ? { section: sectionFor(patch.activation) } : {}),
                  })
                }
              />
              <FlavorFields
                flavor={{ ...emptyBehavior().flavor, ...behavior.flavor }}
                toggle
                visual={behavior.toggle?.visual}
                set={(patch) => setItem({ behavior: { ...behavior, flavor: { ...emptyBehavior().flavor, ...behavior.flavor, ...patch } } })}
              />
            </div>
          )}

          {showLimits ? (
            <>
              <p className="aw-question-small">{isGear ? 'Does it have charges?' : 'How often can they use it?'}</p>
              <Choices options={fitting(LIMITS, allowedLimits(spec), limit, kind.article)} value={limit} onPick={pickLimit} compact />
            </>
          ) : (
            <p className="npc-hint">Always on, with nothing to use: no {isGear ? 'charges' : 'uses'} to track. Add a roll if it has a power that spends them.</p>
          )}
          {limit === 'uses' && (
            <div className="dm-form-row">
              <label>
                {isGear ? 'Charges' : 'Uses'}
                <FormulaInput value={String(item.usesMax ?? '')} onChange={(usesMax) => setItem({ usesMax })} placeholder={isGear ? 'e.g. 7' : '3 or @prof'} ariaLabel="Uses" />
              </label>
              <label>
                Comes back
                <select value={item.usesRecovery} onChange={(e) => setItem({ usesRecovery: e.target.value })}>
                  {RECOVERY.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
              {item.usesRecovery !== 'none' && (
                <label>
                  How many come back
                  <FormulaInput value={String(item.usesRecoverFormula ?? '')} onChange={(usesRecoverFormula) => setItem({ usesRecoverFormula })} placeholder="all, or e.g. 1d6 + 1" ariaLabel="Uses regained" />
                </label>
              )}
              <label className="npc-wide-field">
                Resource identifier (other features spend these uses by it)
                <input
                  className="npc-code-input"
                  value={item.identifier ?? ''}
                  onChange={(e) => setItem({ identifier: e.target.value })}
                  placeholder={`from the name${item.name ? `: ${identifierFor(item.name)}` : ''}, or e.g. darkness`}
                />
              </label>
            </div>
          )}
          {limit === 'recharge' && (
            <label className="aw-inline">
              Recharges on
              <select value={item.rechargeOn} onChange={(e) => setItem({ rechargeOn: Number(e.target.value) })}>
                {[2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n === 6 ? '6' : `${n}–6`}
                  </option>
                ))}
              </select>
            </label>
          )}
        </>
      )
    }
  } else if (current.key === 'rolls') {
    body = <RollsStep spec={spec} item={item} inSpell={isSpell} setItem={setItem} />
  } else if (current.key === 'effects') {
    body = <EffectsStep spec={spec} item={item} setItem={setItem} />
  } else if (current.key === 'reactions') {
    body = <ReactionsStep spec={spec} item={item} setItem={setItem} />
  } else {
    const section = (key, title, content) => (
      <li className="fw-review-part">
        <div className="aw-piece-head">
          <strong>{title}</strong>
          <button type="button" className="secondary npc-small-button" onClick={() => go(key)}>
            Edit
          </button>
        </div>
        {content}
      </li>
    )
    const none = <span className="npc-hint">None</span>
    const gearSubtype = isGear ? gearType(spec).subtypes.find(([k]) => k === spec.gear.subtype)?.[1] : ''
    const typeLabel = isSpell ? 'Spell' : isGear ? [rarityLabel(spec.gear.rarity), gearSubtype, spec.gear.attunement && 'requires attunement'].filter(Boolean).join(' ') : FEAT_TYPES.find((t) => t.key === spec.featType)?.label
    const descriptionText = isGear ? descriptionMarkdown(spec.gear.blocks) : ''
    body = (
      <>
        <Question title="Review">Save or send it with the buttons at the top or bottom of the page.</Question>
        {problems.length > 0 && (
          <div className="fw-problems">
            {problems.map((p) => (
              <p key={p.text} className="status-message error">
                {p.text}{' '}
                <button type="button" className="secondary npc-small-button" onClick={() => go(p.step)}>
                  Fix
                </button>
              </p>
            ))}
            {fit.changes.length > 0 && (
              <button type="button" className="secondary npc-small-button fw-self-start" onClick={() => set({ item: fit.spec.item })}>
                Make it fit {kind.article}
              </button>
            )}
          </div>
        )}
        <ul className="fw-review">
          {section('basics', 'Basics', <span>{[name || 'Unnamed', typeLabel, !isSpell && !isGear && spec.requirements].filter(Boolean).join(' · ')}</span>)}
          {isGear &&
            section(
              'description',
              'Description',
              hasDescription(spec.gear.blocks) ? <span>{descriptionText.length > 220 ? `${descriptionText.slice(0, 220)}…` : descriptionText}</span> : none,
            )}
          {!isSpell && section('use', 'How it’s used', <span>{[USES.find((u) => u.key === usageOf(item))?.label, limitText(item)].join(' · ')}</span>)}
          {section(
            'rolls',
            'Rolls',
            item.activities.length ? (
              <ol>
                {item.activities.map((a, i) => (
                  <li key={a.key}>
                    {activityLabel(a, i)}: {rollSummary(a)}
                    {hasFlow(a) ? ' · built automation' : ''}
                  </li>
                ))}
              </ol>
            ) : (
              none
            ),
          )}
          {section(
            'effects',
            'Effects',
            item.effects.length ? (
              <ul>
                {item.effects.map((e) => (
                  <li key={e.key}>{effectSummary(e, item)}</li>
                ))}
              </ul>
            ) : (
              none
            ),
          )}
          {steps.some((s) => s.key === 'reactions') && section('reactions', 'Reactions', item.behavior ? <span>{behaviorSummary(item.behavior, name)}</span> : none)}
        </ul>
      </>
    )
  }

  return (
    <div className="fw" ref={ref}>
      <ol className="aw-progress fw-steps">
        {steps.map((s, i) => (
          <li key={s.key} className={i === at ? 'is-current' : i < at ? 'is-done' : ''}>
            <button type="button" onClick={() => go(s.key)} disabled={!started && s.key !== 'start'}>
              {s.label}
            </button>
          </li>
        ))}
      </ol>
      <div className="fw-panel aw-body">{body}</div>
      {started && (
        <div className="fw-nav">
          {at > 0 && (
            <button type="button" className="secondary" onClick={() => go(steps[at - 1].key)}>
              Back
            </button>
          )}
          <span className="npc-item-actions-spacer" />
          {at < steps.length - 1 && (
            <button type="button" onClick={() => go(steps[at + 1].key)}>
              Next: {steps[at + 1].label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
