import { createContext, useContext, useState } from 'react'
import { ACTIVITY_KINDS, SPEND_SOURCES, emptyActivity, emptyChange, emptyEffect, emptyOverTimeRoll, emptySpend } from '../../../lib/foundryActorBuilder'
import { FEAT_TYPES, gearType } from '../../../lib/foundryFeatures'
import { allowedEffects, canTickEachTurn, fitToKind, forgeKind, limitOf, usageOf } from '../../../lib/forgeKinds'
import { chainOf, freeEffectName, landsFrom, looseEffects } from '../../../lib/forgeChain'
import { triggersFor } from '../../../lib/automationFlow'
import { behaviorSummary } from '../../../lib/foundryBehaviors'
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
import { FlowPoint, FlowScope } from './AutomationWizard'
import FeatureWizard, { Choices, ROLL_KIND_HELP, USES, effectSummary, fitting, limitText, rollProblems, shownUsage } from './FeatureWizard'

// The chain builder (experimental, docs/item-forge-chain.md): a whole feature
// as one tree, top to bottom in the order things happen, every part edited in
// place. It's a view of the same spec the guided steps and All fields edit
// (lib/forgeChain.js works out the shape), so either editor can open the item.

const ChainContext = createContext(null)

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)

// The roll itself, without its damage (that's its own node): "Ranged spell attack · 30 ft."
function rollHead(a) {
  const area = a.areaType ? `${a.areaSize || '?'}-ft. ${a.areaType}` : Number(a.targetCount) > 1 ? `${a.targetCount} targets` : ''
  return (
    {
      attack: [`${cap(a.attackType || 'melee')} ${a.classification === 'spell' ? 'spell' : 'weapon'} attack`, a.attackType === 'ranged' ? `${a.range || 30} ft.` : `${a.reach || 5} ft. reach`],
      save: [`${String(a.saveAbility || 'dex').toUpperCase()} save${a.dcAbility === 'spellcasting' ? ' against the spell DC' : a.dcAbility ? ` (8 + prof + ${a.dcAbility.toUpperCase()})` : a.dc ? `, DC ${a.dc}` : ''}`, area],
      damage: ['No roll to hit', area],
      heal: ['Heals', area],
      utility: ['No roll', area],
      summon: [`Summons ${a.creatureName || 'a creature'}`],
      transform: [`Transforms into ${a.creatureName || 'a creature'}`],
    }[a.kind] ?? [a.kind]
  )
    .filter(Boolean)
    .join(' · ')
}

function damageText(a) {
  if (a.kind === 'heal') return String(a.healing ?? '').trim() ? `${a.healing}${a.healType === 'temphp' ? ' temporary HP' : ' HP'}` : 'How much? (not set)'
  const parts = (a.damage ?? []).filter((d) => String(d.formula ?? '').trim()).map((d) => [d.formula, (d.types ?? []).join(' or ')].filter(Boolean).join(' '))
  const text = parts.join(' + ') || 'How much? (not set)'
  return a.kind === 'save' && parts.length ? `${text}${a.onSave === 'half' ? ', half on a success' : a.onSave === 'none' ? ', none on a success' : ''}` : text
}

function spendText(rows) {
  return rows
    .map((s) => {
      const what = s.source === 'pool' ? s.target || 'a resource' : s.source === 'item' ? 'another feature’s uses' : SPEND_SOURCES.find((x) => x.key === s.source)?.label.toLowerCase() ?? s.source
      return `${String(s.amount ?? '').trim() || '1'} ${what}${s.extra ? ' (more for extra)' : ''}`
    })
    .join(', ')
}

const landsWord = (a) => ({ attack: 'On a hit', save: 'On a failed save' })[a.kind] ?? 'On the target'
const thenWord = (a) => (a.triggerOnlyIf === 'hit' ? ' on a hit' : a.triggerOnlyIf === 'failedSave' ? ' if the save fails' : '')

// One part of the chain: folded to a line, opened in place.
function Node({ id, tone, tag, title, tools = null, children }) {
  const c = useContext(ChainContext)
  const open = c.isOpen(id)
  return (
    <div className={`ch-node is-${tone}${open ? ' is-open' : ''}`}>
      <div className="ch-node-row">
        <button type="button" className="ch-node-head" onClick={() => c.toggle(id)} aria-expanded={open}>
          <span className="ch-tag">{tag}</span>
          <span className="ch-node-title">{title}</span>
        </button>
        {tools && <span className="aw-piece-tools">{tools}</span>}
      </div>
      {open && (
        <div className="ch-node-body">
          {children}
          <button type="button" className="secondary npc-small-button fw-self-start" onClick={() => c.toggle(id)}>
            Done
          </button>
        </div>
      )}
    </div>
  )
}

function EffectNode({ effect, tag }) {
  const { item, update } = useContext(ChainContext)
  const remove = () =>
    update((it) => {
      const i = it.effects.findIndex((e) => e.key === effect.key)
      return i < 0 ? it : { ...it, ...withoutEffect(it, i) }
    })
  return (
    <Node
      id={effect.key}
      tone="effect"
      tag={tag}
      title={effectSummary(effect, item)}
      tools={
        <button type="button" className="icon-button" onClick={remove} aria-label="Remove effect">
          ×
        </button>
      }
    >
      <EffectEditor
        effect={effect}
        item={item}
        onChange={(next) => update((it) => ({ ...it, effects: it.effects.map((e) => (e.key === next.key ? next : e)) }))}
        onRemove={remove}
      />
    </Node>
  )
}

// The kinds of roll this item can add, the guided steps' way (forgeKinds.js).
function useRollKinds() {
  const { spec } = useContext(ChainContext)
  const kind = forgeKind(spec)
  return fitting(
    ACTIVITY_KINDS.map((k) => ({ ...k, help: ROLL_KIND_HELP[k.key] })),
    kind.rolls,
    '',
    kind.article,
  )
}

// A new roll: a save in a spell uses the spell's DC.
function newRoll(key, inSpell) {
  return inSpell && key === 'save' ? { ...emptyActivity('save'), dcAbility: 'spellcasting' } : emptyActivity(key)
}

// One roll, in the order it happens: cost, "when it's used" lines, the roll,
// what's known after it, the damage, its lines, what lands, "after it's all
// done", and what it sets off. seen: rolls above it (a trigger loop stops).
function RollChain({ roll, seen = [] }) {
  const c = useContext(ChainContext)
  const { item, update, inSpell, spec } = c
  const kinds = useRollKinds()
  const [points, setPoints] = useState(() => new Set())
  const [picking, setPicking] = useState(null) // 'then' | 'extra' while a kind is being picked
  const index = item.activities.findIndex((a) => a.key === roll.key)
  const set = (patch) => update((it) => ({ ...it, activities: it.activities.map((a) => (a.key === roll.key ? { ...a, ...patch } : a)) }))
  const chain = chainOf(item)
  const then = chain.follows(roll)
  const extra = chain.extraFor(roll)
  const below = [...seen, roll.key]
  const lands = landsFrom(item, roll)
  const triggers = triggersFor(roll.kind).map((t) => t.key)
  const damaging = ['attack', 'save', 'damage', 'heal'].includes(roll.kind)
  const canLand = !roll.overTime && allowedEffects(spec, item).some((k) => ['condition', 'debuff', 'onUser'].includes(k))
  const sectionWith = (t) => (roll.flow?.sections ?? []).some((s) => s.trigger === t && s.lines?.length)
  const point = (t) => triggers.includes(t) && <FlowPoint trigger={t} adding={points.has(t)} />
  const extras = [
    roll.useConditions?.length && 'only on some targets',
    roll.effectConditions?.length && 'effects only on some targets',
    roll.aura && 'aura',
    roll.script && !roll.flow && 'recipe script',
  ].filter(Boolean)
  const moreId = `${roll.key}:more`

  // A new effect from an "Apply" line: placed only by automation.
  function newEffect() {
    const e = { ...emptyEffect(), name: freeEffectName(item), byRule: true }
    update((it) => ({ ...it, effects: [...it.effects, e] }))
    c.open(e.key)
    return e.key
  }

  function removeRoll() {
    // Effects only this roll lands would start landing from every roll: they go too.
    const only = item.effects.filter((e) => e.appliedBy?.length && e.appliedBy.every((k) => k === roll.key))
    const label = roll.name || activityLabel(roll, index)
    if (!confirm(`Remove ${label}${only.length ? ` and what only it lands (${only.map((e) => e.name || 'an effect').join(', ')})` : ''}?`)) return
    update((it) => {
      const i = it.activities.findIndex((a) => a.key === roll.key)
      if (i < 0) return it
      const next = { ...it, ...withoutActivity(it, i) }
      return { ...next, effects: next.effects.filter((e) => !only.some((o) => o.key === e.key)) }
    })
  }

  function link(field, key) {
    const a = newRoll(key, inSpell)
    const patch = field === 'then' ? { triggerKey: a.key, triggerOnlyIf: roll.kind === 'attack' ? 'hit' : roll.kind === 'save' ? 'failedSave' : '' } : { otherKey: a.key }
    update((it) => ({ ...it, activities: [...it.activities.map((x) => (x.key === roll.key ? { ...x, ...patch } : x)), a] }))
    c.open(`${a.key}:roll`)
    setPicking(null)
  }

  function add(what) {
    if (what.startsWith('point:')) return setPoints((p) => new Set(p).add(what.slice(6)))
    if (what === 'cost') {
      set({ spend: [{ ...emptySpend(), source: 'pool' }] })
      return c.open(`${roll.key}:cost`)
    }
    if (what === 'effect') {
      const e = { ...emptyEffect(), name: freeEffectName(item), appliedBy: [roll.key] }
      update((it) => ({ ...it, effects: [...it.effects, e] }))
      return c.open(e.key)
    }
    if (what === 'then' || what === 'extra') return setPicking(what)
    if (what === 'more') c.open(moreId)
  }

  return (
    <ActivityScope activity={roll} inSpell={inSpell}>
      <FlowScope
        activity={roll}
        item={item}
        onChange={(flow) => set({ flow })}
        newEffect={newEffect}
        afterLine={(line) => {
          const e = line.type === 'effect' && item.effects.find((x) => x.key === line.effectKey)
          return e ? (
            <div className="ch-under">
              <EffectNode effect={e} tag="The effect" />
            </div>
          ) : null
        }}
      >
        <div className="ch-roll">
          {roll.spend?.length > 0 && (
            <Node id={`${roll.key}:cost`} tone="cost" tag="Costs" title={spendText(roll.spend)}>
              <ActivityCostFields activity={roll} set={set} item={item} />
            </Node>
          )}
          {point('use')}
          {point('preAttack')}
          <Node
            id={`${roll.key}:roll`}
            tone="roll"
            tag={ACTIVITY_KINDS.find((k) => k.key === roll.kind)?.label ?? roll.kind}
            title={rollHead(roll)}
            tools={
              <button type="button" className="icon-button" onClick={removeRoll} aria-label="Remove roll">
                ×
              </button>
            }
          >
            <ActivityBasics activity={roll} set={set} item={item} inSpell={inSpell} />
            <ActivityTargetFields activity={roll} set={set} inSpell={inSpell} />
          </Node>
          {point('attack')}
          {point('save')}
          {damaging && (
            <Node id={`${roll.key}:damage`} tone="damage" tag={roll.kind === 'heal' ? 'Heals' : 'Damage'} title={damageText(roll)}>
              <ActivityDamageFields activity={roll} set={set} inSpell={inSpell} />
            </Node>
          )}
          {extra && !below.includes(extra.key) && (
            <div className="ch-nested">
              <span className="ch-nested-label">Extra damage, per {roll.kind === 'attack' ? 'hit' : 'target'}</span>
              <RollChain roll={extra} seen={below} />
            </div>
          )}
          {point('damage')}
          {lands.map((e) => (
            <EffectNode key={e.key} effect={e} tag={landsWord(roll)} />
          ))}
          {point('done')}
          {then && !below.includes(then.key) && (
            <div className="ch-nested">
              <span className="ch-nested-label">Then rolls{thenWord(roll)}, against the same targets</span>
              <RollChain roll={then} seen={below} />
            </div>
          )}
          {(extras.length > 0 || c.isOpen(moreId)) && (
            <Node id={moreId} tone="more" tag="Also" title={extras.join(' · ') || 'Conditions, aura, repeat each turn'}>
              <AutomationSection activity={roll} set={set} item={item} bare noFlow />
            </Node>
          )}
          {picking ? (
            <div className="ch-picking">
              <p className="aw-question-small">{picking === 'then' ? 'Then roll what?' : 'What kind of extra damage?'}</p>
              <Choices options={picking === 'extra' ? kinds.filter((k) => k.key === 'damage') : kinds} onPick={(key) => link(picking, key)} compact />
              <button type="button" className="secondary npc-small-button fw-self-start" onClick={() => setPicking(null)}>
                Cancel
              </button>
            </div>
          ) : (
            <select className="ch-add" value="" onChange={(e) => e.target.value && add(e.target.value)} aria-label="Add to this roll">
              <option value="">+ Add to this roll…</option>
              <optgroup label="A line of automation">
                {triggersFor(roll.kind)
                  .filter((t) => !sectionWith(t.key) && !points.has(t.key))
                  .map((t) => (
                    <option key={t.key} value={`point:${t.key}`}>
                      {t.label}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="The roll">
                {!roll.spend?.length && <option value="cost">A cost (Ink, Ki, hit points…)</option>}
                {canLand && <option value="effect">An effect {landsWord(roll).toLowerCase()}</option>}
                {!roll.triggerKey && !roll.overTime && <option value="then">Then roll another of its rolls</option>}
                {['attack', 'save'].includes(roll.kind) && !roll.otherKey && <option value="extra">An extra damage roll</option>}
                {!c.isOpen(moreId) && !extras.length && <option value="more">Conditions, aura, repeat each turn…</option>}
              </optgroup>
            </select>
          )}
        </div>
      </FlowScope>
    </ActivityScope>
  )
}

// What the player picks between, or the one roll; empty: what to add first.
function Rolls() {
  const c = useContext(ChainContext)
  const { item, update, inSpell, spec } = c
  const kinds = useRollKinds()
  const chain = chainOf(item)
  const [adding, setAdding] = useState(false)
  const usage = inSpell ? 'spell' : usageOf(item)
  const tick = !inSpell && canTickEachTurn(spec, item)

  function addRoll(key) {
    setAdding(false)
    if (key === 'everyTurn') return addTick()
    const a = newRoll(key, inSpell)
    update((it) => ({ ...it, activities: [...it.activities, a] }))
    c.open(`${a.key}:roll`)
  }

  // As the guided Rolls step: a roll midi repeats on the owner's turns while
  // the always-on (or stance) effect is on them.
  function addTick() {
    const stance = usage === 'stance'
    const a = { ...emptyActivity('utility'), name: 'Each turn', targetType: 'self' }
    update((it) => {
      let effects = it.effects
      let carrier = effects.find((e) => (stance ? e.stance : e.passive))
      if (!carrier) {
        carrier = { ...emptyEffect(), name: it.name || (stance ? 'Stance' : 'Always on'), ...(stance ? { stance: true } : { passive: true }) }
        effects = [...effects, carrier]
      }
      return { ...it, effects, activities: [...it.activities, { ...a, overTime: { ...emptyOverTimeRoll(), turn: 'start', effectKey: carrier.key } }] }
    })
  }

  const options = [
    tick && { key: 'everyTurn', label: 'Something every turn', help: 'At the start (or end) of each of their turns while they have it.' },
    ...kinds,
  ].filter(Boolean)

  return (
    <>
      {chain.choices.length === 0 && (
        <p className="npc-hint">
          {usage === 'passive' ? 'Nothing to click: it’s always on. Add a roll if it has a power to use.' : 'Nothing happens yet when it’s used. Add what it rolls.'}
        </p>
      )}
      {chain.choices.length === 1 && <RollChain roll={chain.choices[0]} />}
      {chain.choices.length > 1 && (
        <div className="ch-choice">
          <div className="ch-choice-head">
            <strong>The player chooses</strong>
            <span className="npc-hint">Foundry asks which when it’s used. Name each choice the way the player should see it.</span>
          </div>
          {chain.choices.map((roll) => {
            const i = item.activities.findIndex((a) => a.key === roll.key)
            return (
              <div key={roll.key} className="ch-branch">
                <input
                  className="ch-branch-name"
                  value={roll.name ?? ''}
                  onChange={(e) => update((it) => ({ ...it, activities: it.activities.map((a) => (a.key === roll.key ? { ...a, name: e.target.value } : a)) }))}
                  placeholder={activityLabel(roll, i)}
                  aria-label="Choice name"
                />
                <RollChain roll={roll} />
              </div>
            )
          })}
        </div>
      )}
      {adding ? (
        <div className="ch-picking">
          <p className="aw-question-small">{chain.choices.length ? 'Another choice for the player: what does it roll?' : 'What does it roll?'}</p>
          <Choices options={options} onPick={addRoll} compact />
          <button type="button" className="secondary npc-small-button fw-self-start" onClick={() => setAdding(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" className="secondary npc-small-button fw-self-start" onClick={() => setAdding(true)}>
          {chain.choices.length ? '+ Another choice for the player' : '+ Add a roll'}
        </button>
      )}
    </>
  )
}

function Ticks() {
  const { item } = useContext(ChainContext)
  const { ticks } = chainOf(item)
  if (!ticks.length) return null
  return ticks.map((roll) => {
    const carrier = item.effects.find((e) => e.key === roll.overTime.effectKey) ?? item.effects.find((e) => !e.passive && !e.stance)
    const onYou = carrier?.passive || carrier?.stance
    return (
      <section key={roll.key} className="ch-section">
        <h3 className="ch-section-head">
          Every turn: at the {roll.overTime.turn === 'start' ? 'start' : 'end'} of {onYou ? 'each of your turns' : 'the turn of whoever has it'}
          {carrier ? `, while ${onYou ? 'you have' : 'they have'} ${carrier.name || 'its effect'}` : ''}
        </h3>
        <RollChain roll={roll} />
      </section>
    )
  })
}

function LooseEffects() {
  const { item, update, spec } = useContext(ChainContext)
  const kind = forgeKind(spec)
  const groups = looseEffects(item)
  const allowed = spec.kind === 'spell' ? [] : allowedEffects(spec, item)
  const titles = {
    passive: kind.gear ? 'While it’s equipped' : 'Always on',
    stance: 'While the stance is on',
    aura: 'In the aura',
    byRule: 'Placed by automation, but no line applies it yet',
    unapplied: 'No roll lands these',
  }
  const add = (patch) => update((it) => ({ ...it, effects: [...it.effects, { ...emptyEffect(), name: freeEffectName(it), changes: [emptyChange()], ...patch }] }))
  const any = Object.values(groups).some((g) => g.length)
  if (!any && !allowed.includes('self') && !allowed.includes('stance')) return null
  return (
    <section className="ch-section">
      <h3 className="ch-section-head">Not tied to a roll</h3>
      {Object.entries(groups).map(
        ([key, list]) =>
          list.length > 0 && (
            <div key={key} className="ch-group">
              <span className="ch-nested-label">{titles[key]}</span>
              {list.map((e) => (
                <EffectNode key={e.key} effect={e} tag={key === 'passive' ? 'Always' : key === 'stance' ? 'Stance' : 'Effect'} />
              ))}
            </div>
          ),
      )}
      <div className="dm-form-row">
        {allowed.includes('self') && (
          <button type="button" className="secondary npc-small-button" onClick={() => add({ passive: true })}>
            + {kind.gear ? 'A bonus while it’s equipped' : 'An always-on bonus'}
          </button>
        )}
        {allowed.includes('stance') && (
          <button type="button" className="secondary npc-small-button" onClick={() => add({ stance: true, changes: [emptyChange('advAttack')] })}>
            + A bonus while the stance is on
          </button>
        )}
      </div>
    </section>
  )
}

export default function ChainBuilder({ spec, set, replace, onImport, showStart = false, linkedText = false }) {
  const isSpell = spec.kind === 'spell'
  const item = isSpell ? spec.spell : spec.item
  // Whole-spec updates, so two in one click (a new effect and the line that
  // applies it) both land.
  const update = (fn) => replace((s) => (s.kind === 'spell' ? { ...s, spell: fn(s.spell) } : { ...s, item: fn(s.item) }))
  const [openKeys, setOpenKeys] = useState(() => new Set(showStart || !item.name ? ['setup'] : []))
  const kind = forgeKind(spec)
  const context = {
    spec,
    item,
    update,
    inSpell: isSpell,
    isOpen: (key) => openKeys.has(key),
    open: (key) => setOpenKeys((keys) => new Set(keys).add(key)),
    toggle: (key) =>
      setOpenKeys((keys) => {
        const next = new Set(keys)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        return next
      }),
  }

  const typeLabel = isSpell
    ? item.level ? `Level ${item.level} spell` : 'Cantrip'
    : spec.kind === 'gear'
      ? gearType(spec).label
      : FEAT_TYPES.find((t) => t.key === spec.featType)?.label ?? 'Feature'
  const setupTitle = [
    item.name || 'Unnamed',
    typeLabel,
    !isSpell && USES.find((u) => u.key === shownUsage(item, kind))?.label,
    !isSpell && limitOf(item) && limitText(item),
  ]
    .filter(Boolean)
    .join(' · ')
  const rules = !isSpell && (kind.events.length > 0 || item.behavior?.rules?.length > 0)
  const fit = fitToKind(spec)
  const problems = [
    !linkedText && !String(item.name ?? '').trim() && 'It has no name yet.',
    !isSpell && limitOf(item) === 'uses' && !String(item.usesMax ?? '').trim() && (shownUsage(item, kind) === 'pool' ? 'The resource pool has no number of points yet.' : 'It’s limited but has no number of uses.'),
    ...item.activities.flatMap((a, i) => rollProblems(a, i)),
    ...fit.changes.map((ch) => ch.text),
  ].filter(Boolean)

  return (
    <ChainContext.Provider value={context}>
      <div className="ch">
        <p className="npc-hint">
          Experimental: the whole feature as one chain, in the order things happen. Click any part to edit it. It’s the
          same item the regular editor opens.
        </p>
        <Node id="setup" tone="setup" tag="Setup" title={setupTitle}>
          <FeatureWizard spec={spec} set={set} replace={replace} onImport={onImport} showStart={showStart} linkedText={linkedText} only={['start', 'basics', 'description', 'use']} />
        </Node>
        <div className="ch-rail">
          <Rolls />
          <Ticks />
          <LooseEffects />
          {rules && (
            <Node id="reactions" tone="rule" tag="Reactions" title={item.behavior?.rules?.length ? behaviorSummary(item.behavior, item.name) : 'None: rules that run on their own (when they’re hit, at the start of their turn…)'}>
              <FeatureWizard spec={spec} set={set} replace={replace} only={['reactions']} />
            </Node>
          )}
        </div>
        {problems.length > 0 && (
          <div className="fw-problems">
            {problems.map((p) => (
              <p key={p} className="status-message error">
                {p}
              </p>
            ))}
          </div>
        )}
      </div>
    </ChainContext.Provider>
  )
}
