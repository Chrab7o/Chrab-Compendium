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

import { conditionRows, conditionText, parseOnUseMacros, scriptCode, scriptPass } from './foundryAutomation.js'

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

// An activity normally takes its activation from the item's section; these
// let one roll differ (a Reaction tucked into an Action, say).
export const ACTIVATION_TYPES = [
  { key: '', label: 'Same as section' },
  { key: 'action', label: 'Action' },
  { key: 'bonus', label: 'Bonus action' },
  { key: 'reaction', label: 'Reaction' },
  { key: 'special', label: 'Special / free' },
  { key: 'legendary', label: 'Legendary action' },
  { key: 'lair', label: 'Lair action' },
]

// target.affects.type. Midi-qol reads enemy / ally to auto-target only those
// tokens inside an area template.
export const TARGET_TYPES = [
  { key: 'creature', label: 'Any creature' },
  { key: 'enemy', label: 'Enemies only' },
  { key: 'ally', label: 'Allies only' },
  { key: 'willing', label: 'Willing creature' },
  { key: 'self', label: 'Self' },
  { key: 'object', label: 'Object' },
  { key: 'any', label: 'Anything' },
]

// What an activity can spend besides its own item's uses. 'item' points at
// another item on this NPC by key (a shared pool like Ki or Focus Points).
export const SPEND_SOURCES = [
  { key: 'item', label: 'Another feature’s uses' },
  { key: 'legact', label: 'Legendary actions', target: 'resources.legact.value' },
  { key: 'legres', label: 'Legendary resistances', target: 'resources.legres.value' },
  { key: 'hp', label: 'Hit points', target: 'attributes.hp.value' },
  { key: 'attribute', label: 'Other attribute…' },
]

// v14 ActiveEffect change types (system.changes[].type). The numeric
// mode/priority pairs of older Foundry are gone.
export const CHANGE_TYPES = [
  { key: 'add', label: 'Add' },
  { key: 'override', label: 'Set to' },
  { key: 'upgrade', label: 'At least' },
  { key: 'downgrade', label: 'At most' },
  { key: 'multiply', label: 'Multiply by' },
  { key: 'custom', label: 'Custom' },
]

export const MOVEMENT_TYPES = ['walk', 'fly', 'swim', 'climb', 'burrow']
export const SENSE_TYPES = ['darkvision', 'blindsight', 'tremorsense', 'truesight']
export const ATTACK_BONUS_KINDS = { mwak: 'Melee weapon', rwak: 'Ranged weapon', msak: 'Melee spell', rsak: 'Ranged spell' }

// Guided effect changes. `path` may hold one {param} filled from `param`'s
// option list; `value` says which input the editor shows. Midi-qol flags are
// switches (value 1, type custom), as in the world's existing effects.
export const EFFECT_CHANGES = [
  { id: 'ac', group: 'Defense', label: 'AC bonus', path: 'system.attributes.ac.bonus', types: ['add'], value: 'formula', placeholder: '+2' },
  { id: 'resist', group: 'Defense', label: 'Resistance', path: 'system.traits.dr.value', types: ['add'], value: 'damageType' },
  { id: 'immune', group: 'Defense', label: 'Damage immunity', path: 'system.traits.di.value', types: ['add'], value: 'damageType' },
  { id: 'vulnerable', group: 'Defense', label: 'Vulnerability', path: 'system.traits.dv.value', types: ['add'], value: 'damageType' },
  { id: 'condImmune', group: 'Defense', label: 'Condition immunity', path: 'system.traits.ci.value', types: ['add'], value: 'condition' },
  { id: 'saveAll', group: 'Defense', label: 'Bonus to all saving throws', path: 'system.bonuses.abilities.save', types: ['add'], value: 'formula', placeholder: '+1' },
  { id: 'saveOne', group: 'Defense', label: 'Bonus to one saving throw', path: 'system.abilities.{param}.bonuses.save', param: 'ability', types: ['add'], value: 'formula', placeholder: '+2' },
  { id: 'hpMax', group: 'Defense', label: 'Max HP bonus', path: 'system.attributes.hp.bonuses.overall', types: ['add'], value: 'formula', placeholder: '10' },

  { id: 'attackBonus', group: 'Offense', label: 'Attack roll bonus', path: 'system.bonuses.{param}.attack', param: 'attackKind', types: ['add'], value: 'formula', placeholder: '+1' },
  { id: 'damageBonus', group: 'Offense', label: 'Damage bonus', path: 'system.bonuses.{param}.damage', param: 'attackKind', types: ['add'], value: 'formula', placeholder: '1d4' },
  { id: 'spellDc', group: 'Offense', label: 'Spell save DC bonus', path: 'system.bonuses.spell.dc', types: ['add'], value: 'formula', placeholder: '+1' },

  { id: 'abilityScore', group: 'Abilities & movement', label: 'Ability score', path: 'system.abilities.{param}.value', param: 'ability', types: ['add', 'override', 'upgrade', 'downgrade'], value: 'number' },
  { id: 'checkAll', group: 'Abilities & movement', label: 'Bonus to all ability checks', path: 'system.bonuses.abilities.check', types: ['add'], value: 'formula', placeholder: '+1' },
  { id: 'init', group: 'Abilities & movement', label: 'Initiative bonus', path: 'system.attributes.init.bonus', types: ['add'], value: 'formula', placeholder: '+5' },
  { id: 'speed', group: 'Abilities & movement', label: 'Speed', path: 'system.attributes.movement.{param}', param: 'movement', types: ['add', 'override', 'upgrade', 'multiply'], value: 'number' },
  { id: 'sense', group: 'Abilities & movement', label: 'Sense range', path: 'system.attributes.senses.ranges.{param}', param: 'sense', types: ['upgrade', 'override'], value: 'number' },

  { id: 'advAttack', group: 'Midi-QOL', label: 'Advantage on its attacks', path: 'flags.midi-qol.advantage.attack.all', types: ['custom'], value: 'flag' },
  { id: 'disAttack', group: 'Midi-QOL', label: 'Disadvantage on its attacks', path: 'flags.midi-qol.disadvantage.attack.all', types: ['custom'], value: 'flag' },
  { id: 'grantsAdv', group: 'Midi-QOL', label: 'Attacks against it have advantage', path: 'flags.midi-qol.grants.advantage.attack.all', types: ['custom'], value: 'flag' },
  { id: 'grantsDis', group: 'Midi-QOL', label: 'Attacks against it have disadvantage', path: 'flags.midi-qol.grants.disadvantage.attack.all', types: ['custom'], value: 'flag' },
  { id: 'grantsCrit', group: 'Midi-QOL', label: 'Hits against it are critical', path: 'flags.midi-qol.grants.critical.all', types: ['custom'], value: 'flag' },
  { id: 'advSave', group: 'Midi-QOL', label: 'Advantage on saving throws', path: 'flags.midi-qol.advantage.ability.save.{param}', param: 'abilityOrAll', types: ['custom'], value: 'flag' },
  { id: 'disSave', group: 'Midi-QOL', label: 'Disadvantage on saving throws', path: 'flags.midi-qol.disadvantage.ability.save.{param}', param: 'abilityOrAll', types: ['custom'], value: 'flag' },
  { id: 'magicRes', group: 'Midi-QOL', label: 'Magic resistance (advantage vs. spells)', path: 'flags.midi-qol.magicResistance.all', types: ['custom'], value: 'flag' },
  { id: 'superSaver', group: 'Midi-QOL', label: 'Evasion (no damage on a successful save)', path: 'flags.midi-qol.superSaver.{param}', param: 'abilityOrAll', types: ['custom'], value: 'flag' },
  { id: 'overTime', group: 'Midi-QOL', label: 'Over time (save / damage each turn)', path: 'flags.midi-qol.OverTime', types: ['override'], value: 'overTime' },

  { id: 'custom', group: 'Other', label: 'Other attribute (type the path)', path: '', types: CHANGE_TYPES.map((t) => t.key), value: 'text' },
]

export const CHANGE_PARAMS = {
  ability: NPC_ABILITIES.map((a) => ({ key: a, label: a.toUpperCase() })),
  abilityOrAll: [{ key: 'all', label: 'All' }, ...NPC_ABILITIES.map((a) => ({ key: a, label: a.toUpperCase() }))],
  attackKind: Object.entries(ATTACK_BONUS_KINDS).map(([key, label]) => ({ key, label })),
  movement: MOVEMENT_TYPES.map((m) => ({ key: m, label: m[0].toUpperCase() + m.slice(1) })),
  sense: SENSE_TYPES.map((s) => ({ key: s, label: s[0].toUpperCase() + s.slice(1) })),
}

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

function lookup(data, path) {
  return path.split('.').reduce((obj, key) => (obj == null ? undefined : obj[key]), data)
}

// "@abilities.str.mod + 2" -> "4 + 2" with this creature's numbers. Unknown
// references become 0, the same as Foundry rolls them.
export function resolveRefs(formula, data = {}) {
  return String(formula ?? '').replace(/@([\w.]+)/g, (_, path) => {
    const value = lookup(data, path.replace(/\.$/, ''))
    return String(typeof value === 'number' ? value : 0)
  })
}

// "26d20 + 208" -> 481. Dice average rounds down per standard statblocks.
export function averageFormula(formula, data = {}) {
  if (!formula) return 0
  const expr = resolveRefs(formula, data)
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
    // custom activities
    name: '', // shown on the sheet and in chat; blank = Foundry's default ("Attack", "Save")
    activation: '', // '' = from the item's section, else an ACTIVATION_TYPES key
    spend: [], // emptySpend() rows, on top of the item's own uses
    // midi-qol
    triggerKey: '', // key of another activity on this item to roll after this one
    triggerOnlyIf: '', // '' always | 'hit' | 'failedSave'
    triggerConditions: [], // foundryAutomation condition rows, on top of triggerOnlyIf
    useConditions: [], // the roll can only be used if the (first) target passes
    useConditionReason: '',
    effectConditions: [], // effects land only on targets that pass
    otherKey: '', // another roll on this item rolled as extra damage on each hit (midi "other activity")
    overTime: null, // emptyOverTimeRoll(): repeats each turn on whoever has an effect from this item
    script: null, // foundryAutomation emptyScript(): activity macro
  }
}

export function emptySpend() {
  return { key: randomId(), source: 'item', target: '', amount: '1' }
}

// A roll midi-qol repeats on each turn of whoever carries one of this item's
// effects (midi's activity over time). effectKey '' = the item's first
// effect that lands on a target.
export function emptyOverTimeRoll() {
  return { turn: 'end', saveEnds: true, once: false, effectKey: '' }
}

export function emptyEffect() {
  // appliedBy: activity keys that apply this effect; empty = every roll on the item
  return { key: randomId(), name: '', statuses: [], passive: false, onSave: false, specialDuration: [], changes: [], appliedBy: [] }
}

export function emptyOverTime() {
  return { turn: 'end', saveAbility: 'con', saveDc: '', damage: '', damageType: '', saveRemoves: true }
}

export function emptyChange(id = 'ac') {
  const def = EFFECT_CHANGES.find((c) => c.id === id) ?? EFFECT_CHANGES[0]
  return {
    key: randomId(),
    id: def.id,
    param: def.param ? CHANGE_PARAMS[def.param][0].key : '',
    type: def.types[0],
    value: '',
    path: '', // custom only
    overTime: def.value === 'overTime' ? emptyOverTime() : null,
  }
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
    magical: false, // 'mgc' property + midi magicDamage/magicEffect on every roll
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

// Flat ability mods (data.str) for the builder's own math, plus the nested
// paths dnd5e's roll data uses (data.abilities.str.mod) for @references.
// The derived values mirror what dnd5e computes at roll time, as far as the
// spec can tell; anything it can't (spellcasting, slots) is left out and
// shows as unknown in the editor.
export function npcRollData(spec) {
  const prof = proficiencyForCr(spec.cr)
  const maxHp = npcMaxHp(spec)
  const num = (v) => (v === null || v === '' || v === undefined ? undefined : Number(v))
  const data = {
    prof,
    abilities: {},
    skills: {},
    details: { cr: Number(spec.cr) || 0 },
    attributes: {
      ac: { value: Number(spec.ac) || 10, flat: Number(spec.ac) || 10 },
      hp: { value: maxHp, max: maxHp, temp: 0, tempmax: 0 },
      init: {},
      movement: {},
      senses: { ranges: {} },
      exhaustion: 0,
    },
    resources: {
      legact: { value: Number(spec.legendaryActions) || 0, max: Number(spec.legendaryActions) || 0 },
      legres: { value: Number(spec.legendaryResistances) || 0, max: Number(spec.legendaryResistances) || 0 },
    },
  }
  for (const a of NPC_ABILITIES) {
    const mod = abilityMod(spec.abilities?.[a])
    data[a] = mod
    data.abilities[a] = {
      mod,
      value: Number(spec.abilities?.[a]) || 10,
      save: { value: mod + ((spec.saves ?? []).includes(a) ? prof : 0) },
      dc: 8 + prof + mod,
    }
  }
  for (const [key, skill] of Object.entries(NPC_SKILLS)) {
    const total = data[skill.ability] + Math.floor(prof * (Number(spec.skills?.[key]) || 0))
    data.skills[key] = { total, passive: 10 + total, value: Number(spec.skills?.[key]) || 0 }
  }
  data.attributes.init.total = num(spec.initiative) ?? data.dex
  for (const key of ['walk', 'fly', 'swim', 'climb', 'burrow']) {
    const v = num(spec.speed?.[key])
    if (v !== undefined) data.attributes.movement[key] = v
  }
  for (const key of ['darkvision', 'blindsight', 'tremorsense', 'truesight']) {
    const v = num(spec.senses?.[key])
    if (v !== undefined) data.attributes.senses.ranges[key] = v
  }
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

function activationFor(item, activity) {
  const section = ITEM_SECTIONS.find((s) => s.key === item.section) ?? ITEM_SECTIONS[1]
  const type = activity?.activation || section.activation
  const activation = { type, value: 1, override: false }
  if (type === 'legendary') activation.value = Number(item.legendaryCost) || 1
  if (type === 'special') delete activation.value
  return activation
}

// One "also spends" row -> a dnd5e consumption target.
export function spendTarget(spend) {
  const amount = String(spend.amount ?? '').trim() || '1'
  if (spend.source === 'item') return spend.target ? { type: 'itemUses', target: spend.target, value: amount, scaling: {} } : null
  const fixed = SPEND_SOURCES.find((s) => s.key === spend.source)?.target
  const target = fixed ?? String(spend.target ?? '').trim().replace(/^@/, '').replace(/^system\./, '')
  return target ? { type: 'attribute', target, value: amount, scaling: {} } : null
}

function consumptionFor(item, activity) {
  const targets = []
  // A repeating roll is midi's doing each turn; it never costs anything.
  if (activity?.overTime) return { scaling: { allowed: false }, spellSlot: false, targets }
  const legendary = (activity?.activation || item.section) === 'legendary'
  const spendsLegact = (activity?.spend ?? []).some((s) => s.source === 'legact')
  if (legendary && !spendsLegact) {
    targets.push({ type: 'attribute', target: 'resources.legact.value', value: String(Number(item.legendaryCost) || 1), scaling: {} })
  }
  if (item.usesRecovery || item.usesMax) {
    targets.push({ type: 'itemUses', target: '', value: '1', scaling: {} })
  }
  for (const spend of activity?.spend ?? []) {
    const target = spendTarget(spend)
    if (target) targets.push(target)
  }
  return { scaling: { allowed: false }, spellSlot: true, targets }
}

// Midi-qol's per-activity settings. Only what we set is written; midi's
// DataModel fills the rest of its defaults on import.
const TRIGGER_CONDITIONS = {
  hit: 'workflow.hitTargets.size > 0',
  failedSave: 'workflow.failedSaves.size > 0',
}

// triggerOnlyIf plus any extra condition rows, all required.
export function triggerConditionText(activity) {
  const parts = [TRIGGER_CONDITIONS[activity.triggerOnlyIf] ?? '', conditionText(activity.triggerConditions)].filter(Boolean)
  return parts.length === 2 ? `(${parts[0]}) && (${parts[1]})` : parts[0] ?? ''
}

// The identifier an over-time roll is found by from its effect's
// flags.midi-qol.ActivityOverTime change.
export function overTimeIdentifier(activityId) {
  return `over-time-${String(activityId).toLowerCase()}`
}

function midiPropertiesFor(item, activity, ids, automationOnly) {
  const props = {}
  if (item.magical) Object.assign(props, { magicDamage: true, magicEffect: true })
  const triggerId = activity.triggerKey && activity.triggerKey !== activity.key ? ids[activity.triggerKey] : null
  if (triggerId) {
    Object.assign(props, {
      triggeredActivityId: triggerId,
      triggeredActivityConditionText: triggerConditionText(activity),
      triggeredActivityTargets: 'targets',
      triggeredActivityRollAs: 'self',
    })
  }
  if (activity.overTime) props.identifier = overTimeIdentifier(ids[activity.key])
  // A roll that only ever happens through another one (a trigger, extra
  // damage, an over-time tick) stays off the activity picker.
  if (automationOnly) props.automationOnly = true
  return Object.keys(props).length ? props : null
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

function buildActivity(item, activity, effectRefs, index, ids = {}, automationOnly = false) {
  const _id = ids[activity.key] ?? idFor(activity)
  const common = {
    _id,
    type: activity.kind,
    name: String(activity.name ?? '').trim(),
    sort: index * 100000,
    activation: activity.overTime ? { type: 'special', override: false } : activationFor(item, activity),
    consumption: consumptionFor(item, activity),
    duration: { units: 'inst', concentration: false, override: false },
    range: rangeFor(activity),
    target: targetFor(activity),
    uses: { spent: 0, recovery: [] },
    effects: effectRefs,
  }
  const midi = midiPropertiesFor(item, activity, ids, automationOnly)
  if (midi) common.midiProperties = midi

  // Midi-qol activity fields; DataModel defaults cover anything not set.
  const useCondition = conditionText(activity.useConditions)
  if (useCondition) {
    common.useConditionText = useCondition
    if (activity.useConditionReason) common.useConditionReason = activity.useConditionReason
  }
  const effectCondition = conditionText(activity.effectConditions)
  if (effectCondition) common.effectConditionText = effectCondition
  if (activity.otherKey && ids[activity.otherKey] && activity.otherKey !== activity.key) common.otherActivityId = ids[activity.otherKey]
  if (activity.overTime) {
    // rollAs "source": the tick is rolled by this NPC's copy of the item, so
    // a save DC from its abilities stays the NPC's, not the target's.
    common.isOverTimeFlag = true
    common.overTimeProperties = {
      turnChoice: activity.overTime.turn === 'start' ? 'start' : 'end',
      saveRemoves: activity.kind === 'save' && activity.overTime.saveEnds !== false,
      rollAs: 'source',
      postRemoveConditionText: activity.overTime.once ? 'true' : '',
    }
  }
  const code = scriptCode(activity.script)
  if (code.trim()) common.macroData = { name: common.name || 'Chrab Corner script', command: code }

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
      const shown = resolveRefs(r.formula, rollData).replace(/\s+/g, ' ').replace(/\+ -/g, '- ')
      const avg = averageFormula(r.formula, rollData)
      const types = (r.types ?? []).map((t) => t[0].toUpperCase() + t.slice(1)).join(' or ')
      return `${avg} (${shown})${types ? ` ${types}` : ''} damage`
    })
    .join(' plus ')
}

// "Costs 2 Focus" for the rows an activity spends beyond its own uses.
export function spendText(spec, activity) {
  const parts = (activity.spend ?? [])
    .map((s) => {
      const amount = String(s.amount ?? '').trim() || '1'
      if (s.source === 'item') {
        const pool = (spec.items ?? []).find((i) => i.key === s.target)
        return pool ? `${amount} ${pool.name || 'uses'}` : ''
      }
      if (s.source === 'attribute') return s.target ? `${amount} ${s.target}` : ''
      const label = { legact: 'Legendary Actions', legres: 'Legendary Resistances', hp: 'Hit Points' }[s.source]
      return label ? `${amount} ${label}` : ''
    })
    .filter(Boolean)
  return parts.length ? `Costs ${parts.join(' and ')}` : ''
}

export function activitySummary(spec, activity) {
  let body = activityBody(spec, activity)
  if (activity.overTime && body) {
    const ot = activity.overTime
    const ends = ot.once ? ', once' : activity.kind === 'save' && ot.saveEnds !== false ? ', ending the effect on a success' : ''
    body = `${body} This repeats at the ${ot.turn === 'start' ? 'start' : 'end'} of each of the affected creature's turns${ends}.`
  }
  const name = String(activity.name ?? '').trim()
  const cost = spendText(spec, activity)
  const head = [name, cost && `(${cost})`].filter(Boolean).join(' ')
  if (!head) return body
  return `${head}${name ? '.' : ''} ${body}`.trim()
}

function activityBody(spec, activity) {
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
    case 'heal': {
      const data = npcRollData(spec)
      return activity.healing ? `Regains ${averageFormula(activity.healing, data)} (${resolveRefs(activity.healing, data)}) Hit Points.` : ''
    }
    default:
      return ''
  }
}

// Uses max may be a formula ("@prof"); the label shows what it comes to.
export function usesLabel(item, spec = null) {
  if (item.usesRecovery === 'recharge') return `Recharge ${item.rechargeOn >= 6 ? '6' : `${item.rechargeOn || 5}–6`}`
  if (!item.usesMax) return ''
  const per = { lr: 'Long Rest', sr: 'Short Rest', day: 'Day' }[item.usesRecovery] ?? 'Day'
  const max = spec && /[@d]/.test(String(item.usesMax)) ? averageFormula(item.usesMax, npcRollData(spec)) : item.usesMax
  return `${max}/${per}`
}

// ---------------------------------------------------------------------------
// Items and effects

// Midi-qol's OverTime value, e.g. "turn=end, label=Venom, saveAbility=con,
// saveDC=13, saveCount=1-, damageRoll=2d6, damageType=poison". Midi reads
// it on the affected creature, so @references would resolve against the
// target - the DC and damage are baked into numbers from this NPC instead. A
// blank DC uses the item's first saving throw. saveCount=1- (remove on the
// first success) replaced the deprecated saveRemove=true in midi 13.0.43;
// "never ends on a save" still has no saveCount spelling, so it keeps the
// deprecated saveRemove=false.
export function overTimeValue(spec, item, effect, ot) {
  const data = npcRollData(spec)
  const parts = [`turn=${ot.turn === 'start' ? 'start' : 'end'}`, `label=${(effect.name || item.name || 'Effect').replace(/[,=#]/g, ' ')}`]
  if (ot.saveAbility) {
    const firstSave = (item.activities ?? []).find((a) => a.kind === 'save')
    const dc = String(ot.saveDc ?? '').trim() ? averageFormula(ot.saveDc, data) : firstSave ? saveDc(spec, firstSave) : 10
    parts.push(`saveAbility=${ot.saveAbility}`, `saveDC=${dc}`, ot.saveRemoves !== false ? 'saveCount=1-' : 'saveRemove=false')
  }
  if (String(ot.damage ?? '').trim()) {
    parts.push(`damageRoll=${resolveRefs(ot.damage, data).replace(/\s+/g, '')}`)
    if (ot.damageType) parts.push(`damageType=${ot.damageType}`)
  }
  return parts.join(', ')
}

export function changePath(change) {
  if (change.id === 'custom') return String(change.path ?? '').trim()
  const def = EFFECT_CHANGES.find((c) => c.id === change.id)
  return def ? def.path.replace('{param}', change.param || '') : ''
}

function buildChange(spec, item, effect, change) {
  const def = EFFECT_CHANGES.find((c) => c.id === change.id)
  const key = changePath(change)
  if (!def || !key) return null
  let value
  if (def.value === 'flag') value = '1'
  else if (def.value === 'overTime') value = overTimeValue(spec, item, effect, change.overTime ?? emptyOverTime())
  else value = String(change.value ?? '').trim()
  if (value === '') return null
  const type = def.types.includes(change.type) ? change.type : def.types[0]
  return { key, value, type, phase: 'initial' }
}

function buildEffect(spec, effect, item) {
  const flags = {}
  if (effect.specialDuration?.length) flags.dae = { specialDuration: effect.specialDuration }
  const changes = (effect.changes ?? []).map((c) => buildChange(spec, item, effect, c)).filter(Boolean)
  return {
    _id: idFor(effect),
    name: effect.name || item.name,
    img: effect.img || item.img || 'icons/svg/aura.svg',
    description: '',
    type: 'base',
    system: { changes },
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
  const kept = (item.effects ?? []).filter((e) => e.name || e.statuses?.length || e.changes?.length)
  const effects = kept.map((e) => buildEffect(spec, e, item))
  // An effect lands from every roll unless appliedBy names the ones it
  // belongs to (the Stun save, not the Strike that triggers it).
  const refsFor = (activity) =>
    kept
      .map((e, i) => [e, effects[i]])
      .filter(([e, built]) => !built.transfer && (!e.appliedBy?.length || e.appliedBy.includes(activity.key)))
      .map(([, built]) => ({ _id: built._id, level: {} }))
  // Ids first, so one activity can point at another (midi triggers).
  const acts = item.activities ?? []
  const ids = Object.fromEntries(acts.map((a) => [a.key, idFor(a)]))
  const reachedOnlyThroughOthers = new Set([
    ...acts.map((a) => a.triggerKey),
    ...acts.map((a) => a.otherKey),
    ...acts.filter((a) => a.overTime).map((a) => a.key),
  ].filter(Boolean))

  // Over-time rolls: the effect that carries them gets the ActivityOverTime
  // change, and the tick itself never re-applies that effect.
  const tickedBy = new Map() // built effect id -> over-time activity key
  for (const activity of acts.filter((a) => a.overTime)) {
    const index = kept.findIndex((e, i) => (activity.overTime.effectKey ? e.key === activity.overTime.effectKey : !effects[i].transfer))
    if (index < 0) continue
    effects[index].system.changes.push({ key: 'flags.midi-qol.ActivityOverTime', value: overTimeIdentifier(ids[activity.key]), type: 'override', phase: 'initial' })
    tickedBy.set(effects[index]._id, activity.key)
  }

  const activities = {}
  acts.forEach((activity, i) => {
    const refs = refsFor(activity).filter((ref) => !(activity.overTime && tickedBy.get(ref._id) === activity.key))
    const built = buildActivity(item, activity, refs, i, ids, reachedOnlyThroughOthers.has(activity.key))
    activities[built._id] = built
  })

  // Scripts: each roll's own macro, run only when that roll is used.
  const onUse = acts
    .filter((a) => scriptCode(a.script).trim())
    .map((a) => `[${scriptPass(a.script)}]ActivityMacro-${ids[a.key]}`)
    .join(',')

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
    properties: item.magical ? ['mgc'] : [],
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
    flags: onUse ? { 'midi-qol': { onUseMacroName: onUse } } : {},
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

// Pre-v14 effects stored a numeric mode instead of a type.
const LEGACY_CHANGE_MODES = ['custom', 'multiply', 'add', 'downgrade', 'upgrade', 'override']

// Midi splits fields at ",key=" / "#key=" (commas inside a value are fine)
// and treats a missing turn as "start".
function parseOverTime(value) {
  const kv = Object.fromEntries(
    String(value ?? '')
      .split(/\s*[,#\n]\s*(?=\w+\s*=)/)
      .map((part) => {
        const at = part.indexOf('=')
        return [part.slice(0, at).trim(), part.slice(at + 1).trim().replace(/^"(.*)"$/, '$1')]
      })
      .filter(([k]) => k),
  )
  return {
    turn: kv.turn === 'end' ? 'end' : 'start',
    saveAbility: kv.saveAbility ?? '',
    saveDc: kv.saveDC ?? '',
    damage: kv.damageRoll ?? '',
    damageType: kv.damageType ?? '',
    saveRemoves: kv.saveCount ? kv.saveCount.includes('-') : kv.saveRemove !== 'false',
  }
}

// A Foundry change back onto the guided catalog, or the "Other" row.
export function changeFromFoundry(change) {
  const type = change.type ?? LEGACY_CHANGE_MODES[change.mode] ?? 'add'
  const value = String(change.value ?? '')
  const row = { ...emptyChange('custom'), type, value, path: change.key ?? '' }
  for (const def of EFFECT_CHANGES) {
    if (def.id === 'custom') continue
    const pattern = new RegExp(`^${def.path.replace(/\./g, '\\.').replace('{param}', '(\\w+)')}$`)
    const m = String(change.key ?? '').match(pattern)
    if (!m) continue
    if (def.param && !CHANGE_PARAMS[def.param].some((p) => p.key === m[1])) continue
    return {
      ...row,
      id: def.id,
      param: def.param ? m[1] : '',
      type: def.types.includes(type) ? type : def.types[0],
      value: def.value === 'flag' || def.value === 'overTime' ? '' : value,
      path: '',
      overTime: def.value === 'overTime' ? parseOverTime(value) : null,
    }
  }
  return row
}


function foundryItemToNpcItem(item) {
  const sys = item.system ?? {}
  const acts = Object.values(sys.activities ?? {}).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
  // Over-time ticks are always "special"; the section comes from a real roll.
  const sectionAct = acts.find((a) => !a.isOverTimeFlag) ?? acts[0]
  const section = ACTIVATION_TO_SECTION[sectionAct?.activation?.type] ?? 'trait'
  const sectionActivation = ITEM_SECTIONS.find((s) => s.key === section)?.activation
  const recovery = sys.uses?.recovery?.[0]
  const keyForId = Object.fromEntries(acts.map((act) => [act._id, isFoundryId(act._id) ? act._id : randomId()]))
  // Rolls that apply an effect; empty when every roll does.
  const appliedBy = (effectId) => {
    const using = acts.filter((act) => (act.effects ?? []).some((ref) => ref._id === effectId))
    return using.length === acts.length ? [] : using.map((act) => keyForId[act._id])
  }
  const out = {
    key: isFoundryId(item._id) ? item._id : randomId(),
    name: item.name,
    section,
    itemType: item.type === 'weapon' ? 'weapon' : 'feat',
    description: sys.description?.value ?? '',
    img: item.img ?? '',
    legendaryCost: sectionAct?.activation?.value ?? 1,
    usesMax: recovery?.period === 'recharge' ? '' : sys.uses?.max ?? '',
    usesRecovery: recovery?.period ?? '',
    rechargeOn: recovery?.period === 'recharge' ? Number(recovery.formula) || 5 : 5,
    magical: (sys.properties ?? []).includes('mgc') || acts.some((a) => a.midiProperties?.magicDamage),
    effects: (item.effects ?? []).map((e) => ({
      key: isFoundryId(e._id) ? e._id : randomId(),
      name: e.name ?? '',
      img: e.img ?? '',
      statuses: e.statuses ?? [],
      passive: !!e.transfer,
      onSave: false,
      specialDuration: e.flags?.dae?.specialDuration ?? [],
      // ActivityOverTime links come back as the over-time roll's effectKey.
      changes: (e.system?.changes ?? e.changes ?? []).filter((c) => c.key !== 'flags.midi-qol.ActivityOverTime').map(changeFromFoundry),
      appliedBy: e.transfer ? [] : appliedBy(e._id),
    })),
    activities: [],
  }
  const macroPasses = parseOnUseMacros(item.flags?.['midi-qol']?.onUseMacroName)
  const identifierOf = (act) => act.midiProperties?.identifier || slugIdentifier(act.name)
  // over-time activity id -> key of the effect whose ActivityOverTime change names it
  const tickEffect = {}
  for (const e of item.effects ?? []) {
    for (const c of e.system?.changes ?? e.changes ?? []) {
      if (c.key !== 'flags.midi-qol.ActivityOverTime') continue
      const act = acts.find((x) => x._id === c.value || x.uuid === c.value || identifierOf(x) === c.value)
      if (act) tickEffect[act._id] = isFoundryId(e._id) ? e._id : ''
    }
  }

  for (const act of acts) {
    const a = { ...emptyActivity(act.type === 'attack' || act.type === 'save' || act.type === 'damage' || act.type === 'heal' ? act.type : 'utility') }
    a.key = keyForId[act._id]
    a.name = act.name ?? ''
    const actType = act.activation?.type
    if (actType && actType !== sectionActivation && ACTIVATION_TYPES.some((t) => t.key === actType)) a.activation = actType
    // Consumption beyond what the builder adds by itself (own uses, the
    // section's legendary action cost) becomes "also spends" rows.
    a.spend = (act.consumption?.targets ?? [])
      .filter((t) => !(t.type === 'itemUses' && !t.target))
      .filter((t) => !(t.type === 'attribute' && t.target === 'resources.legact.value' && (a.activation || sectionActivation) === 'legendary'))
      .filter((t) => !(t.type === 'attribute' && t.target === 'resources.legres.value' && item.name === 'Legendary Resistance'))
      .filter((t) => t.type === 'itemUses' || t.type === 'attribute')
      .map((t) => {
        const fixed = SPEND_SOURCES.find((s) => s.target && s.target === t.target)
        const source = t.type === 'itemUses' ? 'item' : fixed ? fixed.key : 'attribute'
        return { ...emptySpend(), source, target: fixed ? '' : t.target, amount: String(t.value ?? '1') }
      })
    const mp = act.midiProperties ?? {}
    if (mp.triggeredActivityId && mp.triggeredActivityId !== 'none' && keyForId[mp.triggeredActivityId]) {
      a.triggerKey = keyForId[mp.triggeredActivityId]
      const text = String(mp.triggeredActivityConditionText ?? '').trim()
      const onlyIf = Object.entries(TRIGGER_CONDITIONS).find(([, t]) => text === t || text.startsWith(`(${t}) && (`))
      a.triggerOnlyIf = onlyIf?.[0] ?? ''
      const rest = !onlyIf ? text : text === onlyIf[1] ? '' : text.slice(onlyIf[1].length + 8, -1)
      a.triggerConditions = conditionRows(rest)
    }
    a.useConditions = conditionRows(act.useConditionText)
    a.useConditionReason = act.useConditionReason ?? ''
    a.effectConditions = conditionRows(act.effectConditionText)
    const other = act.otherActivityId && act.otherActivityId !== 'none' ? acts.find((x) => x._id === act.otherActivityId || identifierOf(x) === act.otherActivityId) : null
    if (other && other._id !== act._id) a.otherKey = keyForId[other._id]
    if (act.isOverTimeFlag) {
      const ot = act.overTimeProperties ?? {}
      a.activation = ''
      a.overTime = {
        turn: ot.turnChoice === 'end' ? 'end' : 'start',
        saveEnds: ot.saveRemoves !== false,
        once: String(ot.postRemoveConditionText ?? '').trim() === 'true',
        effectKey: tickEffect[act._id] ?? '',
      }
    }
    if (String(act.macroData?.command ?? '').trim()) {
      a.script = { recipe: 'custom', pass: macroPasses[act._id] || 'postActiveEffects', params: {}, code: act.macroData.command, edited: true }
    }
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
