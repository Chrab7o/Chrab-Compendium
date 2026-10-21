// Pure builder for the NPC Forge: turns the editor's NPC spec (the same
// object stored whole in npc_drafts.spec) into a Foundry VTT actor document
// for dnd5e 5.3.3 on Foundry 14. The reverse of lib/foundryCharacter.js,
// which reads actor JSON for the character sheet.
//
// Output is "source" data - only the fields that mean something. Foundry's
// own DataModels fill every default on import (including the large blocks
// modules like midi-qol register on each activity), so the builder never
// copies module flag shapes that would go stale when those modules update.
// The shapes it does write were taken from real exports out of the
// eclipse-of-the-burning-sun world (a Plutonium-imported Kraken).
//
// NPCs are always GM-only: ownership { default: 0 } on the actor and every
// item, unlinked tokens, names and bars hidden from non-owners.

export const CORE_VERSION = '14.368'
export const SYSTEM_ID = 'dnd5e'
export const SYSTEM_VERSION = '5.3.3'

const STATS = { coreVersion: CORE_VERSION, systemId: SYSTEM_ID, systemVersion: SYSTEM_VERSION }

export const NPC_ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha']

export const NPC_SIZES = [
  { key: 'tiny', label: 'Tiny', grid: 0.5 },
  { key: 'sm', label: 'Small', grid: 1 },
  { key: 'med', label: 'Medium', grid: 1 },
  { key: 'lg', label: 'Large', grid: 2 },
  { key: 'huge', label: 'Huge', grid: 3 },
  { key: 'grg', label: 'Gargantuan', grid: 4 },
]

// dnd5e skill key -> label + governing ability
export const NPC_SKILLS = {
  acr: { label: 'Acrobatics', ability: 'dex' },
  ani: { label: 'Animal Handling', ability: 'wis' },
  arc: { label: 'Arcana', ability: 'int' },
  ath: { label: 'Athletics', ability: 'str' },
  dec: { label: 'Deception', ability: 'cha' },
  his: { label: 'History', ability: 'int' },
  ins: { label: 'Insight', ability: 'wis' },
  itm: { label: 'Intimidation', ability: 'cha' },
  inv: { label: 'Investigation', ability: 'int' },
  med: { label: 'Medicine', ability: 'wis' },
  nat: { label: 'Nature', ability: 'int' },
  prc: { label: 'Perception', ability: 'wis' },
  prf: { label: 'Performance', ability: 'cha' },
  per: { label: 'Persuasion', ability: 'cha' },
  rel: { label: 'Religion', ability: 'int' },
  slt: { label: 'Sleight of Hand', ability: 'dex' },
  ste: { label: 'Stealth', ability: 'dex' },
  sur: { label: 'Survival', ability: 'wis' },
}

export const DAMAGE_TYPES = [
  'acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic', 'piercing',
  'poison', 'psychic', 'radiant', 'slashing', 'thunder',
]

export const CONDITIONS = [
  'blinded', 'charmed', 'deafened', 'diseased', 'exhaustion', 'frightened', 'grappled',
  'incapacitated', 'invisible', 'paralyzed', 'petrified', 'poisoned', 'prone',
  'restrained', 'stunned', 'unconscious',
]

// Language label (as LANGUAGE_OPTIONS in lib/homebrew.js spells them) -> dnd5e key.
// Anything not listed here goes into the free-text "custom" field instead.
export const LANGUAGE_KEYS = {
  Common: 'common', Dwarvish: 'dwarvish', Elvish: 'elvish', Giant: 'giant', Gnomish: 'gnomish',
  Goblin: 'goblin', Halfling: 'halfling', Orc: 'orc', Abyssal: 'abyssal', Celestial: 'celestial',
  Draconic: 'draconic', 'Deep Speech': 'deep', Infernal: 'infernal', Primordial: 'primordial',
  Sylvan: 'sylvan', Undercommon: 'undercommon', Druidic: 'druidic', "Thieves' Cant": 'cant',
}

// Where an item sits in the statblock decides how it's activated in Foundry.
export const ITEM_SECTIONS = [
  { key: 'trait', label: 'Traits', activation: 'special' },
  { key: 'action', label: 'Actions', activation: 'action' },
  { key: 'bonus', label: 'Bonus Actions', activation: 'bonus' },
  { key: 'reaction', label: 'Reactions', activation: 'reaction' },
  { key: 'legendary', label: 'Legendary Actions', activation: 'legendary' },
  { key: 'lair', label: 'Lair Actions', activation: 'lair' },
]

export const ACTIVITY_KINDS = [
  { key: 'attack', label: 'Attack roll' },
  { key: 'save', label: 'Saving throw' },
  { key: 'damage', label: 'Damage (no roll)' },
  { key: 'heal', label: 'Healing' },
  { key: 'utility', label: 'Utility' },
]

export const AREA_TYPES = ['radius', 'sphere', 'cylinder', 'cone', 'line', 'cube', 'square', 'wall']

// Senses that also give the token a detection mode, so it sees what it should.
const SENSE_DETECTION = { truesight: 'seeAll', blindsight: 'blindsight', tremorsense: 'feelTremor' }

// CONST.TOKEN_DISPOSITIONS
export const DISPOSITIONS = { secret: -2, hostile: -1, neutral: 0, friendly: 1 }
// CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER / OWNER - players are never owners of
// an NPC, so they see neither its name plate nor its HP bar.
const DISPLAY_OWNER_HOVER = 20
const DISPLAY_OWNER = 40

const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

// Foundry document ids are 16 alphanumeric characters. The editor mints one
// per item/activity/effect and keeps it in the spec, so re-exporting the same
// draft produces the same ids - Phase 2's sync relies on that to update an
// actor in place instead of duplicating its items.
export function randomId() {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => ID_CHARS[b % ID_CHARS.length]).join('')
}

function isFoundryId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9]{16}$/.test(value)
}

function idFor(thing) {
  return isFoundryId(thing?.key) ? thing.key : randomId()
}

export function abilityMod(score) {
  return Math.floor(((Number(score) || 10) - 10) / 2)
}

export function proficiencyForCr(cr) {
  const n = Number(cr) || 0
  if (n < 5) return 2
  return Math.min(9, 2 + Math.ceil((n - 4) / 4))
}

export function crLabel(cr) {
  const n = Number(cr)
  if (n === 0.125) return '1/8'
  if (n === 0.25) return '1/4'
  if (n === 0.5) return '1/2'
  return String(n)
}

export const CR_OPTIONS = [0, 0.125, 0.25, 0.5, ...Array.from({ length: 30 }, (_, i) => i + 1)]

// "26d20 + 208" -> 481. Dice average rounds down per standard statblocks.
export function averageFormula(formula, data = {}) {
  if (!formula) return 0
  const expr = String(formula).replace(/@(\w+)/g, (_, key) => String(data[key] ?? 0))
  let total = 0
  const terms = expr.replace(/\s+/g, '').match(/[+-]?[^+-]+/g) ?? []
  for (const term of terms) {
    const sign = term.startsWith('-') ? -1 : 1
    const body = term.replace(/^[+-]/, '')
    const dice = body.match(/^(\d*)d(\d+)$/i)
    if (dice) total += sign * (Number(dice[1] || 1) * (Number(dice[2]) + 1)) / 2
    else if (/^\d+(\.\d+)?$/.test(body)) total += sign * Number(body)
  }
  return Math.floor(total)
}

// One damage row from the editor ({ formula: "4d6 + @mod", types: ["bludgeoning"] })
// -> a dnd5e DamageData part. A single leading die term maps onto the
// number/denomination fields so the sheet can scale it; anything fancier
// ("2d8 + 1d6") falls back to a custom formula, which dnd5e also accepts.
export function damagePart(row) {
  const formula = String(row?.formula ?? '').trim()
  const types = (row?.types ?? []).filter((t) => DAMAGE_TYPES.includes(t) || t === 'healing' || t === 'temphp')
  const base = { types, scaling: { mode: '', number: 1 }, custom: { enabled: false } }
  const match = formula.match(/^(\d+)\s*d\s*(\d+)\s*(?:([+-])\s*(.+))?$/i)
  if (match && !/d\d/i.test(match[4] ?? '')) {
    const bonus = match[4] ? `${match[3] === '-' ? '-' : ''}${match[4].trim()}` : ''
    return { ...base, number: Number(match[1]), denomination: Number(match[2]), bonus }
  }
  if (/^[+-]?\d+$/.test(formula)) return { ...base, number: null, denomination: null, bonus: formula }
  return { ...base, number: null, denomination: null, bonus: '', custom: { enabled: true, formula } }
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Plain text from the editor -> HTML paragraphs. Text that already looks like
// HTML (pasted from another export) passes through untouched.
export function textToHtml(text) {
  const value = String(text ?? '').trim()
  if (!value) return ''
  if (value.startsWith('<')) return value
  return value
    .split(/\n\s*\n/)
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

// ---------------------------------------------------------------------------
// Empty shapes for the editor

export function emptyActivity(kind = 'attack') {
  return {
    key: randomId(),
    kind,
    // attack
    attackType: 'melee',
    classification: 'weapon',
    ability: '', // '' = Foundry picks (str for melee, dex for ranged / finesse)
    toHit: '', // blank = ability mod + proficiency; a number = flat bonus
    reach: 5,
    range: null,
    longRange: null,
    // save
    saveAbility: 'dex',
    dc: '',
    dcAbility: '', // set to compute DC as 8 + prof + that ability's mod
    onSave: 'half',
    // shared
    damage: [{ formula: '', types: [] }],
    healing: '',
    targetCount: '',
    targetType: 'creature',
    areaType: '',
    areaSize: '',
  }
}

export function emptyEffect() {
  return { key: randomId(), name: '', statuses: [], passive: false, onSave: false, specialDuration: [] }
}

export function emptyNpcItem(section = 'action') {
  return {
    key: randomId(),
    name: '',
    section,
    itemType: 'feat', // 'weapon' for natural weapons/attacks that should show as one on the sheet
    description: '',
    img: '',
    legendaryCost: 1,
    usesMax: '',
    usesRecovery: '', // '' | 'lr' | 'sr' | 'day' | 'recharge'
    rechargeOn: 5,
    activities: section === 'trait' ? [] : [emptyActivity('attack')],
    effects: [],
  }
}

export const emptyNpcSpec = () => ({
  name: '',
  img: '',
  cr: 1,
  size: 'med',
  creatureType: 'humanoid',
  subtype: '',
  alignment: '',
  abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
  saves: [],
  skills: {}, // { prc: 1, ste: 2 } - 1 proficient, 2 expertise
  ac: 10,
  naturalArmor: false,
  hpFormula: '',
  hpMax: '',
  initiative: '', // total initiative modifier, as 2024 statblocks print it
  speed: { walk: 30, fly: null, swim: null, climb: null, burrow: null, hover: false },
  senses: { darkvision: null, blindsight: null, tremorsense: null, truesight: null, special: '' },
  resistances: [],
  immunities: [],
  vulnerabilities: [],
  conditionImmunities: [],
  languages: [],
  languagesCustom: '',
  legendaryActions: 0,
  legendaryResistances: 0,
  lair: false,
  biography: '',
  token: { img: '', disposition: 'hostile', appendNumber: true, scale: 1 },
  items: [],
})

// ---------------------------------------------------------------------------
// Derived numbers the preview and the builder both use

export function npcRollData(spec) {
  const data = { prof: proficiencyForCr(spec.cr) }
  for (const a of NPC_ABILITIES) data[a] = abilityMod(spec.abilities?.[a])
  return data
}

export function npcMaxHp(spec) {
  const explicit = Number(spec.hpMax)
  if (spec.hpMax !== '' && spec.hpMax != null && Number.isFinite(explicit)) return explicit
  return averageFormula(spec.hpFormula) || 1
}

function attackAbility(activity) {
  if (activity.ability) return activity.ability
  return activity.attackType === 'ranged' ? 'dex' : 'str'
}

export function attackToHit(spec, activity) {
  if (activity.toHit !== '' && activity.toHit != null) return Number(activity.toHit)
  const data = npcRollData(spec)
  return data[attackAbility(activity)] + data.prof
}

export function saveDc(spec, activity) {
  if (activity.dcAbility) {
    const data = npcRollData(spec)
    return 8 + data.prof + data[activity.dcAbility]
  }
  return Number(activity.dc) || 10
}

// ---------------------------------------------------------------------------
// Activities

function activationFor(item) {
  const section = ITEM_SECTIONS.find((s) => s.key === item.section) ?? ITEM_SECTIONS[1]
  const activation = { type: section.activation, value: 1, override: false }
  if (section.activation === 'legendary') activation.value = Number(item.legendaryCost) || 1
  if (section.activation === 'special') delete activation.value
  return activation
}

function consumptionFor(item) {
  const targets = []
  if (item.section === 'legendary') {
    targets.push({ type: 'attribute', target: 'resources.legact.value', value: String(Number(item.legendaryCost) || 1), scaling: {} })
  }
  if (item.usesRecovery || item.usesMax) {
    targets.push({ type: 'itemUses', target: '', value: '1', scaling: {} })
  }
  return { scaling: { allowed: false }, spellSlot: true, targets }
}

function targetFor(activity) {
  const template = { contiguous: false, stationary: false, units: 'ft', count: '', type: '', size: '', width: '', height: '' }
  if (activity.areaType) {
    template.type = activity.areaType
    template.size = String(activity.areaSize ?? '')
  }
  return {
    prompt: true,
    override: false,
    template,
    affects: {
      count: activity.targetCount === '' || activity.targetCount == null ? '' : String(activity.targetCount),
      type: activity.targetType ?? 'creature',
      choice: false,
      special: '',
    },
  }
}

function rangeFor(activity) {
  if (activity.kind === 'attack') return { units: 'self', override: false }
  if (activity.range) return { value: String(activity.range), units: 'ft', override: true }
  return { units: 'self', override: false }
}

function damageParts(rows) {
  return (rows ?? []).filter((r) => String(r.formula ?? '').trim() !== '').map(damagePart)
}

function buildActivity(item, activity, effectRefs, index) {
  const _id = idFor(activity)
  const common = {
    _id,
    type: activity.kind,
    name: '',
    sort: index * 100000,
    activation: activationFor(item),
    consumption: consumptionFor(item),
    duration: { units: 'inst', concentration: false, override: false },
    range: rangeFor(activity),
    target: targetFor(activity),
    uses: { spent: 0, recovery: [] },
    effects: effectRefs,
  }

  switch (activity.kind) {
    case 'attack': {
      // A flat to-hit replaces the whole bonus, but the ability still matters:
      // it's what @mod in the damage formula resolves to.
      const flat = activity.toHit !== '' && activity.toHit != null
      return {
        ...common,
        attack: {
          flat,
          type: { value: activity.attackType === 'ranged' ? 'ranged' : 'melee', classification: activity.classification || 'weapon' },
          ability: attackAbility(activity),
          bonus: flat ? String(activity.toHit) : '',
          critical: {},
        },
        damage: { parts: damageParts(activity.damage), critical: {}, includeBase: true },
      }
    }
    case 'save':
      return {
        ...common,
        save: {
          ability: [activity.saveAbility || 'dex'],
          dc: activity.dcAbility
            ? { calculation: activity.dcAbility, formula: '' }
            : { calculation: '', formula: String(Number(activity.dc) || 10) },
        },
        damage: { onSave: activity.onSave || 'half', parts: damageParts(activity.damage), critical: { allow: false } },
        effects: effectRefs.map((ref) => ({ ...ref, onSave: false })),
      }
    case 'damage':
      return { ...common, damage: { parts: damageParts(activity.damage), critical: { allow: false } } }
    case 'heal':
      return { ...common, healing: { ...damagePart({ formula: activity.healing, types: ['healing'] }) } }
    default:
      return { ...common, type: 'utility', roll: { prompt: false, visible: false } }
  }
}

// ---------------------------------------------------------------------------
// Statblock text, used for blank descriptions and by the editor's preview

function signed(n) {
  return n >= 0 ? `+${n}` : String(n)
}

function damageText(spec, activity, rows) {
  const data = npcRollData(spec)
  const ability = activity.kind === 'attack' ? attackAbility(activity) : null
  const rollData = { ...data, mod: ability ? data[ability] : 0 }
  return (rows ?? [])
    .filter((r) => String(r.formula ?? '').trim() !== '')
    .map((r) => {
      const shown = String(r.formula).replace(/@mod/g, String(rollData.mod)).replace(/\s+/g, ' ')
      const avg = averageFormula(r.formula, rollData)
      const types = (r.types ?? []).map((t) => t[0].toUpperCase() + t.slice(1)).join(' or ')
      return `${avg} (${shown})${types ? ` ${types}` : ''} damage`
    })
    .join(' plus ')
}

export function activitySummary(spec, activity) {
  switch (activity.kind) {
    case 'attack': {
      const kind = `${activity.attackType === 'ranged' ? 'Ranged' : 'Melee'} ${activity.classification === 'spell' ? 'Spell ' : ''}Attack Roll`
      const reach =
        activity.attackType === 'ranged'
          ? `range ${activity.range || 30}${activity.longRange ? `/${activity.longRange}` : ''} ft.`
          : `reach ${activity.reach || 5} ft.`
      const hit = damageText(spec, activity, activity.damage)
      return `${kind}: ${signed(attackToHit(spec, activity))}, ${reach}${hit ? ` Hit: ${hit}.` : ''}`
    }
    case 'save': {
      const label = activity.saveAbility?.toUpperCase() ?? 'DEX'
      const area = activity.areaType ? ` ${activity.areaSize || 0}-foot ${activity.areaType}.` : ''
      const dmg = damageText(spec, activity, activity.damage)
      const onSave = activity.onSave === 'half' ? ' Success: Half damage.' : ''
      return `${label} Saving Throw: DC ${saveDc(spec, activity)}.${area}${dmg ? ` Failure: ${dmg}.${onSave}` : ''}`
    }
    case 'damage': {
      const dmg = damageText(spec, activity, activity.damage)
      return dmg ? `${dmg}.` : ''
    }
    case 'heal':
      return activity.healing ? `Regains ${averageFormula(activity.healing, npcRollData(spec))} (${activity.healing}) Hit Points.` : ''
    default:
      return ''
  }
}

export function usesLabel(item) {
  if (item.usesRecovery === 'recharge') return `Recharge ${item.rechargeOn >= 6 ? '6' : `${item.rechargeOn || 5}–6`}`
  if (!item.usesMax) return ''
  const per = { lr: 'Long Rest', sr: 'Short Rest', day: 'Day' }[item.usesRecovery] ?? 'Day'
  return `${item.usesMax}/${per}`
}

// ---------------------------------------------------------------------------
// Items and effects

function buildEffect(effect, item) {
  const flags = {}
  if (effect.specialDuration?.length) flags.dae = { specialDuration: effect.specialDuration }
  return {
    _id: idFor(effect),
    name: effect.name || item.name,
    img: effect.img || item.img || 'icons/svg/aura.svg',
    description: '',
    type: 'base',
    system: { changes: [] },
    statuses: (effect.statuses ?? []).filter((s) => CONDITIONS.includes(s)),
    disabled: false,
    transfer: !!effect.passive,
    duration: { units: 'seconds', value: null, expiry: null, expired: false },
    tint: '#ffffff',
    showIcon: 1,
    flags,
    _stats: { ...STATS },
  }
}

function usesFor(item) {
  if (item.usesRecovery === 'recharge') {
    return { max: '1', spent: 0, recovery: [{ period: 'recharge', formula: String(item.rechargeOn || 5) }] }
  }
  if (item.usesMax) {
    const period = item.usesRecovery || 'day'
    return { max: String(item.usesMax), spent: 0, recovery: [{ period, type: 'recoverAll' }] }
  }
  return { max: '', spent: 0, recovery: [] }
}

function slugIdentifier(name) {
  return String(name ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function defaultImg(item) {
  if (item.img) return item.img
  if (item.section === 'trait') return 'icons/svg/book.svg'
  return item.itemType === 'weapon' ? 'icons/svg/sword.svg' : 'icons/svg/combat.svg'
}

export function buildNpcItem(spec, item, index = 0) {
  const effects = (item.effects ?? []).filter((e) => e.name || e.statuses?.length).map((e) => buildEffect(e, item))
  const effectRefs = effects.filter((e) => !e.transfer).map((e) => ({ _id: e._id, level: {} }))
  const activities = {}
  ;(item.activities ?? []).forEach((activity, i) => {
    const built = buildActivity(item, activity, effectRefs, i)
    activities[built._id] = built
  })

  const generated = (item.activities ?? []).map((a) => activitySummary(spec, a)).filter(Boolean).join(' ')
  const description = textToHtml(item.description) || (generated ? `<p>${escapeHtml(generated)}</p>` : '')

  const isWeapon = item.itemType === 'weapon'
  const firstAttack = (item.activities ?? []).find((a) => a.kind === 'attack')
  const system = {
    description: { value: description, chat: '' },
    source: { custom: 'Chrab Corner', rules: '2024' },
    identifier: slugIdentifier(item.name),
    uses: usesFor(item),
    activities,
    properties: [],
  }
  if (isWeapon) {
    Object.assign(system, {
      type: { value: 'natural', baseItem: '' },
      proficient: 1,
      equipped: true,
      quantity: 1,
      range:
        firstAttack?.attackType === 'ranged'
          ? { value: Number(firstAttack.range) || 30, long: Number(firstAttack.longRange) || null, units: 'ft' }
          : { value: Number(firstAttack?.reach) || 5, long: null, units: 'ft' },
      damage: { base: { types: [], custom: { enabled: false }, scaling: { number: 1 } } },
    })
  } else {
    system.type = { value: 'monster', subtype: '' }
  }

  return {
    _id: idFor(item),
    name: item.name || 'Unnamed',
    type: isWeapon ? 'weapon' : 'feat',
    img: defaultImg(item),
    system,
    effects,
    sort: index * 100000,
    ownership: { default: 0 },
    flags: {},
    _stats: { ...STATS },
  }
}

// Spec can say "4 legendary resistances" without hand-building the trait.
function legendaryResistanceItem(spec) {
  return {
    key: '',
    name: 'Legendary Resistance',
    section: 'trait',
    itemType: 'feat',
    description: `If the ${spec.name || 'creature'} fails a saving throw, it can choose to succeed instead.`,
    activities: [{ ...emptyActivity('utility'), key: '' }],
    effects: [],
    usesMax: '',
    usesRecovery: '',
  }
}

// ---------------------------------------------------------------------------
// The actor

function ranges(values) {
  const out = {}
  for (const [key, value] of Object.entries(values ?? {})) {
    if (value === null || value === '' || value === undefined) continue
    out[key] = Number(value)
  }
  return out
}

function splitLanguages(spec) {
  const value = []
  const custom = []
  for (const lang of spec.languages ?? []) {
    if (LANGUAGE_KEYS[lang]) value.push(LANGUAGE_KEYS[lang])
    else custom.push(lang)
  }
  if (spec.languagesCustom) custom.push(spec.languagesCustom)
  return { value, custom: custom.join('; '), communication: {} }
}

export function buildNpcActor(spec, { draftId = null } = {}) {
  const data = npcRollData(spec)
  const size = NPC_SIZES.find((s) => s.key === spec.size) ?? NPC_SIZES[2]
  const maxHp = npcMaxHp(spec)

  const abilities = {}
  for (const a of NPC_ABILITIES) {
    abilities[a] = { value: Number(spec.abilities?.[a]) || 10, proficient: (spec.saves ?? []).includes(a) ? 1 : 0 }
  }

  const skills = {}
  for (const [key, value] of Object.entries(spec.skills ?? {})) {
    if (!NPC_SKILLS[key] || !value) continue
    skills[key] = { value: Number(value), ability: NPC_SKILLS[key].ability }
  }

  const movement = { units: 'ft', hover: !!spec.speed?.hover }
  for (const key of ['walk', 'fly', 'swim', 'climb', 'burrow']) {
    const v = spec.speed?.[key]
    if (v !== null && v !== '' && v !== undefined) movement[key] = String(v)
  }

  const senseRanges = ranges({
    darkvision: spec.senses?.darkvision,
    blindsight: spec.senses?.blindsight,
    tremorsense: spec.senses?.tremorsense,
    truesight: spec.senses?.truesight,
  })

  const init = { ability: 'dex' }
  if (spec.initiative !== '' && spec.initiative != null) init.bonus = String(Number(spec.initiative) - data.dex)

  const items = (spec.items ?? []).map((item, i) => buildNpcItem(spec, item, i))
  if (Number(spec.legendaryResistances) > 0 && !items.some((i) => i.name === 'Legendary Resistance')) {
    const lr = buildNpcItem(spec, legendaryResistanceItem(spec), items.length)
    for (const activity of Object.values(lr.system.activities)) {
      activity.activation = { type: 'special', override: false }
      activity.consumption.targets = [{ type: 'attribute', target: 'resources.legres.value', value: '1', scaling: {} }]
    }
    items.push(lr)
  }

  const detectionModes = {}
  for (const [sense, mode] of Object.entries(SENSE_DETECTION)) {
    if (senseRanges[sense]) detectionModes[mode] = { range: senseRanges[sense], enabled: true }
  }

  const img = spec.img || 'icons/svg/mystery-man.svg'
  const tokenImg = spec.token?.img || img
  const scale = Number(spec.token?.scale) || 1

  return {
    name: spec.name || 'Unnamed NPC',
    type: 'npc',
    img,
    system: {
      abilities,
      skills,
      attributes: {
        ac: spec.naturalArmor ? { calc: 'natural', flat: Number(spec.ac) || 10 } : { calc: 'flat', flat: Number(spec.ac) || 10 },
        hp: { value: maxHp, max: maxHp, temp: 0, tempmax: 0, formula: spec.hpFormula ?? '' },
        init,
        movement,
        senses: { ranges: senseRanges, units: 'ft', special: spec.senses?.special ?? '' },
      },
      details: {
        cr: Number(spec.cr) || 0,
        alignment: spec.alignment ?? '',
        type: { value: spec.creatureType || 'humanoid', subtype: spec.subtype ?? '' },
        biography: { value: textToHtml(spec.biography), public: '' },
      },
      resources: {
        legact: { max: Number(spec.legendaryActions) || 0, spent: 0 },
        legres: { max: Number(spec.legendaryResistances) || 0, spent: 0 },
        lair: { value: !!spec.lair },
      },
      traits: {
        size: size.key,
        di: { value: spec.immunities ?? [], custom: '', bypasses: [] },
        dr: { value: spec.resistances ?? [], custom: '', bypasses: [] },
        dv: { value: spec.vulnerabilities ?? [], custom: '', bypasses: [] },
        ci: { value: spec.conditionImmunities ?? [], custom: '' },
        languages: splitLanguages(spec),
      },
      source: { custom: 'Chrab Corner', rules: '2024' },
    },
    prototypeToken: {
      name: spec.name || 'Unnamed NPC',
      actorLink: false,
      appendNumber: spec.token?.appendNumber ?? true,
      width: size.grid,
      height: size.grid,
      texture: { src: tokenImg, scaleX: scale, scaleY: scale, fit: 'contain' },
      disposition: DISPOSITIONS[spec.token?.disposition] ?? DISPOSITIONS.hostile,
      displayName: DISPLAY_OWNER_HOVER,
      displayBars: DISPLAY_OWNER,
      bar1: { attribute: 'attributes.hp' },
      bar2: { attribute: null },
      sight: {
        enabled: false,
        range: senseRanges.darkvision ?? 0,
        visionMode: senseRanges.darkvision ? 'darkvision' : 'basic',
      },
      detectionModes,
    },
    items,
    effects: [],
    ownership: { default: 0 },
    // Scoped to the Chrab Sync module's id - Foundry's getFlag() only accepts
    // scopes of active packages - so the module can find this actor again
    // and update it in place on a re-send.
    flags: draftId ? { 'chrab-sync': { npcDraftId: draftId } } : {},
    _stats: { ...STATS },
  }
}

// ---------------------------------------------------------------------------
// Reading a Foundry NPC export back into a spec, so an existing monster
// (a Plutonium import, say) can be the starting point for a variant. Lossy by
// design: anything the editor can't express is dropped, and the variant is
// rebuilt from the spec rather than patched.

export function npcActorToSpec(actor) {
  const s = actor?.system ?? {}
  const spec = emptyNpcSpec()
  const dexMod = abilityMod(s.abilities?.dex?.value)

  spec.name = actor?.name ?? ''
  spec.img = actor?.img ?? ''
  spec.cr = s.details?.cr ?? 1
  spec.size = s.traits?.size ?? 'med'
  spec.creatureType = s.details?.type?.value ?? 'humanoid'
  spec.subtype = s.details?.type?.subtype ?? ''
  spec.alignment = s.details?.alignment ?? ''
  spec.biography = s.details?.biography?.value ?? ''
  for (const a of NPC_ABILITIES) spec.abilities[a] = s.abilities?.[a]?.value ?? 10
  spec.saves = NPC_ABILITIES.filter((a) => s.abilities?.[a]?.proficient)
  for (const [key, skill] of Object.entries(s.skills ?? {})) if (skill?.value) spec.skills[key] = skill.value

  const ac = s.attributes?.ac ?? {}
  spec.naturalArmor = ac.calc === 'natural'
  spec.ac = ac.flat || (ac.calc === 'custom' ? averageFormula(String(ac.formula ?? '').replace(/@attributes\.ac\.armor/g, '10').replace(/@attributes\.ac\.dex/g, String(dexMod))) : 10)
  spec.hpFormula = s.attributes?.hp?.formula ?? ''
  spec.hpMax = s.attributes?.hp?.max ?? ''
  const initBonus = Number(s.attributes?.init?.bonus)
  spec.initiative = Number.isFinite(initBonus) && s.attributes?.init?.bonus !== '' ? dexMod + initBonus : ''

  const mv = s.attributes?.movement ?? {}
  for (const key of ['walk', 'fly', 'swim', 'climb', 'burrow']) spec.speed[key] = mv[key] ? Number(mv[key]) : null
  spec.speed.hover = !!mv.hover
  const sr = s.attributes?.senses?.ranges ?? {}
  for (const key of ['darkvision', 'blindsight', 'tremorsense', 'truesight']) spec.senses[key] = sr[key] || null
  spec.senses.special = s.attributes?.senses?.special ?? ''

  spec.immunities = s.traits?.di?.value ?? []
  spec.resistances = s.traits?.dr?.value ?? []
  spec.vulnerabilities = s.traits?.dv?.value ?? []
  spec.conditionImmunities = s.traits?.ci?.value ?? []
  const labelFor = Object.fromEntries(Object.entries(LANGUAGE_KEYS).map(([label, key]) => [key, label]))
  spec.languages = (s.traits?.languages?.value ?? []).map((k) => labelFor[k] ?? k)
  spec.languagesCustom = s.traits?.languages?.custom ?? ''

  spec.legendaryActions = s.resources?.legact?.max ?? 0
  spec.legendaryResistances = s.resources?.legres?.max ?? 0
  spec.lair = !!s.resources?.lair?.value

  const token = actor?.prototypeToken ?? {}
  const disposition = Object.entries(DISPOSITIONS).find(([, v]) => v === token.disposition)?.[0] ?? 'hostile'
  spec.token = {
    img: token.texture?.src ?? '',
    disposition,
    appendNumber: token.appendNumber ?? true,
    scale: token.texture?.scaleX ?? 1,
  }

  spec.items = (actor?.items ?? [])
    .filter((item) => item.type === 'feat' || item.type === 'weapon')
    .filter((item) => item.name !== 'Legendary Resistance' || !spec.legendaryResistances)
    .filter((item) => item.name !== 'Legendary Actions')
    .map((item) => foundryItemToNpcItem(item))
  return spec
}

const ACTIVATION_TO_SECTION = { action: 'action', bonus: 'bonus', reaction: 'reaction', legendary: 'legendary', lair: 'lair' }

function partToRow(part) {
  if (part?.custom?.enabled) return { formula: part.custom.formula ?? '', types: part.types ?? [] }
  const dice = part?.number && part?.denomination ? `${part.number}d${part.denomination}` : ''
  const bonus = part?.bonus ? String(part.bonus) : ''
  const formula = dice && bonus ? `${dice} ${bonus.startsWith('-') ? '-' : '+'} ${bonus.replace(/^[+-]\s*/, '')}` : dice || bonus
  return { formula, types: part?.types ?? [] }
}

function foundryItemToNpcItem(item) {
  const sys = item.system ?? {}
  const acts = Object.values(sys.activities ?? {}).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
  const section = ACTIVATION_TO_SECTION[acts[0]?.activation?.type] ?? 'trait'
  const recovery = sys.uses?.recovery?.[0]
  const out = {
    key: isFoundryId(item._id) ? item._id : randomId(),
    name: item.name,
    section,
    itemType: item.type === 'weapon' ? 'weapon' : 'feat',
    description: sys.description?.value ?? '',
    img: item.img ?? '',
    legendaryCost: acts[0]?.activation?.value ?? 1,
    usesMax: recovery?.period === 'recharge' ? '' : sys.uses?.max ?? '',
    usesRecovery: recovery?.period ?? '',
    rechargeOn: recovery?.period === 'recharge' ? Number(recovery.formula) || 5 : 5,
    effects: (item.effects ?? []).map((e) => ({
      key: isFoundryId(e._id) ? e._id : randomId(),
      name: e.name ?? '',
      img: e.img ?? '',
      statuses: e.statuses ?? [],
      passive: !!e.transfer,
      onSave: false,
      specialDuration: e.flags?.dae?.specialDuration ?? [],
    })),
    activities: [],
  }

  for (const act of acts) {
    const a = { ...emptyActivity(act.type === 'attack' || act.type === 'save' || act.type === 'damage' || act.type === 'heal' ? act.type : 'utility') }
    a.key = isFoundryId(act._id) ? act._id : randomId()
    if (act.type === 'attack') {
      a.attackType = act.attack?.type?.value === 'ranged' ? 'ranged' : 'melee'
      a.classification = act.attack?.type?.classification || 'weapon'
      a.ability = act.attack?.ability && act.attack.ability !== 'none' ? act.attack.ability : ''
      a.toHit = act.attack?.flat ? act.attack.bonus : ''
      if (a.attackType === 'ranged') {
        a.range = sys.range?.value ?? 30
        a.longRange = sys.range?.long ?? null
      } else {
        a.reach = sys.range?.value ?? 5
      }
    }
    if (act.type === 'save') {
      a.saveAbility = act.save?.ability?.[0] ?? 'dex'
      if (act.save?.dc?.calculation && act.save.dc.calculation !== 'spellcasting') a.dcAbility = act.save.dc.calculation
      else a.dc = act.save?.dc?.formula ?? ''
      a.onSave = act.damage?.onSave ?? 'half'
    }
    if (act.damage?.parts) a.damage = act.damage.parts.map(partToRow)
    if (!a.damage.length) a.damage = [{ formula: '', types: [] }]
    if (act.type === 'heal') a.healing = partToRow(act.healing).formula
    const tpl = act.target?.template ?? {}
    a.areaType = tpl.type ?? ''
    a.areaSize = tpl.size ?? ''
    a.targetCount = act.target?.affects?.count ?? ''
    a.targetType = act.target?.affects?.type || 'creature'
    if (act.range?.override && act.range?.value) a.range = Number(act.range.value)
    out.activities.push(a)
  }
  return out
}
