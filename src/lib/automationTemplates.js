// Automation templates: TYPES of mechanic (defenses, a resource pool, a save
// or suffer, a stance...) that a feature starts from, each with its own
// settings, rather than copies of finished features. Built up class by class,
// starting with the Dark Knight (docs/automation-templates.md). Everything a
// template makes stays editable in the Feature Forge editor afterwards.
//
// A template: { key, kind: 'type' | 'example', group, label, help, params, build }.
//   params  the settings the picker asks for: { key, label, kind, hint?, default?, options? }
//           kinds: 'conditions' | 'damageTypes' | 'abilities' | 'skills' (multi-select lists),
//           'text', 'formula', 'number', 'checkbox', 'select' (options: [[value, label]])
//   build(values) -> a Feature Forge spec (foundryFeatures.js shape); it may
//           throw an Error whose message tells the DM what's missing.
// Templates for things you use share the cost settings (costParams): what it
// takes, limited uses, and a resource it spends (Darkness), optionally "spend
// more for +1 die each".

import { CONDITIONS, DAMAGE_TYPES, NPC_ABILITIES, NPC_SKILLS, emptyActivity, emptyChange, emptyEffect, emptySpend, identifierFor } from './foundryActorBuilder.js'
import { TOGGLE_VISUALS, emptyBehavior, emptyBehaviorAction, emptyBehaviorRule } from './foundryBehaviors.js'
import { emptyScript } from './foundryAutomation.js'
import { CARD_COLOR_OPTIONS } from './foundryChat.js'
import { FEATURE_TEMPLATES, emptyFeatureSpec } from './foundryFeatures.js'

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)
const ABILITY_NAMES = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' }

// Multi-select lists, as [value, label].
export const PARAM_OPTIONS = {
  conditions: CONDITIONS.map((c) => [c, cap(c)]),
  damageTypes: DAMAGE_TYPES.map((t) => [t, cap(t)]),
  abilities: NPC_ABILITIES.map((a) => [a, ABILITY_NAMES[a]]),
  skills: Object.entries(NPC_SKILLS).map(([key, s]) => [key, s.label]),
}

const ABILITY_OPTIONS = NPC_ABILITIES.map((a) => [a, ABILITY_NAMES[a]])
const DAMAGE_TYPE_OPTIONS = [['', '(no type)'], ...PARAM_OPTIONS.damageTypes]
const CONDITION_OPTIONS = [['', 'None'], ...PARAM_OPTIONS.conditions]
const AREA_OPTIONS = [['', 'No area'], ['radius', 'Radius'], ['cone', 'Cone'], ['line', 'Line'], ['cube', 'Cube']]

// How its chat cards read (foundryChat.js): a flavor line and an accent color.
function flavorParams(example = '') {
  return [
    { key: 'flavor', label: 'Flavor text', kind: 'text', default: '', hint: `A line on its chat card and prompt${example ? `, e.g. “${example}”` : ''}.` },
    { key: 'cardColor', label: 'Card color', kind: 'select', default: 'shadow', options: CARD_COLOR_OPTIONS },
  ]
}

const list = (v) => (Array.isArray(v) ? v.filter(Boolean) : [])
const text = (v) => String(v ?? '').trim()
const num = (v) => Number(v) || 0

const change = (id, value = '', o = {}) => ({ ...emptyChange(id), value: String(value), ...o })

// midi-qol damage reduction: system.traits.dm.midi.<kind> holds a damage
// MODIFICATION rolled against the owner each time damage is worked out
// (Hooks.ts applyDamageReduction), so reducing by X is "-(X)". The old
// flags.midi-qol.DR.* keys map onto it.
const damageReduction = (kind, formula) => change('custom', `-(${formula})`, { path: `system.traits.dm.midi.${kind}`, type: 'override' })

function featureSpec(item) {
  const spec = emptyFeatureSpec('feat')
  spec.item = { ...spec.item, activities: [], effects: [], ...item }
  return spec
}

// ---------------------------------------------------------------------------
// Shared cost settings for things you use

const USES = { 'prof-lr': ['@prof', 'lr'], '1-lr': ['1', 'lr'], '1-sr': ['1', 'sr'] }

function costParams(activation = 'action') {
  return [
    { key: 'activation', label: 'Takes', kind: 'select', default: activation, options: [['action', 'Action'], ['bonus', 'Bonus action'], ['reaction', 'Reaction'], ['special', 'No action / special']] },
    { key: 'uses', label: 'Limited uses', kind: 'select', default: '', options: [['', 'Unlimited'], ['prof-lr', 'Proficiency bonus per long rest'], ['1-lr', 'Once per long rest'], ['1-sr', 'Once per short rest']] },
    { key: 'pool', label: 'Spends from a resource', kind: 'text', default: '', hint: 'The resource’s identifier, e.g. darkness. Blank = spends nothing.' },
    { key: 'poolCost', label: 'Amount spent', kind: 'number', default: '1' },
    { key: 'poolExtra', label: 'Can spend more: +1 die each', kind: 'checkbox', default: false },
  ]
}

// The feature that holds `activities`, with the cost settings applied.
function usedFeature(values, activities, item = {}) {
  const special = values.activation === 'special'
  const pool = identifierFor(values.pool)
  const [usesMax, usesRecovery] = USES[values.uses] ?? ['', '']
  // The first roll is the one you use; the rest (a repeat save, an aura's
  // damage) are rolled by midi for it and cost nothing themselves.
  const acts = activities.map((a, i) => ({
    ...a,
    activation: special ? 'special' : a.activation,
    spend: pool && i === 0 ? [{ ...emptySpend(), source: 'pool', target: pool, amount: String(num(values.poolCost) || 1), extra: !!values.poolExtra }] : a.spend,
  }))
  return featureSpec({ section: special ? 'action' : values.activation || 'action', usesMax, usesRecovery, activities: acts, ...item })
}

// "One creature" / "enemies in an area" / "every creature in an area" / "self" / "an ally"
function applyTarget(activity, target) {
  if (target === 'self') return { ...activity, targetType: 'self' }
  if (target === 'ally') return { ...activity, targetType: 'ally', targetCount: '1' }
  if (target === 'enemies') return { ...activity, targetType: 'enemy' }
  if (target === 'creatures') return { ...activity, targetType: 'creature' }
  return { ...activity, targetType: 'creature', targetCount: '1' }
}

// ---------------------------------------------------------------------------
// Always on

const defenses = {
  key: 'defenses',
  group: 'Always on',
  label: 'Defenses: resistances, immunities, condition saves',
  help: 'Always on. Advantage on saves against chosen conditions (Tainted Soul: frightened), immunity to conditions, and resistance, immunity or vulnerability to damage types.',
  params: [
    { key: 'saveAdvantage', label: 'Advantage on saves against', kind: 'conditions', hint: 'Works on saves midi-qol rolls for something that applies the condition (a spell, a monster’s Frightful Presence, a repeat save).' },
    { key: 'conditionImmune', label: 'Immune to conditions', kind: 'conditions' },
    { key: 'resist', label: 'Resistance to', kind: 'damageTypes' },
    { key: 'immune', label: 'Immunity to', kind: 'damageTypes' },
    { key: 'vulnerable', label: 'Vulnerability to', kind: 'damageTypes' },
    { key: 'reduceAll', label: 'Reduce all damage taken by', kind: 'formula', default: '', hint: 'midi-qol damage reduction, e.g. 3 or @prof.' },
    { key: 'reducePhysical', label: 'Reduce nonmagical bludgeoning, piercing and slashing by', kind: 'formula', default: '' },
    { key: 'bypass', label: 'Your damage ignores resistance to', kind: 'damageTypes', hint: 'Unstoppable: bludgeoning, piercing and slashing. Applies to every damage roll you make.' },
  ],
  build(values) {
    const changes = [
      ...list(values.saveAdvantage).map((c) => change('advSaveVs', c)),
      ...list(values.conditionImmune).map((c) => change('condImmune', c)),
      ...list(values.resist).map((t) => change('resist', t)),
      ...list(values.immune).map((t) => change('immune', t)),
      ...list(values.vulnerable).map((t) => change('vulnerable', t)),
      text(values.reduceAll) && damageReduction('all', text(values.reduceAll)),
      text(values.reducePhysical) && damageReduction('non-magical-physical', text(values.reducePhysical)),
    ].filter(Boolean)
    const bypass = list(values.bypass)
    if (!changes.length && !bypass.length) throw new Error('Pick at least one condition or damage type.')
    // Ignoring resistance is per damage roll in midi, so it's a behavior rule.
    const behavior = bypass.length ? { ...emptyBehavior('passive'), rules: [{ ...emptyBehaviorRule('ignoreResistance'), event: 'damage', ignoreTypes: bypass }] } : null
    return featureSpec({ section: 'trait', effects: changes.length ? [{ ...emptyEffect(), passive: true, changes }] : [], behavior })
  },
}

const SENSES = ['darkvision', 'blindsight', 'tremorsense', 'truesight']

const passiveBonus = {
  key: 'passiveBonus',
  group: 'Always on',
  label: 'Passive bonus: AC, speed, senses, advantage',
  help: 'Always on. Fill in only what the feature gives: an AC or initiative bonus, speeds, senses, and advantage on saving throws or skills (Imposing Presence: Intimidation; Vanguard L7: Wisdom saves).',
  params: [
    { key: 'ac', label: 'AC bonus', kind: 'formula', default: '' },
    { key: 'init', label: 'Initiative bonus', kind: 'formula', default: '' },
    { key: 'walk', label: 'Walking speed +', kind: 'number', default: '' },
    { key: 'fly', label: 'Flying speed (at least)', kind: 'number', default: '' },
    { key: 'swim', label: 'Swimming speed (at least)', kind: 'number', default: '' },
    { key: 'climb', label: 'Climbing speed (at least)', kind: 'number', default: '' },
    ...SENSES.map((s) => ({ key: s, label: `${cap(s)} (ft)`, kind: 'number', default: '' })),
    { key: 'weaponAttack', label: 'Weapon attack bonus', kind: 'formula', default: '' },
    { key: 'meleeDamage', label: 'Melee weapon damage bonus', kind: 'formula', default: '', hint: 'Dueling: 2.' },
    { key: 'rangedDamage', label: 'Ranged weapon damage bonus', kind: 'formula', default: '' },
    { key: 'spellAttack', label: 'Spell attack bonus', kind: 'formula', default: '' },
    { key: 'spellDc', label: 'Spell save DC bonus', kind: 'formula', default: '' },
    { key: 'critRange', label: 'Weapon crits on (e.g. 19 for 19–20)', kind: 'number', default: '' },
    { key: 'saveAdvantage', label: 'Advantage on saving throws', kind: 'abilities' },
    { key: 'skillAdvantage', label: 'Advantage on skill checks', kind: 'skills' },
  ],
  build(values) {
    const crit = num(values.critRange)
    const changes = [
      text(values.ac) && change('ac', text(values.ac)),
      text(values.init) && change('init', text(values.init)),
      ...(text(values.weaponAttack) ? ['mwak', 'rwak'].map((k) => change('attackBonus', text(values.weaponAttack), { param: k })) : []),
      text(values.meleeDamage) && change('damageBonus', text(values.meleeDamage), { param: 'mwak' }),
      text(values.rangedDamage) && change('damageBonus', text(values.rangedDamage), { param: 'rwak' }),
      ...(text(values.spellAttack) ? ['msak', 'rsak'].map((k) => change('attackBonus', text(values.spellAttack), { param: k })) : []),
      text(values.spellDc) && change('spellDc', text(values.spellDc)),
      crit >= 2 && crit <= 20 && change('custom', crit, { path: 'flags.dnd5e.weaponCriticalThreshold', type: 'downgrade' }),
      num(values.walk) && change('speed', num(values.walk), { param: 'walk', type: 'add' }),
      ...['fly', 'swim', 'climb'].map((m) => num(values[m]) && change('speed', num(values[m]), { param: m, type: 'upgrade' })),
      ...SENSES.map((s) => num(values[s]) && change('sense', num(values[s]), { param: s, type: 'upgrade' })),
      ...list(values.saveAdvantage).map((a) => change('advSave', '', { param: a })),
      ...list(values.skillAdvantage).map((s) => change('custom', '1', { path: `flags.midi-qol.advantage.skill.${s}`, type: 'custom' })),
    ].filter(Boolean)
    if (!changes.length) throw new Error('Fill in at least one bonus.')
    return featureSpec({ section: 'trait', effects: [{ ...emptyEffect(), passive: true, changes }] })
  },
}

// ---------------------------------------------------------------------------
// Resources

// A pool of points other features spend - the Dark Knight's Darkness, the
// Pictomancer's Ink, Ki. The pool is the feature's own uses; spenders name it
// by identifier, which dnd5e re-links to the pool on whichever character has it.
const resourcePool = {
  key: 'resourcePool',
  group: 'Resources',
  label: 'Resource pool: points other features spend',
  help: 'A feature holding a pool of points, like Darkness. Other templates spend from it with “Spends from a resource” set to this identifier.',
  params: [
    { key: 'identifier', label: 'Identifier', kind: 'text', default: 'darkness', hint: 'What spenders name. Lowercase words, e.g. darkness or ink.' },
    {
      key: 'max',
      label: 'Pool size',
      kind: 'formula',
      default: '@scale.the-dark-knight.darkness-points',
      hint: 'A number, or a class table column: @scale.<class identifier>.<column>, e.g. the Dark Knight’s Darkness Points.',
    },
    { key: 'recovery', label: 'Refills on', kind: 'select', default: 'lr', options: [['lr', 'Long rest'], ['sr', 'Short rest'], ['day', 'Each day']] },
  ],
  build(values) {
    const identifier = identifierFor(values.identifier)
    const max = text(values.max)
    if (!identifier) throw new Error('Give the pool an identifier, e.g. darkness.')
    if (!max) throw new Error('Set the pool size.')
    return featureSpec({ section: 'trait', usesMax: max, usesRecovery: values.recovery || 'lr', identifier })
  },
}

// Cheaper costs from a resource, always on: adds to the owner's discount
// flags, which every spender's cost subtracts (foundryActorBuilder
// discountedCost; behavior rule costs read them too). Costs never go below 1.
const discountChange = (key, amount) => change('custom', amount, { path: `flags.chrab-sync.discount.${key}`, type: 'add' })

const costReduction = {
  key: 'costReduction',
  group: 'Resources',
  label: 'Cost reduction: things cost less of a resource',
  help: 'Always on. Everything that spends the resource costs less (Magus L19: Dark Arts cost 2 less), or only the features you list (Magus L7: Shadow Lance and Grasp of Shadows cost 1 less). Costs never drop below 1.',
  params: [
    { key: 'pool', label: 'Resource', kind: 'text', default: 'darkness' },
    { key: 'amount', label: 'Costs less by', kind: 'number', default: '1' },
    { key: 'features', label: 'Only these features (blank = all)', kind: 'text', default: '', hint: 'Names separated by commas, e.g. Shadow Lance, Grasp of Shadows.' },
  ],
  build(values) {
    const amount = num(values.amount)
    const pool = identifierFor(values.pool)
    if (amount <= 0) throw new Error('Set how much less it costs.')
    const only = String(values.features ?? '').split(',').map(identifierFor).filter(Boolean)
    if (!only.length && !pool) throw new Error('Name the resource, or the features that get cheaper.')
    const changes = (only.length ? only : [pool]).map((k) => discountChange(k, amount))
    return featureSpec({ section: 'trait', effects: [{ ...emptyEffect(), passive: true, changes }] })
  },
}

// ---------------------------------------------------------------------------
// Things you use

const attack = {
  key: 'attack',
  group: 'Things you use',
  label: 'Attack: a spell-style or special attack',
  help: 'An attack roll that uses one ability (Shadow Lance: ranged spell attack with CON, prof + CON to hit), with its own range and damage.',
  params: [
    ...costParams('action'),
    { key: 'attackType', label: 'Attack', kind: 'select', default: 'ranged', options: [['ranged', 'Ranged'], ['melee', 'Melee']] },
    { key: 'classification', label: 'Counts as', kind: 'select', default: 'spell', options: [['spell', 'A spell attack'], ['weapon', 'A weapon attack']] },
    { key: 'ability', label: 'Ability (to hit and @mod)', kind: 'select', default: 'con', options: ABILITY_OPTIONS },
    { key: 'range', label: 'Range / reach (ft)', kind: 'number', default: '60' },
    { key: 'longRange', label: 'Long range (ft, ranged)', kind: 'number', default: '' },
    { key: 'damage', label: 'Damage', kind: 'formula', default: '1d8 + @abilities.con.mod' },
    { key: 'damageType', label: 'Damage type', kind: 'select', default: 'necrotic', options: DAMAGE_TYPE_OPTIONS },
    { key: 'toHitBonus', label: 'Extra to-hit bonus (e.g. 3 for a +3 weapon)', kind: 'formula', default: '' },
    { key: 'ignoresDefenses', label: 'Ignores resistance and immunity', kind: 'checkbox', default: false },
  ],
  build(values) {
    if (!text(values.damage)) throw new Error('Set the damage.')
    const ranged = values.attackType !== 'melee'
    const roll = {
      ...emptyActivity('attack'),
      attackType: ranged ? 'ranged' : 'melee',
      classification: values.classification || 'spell',
      ability: values.ability || 'con',
      range: ranged ? num(values.range) || null : null,
      longRange: ranged ? num(values.longRange) || null : null,
      reach: ranged ? 5 : num(values.range) || 5,
      targetCount: '1',
      damage: [{ formula: text(values.damage), types: values.damageType ? [values.damageType] : [] }],
      ignoreTraits: values.ignoresDefenses ? ['idr', 'idi'] : [],
      attackBonus: text(values.toHitBonus),
    }
    return usedFeature(values, [roll])
  },
}

const saveOrSuffer = {
  key: 'saveOrSuffer',
  group: 'Things you use',
  label: 'Save or suffer: damage and/or a condition',
  help: 'Targets make a saving throw. On a failure they take damage and/or gain a condition (Grasp of Shadows, Enthrall, Despairing Cry). Optionally they repeat the save at the end of each of their turns to end the condition.',
  params: [
    ...costParams('action'),
    { key: 'saveAbility', label: 'Saving throw', kind: 'select', default: 'con', options: ABILITY_OPTIONS },
    { key: 'dc', label: 'Save DC', kind: 'formula', default: '8 + @prof + @abilities.con.mod', hint: 'A number or a formula. The Dark Knight’s Dark Arts use 10 + @prof + @abilities.con.mod.' },
    { key: 'target', label: 'Targets', kind: 'select', default: 'one', options: [['one', 'One creature'], ['enemies', 'Enemies in the area'], ['creatures', 'Every creature in the area']] },
    { key: 'area', label: 'Area', kind: 'select', default: '', options: AREA_OPTIONS },
    { key: 'areaSize', label: 'Area size (ft)', kind: 'number', default: '' },
    { key: 'range', label: 'Range (ft)', kind: 'number', default: '' },
    { key: 'damage', label: 'Damage on a failure', kind: 'formula', default: '' },
    { key: 'damageType', label: 'Damage type', kind: 'select', default: 'necrotic', options: DAMAGE_TYPE_OPTIONS },
    { key: 'onSave', label: 'On a success', kind: 'select', default: 'half', options: [['half', 'Half damage'], ['none', 'No damage']] },
    { key: 'condition', label: 'Condition on a failure', kind: 'select', default: '', options: CONDITION_OPTIONS },
    { key: 'repeatSave', label: 'Repeats the save at the end of each of its turns (a success ends it)', kind: 'checkbox', default: false },
    { key: 'extraTargets', label: 'Spending more: one more target per extra point', kind: 'checkbox', default: false, hint: 'One creature, with “Can spend more” on. Use this instead of +1 die each by leaving the damage blank, or have both.' },
  ],
  build(values) {
    const damage = text(values.damage)
    if (!damage && !values.condition) throw new Error('Give it damage, a condition, or both.')
    const dc = text(values.dc) || '10'
    const base = { ...emptyActivity('save'), saveAbility: values.saveAbility || 'con', dc, onSave: damage ? values.onSave || 'half' : 'none' }
    let roll = applyTarget({ ...base, damage: [{ formula: damage, types: damage && values.damageType ? [values.damageType] : [] }] }, values.area ? values.target : 'one')
    if (values.area) roll = { ...roll, areaType: values.area, areaSize: String(num(values.areaSize) || '') }
    if (num(values.range)) roll = { ...roll, range: num(values.range) }
    if (values.extraTargets) {
      if (!values.poolExtra || values.area) throw new Error('One more target per point needs one creature (no area) and “Can spend more” on.')
      // dnd5e's target count is a formula; @scaling.increase is how much extra was spent.
      roll = { ...roll, targetCount: '1 + @scaling.increase' }
    }
    const activities = [roll]
    const effects = []
    if (values.condition) {
      effects.push({ ...emptyEffect(), name: cap(values.condition), statuses: [values.condition] })
      if (values.repeatSave) {
        // Its own activity (fresh key), rolled by midi at the end of each of the target's turns.
        activities.push({ ...emptyActivity('save'), name: 'Repeat save', saveAbility: base.saveAbility, dc, onSave: 'none', overTime: { turn: 'end', saveEnds: true, once: false, effectKey: '' } })
      }
    }
    return usedFeature(values, activities, { effects })
  },
}

const heal = {
  key: 'heal',
  group: 'Things you use',
  label: 'Heal or temporary hit points',
  help: 'Restores hit points, or grants temporary hit points, to you or someone else (Restore Vitality: 2d8 + CON to yourself).',
  params: [
    ...costParams('action'),
    { key: 'formula', label: 'Amount', kind: 'formula', default: '2d8 + @abilities.con.mod' },
    { key: 'gives', label: 'Gives', kind: 'select', default: 'healing', options: [['healing', 'Hit points'], ['temphp', 'Temporary hit points']] },
    { key: 'target', label: 'Target', kind: 'select', default: 'self', options: [['self', 'Yourself'], ['ally', 'An ally'], ['one', 'One creature']] },
    { key: 'range', label: 'Range (ft)', kind: 'number', default: '' },
  ],
  build(values) {
    if (!text(values.formula)) throw new Error('Set the amount.')
    let roll = applyTarget({ ...emptyActivity('heal'), healing: text(values.formula), healType: values.gives === 'temphp' ? 'temphp' : 'healing' }, values.target)
    if (num(values.range) && values.target !== 'self') roll = { ...roll, range: num(values.range) }
    return usedFeature(values, [roll])
  },
}

const LASTS = [
  ['turnStart', 'Until the start of your next turn'],
  ['turnEnd', 'Until the end of your next turn'],
  ['isAttacked', 'Until you’re next attacked'],
  ['', 'Until removed'],
]

const selfBuff = {
  key: 'selfBuff',
  group: 'Things you use',
  label: 'Self buff: a short-lived boost',
  help: 'Using it puts an effect on you (Shadow Veil: +5 AC until the start of your next turn; Wings of Darkness: fly 50 ft). For something you switch on and off, use Stance instead.',
  params: [
    ...costParams('bonus'),
    { key: 'lasts', label: 'Lasts', kind: 'select', default: 'turnStart', options: LASTS },
    { key: 'ac', label: 'AC bonus', kind: 'formula', default: '' },
    { key: 'fly', label: 'Flying speed (ft)', kind: 'number', default: '' },
    { key: 'walk', label: 'Walking speed +', kind: 'number', default: '' },
    { key: 'resist', label: 'Resistance to', kind: 'damageTypes' },
    { key: 'advAttacks', label: 'Advantage on your attacks', kind: 'checkbox', default: false },
    { key: 'advSaves', label: 'Advantage on your saving throws', kind: 'checkbox', default: false },
  ],
  build(values) {
    const changes = [
      text(values.ac) && change('ac', text(values.ac)),
      num(values.fly) && change('speed', num(values.fly), { param: 'fly', type: 'upgrade' }),
      num(values.walk) && change('speed', num(values.walk), { param: 'walk', type: 'add' }),
      ...list(values.resist).map((t) => change('resist', t)),
      values.advAttacks && change('advAttack'),
      values.advSaves && change('advSave', '', { param: 'all' }),
    ].filter(Boolean)
    if (!changes.length) throw new Error('Pick at least one boost.')
    const effect = { ...emptyEffect(), changes, specialDuration: values.lasts ? [values.lasts] : [] }
    return usedFeature(values, [{ ...emptyActivity('utility'), targetType: 'self' }], { effects: [effect] })
  },
}

const bonusDamage = {
  key: 'bonusDamage',
  group: 'Things you use',
  label: 'Extra damage after a hit',
  help: 'Used right after you hit: rolls extra damage against the target (Shadow Smite: 2d10 necrotic, +1d10 per extra Darkness). For extra damage that asks on every hit by itself, use a stance or an Always-on behavior rule instead.',
  params: [
    ...costParams('special'),
    { key: 'damage', label: 'Damage', kind: 'formula', default: '2d10' },
    { key: 'damageType', label: 'Damage type', kind: 'select', default: 'necrotic', options: DAMAGE_TYPE_OPTIONS },
  ],
  build(values) {
    if (!text(values.damage)) throw new Error('Set the damage.')
    const roll = { ...emptyActivity('damage'), targetCount: '1', damage: [{ formula: text(values.damage), types: values.damageType ? [values.damageType] : [] }] }
    return usedFeature(values, [roll])
  },
}

const mark = {
  key: 'mark',
  group: 'Things you use',
  label: 'Mark or curse a target',
  help: 'Puts a named effect on one creature so everyone can see it’s marked (Mark of Darkness, Curse, Mark of Devastation). Use it on a target, or have it offered each time you hit. Optional: one mark at a time, a save penalty (or one the player picks each time), extra damage taken, advantage and disadvantage.',
  params: [
    ...costParams('bonus'),
    { key: 'effectName', label: 'Effect name', kind: 'text', default: 'Marked', hint: 'Shown on the target, e.g. Marked by Darkness.' },
    { key: 'target', label: 'Target', kind: 'select', default: 'one', options: [['one', 'One creature'], ['ally', 'An ally']] },
    { key: 'range', label: 'Range (ft)', kind: 'number', default: '60' },
    { key: 'onHit', label: 'Also offered when you hit a creature (asks)', kind: 'checkbox', default: false, hint: 'Mark of Darkness: “when you touch or hit a creature”. Costs a use of this feature, or the resource above.' },
    { key: 'oneAtATime', label: 'Only one creature marked at a time', kind: 'checkbox', default: true },
    { key: 'savePenalty', label: 'Penalty to its saving throws (e.g. -2)', kind: 'formula', default: '' },
    { key: 'penaltyAbility', label: 'For saves of', kind: 'select', default: 'all', options: [['all', 'Every ability'], ['pick', 'An ability the player picks each time'], ...ABILITY_OPTIONS] },
    { key: 'extraDamage', label: 'Takes extra damage when hit by an attack', kind: 'formula', default: '', hint: 'Curse: 1d6. Rolled on each attack that hits it, from anyone, and added to that hit.' },
    { key: 'grantsAdvantage', label: 'Attacks against it have advantage', kind: 'checkbox', default: false },
    { key: 'disAttacks', label: 'It has disadvantage on attack rolls', kind: 'checkbox', default: false },
    { key: 'disSaves', label: 'It has disadvantage on saving throws', kind: 'checkbox', default: false },
    {
      key: 'onlyYou',
      label: 'Those three count only between it and you',
      kind: 'checkbox',
      default: false,
      hint: 'Mark of Devastation: your attacks against it, its attacks against you, its saves against your abilities.',
    },
    {
      key: 'onDrop',
      label: 'When the marked creature drops to 0',
      kind: 'select',
      default: '',
      options: [['', 'Nothing'], ['use', 'Give back a use of this feature'], ['cost', 'Give back the resource it cost']],
      hint: 'Mark of Darkness: a use back, to mark a new creature for free. Curse: the Darkness back.',
    },
    ...flavorParams('Shadows coil around your prey; it cannot hide from you now.'),
  ],
  build(values) {
    const name = text(values.effectName)
    if (!name) throw new Error('Name the effect.')
    const pool = identifierFor(values.pool)
    if (values.onDrop === 'cost' && !pool) throw new Error('“Give back the resource it cost” needs a resource it spends.')
    const penalty = text(values.savePenalty)
    const extra = text(values.extraDamage)
    const pick = values.penaltyAbility === 'pick'
    // "{owner}" becomes whoever applied the mark (foundryBehaviors effectCopy).
    const onlyYou = !!values.onlyYou
    const flag = (path, condition) => change('custom', condition, { path, type: 'custom' })
    const changes = [
      penalty &&
        (pick
          ? change('custom', penalty, { path: 'system.abilities.{ability}.bonuses.save', type: 'add' })
          : values.penaltyAbility && values.penaltyAbility !== 'all'
            ? change('saveOne', penalty, { param: values.penaltyAbility })
            : change('saveAll', penalty)),
      values.grantsAdvantage && (onlyYou ? flag('flags.midi-qol.grants.advantage.attack.all', 'workflow?.actor?.uuid === "{owner}"') : change('grantsAdv')),
      values.disAttacks && (onlyYou ? flag('flags.midi-qol.disadvantage.attack.all', 'targetActorUuid === "{owner}"') : change('disAttack')),
      values.disSaves && (onlyYou ? flag('flags.midi-qol.disadvantage.ability.save.all', 'workflow?.actor?.uuid === "{owner}"') : change('disSave', '', { param: 'all' })),
    ].filter(Boolean)
    if (pick && !penalty) throw new Error('Set the save penalty the player picks an ability for.')
    let roll = applyTarget({ ...emptyActivity('utility') }, values.target)
    if (num(values.range)) roll = { ...roll, range: num(values.range) }
    // The mark is placed by the feature's rules, so it can move (one at a
    // time), ask for an ability, and remember who placed it. Getting the cost
    // back is a rule run on the marked creature: the mark is also a linked
    // (bond) effect.
    // Extra damage is added by the feature's hook on the marked creature (not
    // midi's dm.midi, a damage reduction field: a positive value there does
    // nothing, or with the "max DR value" rule takes the dice OFF the hit).
    const effect = { ...emptyEffect(), name, changes, byRule: true, bond: !!values.onDrop, extraDamage: extra }
    const place = { ...emptyBehaviorAction('applyEffect'), effectKey: effect.key, name, to: 'target', unique: values.oneAtATime !== false, pickAbility: pick }
    const flavor = text(values.flavor)
    const rules = [{ ...emptyBehaviorRule('nothing'), event: 'used', ask: false, flavor, actions: [place] }]
    if (values.onHit) {
      const [usesMax] = USES[values.uses] ?? ['']
      if (!usesMax && !pool) throw new Error('Offering it on a hit needs limited uses or a resource to spend.')
      const cost = pool ? ruleCost(values) : { costOwnUses: true, costAmount: '1' }
      rules.push({
        ...emptyBehaviorRule('nothing'),
        event: 'hit',
        ask: true,
        flavor,
        ...cost,
        // Not again on a creature that already carries this mark.
        when: '!c.target?.actor?.effects?.some((e) => e.origin === c.item.uuid)',
        actions: [{ ...place, key: emptyBehaviorAction().key }],
      })
    }
    if (values.onDrop) {
      rules.push({ ...emptyBehaviorRule('refund'), event: 'bondedDowned', flavor: '', refundPool: values.onDrop === 'cost' ? pool : '', refundAmount: String(num(values.poolCost) || 1) })
    }
    const behavior = emptyBehavior('passive')
    return usedFeature(values, [roll], {
      effects: [effect],
      behavior: { ...behavior, flavor: { ...behavior.flavor, color: values.cardColor || '' }, rules },
    })
  },
}

const utility = {
  key: 'utility',
  group: 'Things you use',
  label: 'Use and spend: no roll',
  help: 'A button that spends its cost (uses, Darkness), for features the table resolves by hand. With an announcement it posts a card saying what it lets you do (Soul Surge: take another action this turn).',
  params: [
    ...costParams('action'),
    { key: 'target', label: 'Target', kind: 'select', default: 'self', options: [['self', 'Yourself'], ['one', 'One creature'], ['ally', 'An ally']] },
    { key: 'range', label: 'Range (ft)', kind: 'number', default: '' },
    { key: 'announce', label: 'Announcement', kind: 'text', default: '', hint: 'e.g. @actor can take one more action this turn. Blank = midi’s own card only.' },
    ...flavorParams('The darkness surges through you, driving you onward.'),
  ],
  build(values) {
    let roll = applyTarget({ ...emptyActivity('utility') }, values.target)
    if (num(values.range) && values.target !== 'self') roll = { ...roll, range: num(values.range) }
    if (text(values.announce)) return scripted(values, roll, 'announce', { text: text(values.announce) })
    return usedFeature(values, [roll])
  },
}

// Script templates: an activity whose midi-qol macro (a foundryAutomation
// recipe) does the work after the roll. Recipes with a chat card take the
// template's flavor and card color.
function scripted(values, activity, recipe, params, item = {}) {
  const base = emptyScript(recipe).params
  const card = 'flavor' in base ? { flavor: text(values.flavor), color: values.cardColor || '' } : {}
  const script = { ...emptyScript(recipe), params: { ...base, ...card, ...params } }
  return usedFeature(values, [{ ...activity, script }], item)
}

const teleport = {
  key: 'teleport',
  group: 'Things you use',
  label: 'Teleport yourself',
  help: 'After you use it, click a spot within range and your token moves there instantly (Shadow Warp). Right-click to cancel. Name your mark and it first offers to warp beside the creature carrying it, seen or not.',
  params: [
    ...costParams('bonus'),
    { key: 'range', label: 'Up to (ft)', kind: 'number', default: '30' },
    { key: 'toMark', label: 'Or beside the creature carrying your mark', kind: 'text', default: '', hint: 'The mark’s effect name, e.g. Marked by Darkness.' },
    ...flavorParams('You step into the shadows and out of another.'),
  ],
  build(values) {
    return scripted(values, { ...emptyActivity('utility'), targetType: 'self' }, 'teleport', { range: String(num(values.range) || 30), toMark: text(values.toMark) })
  },
}

const missiles = {
  key: 'missiles',
  group: 'Things you use',
  label: 'Missiles: pick a target for each',
  help: 'After you use it, a blue ring shows the range and you click a creature for each missile, the same one again to stack them (Magic Missile, Lunar Missile Barrage). Each creature takes its missiles’ damage. Cast with a higher slot, a spell fires more.',
  params: [
    ...costParams('action'),
    { key: 'count', label: 'Missiles', kind: 'number', default: '3' },
    { key: 'perLevel', label: 'More per slot level up', kind: 'number', default: '1', hint: 'Spells only: missiles added for each level above the spell’s.' },
    { key: 'formula', label: 'Damage per missile', kind: 'formula', default: '1d4 + 1' },
    { key: 'damageType', label: 'Damage type', kind: 'select', default: 'force', options: DAMAGE_TYPE_OPTIONS },
    { key: 'range', label: 'Range (ft)', kind: 'number', default: '', hint: 'Blank: the spell’s or feature’s own range, whatever it is.' },
    { key: 'sameRoll', label: 'Roll once: every missile deals the same', kind: 'checkbox', default: false },
    ...flavorParams('Bolts of light streak out and find their marks.'),
  ],
  build(values) {
    if (!text(values.formula)) throw new Error('Set the damage per missile.')
    return scripted(values, { ...emptyActivity('utility'), targetType: 'self' }, 'missiles', {
      count: String(num(values.count) || 3),
      perLevel: String(num(values.perLevel)),
      formula: text(values.formula),
      damageType: values.damageType || '',
      range: num(values.range) > 0 ? String(num(values.range)) : '',
      sameRoll: !!values.sameRoll,
    })
  },
}

const takeHit = {
  key: 'takeHit',
  group: 'Reactions',
  label: 'Take a creature’s damage instead',
  help: 'Target the creature that was just hurt and use it: you enter how much damage it took, it regains that much, and you take it instead (Absorb Wounds). Midi only offers reactions to the creature that was hit, so you use this one yourself.',
  params: [...costParams('reaction'), { key: 'range', label: 'Range (ft)', kind: 'number', default: '30' }, ...flavorParams('Darkness pulls the wound out of them and into you.')],
  build(values) {
    let roll = { ...emptyActivity('utility'), targetType: 'creature', targetCount: '1' }
    if (num(values.range)) roll = { ...roll, range: num(values.range) }
    return scripted(values, roll, 'takeHit', {})
  },
}

const sacrifice = {
  key: 'sacrifice',
  group: 'Things you use',
  label: 'Hurt yourself, allies gain temp HP',
  help: 'You take damage, and each ally within range gains temporary hit points equal to it, not stacking (Bulwark: 3d10 necrotic, allies within 30 ft).',
  params: [
    ...costParams('action'),
    { key: 'formula', label: 'Damage to you', kind: 'formula', default: '3d10' },
    { key: 'damageType', label: 'Damage type', kind: 'select', default: 'necrotic', options: DAMAGE_TYPE_OPTIONS },
    { key: 'range', label: 'Allies within (ft)', kind: 'number', default: '30' },
    ...flavorParams('You bleed darkness, and it hardens into armor around your allies.'),
  ],
  build(values) {
    if (!text(values.formula)) throw new Error('Set the damage.')
    return scripted(values, { ...emptyActivity('utility'), targetType: 'self' }, 'sacrifice', {
      formula: text(values.formula),
      damageType: values.damageType || '',
      range: String(num(values.range) || 30),
    })
  },
}

const weaponWave = {
  key: 'weaponWave',
  group: 'Things you use',
  label: 'Weapon attack against everyone in an area',
  help: 'Place the area (a 30 ft line), then one attack roll with your melee weapon is checked against every creature in it, each hit dealing the weapon’s damage plus extra (Death Wave: +1d8). Asks which weapon if you carry more than one.',
  params: [
    ...costParams('action'),
    { key: 'area', label: 'Area', kind: 'select', default: 'line', options: AREA_OPTIONS.filter(([key]) => key) },
    { key: 'areaSize', label: 'Area size (ft)', kind: 'number', default: '30' },
    { key: 'extra', label: 'Extra damage on each hit', kind: 'formula', default: '1d8' },
    ...flavorParams('Your blade sheds a wave of darkness that tears through everything before you.'),
  ],
  build(values) {
    const roll = { ...emptyActivity('utility'), targetType: 'enemy', areaType: values.area || 'line', areaSize: String(num(values.areaSize) || 30) }
    return scripted(values, roll, 'weaponWave', { extra: text(values.extra) })
  },
}

// A bond on another creature: while it carries the bond effect, a share of
// the damage it takes comes to you (behavior event bondedHurt).
const bond = {
  key: 'bond',
  group: 'Things you use',
  label: 'Bond: share a creature’s damage',
  help: 'Bind yourself to a creature: while bonded, part of every hit it takes comes to you instead (Defend the Weak: half). The bond is an effect on it; remove the effect to end it.',
  params: [
    ...costParams('bonus'),
    { key: 'share', label: 'Share of its damage you take (%)', kind: 'number', default: '50' },
    { key: 'effectName', label: 'Bond name', kind: 'text', default: 'Bonded' },
    { key: 'target', label: 'Bonds', kind: 'select', default: 'ally', options: [['ally', 'An ally'], ['one', 'Any creature']] },
    { key: 'range', label: 'Range (ft)', kind: 'number', default: '30' },
    { key: 'lasts', label: 'Lasts', kind: 'select', default: '', options: [['', 'Until removed'], ['longRest', 'Until a long rest'], ['turnStartSource', 'Until the start of your next turn']] },
    ...flavorParams('The tether of shadow pulls taut, and you take the blow meant for them.'),
  ],
  build(values) {
    const share = Math.min(100, Math.max(1, num(values.share) || 50))
    let roll = applyTarget({ ...emptyActivity('utility') }, values.target === 'one' ? 'one' : 'ally')
    if (num(values.range)) roll = { ...roll, range: num(values.range) }
    const base = emptyBehavior('passive')
    const behavior = { ...base, flavor: { ...base.flavor, color: values.cardColor || '' }, rules: [{ ...emptyBehaviorRule('shareDamage'), share: String(share), flavor: text(values.flavor) }] }
    const effect = { ...emptyEffect(), name: text(values.effectName) || 'Bonded', bond: true, specialDuration: values.lasts ? [values.lasts] : [] }
    return usedFeature(values, [roll], { effects: [effect], behavior })
  },
}

// ---------------------------------------------------------------------------
// Reactions: midi-qol offers them to their owner when the trigger happens
// (the activity's reactionCondition). One taking damage runs before the
// damage is worked out, so its damage reduction counts against that hit.

const reaction = {
  key: 'reaction',
  group: 'Reactions',
  label: 'Reaction when you’re hit or take damage',
  help: 'Midi-qol offers it to you at the right moment. Shadow Veil: when hit, +5 AC until your next turn (like Shield). Deflecting Darkness: when you take damage, reduce it by 2d10 + CON. The boost lasts until your next turn; the reduction and resistance only for the damage that set it off.',
  params: [
    { key: 'trigger', label: 'Offered when', kind: 'select', default: 'isDamaged', options: [['isHit', 'You’re hit by an attack'], ['isDamaged', 'You take damage'], ['isAttacked', 'You’re attacked (before the roll)'], ['isMissed', 'An attack misses you'], ['isSaveFail', 'You fail a saving throw']] },
    ...costParams('reaction').filter((p) => p.key !== 'activation'),
    { key: 'ac', label: 'AC bonus until your next turn', kind: 'formula', default: '' },
    { key: 'reduce', label: 'Reduce that damage by', kind: 'formula', default: '' },
    { key: 'resist', label: 'Resistance to that damage, if it’s', kind: 'damageTypes' },
    { key: 'heal', label: 'Heal yourself (after)', kind: 'formula', default: '' },
  ],
  build(values) {
    const ac = text(values.ac)
    const reduce = text(values.reduce)
    const resist = list(values.resist)
    const healing = text(values.heal)
    if (!ac && !reduce && !resist.length && !healing) throw new Error('Give it an AC bonus, damage reduction, a resistance, or healing.')
    const effects = []
    if (ac) effects.push({ ...emptyEffect(), changes: [change('ac', ac)], specialDuration: ['turnStart'] })
    if (reduce || resist.length) {
      effects.push({ ...emptyEffect(), changes: [...(reduce ? [damageReduction('all', reduce)] : []), ...resist.map((t) => change('resist', t))], specialDuration: ['isDamaged'] })
    }
    const roll = healing
      ? { ...emptyActivity('heal'), healing, targetType: 'self' }
      : { ...emptyActivity('utility'), targetType: 'self' }
    return usedFeature({ ...values, activation: 'reaction' }, [{ ...roll, reactionTrigger: values.trigger || 'isDamaged' }], { effects })
  },
}

// ---------------------------------------------------------------------------
// When you attack: behavior rules (foundryBehaviors.js) on an always-on
// feature - they react to the owner's own attacks, any weapon or spell.

const ATTACK_FILTERS = [
  { key: 'attackRange', label: 'With', kind: 'select', default: 'melee', options: [['any', 'Any attack'], ['melee', 'Melee attacks'], ['ranged', 'Ranged attacks']] },
  { key: 'attackSource', label: 'Made with', kind: 'select', default: 'any', options: [['any', 'Anything'], ['weapon', 'A weapon (or unarmed)'], ['spell', 'A spell']] },
]

function ruleFeature(rule, values = {}) {
  const behavior = emptyBehavior('passive')
  return featureSpec({
    section: 'trait',
    behavior: { ...behavior, flavor: { ...behavior.flavor, color: values.cardColor || '' }, rules: [{ ...rule, flavor: text(values.flavor) }] },
  })
}

function ruleCost(values) {
  const pool = identifierFor(values.pool)
  return pool ? { costPool: pool, costAmount: String(num(values.poolCost) || 1), costExtra: !!values.poolExtra } : {}
}

const COST_PARAMS = costParams().filter((p) => ['pool', 'poolCost', 'poolExtra'].includes(p.key))

const onHitDamage = {
  key: 'onHitDamage',
  group: 'When you attack',
  label: 'Extra damage on a hit (asks each time)',
  help: 'Every time you hit, it can add damage - asking first if you like, and spending a resource (Shadow Smite: 3 Darkness for 2d10 necrotic, more for +1d10 each). Works with any of your weapons or spells.',
  params: [
    ...ATTACK_FILTERS,
    { key: 'damage', label: 'Damage', kind: 'formula', default: '2d10' },
    { key: 'damageType', label: 'Damage type', kind: 'select', default: 'necrotic', options: DAMAGE_TYPE_OPTIONS },
    { key: 'ask', label: 'Ask first', kind: 'checkbox', default: true },
    { key: 'oncePerTurn', label: 'Once per turn', kind: 'checkbox', default: false },
    { key: 'critOnly', label: 'Critical hits only', kind: 'checkbox', default: false },
    { key: 'selfCost', label: 'You take the same damage', kind: 'checkbox', default: false },
    ...COST_PARAMS,
    ...flavorParams('Dark energy surges down your blade and into the wound.'),
  ],
  build(values) {
    if (!text(values.damage)) throw new Error('Set the damage.')
    return ruleFeature({
      ...emptyBehaviorRule('bonusDamage'),
      event: 'damage',
      attackRange: values.attackRange || 'any',
      attackSource: values.attackSource || 'any',
      formula: text(values.damage),
      damageType: values.damageType || '',
      ask: !!values.ask,
      oncePerTurn: !!values.oncePerTurn,
      critOnly: !!values.critOnly,
      selfCost: values.selfCost ? 'same' : 'none',
      ...ruleCost(values),
    }, values)
  },
}

const onHitBenefit = {
  key: 'onHitBenefit',
  group: 'When you attack',
  label: 'Heal or temp HP when you hit (or drain)',
  help: 'Something for you when your attacks connect: heal on a hit or a high roll (Death Stance’s Blood Harvest), temp HP on a hit, or drain - heal for part of the damage you dealt (use @dealt, e.g. floor(@dealt / 2)).',
  params: [
    { key: 'event', label: 'When', kind: 'select', default: 'hit', options: [['hit', 'You hit'], ['attackRoll', 'You make an attack roll (hit or miss)'], ['dealt', 'Your damage has landed (drain)']] },
    ...ATTACK_FILTERS,
    { key: 'naturalMin', label: 'Natural d20 at least (blank = any)', kind: 'number', default: '' },
    { key: 'critOnly', label: 'Critical hits only', kind: 'checkbox', default: false },
    { key: 'gives', label: 'You gain', kind: 'select', default: 'healSelf', options: [['healSelf', 'Hit points'], ['tempHpSelf', 'Temporary hit points']] },
    { key: 'formula', label: 'Amount', kind: 'formula', default: '1d10 + @abilities.con.mod', hint: '@dealt is the damage dealt (with “Your damage has landed”).' },
    { key: 'ask', label: 'Ask first', kind: 'checkbox', default: false },
    { key: 'oncePerTurn', label: 'Once per turn', kind: 'checkbox', default: false },
    ...COST_PARAMS,
    ...flavorParams('The darkness drinks from the wound and pours the stolen life back into you.'),
  ],
  build(values) {
    if (!text(values.formula)) throw new Error('Set the amount.')
    const outcome = values.gives === 'tempHpSelf' ? 'tempHpSelf' : 'healSelf'
    return ruleFeature({
      ...emptyBehaviorRule(outcome),
      event: values.event || 'hit',
      attackRange: values.attackRange || 'any',
      attackSource: values.attackSource || 'any',
      naturalMin: num(values.naturalMin) > 1 ? String(num(values.naturalMin)) : '',
      critOnly: !!values.critOnly,
      formula: text(values.formula),
      ask: !!values.ask,
      oncePerTurn: !!values.oncePerTurn,
      ...ruleCost(values),
    }, values)
  },
}

// ---------------------------------------------------------------------------
// Stances

const stance = {
  key: 'stance',
  group: 'Stances',
  label: 'Stance: switch on and off',
  help: 'A toggle that lasts a while and shows on your token (Vanguard Stance; Death Stance is the finished example). Add “when I hit…” rules afterwards in the Behavior section.',
  params: [
    { key: 'activation', label: 'Switching it takes', kind: 'select', default: 'bonus', options: [['bonus', 'Bonus action'], ['action', 'Action'], ['reaction', 'Reaction'], ['special', 'No action']] },
    { key: 'uses', label: 'Limited uses', kind: 'select', default: 'prof-lr', options: [['', 'Unlimited'], ['prof-lr', 'Proficiency bonus per long rest'], ['1-lr', 'Once per long rest'], ['1-sr', 'Once per short rest']] },
    { key: 'minutes', label: 'Lasts (minutes, blank = until switched off)', kind: 'number', default: '1' },
    { key: 'visual', label: 'Visual while on', kind: 'select', default: 'necrotic', options: TOGGLE_VISUALS.map((v) => [v.key, v.label]) },
    { key: 'advAttacks', label: 'Advantage on your attacks', kind: 'checkbox', default: false },
    { key: 'disAttacks', label: 'Disadvantage on your attacks', kind: 'checkbox', default: false },
    { key: 'ac', label: 'AC bonus', kind: 'formula', default: '' },
    { key: 'resist', label: 'Resistance to', kind: 'damageTypes' },
    {
      key: 'tempHp',
      label: 'Temporary HP at the start of each of your turns',
      kind: 'formula',
      default: '',
      hint: 'For “+CON from level 7”: 1d10 + min(1, floor(@classes.<class>.levels / 7)) * @abilities.con.mod.',
    },
    { key: 'healEachTurn', label: 'Healing at the start of each of your turns', kind: 'formula', default: '', hint: 'The Final Art: 2d8.' },
    { key: 'discountPool', label: 'While on, a resource costs less', kind: 'text', default: '', hint: 'The resource’s identifier, e.g. darkness.' },
    { key: 'discountAmount', label: 'Less by', kind: 'number', default: '' },
    { key: 'flavorOn', label: 'Flavor when it starts', kind: 'text', default: '', hint: 'On its chat card, e.g. “A barrier of shadow knits itself around you.”' },
    { key: 'flavorOff', label: 'Flavor when it ends', kind: 'text', default: '' },
  ],
  build(values) {
    const tempHp = text(values.tempHp)
    const healEachTurn = text(values.healEachTurn)
    // midi's OverTime setting splits only at ",key=", so min(1, x) is safe;
    // a stray "=" after a comma is the one thing that would break it.
    if ([tempHp, healEachTurn].some((f) => /,\s*\w+\s*=/.test(f))) throw new Error('The temporary HP and healing formulas can’t contain “, name=” (midi’s OverTime setting splits there).')
    const discountPool = identifierFor(values.discountPool)
    const changes = [
      values.advAttacks && change('advAttack'),
      values.disAttacks && change('disAttack'),
      text(values.ac) && change('ac', text(values.ac)),
      ...list(values.resist).map((t) => change('resist', t)),
      tempHp && { ...change('overTime'), overTime: { turn: 'start', saveAbility: '', saveDc: '', damage: tempHp, damageType: 'temphp', saveRemoves: false } },
      healEachTurn && { ...change('overTime'), overTime: { turn: 'start', saveAbility: '', saveDc: '', damage: healEachTurn, damageType: 'healing', saveRemoves: false } },
      discountPool && num(values.discountAmount) > 0 && discountChange(discountPool, num(values.discountAmount)),
    ].filter(Boolean)
    const behavior = emptyBehavior('toggle')
    const [usesMax, usesRecovery] = USES[values.uses] ?? ['', '']
    return featureSpec({
      section: values.activation === 'special' ? 'trait' : values.activation || 'bonus',
      usesMax,
      usesRecovery,
      effects: [{ ...emptyEffect(), stance: true, changes }],
      behavior: {
        ...behavior,
        toggle: { ...behavior.toggle, activation: values.activation || 'bonus', duration: text(values.minutes), visual: values.visual || 'necrotic', freeOff: !usesMax },
        flavor: { ...behavior.flavor, on: text(values.flavorOn), off: text(values.flavorOff) },
      },
    })
  },
}

// A chat card at the start (or end) of your turn, always or while you have
// one of some conditions - for rules the table applies (Inevitable).
const turnReminder = {
  key: 'turnReminder',
  group: 'Always on',
  label: 'Reminder on your turn',
  help: 'Posts a card at the start or end of each of your turns in combat - always, or only while you have one of the chosen conditions (Inevitable: when something holds you in place, its saves succeed after one turn). @name is you, @statuses your current conditions.',
  params: [
    { key: 'turn', label: 'When', kind: 'select', default: 'start', options: [['start', 'Start of your turn'], ['end', 'End of your turn']] },
    { key: 'whileAny', label: 'Only while you have', kind: 'conditions', hint: 'Blank = every turn.' },
    { key: 'text', label: 'What it says', kind: 'text', default: '' },
    ...flavorParams(),
  ],
  build(values) {
    const words = text(values.text)
    if (!words) throw new Error('Write what the reminder says.')
    const statuses = list(values.whileAny)
    const base = emptyBehavior('passive')
    const rule = {
      ...emptyBehaviorRule('nothing'),
      event: values.turn === 'end' ? 'turnEnd' : 'turnStart',
      ask: false,
      flavor: text(values.flavor),
      when: statuses.length ? `${JSON.stringify(statuses)}.some((s) => c.actor.statuses?.has(s))` : '',
      actions: [{ ...emptyBehaviorAction('message'), text: words, style: 'chat' }],
    }
    return featureSpec({ section: 'trait', behavior: { ...base, flavor: { ...base.flavor, color: values.cardColor || '' }, rules: [rule] } })
  },
}

// ---------------------------------------------------------------------------
// Over time

const MINUTES_HINT = 'Effects on targets last this long (midi gives an effect without its own duration the roll’s). Blank = until removed.'

const lingering = {
  key: 'lingering',
  group: 'Over time',
  label: 'Lingering damage or healing',
  help: 'Puts an effect on a creature that deals damage (or heals) at the start or end of each of its turns, rolled with YOUR numbers (Wither: 1d6 necrotic each turn; a regeneration blessing on an ally). Optionally a save to resist, and a repeat save each turn to end it.',
  params: [
    ...costParams('action'),
    { key: 'gives', label: 'Each turn it', kind: 'select', default: 'damage', options: [['damage', 'Deals damage'], ['healing', 'Heals'], ['temphp', 'Gives temporary HP']] },
    { key: 'formula', label: 'Amount each turn', kind: 'formula', default: '1d6', hint: 'Rolled as you: @abilities.cha.mod, @prof and your class levels are yours.' },
    { key: 'damageType', label: 'Damage type', kind: 'select', default: 'necrotic', options: DAMAGE_TYPE_OPTIONS },
    { key: 'turn', label: 'When', kind: 'select', default: 'start', options: [['start', 'Start of its turn'], ['end', 'End of its turn']] },
    { key: 'target', label: 'Target', kind: 'select', default: 'one', options: [['one', 'One creature'], ['ally', 'An ally'], ['self', 'Yourself']] },
    { key: 'range', label: 'Range (ft)', kind: 'number', default: '60' },
    { key: 'saveAbility', label: 'Save to resist it landing', kind: 'select', default: '', options: [['', 'No save'], ...ABILITY_OPTIONS] },
    { key: 'dc', label: 'Save DC', kind: 'formula', default: '8 + @prof + @abilities.con.mod' },
    { key: 'repeatSave', label: 'Repeats the save each turn: a success ends it', kind: 'checkbox', default: false },
    { key: 'effectName', label: 'Effect name', kind: 'text', default: '', hint: 'Shown on the creature, e.g. Withering.' },
    { key: 'minutes', label: 'Lasts (minutes)', kind: 'number', default: '1', hint: MINUTES_HINT },
  ],
  build(values) {
    const formula = text(values.formula)
    if (!formula) throw new Error('Set the amount each turn.')
    const damage = values.gives === 'damage'
    const saveAbility = values.saveAbility
    const dc = text(values.dc) || '10'
    if (values.repeatSave && !saveAbility) throw new Error('A repeat save needs a saving throw.')
    if (values.repeatSave && !damage) throw new Error('A repeat save each turn only works with damage (healing doesn’t need one).')
    const minutes = text(values.minutes)
    // The roll that puts it on: a save, or a plain utility use.
    let apply = saveAbility ? { ...emptyActivity('save'), saveAbility, dc, onSave: 'none', damage: [{ formula: '', types: [] }] } : { ...emptyActivity('utility') }
    apply = applyTarget({ ...apply, durationMinutes: minutes }, values.target)
    if (num(values.range) && values.target !== 'self') apply = { ...apply, range: num(values.range) }
    const effect = { ...emptyEffect(), name: text(values.effectName) }
    // The tick: midi uses it on the creature each turn (ActivityOverTime),
    // rolled as the source - so the formula's @ values are the caster's.
    const overTime = { turn: values.turn === 'end' ? 'end' : 'start', saveEnds: !!values.repeatSave, once: false, effectKey: effect.key }
    const tickKind = values.repeatSave ? 'save' : damage ? 'damage' : 'heal'
    const tick = {
      ...emptyActivity(tickKind),
      name: values.repeatSave ? 'Each turn (save ends)' : 'Each turn',
      overTime,
      ...(tickKind === 'save' ? { saveAbility, dc, onSave: 'full' } : {}),
      ...(damage ? { damage: [{ formula, types: values.damageType ? [values.damageType] : [] }] } : {}),
      ...(tickKind === 'heal' ? { healing: formula, healType: values.gives === 'temphp' ? 'temphp' : 'healing' } : {}),
    }
    return usedFeature(values, [apply, tick], { effects: [{ ...effect, appliedBy: [apply.key] }] })
  },
}

// ---------------------------------------------------------------------------
// Auras

const aura = {
  key: 'aura',
  group: 'Auras',
  label: 'Aura around you',
  help: 'An area that moves with your token (midi-qol region). Creatures of your choice inside get an effect while they stay in it, and/or take damage when they enter or start their turn there, optionally with a save (Imposing Presence, Aura of Despair).',
  params: [
    ...costParams('action'),
    { key: 'radius', label: 'Radius (ft)', kind: 'number', default: '10' },
    { key: 'affects', label: 'Affects', kind: 'select', default: 'enemy', options: [['enemy', 'Enemies'], ['ally', 'Allies'], ['all', 'Everyone but you']] },
    { key: 'minutes', label: 'Lasts (minutes)', kind: 'text', default: '1', hint: 'perm = until you end it (an always-on aura still needs to be used once).' },
    { key: 'effectName', label: 'Effect while inside', kind: 'text', default: '', hint: 'Named effect for the changes below; blank and no changes = no effect.' },
    { key: 'ac', label: 'AC change inside', kind: 'formula', default: '', hint: 'e.g. 1 for allies, -1 for enemies.' },
    { key: 'savePenalty', label: 'Saving throw change inside', kind: 'formula', default: '', hint: 'e.g. -1d4 or @abilities.cha.mod.' },
    { key: 'disAttacks', label: 'Disadvantage on attack rolls inside', kind: 'checkbox', default: false },
    { key: 'condition', label: 'Condition inside', kind: 'select', default: '', options: CONDITION_OPTIONS },
    { key: 'resist', label: 'Resistance inside', kind: 'damageTypes' },
    { key: 'abilityPenalty', label: 'Ability scores inside reduced by', kind: 'number', default: '', hint: 'Every ability score, e.g. 3.' },
    { key: 'damage', label: 'Damage on entering / starting a turn inside', kind: 'formula', default: '' },
    { key: 'damageType', label: 'Damage type', kind: 'select', default: 'necrotic', options: DAMAGE_TYPE_OPTIONS },
    { key: 'saveAbility', label: 'Save against the damage', kind: 'select', default: '', options: [['', 'No save'], ...ABILITY_OPTIONS] },
    { key: 'dc', label: 'Save DC', kind: 'formula', default: '8 + @prof + @abilities.con.mod' },
    { key: 'onSave', label: 'On a success', kind: 'select', default: 'half', options: [['half', 'Half damage'], ['none', 'No damage'], ['full', 'Full damage (the save is for something else)']] },
    { key: 'drain', label: 'You heal for half the damage it deals', kind: 'checkbox', default: false },
    ...flavorParams('The darkness feeds, and so do you.'),
    { key: 'failCondition', label: 'Condition on a failed save', kind: 'select', default: '', options: CONDITION_OPTIONS, hint: 'Until the start of its next turn, e.g. frightened.' },
    {
      key: 'failEffect',
      label: 'Named effect on a failed save',
      kind: 'text',
      default: '',
      hint: 'Until the start of its next turn, when the aura makes it save again. Imposing Presence: Locked in the Aura (shown on the token; leaving is on the table).',
    },
  ],
  build(values) {
    const changes = [
      text(values.ac) && change('ac', text(values.ac)),
      text(values.savePenalty) && change('saveAll', text(values.savePenalty)),
      values.disAttacks && change('disAttack'),
      ...list(values.resist).map((t) => change('resist', t)),
      ...(num(values.abilityPenalty) ? NPC_ABILITIES.map((a) => change('abilityScore', -Math.abs(num(values.abilityPenalty)), { param: a, type: 'add' })) : []),
    ].filter(Boolean)
    const damage = text(values.damage)
    const saveAbility = values.saveAbility
    const failEffect = text(values.failEffect)
    if (!changes.length && !values.condition && !damage && !values.failCondition && !failEffect) throw new Error('Give the aura an effect inside, damage, or both.')
    if ((values.failCondition || failEffect) && !saveAbility) throw new Error('Something on a failed save needs a save.')
    const main = { ...emptyActivity('utility'), durationMinutes: text(values.minutes) || '1' }
    const activities = [main]
    const effects = []
    const rules = []
    if (changes.length || values.condition || text(values.effectName)) {
      const inside = { ...emptyEffect(), aura: true, name: text(values.effectName), changes, statuses: values.condition ? [values.condition] : [] }
      effects.push(inside)
      rules.push({ trigger: 'entry', action: 'applyEffect', target: inside.key }, { trigger: 'exit', action: 'removeEffect', target: inside.key })
    }
    if (damage || values.failCondition || failEffect) {
      const types = values.damageType ? [values.damageType] : []
      const parts = [{ formula: damage, types: damage ? types : [] }]
      const hurt = saveAbility
        ? { ...emptyActivity('save'), name: 'Aura', saveAbility, dc: text(values.dc) || '10', onSave: damage ? values.onSave || 'half' : 'none', damage: parts }
        : { ...emptyActivity('damage'), name: 'Aura', damage: parts }
      activities.push({ ...hurt, targetType: 'creature', targetCount: '1', activation: 'special' })
      rules.push({ trigger: 'entry', action: 'useActivity', target: hurt.key }, { trigger: 'turnStart', action: 'useActivity', target: hurt.key })
      if (values.failCondition || failEffect) {
        effects.push({
          ...emptyEffect(),
          name: failEffect || cap(values.failCondition),
          statuses: values.failCondition ? [values.failCondition] : [],
          specialDuration: ['turnStart'],
          appliedBy: [hurt.key],
        })
      }
    }
    main.aura = { radius: String(num(values.radius) || 10), affects: values.affects || 'enemy', oncePerTurn: true, rules }
    if (values.drain && !damage) throw new Error('Healing for half the damage needs damage.')
    // The drain: a rule on this feature's own damage landing (the aura's roll
    // is used by you, so your hook sees it).
    const behavior = values.drain
      ? {
          ...emptyBehavior('passive'),
          flavor: { ...emptyBehavior('passive').flavor, color: values.cardColor || '' },
          rules: [{ ...emptyBehaviorRule('healSelf'), event: 'dealt', label: 'Drain', flavor: text(values.flavor), formula: 'floor(@dealt / 2)', when: 'c.activity?.item?.id === c.item.id' }],
        }
      : null
    return usedFeature(values, activities, { effects, behavior })
  },
}

// ---------------------------------------------------------------------------
// Summons and shapes

const creatureParams = [
  { key: 'uuid', label: 'Creature UUID', kind: 'text', default: '', hint: 'Drag the actor into a Foundry macro or right-click it → Copy UUID. Blank = the player picks from the compendium browser.' },
  { key: 'name', label: 'Creature name', kind: 'text', default: '' },
  { key: 'crMax', label: 'Up to CR (when picking)', kind: 'formula', default: '', hint: 'e.g. 1, or floor(@classes.the-dark-knight.levels / 4).' },
]

const summon = {
  key: 'summon',
  group: 'Summons & shapes',
  label: 'Summon a creature',
  help: 'Places a creature (or several) next to you, on your side, using your attack and save numbers (Shadow Image, a bound spirit). Needs the world setting “Allow Summoning” and the player to have Create Token permission.',
  params: [
    ...costParams('action'),
    ...creatureParams,
    { key: 'count', label: 'How many', kind: 'formula', default: '1', hint: 'With “spend more”: 1 + @scaling.increase for one more per extra point.' },
    { key: 'minutes', label: 'Lasts (minutes)', kind: 'number', default: '1', hint: 'midi removes it at the end if “auto remove summoned creatures” is on.' },
  ],
  build(values) {
    if (!text(values.uuid) && !text(values.crMax)) throw new Error('Give the creature’s UUID, or the highest CR the player can pick.')
    const roll = { ...emptyActivity('summon'), creatureUuid: text(values.uuid), creatureName: text(values.name), crMax: text(values.crMax), creatureCount: text(values.count) || '1', durationMinutes: text(values.minutes) }
    return usedFeature(values, [roll])
  },
}

const transform = {
  key: 'transform',
  group: 'Summons & shapes',
  label: 'Transform into a creature',
  help: 'Turns your token into another creature: become it fully, Wild Shape style, or keep your own mind, class features and hit points (a Dark Knight’s shadow form). Revert from the sheet. Needs the world setting “Allow Polymorphing”.',
  params: [
    ...costParams('action'),
    ...creatureParams,
    { key: 'preset', label: 'Keeps', kind: 'select', default: 'custom', options: [['polymorph', 'Nothing (become the creature)'], ['wildshape', 'Mind (Wild Shape)'], ['custom', 'Mind, class, features, hit points'], ['polymorphSelf', 'Everything: appearance only']] },
    { key: 'minutes', label: 'Lasts (minutes)', kind: 'number', default: '10', hint: 'midi reverts it at the end if “auto undo transformations” is on.' },
  ],
  build(values) {
    if (!text(values.uuid) && !text(values.crMax)) throw new Error('Give the creature’s UUID, or the highest CR the player can pick.')
    const roll = { ...emptyActivity('transform'), targetType: 'self', creatureUuid: text(values.uuid), creatureName: text(values.name), crMax: text(values.crMax), transformPreset: values.preset || 'custom', durationMinutes: text(values.minutes) }
    return usedFeature(values, [roll])
  },
}

export const AUTOMATION_TEMPLATES = [
  defenses,
  passiveBonus,
  turnReminder,
  resourcePool,
  costReduction,
  attack,
  saveOrSuffer,
  heal,
  selfBuff,
  bonusDamage,
  mark,
  bond,
  teleport,
  missiles,
  sacrifice,
  weaponWave,
  utility,
  reaction,
  takeHit,
  onHitDamage,
  onHitBenefit,
  stance,
  lingering,
  aura,
  summon,
  transform,
].map((t) => ({ ...t, kind: 'type' }))
  .concat(FEATURE_TEMPLATES.map((t) => ({ ...t, kind: 'example', group: 'Finished examples', params: [], build: () => t.build() })))

// Picker order: these groups, then the examples.
export const TEMPLATE_GROUPS = ['Always on', 'Resources', 'Things you use', 'Reactions', 'When you attack', 'Stances', 'Over time', 'Auras', 'Summons & shapes', 'Finished examples']

export function findTemplate(key) {
  return AUTOMATION_TEMPLATES.find((t) => t.key === key) ?? null
}

export function templateDefaults(template) {
  return Object.fromEntries((template?.params ?? []).map((p) => [p.key, p.default ?? (PARAM_OPTIONS[p.kind] ? [] : '')]))
}

// { spec } or { error } - for the picker, which shows the error instead of creating.
export function buildFromTemplate(template, values) {
  try {
    return { spec: template.build({ ...templateDefaults(template), ...(values ?? {}) }) }
  } catch (err) {
    return { error: err.message }
  }
}
