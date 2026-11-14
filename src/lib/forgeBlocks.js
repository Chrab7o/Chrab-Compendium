// Building blocks: a feature as "how it's used" plus a list of small blocks,
// each one job (an attack, a condition it applies, a drain when it lands…).
// docs/forge-overhaul.md, Phase 2b, in the lab.
//
// A feature built from blocks is saved as
//   spec.source = { use, blocks: [{ id, block, settings }], fingerprint }
// and rebuilt from that when the pack is published (rebuildFromSource), like a
// single template (lib/forgeSource.js).
//
// use: { activation, uses, usesMax, usesRecovery, pool, poolCost, poolExtra, slot }
//   what the feature takes, its limited uses, the resource or spell slot it
//   spends. It goes to the first block that is used (has "Takes" settings).
//   Every later used block becomes a second button: no action, no cost.
//
// Most blocks are the automation templates with their "how it's used"
// settings taken out; a few small ones exist only as blocks (another roll,
// applies a condition, drain, custom). Blocks name each other by id ("from":
// the block whose roll applies this effect).
//
// Merging, in block order: rolls and effects are joined; behavior rules join
// one behavior (a stance's toggle wins, else the first); the item's uses and
// resource identifier come from the first block that has them. With rolls from
// more than one block, a block's target effects that name no roll are tied to
// that block's own first roll, so the other rolls don't apply them.
import { emptyActivity, emptyEffect, emptySpend, randomId } from './foundryActorBuilder.js'
import { AUTOMATION_TEMPLATES, buildFromTemplate, findTemplate, PARAM_OPTIONS } from './automationTemplates.js'
import { emptyFeatureSpec } from './foundryFeatures.js'
import { carryKeys, followsTemplate, specFingerprint } from './forgeSource.js'

const text = (v) => String(v ?? '').trim()
const list = (v) => (Array.isArray(v) ? v.filter(Boolean) : [])

// The "how it's used" settings every used template has (costParams).
const USE_KEYS = ['activation', 'uses', 'pool', 'poolCost', 'poolExtra']
const USES = { 'prof-lr': ['@prof', 'lr'], '1-lr': ['1', 'lr'], '1-sr': ['1', 'sr'] }

export const USE_PARAMS = [
  { key: 'activation', label: 'Takes', kind: 'select', default: 'action', options: [['action', 'Action'], ['bonus', 'Bonus action'], ['reaction', 'Reaction'], ['special', 'No action / special']] },
  { key: 'uses', label: 'Limited uses', kind: 'select', default: '', options: [['', 'Unlimited'], ['prof-lr', 'Proficiency bonus per long rest'], ['1-lr', 'Once per long rest'], ['1-sr', 'Once per short rest'], ['custom', 'Other (a formula)']] },
  { key: 'usesMax', label: 'Uses (formula)', kind: 'formula', default: '', hint: 'With “Other”: e.g. @abilities.int.mod.' },
  { key: 'usesRecovery', label: 'Uses come back on', kind: 'select', default: 'lr', options: [['lr', 'Long rest'], ['sr', 'Short rest'], ['day', 'Each day']] },
  { key: 'pool', label: 'Spends from a resource', kind: 'text', default: '', hint: 'The resource’s identifier, e.g. darkness. Blank = spends nothing.' },
  { key: 'poolCost', label: 'Amount spent', kind: 'number', default: '1' },
  { key: 'poolExtra', label: 'Can spend more: +1 die each', kind: 'checkbox', default: false },
  { key: 'slot', label: 'Spends a spell slot of level', kind: 'select', default: '', options: [['', 'No spell slot'], ...Array.from({ length: 9 }, (_, i) => [String(i + 1), `Level ${i + 1}`])] },
]
export const useDefaults = () => Object.fromEntries(USE_PARAMS.map((p) => [p.key, p.default]))

// Picker groups, by the question each answers.
export const BLOCK_GROUPS = [
  { key: 'roll', label: 'When you use it, roll…' },
  { key: 'applies', label: 'It applies…' },
  { key: 'always', label: 'Always true' },
  { key: 'when', label: 'When something happens…' },
  { key: 'custom', label: 'Custom' },
]
const GROUP_OF = {
  attack: 'roll', saveOrSuffer: 'roll', heal: 'roll', bonusDamage: 'roll', utility: 'roll', teleport: 'roll', launch: 'roll', missiles: 'roll',
  sacrifice: 'roll', weaponWave: 'roll', summon: 'roll', transform: 'roll',
  selfBuff: 'applies', mark: 'applies', lingering: 'applies', zone: 'applies', aura: 'applies', bond: 'applies',
  defenses: 'always', passiveBonus: 'always', resourcePool: 'always', costReduction: 'always', turnReminder: 'always',
  onHitDamage: 'when', onHitBenefit: 'when', reaction: 'when', takeHit: 'when', stance: 'when',
}

// A roll block's own name for its roll ("Drain", "Raise undead").
const ROLL_NAME = { key: 'rollName', label: 'Name of the roll', kind: 'text', default: '', hint: 'Shown on the sheet’s button when the feature has more than one roll. Blank = the template’s.' }

// "From": a block whose roll this one hangs off. The editor lists the
// feature's roll blocks; blank = the first one.
const FROM = { key: 'from', label: 'Applied by', kind: 'block', default: '', hint: 'Which roll lands it. Blank = the feature’s first roll.' }

// Blocks that exist only as blocks.
const OWN_BLOCKS = [
  {
    key: 'extraRoll',
    group: 'roll',
    label: 'Another roll',
    help: 'A second button on the same feature, with no cost of its own: a follow-up hit (“Pull again”), a command (“Bow down”). Give it what it rolls, if anything.',
    params: [
      { ...ROLL_NAME, label: 'Name', default: 'Another roll' },
      { key: 'kind', label: 'Rolls', kind: 'select', default: 'utility', options: [['utility', 'Nothing (a button)'], ['damage', 'Damage'], ['heal', 'Healing']] },
      { key: 'target', label: 'Targets', kind: 'select', default: 'creature', options: [['creature', 'One creature'], ['creatures', 'Any number of creatures'], ['self', 'Yourself']] },
      { key: 'range', label: 'Range (ft)', kind: 'number', default: '' },
      { key: 'formula', label: 'Amount', kind: 'formula', default: '' },
      { key: 'damageType', label: 'Damage type', kind: 'select', default: '', options: [['', '(no type)'], ...PARAM_OPTIONS.damageTypes] },
    ],
    build(v) {
      const kind = v.kind || 'utility'
      const roll = { ...emptyActivity(kind), name: text(v.rollName) || 'Another roll', activation: 'special' }
      if (v.target === 'self') roll.targetType = 'self'
      else Object.assign(roll, { targetType: 'creature', targetCount: v.target === 'creatures' ? '' : '1' })
      if (text(v.range)) roll.range = text(v.range)
      if (kind === 'damage') roll.damage = [{ formula: text(v.formula), types: v.damageType ? [v.damageType] : [] }]
      if (kind === 'heal' && text(v.formula)) roll.healing = { formula: text(v.formula), type: 'healing' }
      return { item: { activities: [roll], effects: [] } }
    },
  },
  {
    key: 'condition',
    group: 'applies',
    label: 'A condition or named effect',
    help: 'Put on the creatures a roll lands on: a condition, several, or just a name to track (“Soul Chained”). Can end when the creature takes damage.',
    params: [
      { key: 'name', label: 'Effect name', kind: 'text', default: '' },
      { key: 'statuses', label: 'Conditions', kind: 'conditions' },
      { key: 'endsOnDamage', label: 'Ends when it takes damage', kind: 'checkbox', default: false },
      FROM,
    ],
    build(v, ctx) {
      const statuses = list(v.statuses)
      const name = text(v.name) || statuses.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(', ')
      if (!name) throw new Error('Give the effect a name or a condition.')
      const effect = { ...emptyEffect(), name, appliedBy: [ctx.rollOf(v.from)].filter(Boolean) }
      if (statuses.length) effect.statuses = statuses
      if (v.endsOnDamage) effect.specialDuration = ['isDamaged']
      return { item: { activities: [], effects: [effect] } }
    },
  },
  {
    key: 'drain',
    group: 'when',
    label: 'Drain: heal from the damage this feature deals',
    help: 'When this feature’s damage lands, you heal what it dealt; past your maximum, the rest is temporary hit points, up to half your maximum.',
    params: [
      { key: 'label', label: 'Name on the chat card', kind: 'text', default: '' },
      { key: 'cardColor', label: 'Card color', kind: 'text', default: '', hint: 'e.g. necrotic. Blank = the default.' },
    ],
    build(v, ctx) {
      // A behavior shaped like every template rule's (onHitBenefit's), with
      // the two drain rules. The temp HP rule runs first, while the hit points
      // it measures from are still the ones before the heal.
      const base = buildFromTemplate(findTemplate('onHitBenefit'), { formula: '1' }).spec.item.behavior
      const rule = (o) => ({ ...base.rules[0], key: randomId(), flavor: '', ...o })
      const own = 'c.activity?.item?.id === c.item.id'
      const missing = '(@attributes.hp.max - @attributes.hp.value)'
      const hp = 'c.actor.system.attributes.hp'
      const label = text(v.label) || ctx.featureName || 'Drain'
      const rules = [
        rule({ outcome: 'tempHpSelf', event: 'dealt', label: `${label}: overflow`, formula: `min(floor(@attributes.hp.max / 2), @dealt - ${missing})`, when: `${own} && c.dealt > ${hp}.max - ${hp}.value` }),
        rule({ outcome: 'healSelf', event: 'dealt', label, formula: `min(@dealt, ${missing})`, when: `${own} && ${hp}.value < ${hp}.max` }),
      ]
      const behavior = { ...base, rules, flavor: { ...base.flavor, ...(text(v.cardColor) ? { color: text(v.cardColor) } : {}) } }
      return { item: { activities: [], effects: [], behavior } }
    },
  },
  {
    key: 'custom',
    group: 'custom',
    label: 'Custom',
    help: 'Anything no block covers, built by hand: its rolls, effects and reactions. The other blocks keep following their templates.',
    params: [],
    build(v) {
      const part = v.part ?? {}
      return { item: { activities: part.activities ?? [], effects: part.effects ?? [], behavior: part.rules?.length ? { mode: 'passive', rules: part.rules } : null } }
    },
  },
]

const costed = (template) => template.params.some((p) => p.key === 'activation')

// Every block: the type templates (cost settings taken out; roll blocks get a
// roll name), then the blocks of their own.
export const BLOCKS = [
  ...AUTOMATION_TEMPLATES.filter((t) => t.kind === 'type').map((t) => {
    const used = costed(t)
    const params = used ? t.params.filter((p) => !USE_KEYS.includes(p.key)) : t.params
    return { key: t.key, group: GROUP_OF[t.key] ?? 'roll', label: t.label, help: t.help, used, params: used ? [ROLL_NAME, ...params] : params, template: t }
  }),
  ...OWN_BLOCKS.map((b) => ({ ...b, used: false })),
]
export const findBlock = (key) => BLOCKS.find((b) => b.key === key) ?? null
export const blockDefaults = (block) => Object.fromEntries((block?.params ?? []).map((p) => [p.key, p.default ?? (PARAM_OPTIONS[p.kind] ? [] : '')]))

let counter = 0
export const newBlockId = () => `b${Date.now().toString(36)}${(counter++).toString(36)}`

// One block -> { item: { activities, effects, behavior?, … } }.
function buildBlock(entry, ctx, use, first) {
  const block = findBlock(entry.block)
  if (!block) throw new Error(`No block called “${entry.block}”.`)
  const settings = { ...blockDefaults(block), ...entry.settings }
  if (!block.template) return block.build(settings, ctx)
  // The used block that comes first takes the feature's use; later ones are
  // second buttons.
  const cost = !block.used ? {} : first ? { activation: use.activation, uses: USES[use.uses] ? use.uses : '', pool: use.pool, poolCost: use.poolCost, poolExtra: use.poolExtra } : { activation: 'special', uses: '', pool: '', poolCost: '1', poolExtra: false }
  const { spec, error } = buildFromTemplate(block.template, { ...settings, ...cost })
  if (error) throw new Error(`${block.label}: ${error}`)
  const item = spec.item
  if (block.used && text(settings.rollName) && item.activities[0]) item.activities[0] = { ...item.activities[0], name: text(settings.rollName) }
  return { item, section: spec.item.section }
}

function mergeBehaviors(behaviors) {
  const real = behaviors.filter(Boolean)
  if (!real.length) return null
  const base = real.find((b) => b.mode === 'toggle' && b.key) ?? real.find((b) => b.key) ?? real[0]
  return { ...base, rules: real.flatMap((b) => b.rules ?? []) }
}

// { use, blocks } -> a Feature Forge spec with its source, or throws with what's missing.
export function buildFeatureFromBlocks({ use = {}, blocks = [] }, { featureName = '' } = {}) {
  if (!blocks.length) throw new Error('Add at least one block.')
  const fullUse = { ...useDefaults(), ...use }
  // Pass 1: the rolls each block makes, so later blocks can name them ("from").
  const built = []
  const rollsOf = new Map()
  const firstUsed = blocks.findIndex((b) => findBlock(b.block)?.used)
  const ctx = {
    featureName,
    rollOf: (id) => {
      const target = id ? rollsOf.get(id) : [...rollsOf.values()].find((keys) => keys.length)
      return target?.[0] ?? ''
    },
  }
  blocks.forEach((entry, i) => {
    const out = buildBlock(entry, ctx, fullUse, i === firstUsed)
    rollsOf.set(entry.id, (out.item.activities ?? []).map((a) => a.key))
    built.push(out)
  })

  const rollBlocks = built.filter((b) => b.item.activities?.length).length
  const base = built[firstUsed === -1 ? 0 : firstUsed]
  const item = { ...built[0].item, ...base.item }
  item.activities = built.flatMap((b) => b.item.activities ?? [])
  item.effects = built.flatMap((b) => {
    const effects = b.item.effects ?? []
    const own = b.item.activities?.[0]?.key
    if (rollBlocks < 2 || !own) return effects
    return effects.map((e) => (!e.appliedBy?.length && !e.passive && !e.stance && !e.aura && !e.byRule && !e.bond ? { ...e, appliedBy: [own] } : e))
  })
  item.behavior = mergeBehaviors(built.map((b) => b.item.behavior))
  for (const field of ['usesMax', 'usesRecovery', 'identifier']) item[field] = built.map((b) => b.item[field]).find((v) => text(v)) ?? item[field] ?? ''
  if (fullUse.uses === 'custom' && text(fullUse.usesMax)) Object.assign(item, { usesMax: text(fullUse.usesMax), usesRecovery: fullUse.usesRecovery || 'lr' })
  // A spell slot: the first roll spends it, after any resource.
  if (fullUse.slot && item.activities[0]) {
    const slot = { ...emptySpend(), source: 'attribute', target: `spells.spell${fullUse.slot}.value`, amount: '1' }
    item.activities[0] = { ...item.activities[0], spend: [...(item.activities[0].spend ?? []), slot] }
  }
  const shape = emptyFeatureSpec('feat')
  const out = { ...shape, item: { ...shape.item, ...item } }
  return { ...out, source: { use: fullUse, blocks: structuredClone(blocks), fingerprint: specFingerprint(out) } }
}

// A source -> a fresh spec, or { error }.
function buildSource(source, featureName) {
  try {
    if (source?.blocks) return { spec: buildFeatureFromBlocks(source, { featureName }) }
    const template = findTemplate(source?.template)
    if (!template) return { error: 'gone' }
    return buildFromTemplate(template, source.settings)
  } catch (err) {
    return { error: err.message }
  }
}

// A stored spec rebuilt from its source (a template, or blocks), when it still
// follows it (not edited by hand since). Otherwise, or if a template is gone or
// now refuses the settings, the stored spec as it is. Keeps the stored spec's
// words and keys (so Foundry ids don't change); `seed` (the draft id) gives
// any new parts the same ids every time.
export function rebuildFromSource(stored, seed = '') {
  if (!followsTemplate(stored)) return stored
  const { spec: fresh, error } = buildSource(stored.source, stored.item?.name ?? '')
  if (error) return stored
  const { source, ...built } = carryKeys(fresh, stored, seed)
  const item = { ...built.item, name: stored.item?.name ?? '', description: stored.item?.description ?? '' }
  if (item.behavior && stored.item?.behavior?.levelClass) item.behavior = { ...item.behavior, levelClass: stored.item.behavior.levelClass }
  const spec = { ...built, featType: stored.featType ?? built.featType, requirements: stored.requirements ?? '', item }
  if (stored.sandboxPush) spec.sandboxPush = stored.sandboxPush
  return { ...spec, source: { ...source, fingerprint: specFingerprint(spec) } }
}
