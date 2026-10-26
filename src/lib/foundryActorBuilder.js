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
import { flowCode, flowPasses, hasFlow } from './automationFlow.js'
import { activeBehavior, behaviorChanges, behaviorMacro, behaviorSummary, bondChanges, hasSelfUseRules, storedKeys, turnTicks } from './foundryBehaviors.js'

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

// A midi-qol condition (the value of a flags.midi-qol.advantage... change):
// true while rolling a save against something that applies `condition`. Midi
// evaluates it with the workflow that asked for the save, so it looks at the
// effects of that save's activity, then of its item (an over-time or aura
// save rolls from the item). An effect counts if it has the condition as a
// status, or is named for it ("Frightened"). Saves rolled outside a midi
// workflow (a plain request from the chat card) see no workflow: no advantage.
export function saveAgainstCondition(condition) {
  const c = JSON.stringify(String(condition))
  return `[workflow?.saveActivity ?? workflow?.activity, workflow?.item].some((s) => [...(s?.effects ?? [])].some((e) => { const fx = e?.effect ?? e; return !!(fx?.statuses?.has?.(${c}) || String(fx?.name ?? "").toLowerCase().includes(${c})); }))`
}

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
  { key: 'summon', label: 'Summon' },
  { key: 'transform', label: 'Transform' },
]

// dnd5e's transformation presets (CONFIG.DND5E.transformation.presets), plus
// "custom": keep the user's mind, class and hit points (keepFull below).
export const TRANSFORM_PRESETS = [
  { key: 'polymorph', label: 'Polymorph (become the creature)' },
  { key: 'wildshape', label: 'Wild Shape (keep your mind)' },
  { key: 'polymorphSelf', label: 'Appearance only' },
  { key: 'custom', label: 'Keep mind, class, features and hit points' },
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

// When midi-qol offers a reaction to its owner, as the activity's
// reactionCondition (`reaction === "isDamaged"`); midi's doReactions checks it
// against the trigger. Blank = midi's default, being hit. A reaction to taking
// damage runs before the damage is worked out, so an effect it puts on its
// owner (damage reduction) counts against that very hit.
export const REACTION_TRIGGERS = [
  { key: '', label: 'You’re hit by an attack (midi default)' },
  { key: 'isAttacked', label: 'You’re attacked (before the roll)' },
  { key: 'isHit', label: 'You’re hit by an attack' },
  { key: 'isDamaged', label: 'You take damage' },
  { key: 'isMissed', label: 'An attack misses you' },
  { key: 'isSaveFail', label: 'You fail a saving throw' },
  { key: 'isTargeted', label: 'You’re targeted' },
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
// 'pool' names the feature by its identifier ("darkness") instead: dnd5e
// 5.3 re-links an identifier target to whichever item on the actor has it
// (Activity#_remapConsumptionTarget), so it works on any character - the
// way class features spend a class resource (Darkness, Ki, Ink).
export const SPEND_SOURCES = [
  { key: 'item', label: 'Another feature’s uses' },
  { key: 'pool', label: 'A class resource (by identifier)' },
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
  // Stored as the condition; built into a midi condition expression
  // (saveAgainstCondition) and read back from it (parse).
  {
    id: 'advSaveVs',
    group: 'Midi-QOL',
    label: 'Advantage on saves against a condition',
    path: 'flags.midi-qol.advantage.ability.save.all',
    types: ['custom'],
    value: 'condition',
    build: (condition) => saveAgainstCondition(condition),
    parse: (value) => value.match(/statuses\?\.has\?\.\("(\w+)"\)/)?.[1] ?? null,
  },
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

// A dice count taken from a reference: "@attributes.movement.fly d8" or
// "(@attributes.movement.fly)d8".
// Only a bare reference directly before the "d" - one already inside
// brackets ("(@x)d8", "(5 * @item.level)d1") is left alone.
const DICE_COUNT_REF = /(^|[^(\w.@])(@[\w.]*\w)\s*d(\d)/gi

export function hasDiceCountRef(formula) {
  return new RegExp(DICE_COUNT_REF.source, 'i').test(String(formula ?? ''))
}

// Foundry 14 / dnd5e 5.3 only accept a dice count from a reference in
// parentheses: "@attributes.movement.fly d8" fails import validation
// ("Expected [%*/], [+\-], or end of input but "d" found") while
// "(@attributes.movement.fly)d8" imports and rolls live (tested in the world
// 2026-10-22, sandbox probes/dice-count-formula.md). Spaces before a "d"
// are closed up too ("2 d6" -> "2d6").
export function normalizeFormula(formula) {
  return String(formula ?? '')
    .trim()
    .replace(DICE_COUNT_REF, (_, before, ref, faces) => `${before}(${ref})d${faces}`)
    .replace(/(\d|\))\s+d(\d)/gi, '$1d$2')
}

// A formula with this creature's numbers filled in: "(@x)d8" -> "5d8".
export function bakeFormula(formula, data = {}) {
  return resolveRefs(normalizeFormula(formula), data).replace(/\((\d+)\)d/g, '$1d')
}

// "26d20 + 208" -> 481. Dice average rounds down per standard statblocks.
export function averageFormula(formula, data = {}) {
  if (!formula) return 0
  const expr = resolveRefs(normalizeFormula(formula), data).replace(/\((\d+)\)/g, '$1')
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
  const formula = normalizeFormula(row?.formula)
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
    attackBonus: '', // with toHit blank: an extra bonus on top (a +3 weapon)
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
    healType: 'healing', // heal rolls: 'healing' | 'temphp'
    targetCount: '',
    targetType: 'creature',
    areaType: '',
    areaSize: '',
    // custom activities
    name: '', // shown on the sheet and in chat; blank = Foundry's default ("Attack", "Save")
    activation: '', // '' = from the item's section, else an ACTIVATION_TYPES key
    reactionTrigger: '', // reactions: a REACTION_TRIGGERS key - when midi-qol offers it to the defender
    ignoreTraits: [], // midi: ['idr', 'idi'] = its damage ignores resistance and immunity
    durationMinutes: '', // how long it lasts (an aura's area, a summon); '' = instantaneous, 'perm' = until dismissed
    aura: null, // emptyAura(): a midi region that follows its user's token (see buildAura)
    // summon / transform: a creature by uuid ("Compendium.x.y.Actor.id" or a
    // world actor), or - uuid blank - one the player picks from the compendium
    // browser, up to crMax (a formula) and of these types.
    creatureUuid: '',
    creatureName: '',
    creatureCount: '1', // summon: a formula, e.g. "2" or "1 + @scaling.increase"
    summonMatch: true, // summon: it uses the summoner's attack, save and proficiency numbers (a familiar doesn't)
    summonSingle: false, // summon: only one out at a time - using it again moves the one on the map (Chrab Sync)
    crMax: '',
    creatureTypes: [],
    transformPreset: 'polymorph',
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
    flow: null, // automationFlow emptyFlow(): built step by step; replaces the script when it has steps
  }
}

// extra: the user may spend more than `amount`; each extra point adds a die
// to the roll's first damage part (or its healing) - "consume additional
// Darkness to add another 1d8".
export function emptySpend() {
  return { key: randomId(), source: 'item', target: '', amount: '1', extra: false }
}

// "Dark Arts Pool" -> "dark-arts-pool": dnd5e identifiers.
export function identifierFor(text) {
  return String(text ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

// A roll midi-qol repeats on each turn of whoever carries one of this item's
// effects (midi's activity over time). effectKey '' = the item's first
// effect that lands on a target.
// An aura: using the activity places a midi-qol region (behavior
// midi-qol.regionActivity, the way midi's Spirit Guardians works) that
// follows the user's token. Each rule: when a creature (filtered by
// disposition) enters / exits / starts / ends its turn inside, use one of the
// item's other rolls on it (target = that roll's key) or apply / remove one
// of the item's effects (target = the effect's key; mark it "aura").
export const AURA_TRIGGERS = [
  { key: 'entry', label: 'Enters' },
  { key: 'exit', label: 'Leaves' },
  { key: 'turnStart', label: 'Starts its turn inside' },
  { key: 'turnEnd', label: 'Ends its turn inside' },
]
export const AURA_ACTIONS = [
  { key: 'useActivity', label: 'Use a roll on it' },
  { key: 'applyEffect', label: 'Apply an effect' },
  { key: 'removeEffect', label: 'Remove an effect' },
]
export function emptyAura() {
  return { radius: '20', affects: 'enemy', oncePerTurn: true, rules: [] }
}
const AURA_DISPOSITION = { enemy: -1, all: 0, ally: 1 }

export function emptyOverTimeRoll() {
  return { turn: 'end', saveEnds: true, once: false, effectKey: '' }
}

export function emptyEffect() {
  // appliedBy: activity keys that apply this effect; empty = every roll on the item
  // stance: on the owner while the item's toggle behavior is on (foundryBehaviors.js)
  // bond: applied to a target, which then runs the item's "bonded creature" rules (Defend the Weak)
  // byRule: only a behavior rule's "apply an effect" action puts it on anyone
  // aura: only an aura's rules apply / remove it
  return { key: randomId(), name: '', statuses: [], passive: false, stance: false, bond: false, byRule: false, aura: false, onSave: false, specialDuration: [], changes: [], appliedBy: [] }
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
    usesRecovery: '', // '' | 'lr' | 'sr' | 'day' | 'dawn' | 'dusk' | 'recharge' | 'none' (charges that never come back)
    usesRecoverFormula: '', // with a period: how many come back ("1d6 + 1"); blank = all of them
    rechargeOn: 5,
    identifier: '', // '' = from the name; other features spend these uses by it ('pool' spends)
    magical: false, // 'mgc' property + midi magicDamage/magicEffect on every roll
    activities: section === 'trait' ? [] : [emptyActivity('attack')],
    effects: [],
    behavior: null, // foundryBehaviors emptyBehavior(): toggles and "when I attack..." rules
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
  spellcasting: emptySpellcasting(),
  spells: [],
})

// 2024 statblocks cast innately (At Will / N per Day, no slots); slots are
// optional for classic caster NPCs. key: the generated Spellcasting entry's id.
export function emptySpellcasting() {
  return { key: randomId(), ability: 'int', slots: false, casterLevel: 1, slotCounts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 }, section: 'action' }
}

export const SPELL_SCHOOLS = {
  abj: 'Abjuration', con: 'Conjuration', div: 'Divination', enc: 'Enchantment',
  evo: 'Evocation', ill: 'Illusion', nec: 'Necromancy', trs: 'Transmutation',
}

// How an NPC casts one spell: at will, N per day (both innate), or with slots.
export const SPELL_METHODS = [
  { key: 'atwill', label: 'At will' },
  { key: 'perDay', label: 'Per day' },
  { key: 'slots', label: 'Spell slot' },
]

export function emptyNpcSpell() {
  return {
    key: randomId(),
    name: '',
    img: '',
    level: 1,
    school: 'evo',
    method: 'atwill',
    usesPerDay: 1,
    activation: { type: 'action', value: 1, condition: '' },
    range: { value: '60', units: 'ft' },
    area: { type: '', size: '' }, // a template, e.g. a 20-ft. sphere
    duration: { value: '', units: 'inst' },
    concentration: false,
    ritual: false,
    components: { v: true, s: true, m: false },
    materials: '',
    description: '', // HTML (from 5etools) or plain text
    upcast: '', // what each slot level above adds to the first damage/healing roll, e.g. "1d6"
    source: { book: '', page: '' },
    fiveTools: '', // "name|source" of the 5etools spell it came from
    activities: [{ ...emptyActivity('save'), dcAbility: 'spellcasting' }],
    effects: [],
  }
}

// ---------------------------------------------------------------------------
// Spells and the Spellcasting entry

const SPELL_ICONS = {
  abj: 'icons/svg/shield.svg', con: 'icons/svg/aura.svg', div: 'icons/svg/eye.svg', enc: 'icons/svg/daze.svg',
  evo: 'icons/svg/fire.svg', ill: 'icons/svg/eye.svg', nec: 'icons/svg/skull.svg', trs: 'icons/svg/lightning.svg',
}

const ORDINALS = ['Cantrip', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th']

export function spellLevelLabel(level) {
  return ORDINALS[Number(level) || 0] ?? `${level}th`
}

// What each spell's activities look like to the shared activity builder: a
// pseudo item whose "uses" are the spell's per-day casts.
function spellAsItem(spell) {
  return {
    key: spell.key,
    name: spell.name,
    img: spell.img,
    section: 'action',
    legendaryCost: 1,
    usesMax: spell.method === 'perDay' ? String(Number(spell.usesPerDay) || 1) : '',
    usesRecovery: spell.method === 'perDay' ? 'day' : '',
    magical: false,
    activities: spell.activities ?? [],
    effects: spell.effects ?? [],
  }
}

function spellProperties(spell) {
  const props = []
  if (spell.components?.v) props.push('vocal')
  if (spell.components?.s) props.push('somatic')
  if (spell.components?.m) props.push('material')
  if (spell.concentration) props.push('concentration')
  if (spell.ritual) props.push('ritual')
  return props
}

// Damage/healing that grows with the slot: "whole" scaling adds `upcast`
// per level above the spell's own (cantrips scale with the caster).
function spellScaling(spell, part) {
  if (Number(spell.level) === 0) return { mode: 'whole', number: 1 }
  const step = normalizeFormula(spell.upcast)
  if (!step) return part.scaling
  const sameDie = step.match(/^1d(\d+)$/i)
  if (sameDie && Number(sameDie[1]) === part.denomination) return { mode: 'whole', number: 1 }
  return { mode: 'whole', number: 1, formula: step }
}

export function buildNpcSpellItem(spec, spell, index = 0) {
  const asItem = spellAsItem(spell)
  const built = buildNpcItem(spec, asItem, index, { inSpell: true })
  const slotted = spell.method === 'slots' && Number(spell.level) > 0
  for (const activity of Object.values(built.system.activities)) {
    // Spells drive their own activation, range and target; activities inherit.
    activity.activation = { type: spell.activation?.type || 'action', value: Number(spell.activation?.value) || 1, override: false }
    activity.range = { override: false }
    activity.target = { ...activity.target, override: false }
    activity.consumption.spellSlot = slotted
    // Upcasting grows the first roll only (Ice Storm's 4d6 bludgeoning doesn't),
    // and never a formula that already scales itself ("(@item.level - 2)d10").
    // Cantrips scale every plain part with the caster.
    const scales = (part, i) => !/@/.test(part.custom?.enabled ? part.custom.formula : '') && (i === 0 || Number(spell.level) === 0)
    ;(activity.damage?.parts ?? []).forEach((part, i) => {
      if (scales(part, i)) part.scaling = spellScaling(spell, part)
    })
    if (activity.healing && scales(activity.healing, 0)) activity.healing.scaling = spellScaling(spell, activity.healing)
  }
  const template = { contiguous: false, stationary: false, units: 'ft', count: '', type: spell.area?.type || '', size: String(spell.area?.size ?? ''), width: '', height: '' }
  const firstActivity = spell.activities?.[0]
  const { type: _featType, ...system } = built.system
  return {
    ...built,
    type: 'spell',
    img: spell.img || SPELL_ICONS[spell.school] || 'icons/svg/book.svg',
    system: {
      ...system,
      description: { value: textToHtml(spell.description) || system.description.value, chat: '' },
      source: spell.source?.book
        ? { book: spell.source.book, page: String(spell.source.page ?? ''), custom: '', rules: '2024' }
        : { custom: 'Chrab Corner', rules: '2024' },
      level: Number(spell.level) || 0,
      school: spell.school || 'evo',
      properties: spellProperties(spell),
      materials: { value: spell.components?.m ? spell.materials ?? '' : '', consumed: false, cost: 0, supply: 0 },
      activation: { type: spell.activation?.type || 'action', value: Number(spell.activation?.value) || 1, condition: spell.activation?.condition ?? '' },
      range: { value: String(spell.range?.value ?? ''), units: spell.range?.units || 'self', special: '' },
      target: {
        template,
        affects: {
          count: firstActivity?.targetCount === '' || firstActivity?.targetCount == null ? '' : String(firstActivity.targetCount),
          type: firstActivity?.targetType ?? 'creature',
          choice: false,
          special: '',
        },
      },
      duration: { value: String(spell.duration?.value ?? ''), units: spell.duration?.units || 'inst' },
      // dnd5e 5.x: innate for At Will / N per Day, prepared spells for slots.
      method: slotted || (spell.method === 'slots' && Number(spell.level) === 0) ? 'spell' : 'innate',
      prepared: 1,
    },
  }
}

function spellCastingLine(spec, spells) {
  return spells.map((s) => s.name || 'Unnamed').sort((a, b) => a.localeCompare(b)).join(', ')
}

// The 2024-style Spellcasting entry ("casts one of the following spells,
// requiring no Material components...") or the classic slot list.
export function spellcastingText(spec) {
  const spells = spec.spells ?? []
  if (!spells.length) return ''
  const sc = spec.spellcasting ?? emptySpellcasting()
  const who = spec.name || 'The creature'
  const abilityName = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' }[spellcastingAbility(spec)]
  const numbers = `spell save DC ${spellSaveDc(spec)}, ${signed(spellAttackBonus(spec))} to hit with spell attacks`
  const lines = []
  const atWill = spells.filter((s) => s.method === 'atwill')
  if (atWill.length) lines.push(`At Will: ${spellCastingLine(spec, atWill)}`)
  const perDay = spells.filter((s) => s.method === 'perDay')
  for (const n of [...new Set(perDay.map((s) => Number(s.usesPerDay) || 1))].sort((a, b) => b - a)) {
    const group = perDay.filter((s) => (Number(s.usesPerDay) || 1) === n)
    lines.push(`${n}/Day${group.length > 1 ? ' Each' : ''}: ${spellCastingLine(spec, group)}`)
  }
  const slotted = spells.filter((s) => s.method === 'slots')
  for (let level = 0; level <= 9; level++) {
    const group = slotted.filter((s) => (Number(s.level) || 0) === level)
    if (!group.length) continue
    const slots = Number(sc.slotCounts?.[level]) || 0
    const label = level === 0 ? 'Cantrips (at will)' : `${spellLevelLabel(level)} level (${slots} slot${slots === 1 ? '' : 's'})`
    lines.push(`${label}: ${spellCastingLine(spec, group)}`)
  }
  const intro = slotted.length && !atWill.length && !perDay.length
    ? `${who} is a level ${Number(sc.casterLevel) || 1} spellcaster that uses ${abilityName} as its spellcasting ability (${numbers}). It has the following spells prepared:`
    : `${who} casts one of the following spells${slotted.length ? '' : ', requiring no Material components'}, using ${abilityName} as the spellcasting ability (${numbers}):`
  return [intro, ...lines].join('\n')
}

function spellcastingItem(spec) {
  const sc = spec.spellcasting ?? emptySpellcasting()
  return {
    key: sc.key,
    name: 'Spellcasting',
    section: sc.slots ? 'trait' : sc.section || 'action',
    itemType: 'feat',
    description: spellcastingText(spec),
    img: 'icons/svg/book.svg',
    legendaryCost: 1,
    usesMax: '',
    usesRecovery: '',
    activities: [],
    effects: [],
  }
}

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

function attackAbility(activity, spec = null) {
  if (activity.ability) return activity.ability
  // Spell attacks default to the spellcasting ability, as dnd5e rolls them.
  if (activity.classification === 'spell' && spec) return spellcastingAbility(spec)
  return activity.attackType === 'ranged' ? 'dex' : 'str'
}

// dnd5e's NPC default when none is set is Intelligence.
export function spellcastingAbility(spec) {
  return spec?.spellcasting?.ability || 'int'
}

export function spellSaveDc(spec) {
  const data = npcRollData(spec)
  return 8 + data.prof + data[spellcastingAbility(spec)]
}

export function spellAttackBonus(spec) {
  const data = npcRollData(spec)
  return data.prof + data[spellcastingAbility(spec)]
}

export function attackToHit(spec, activity) {
  if (activity.toHit !== '' && activity.toHit != null) return Number(activity.toHit)
  const data = npcRollData(spec)
  return data[attackAbility(activity, spec)] + data.prof
}

const isFormulaDc = (dc) => /[@a-z]/i.test(String(dc ?? ''))

export function saveDc(spec, activity) {
  if (activity.dcAbility === 'spellcasting') return spellSaveDc(spec)
  if (activity.dcAbility) {
    const data = npcRollData(spec)
    return 8 + data.prof + data[activity.dcAbility]
  }
  if (isFormulaDc(activity.dc)) return averageFormula(activity.dc, npcRollData(spec))
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
// Cost discounts (Magus "Dark Arts cost 1 less", The Final Art's -4) live on
// the owner as flags.chrab-sync.discount.<key>: one per resource (darkness)
// and one per spending feature (shadow-lance). A pool cost subtracts both and
// never drops below 1. dnd5e evaluates the cost against the actor's roll data,
// which includes its flags; the spender's discountFloorEffect makes sure both
// flags exist (a missing @reference would break the formula).
export const DISCOUNT_FLAG = 'flags.chrab-sync.discount'

export function discountedCost(amount, pool, itemId) {
  const keys = [pool, itemId].filter(Boolean).map((k) => `@${DISCOUNT_FLAG}.${k}`)
  return keys.length ? `max(1, ${amount} - ${keys.join(' - ')})` : amount
}

// "max(1, 3 - @flags...)" -> "3", for reading a cost back into the editor.
function plainCost(value) {
  return String(value ?? '').match(/^max\(1, (\S+) - @flags\.chrab-sync\.discount\./)?.[1] ?? String(value ?? '')
}

export function spendTarget(spend, itemId = '') {
  const amount = String(spend.amount ?? '').trim() || '1'
  // Each extra step spends one more.
  const scaling = spend.extra ? { mode: 'amount', formula: '1' } : {}
  if (spend.source === 'item') return spend.target ? { type: 'itemUses', target: spend.target, value: amount, scaling } : null
  if (spend.source === 'pool') {
    const identifier = identifierFor(spend.target)
    return identifier ? { type: 'itemUses', target: identifier, value: discountedCost(amount, identifier, itemId), scaling } : null
  }
  const fixed = SPEND_SOURCES.find((s) => s.key === spend.source)?.target
  const target = fixed ?? String(spend.target ?? '').trim().replace(/^@/, '').replace(/^system\./, '')
  return target ? { type: 'attribute', target, value: amount, scaling } : null
}

// An activity that lets the user spend extra: its first damage part (or its
// healing) gains a die per extra step. A plain "2d8 + 3" adds 1d8; a custom
// formula adds one of its first die.
function scalePerExtraStep(built) {
  if (!built.consumption?.scaling?.allowed) return built
  const grow = (part) => {
    if (!part) return
    if (part.denomination) part.scaling = { mode: 'whole', number: 1 }
    else {
      const die = (part.custom?.formula ?? '').match(/d(\d+)/i)
      if (die) part.scaling = { mode: 'whole', number: 1, formula: `1d${die[1]}` }
    }
  }
  grow(built.damage?.parts?.[0])
  grow(built.healing)
  return built
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
    const target = spendTarget(spend, itemIdentifier(item))
    if (target) targets.push(target)
  }
  const extra = (activity?.spend ?? []).some((s) => s.extra && spendTarget(s))
  return { scaling: { allowed: extra, max: '' }, spellSlot: true, targets }
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
  // "idr" / "idi": the target's resistances / immunities don't count against this roll.
  if (activity.ignoreTraits?.length) props.ignoreTraits = [...activity.ignoreTraits]
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

// The one creature profile a summon / transform uses: by uuid, or (uuid
// blank) "pick one up to this CR of these types" from the compendium browser.
function creatureProfile(activity, activityId, extra = {}) {
  const uuid = String(activity.creatureUuid ?? '').trim()
  return {
    _id: `${String(activityId).slice(0, 12)}Prof`,
    name: String(activity.creatureName ?? '').trim(),
    uuid: uuid || null,
    cr: uuid ? '' : String(activity.crMax ?? '').trim(),
    types: uuid ? [] : [...(activity.creatureTypes ?? [])],
    level: { min: null, max: null },
    ...extra,
  }
}

// dnd5e 5.3 summon activity (data/activity/summon-data.mjs). The caster's
// proficiency, attack and save numbers carry over; midi's friendlySummon
// gives the summons the caster's disposition. Summons don't expire by
// themselves unless midi's autoRemoveSummonedCreature setting is on.
function summonData(activity, id) {
  const byUuid = !!String(activity.creatureUuid ?? '').trim()
  return {
    type: 'summon',
    profiles: [creatureProfile(activity, id, { count: String(activity.creatureCount ?? '').trim() || '1' })],
    summon: { mode: byUuid ? '' : 'cr', prompt: true },
    match: activity.summonMatch === false
      ? { attacks: false, saves: false, proficiency: false, disposition: true, ability: '' }
      : { attacks: true, saves: true, proficiency: true, disposition: true, ability: '' },
    bonuses: { ac: '', hd: '', hp: '', attackDamage: '', saveDamage: '', healing: '' },
    creatureSizes: [],
    creatureTypes: [],
    tempHP: '',
    friendlySummon: true,
  }
}

// dnd5e 5.3 transform activity (data/activity/transform-data.mjs). mode must
// be "" for a uuid (it defaults to "cr"). midi transforms the user straight
// away (target self); reverting is from the sheet unless midi's
// autoUndoTransformations is on.
function transformData(activity, id) {
  const byUuid = !!String(activity.creatureUuid ?? '').trim()
  const preset = TRANSFORM_PRESETS.some((p) => p.key === activity.transformPreset) ? activity.transformPreset : 'polymorph'
  const custom = preset === 'custom'
  return {
    type: 'transform',
    target: { prompt: false, override: true, template: { contiguous: false, stationary: false, units: 'ft', count: '', type: '', size: '', width: '', height: '' }, affects: { count: '', type: 'self', choice: false, special: '' } },
    profiles: [creatureProfile(activity, id, { sizes: [], movement: [] })],
    transform: { customize: custom, mode: byUuid ? '' : 'cr', preset: custom ? '' : preset },
    settings: custom
      ? {
          keep: ['mental', 'hp', 'class', 'feats', 'languages', 'bio', 'vision', 'spells', 'items'],
          merge: ['saves', 'skills'],
          effects: ['origin', 'otherOrigin', 'feat', 'spell', 'class', 'background'],
          other: [],
          spellLists: [],
          minimumAC: '',
          tempFormula: '',
          transformTokens: true,
          preset: null,
        }
      : null,
  }
}

// midi auto-places a region when the activity's range is "self" and its
// template a radius (utils.ts ~9191), attaches it to the caster
// (attachToken) and adds its regionActivity behavior with these rules.
function buildAura(aura, ids) {
  const rules = (aura.rules ?? [])
    .map((r) => ({
      trigger: AURA_TRIGGERS.some((t) => t.key === r.trigger) ? r.trigger : 'entry',
      action: AURA_ACTIONS.some((a) => a.key === r.action) ? r.action : 'useActivity',
      // midi resolves it to an activity (id or identifier) or one of the item's effects (id)
      targetId: ids[r.target] ?? r.target,
    }))
    .filter((r) => r.targetId)
  return {
    range: { units: 'self', special: '', override: true },
    target: {
      prompt: true,
      override: true,
      template: { contiguous: false, stationary: false, units: 'ft', count: '', type: 'radius', size: String(Number(aura.radius) || 10), width: '', height: '' },
      affects: { count: '', type: 'creature', choice: false, special: '' },
    },
    regionBehavior: {
      enabled: true,
      attachToken: 'caster',
      dispositionFilter: AURA_DISPOSITION[aura.affects] ?? -1,
      excludeSource: true,
      oncePerTurn: aura.oncePerTurn !== false,
      rules,
    },
  }
}

function rangeFor(activity, item) {
  if (activity.kind === 'attack') {
    // A weapon's range lives on the weapon. A feature (Shadow Lance) has no
    // range of its own, so its attack carries one - the long range, since an
    // activity has a single range value.
    if (item?.itemType === 'weapon') return { units: 'self', override: false }
    const ranged = activity.attackType === 'ranged'
    const value = ranged ? Number(activity.longRange) || Number(activity.range) || 0 : Number(activity.reach) || 5
    return value ? { value: String(value), units: 'ft', override: true } : { units: 'self', override: false }
  }
  if (activity.range) return { value: String(activity.range), units: 'ft', override: true }
  return { units: 'self', override: false }
}

function damageParts(rows) {
  return (rows ?? []).filter((r) => String(r.formula ?? '').trim() !== '').map((row) => damagePart(row))
}

function buildActivity(item, activity, effectRefs, index, ids = {}, automationOnly = false) {
  return scalePerExtraStep(buildActivityData(item, activity, effectRefs, index, ids, automationOnly))
}

function buildActivityData(item, activity, effectRefs, index, ids = {}, automationOnly = false) {
  const _id = ids[activity.key] ?? idFor(activity)
  const common = {
    _id,
    type: activity.kind,
    name: String(activity.name ?? '').trim(),
    sort: index * 100000,
    activation: activity.overTime ? { type: 'special', override: false } : activationFor(item, activity),
    consumption: consumptionFor(item, activity),
    duration: { units: 'inst', concentration: false, override: false },
    range: rangeFor(activity, item),
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
  if (activity.reactionTrigger && REACTION_TRIGGERS.some((t) => t.key === activity.reactionTrigger)) {
    common.reactionCondition = `reaction === "${activity.reactionTrigger}"`
  }
  const minutes = String(activity.durationMinutes ?? '').trim()
  if (minutes === 'perm') common.duration = { units: 'perm', concentration: false, override: true }
  else if (Number(minutes) > 0) common.duration = { value: String(Number(minutes)), units: 'minute', concentration: false, override: true }
  if (activity.aura) Object.assign(common, buildAura(activity.aura, ids))
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
  const code = hasFlow(activity) ? flowCode(activity.flow, { ids, itemName: item.name }) : scriptCode(activity.script)
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
          // '' lets dnd5e use the spellcasting ability for spell attacks.
          ability: activity.ability || (activity.classification === 'spell' ? '' : attackAbility(activity)),
          // Not flat: an extra bonus on top of ability + proficiency (a +3 weapon).
          bonus: flat ? String(activity.toHit) : String(activity.attackBonus ?? '').trim(),
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
          // A formula DC ("10 + @prof + @abilities.con.mod", a homebrew class's
          // own) resolves against whoever owns the item.
          dc: activity.dcAbility
            ? { calculation: activity.dcAbility, formula: '' }
            : { calculation: '', formula: isFormulaDc(activity.dc) ? normalizeFormula(activity.dc) : String(Number(activity.dc) || 10) },
        },
        damage: { onSave: activity.onSave || 'half', parts: damageParts(activity.damage), critical: { allow: false } },
        effects: effectRefs.map((ref) => ({ ...ref, onSave: false })),
      }
    case 'damage':
      return { ...common, damage: { parts: damageParts(activity.damage), critical: { allow: false } } }
    case 'heal':
      return { ...common, healing: { ...damagePart({ formula: activity.healing, types: [activity.healType === 'temphp' ? 'temphp' : 'healing'] }) } }
    case 'summon':
      return { ...common, ...summonData(activity, _id) }
    case 'transform':
      return { ...common, ...transformData(activity, _id) }
    default:
      return { ...common, type: 'utility', roll: { prompt: false, visible: false } }
  }
}

// ---------------------------------------------------------------------------
// Statblock text, used for blank descriptions and by the editor's preview

function signed(n) {
  return n >= 0 ? `+${n}` : String(n)
}

export const signedNumber = signed

// @mod in a roll: the attack's ability, or for a spell the spellcasting one.
function modAbility(spec, activity, inSpell) {
  if (activity.kind === 'attack') return attackAbility(activity, spec)
  return inSpell ? spellcastingAbility(spec) : null
}

function damageText(spec, activity, rows, inSpell = false) {
  const data = npcRollData(spec)
  const ability = modAbility(spec, activity, inSpell)
  const rollData = { ...data, mod: ability ? data[ability] : 0 }
  return (rows ?? [])
    .filter((r) => String(r.formula ?? '').trim() !== '')
    .map((r) => {
      const shown = bakeFormula(r.formula, rollData).replace(/\s+/g, ' ').replace(/\+ -/g, '- ')
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
      if (s.source === 'pool') {
        const id = identifierFor(s.target)
        return id ? `${amount} ${id.replace(/-/g, ' ')}${s.extra ? ' (or more, +1 die each)' : ''}` : ''
      }
      const label = { legact: 'Legendary Actions', legres: 'Legendary Resistances', hp: 'Hit Points' }[s.source]
      return label ? `${amount} ${label}` : ''
    })
    .filter(Boolean)
  return parts.length ? `Costs ${parts.join(' and ')}` : ''
}

// inSpell: the roll belongs to a spell, so @mod is the spellcasting modifier.
export function activitySummary(spec, activity, inSpell = false) {
  let body = activityBody(spec, activity, inSpell)
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

function activityBody(spec, activity, inSpell) {
  switch (activity.kind) {
    case 'attack': {
      const kind = `${activity.attackType === 'ranged' ? 'Ranged' : 'Melee'} ${activity.classification === 'spell' ? 'Spell ' : ''}Attack Roll`
      const reach =
        activity.attackType === 'ranged'
          ? `range ${activity.range || 30}${activity.longRange ? `/${activity.longRange}` : ''} ft.`
          : `reach ${activity.reach || 5} ft.`
      const hit = damageText(spec, activity, activity.damage, inSpell)
      return `${kind}: ${signed(attackToHit(spec, activity))}, ${reach}${hit ? ` Hit: ${hit}.` : ''}`
    }
    case 'save': {
      const label = activity.saveAbility?.toUpperCase() ?? 'DEX'
      const area = activity.areaType ? ` ${activity.areaSize || 0}-foot ${activity.areaType}.` : ''
      const dmg = damageText(spec, activity, activity.damage, inSpell)
      const onSave = activity.onSave === 'half' ? ' Success: Half damage.' : ''
      return `${label} Saving Throw: DC ${saveDc(spec, activity)}.${area}${dmg ? ` Failure: ${dmg}.${onSave}` : ''}`
    }
    case 'damage': {
      const dmg = damageText(spec, activity, activity.damage, inSpell)
      return dmg ? `${dmg}.` : ''
    }
    case 'heal': {
      const ability = modAbility(spec, activity, inSpell)
      const data = { ...npcRollData(spec) }
      data.mod = ability ? data[ability] : 0
      return activity.healing ? `Regains ${averageFormula(activity.healing, data)} (${bakeFormula(activity.healing, data)}) Hit Points.` : ''
    }
    case 'summon':
    case 'transform': {
      const who = String(activity.creatureName ?? '').trim() || (activity.creatureUuid ? 'the chosen creature' : `a creature of CR ${activity.crMax || '?'} or lower`)
      if (activity.kind === 'transform') return `Transforms into ${who}.`
      const count = String(activity.creatureCount ?? '').trim() || '1'
      return `Summons ${count === '1' ? who : `${count} × ${who}`}.`
    }
    default:
      return ''
  }
}

// Uses max may be a formula ("@prof"); the label shows what it comes to.
export function usesLabel(item, spec = null) {
  if (item.usesRecovery === 'recharge') return `Recharge ${item.rechargeOn >= 6 ? '6' : `${item.rechargeOn || 5}–6`}`
  if (!item.usesMax) return ''
  const max = spec && /[@d]/.test(String(item.usesMax)) ? averageFormula(item.usesMax, npcRollData(spec)) : item.usesMax
  if (item.usesRecovery === 'none') return `${max} charges`
  const per = { lr: 'Long Rest', sr: 'Short Rest', day: 'Day', dawn: 'Dawn', dusk: 'Dusk' }[item.usesRecovery] ?? 'Day'
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
// An NPC's numbers are baked in: midi evaluates the string against whoever
// carries the effect, which for a monster's poison is the victim. A standalone
// feature (spec.formulasAsIs) has no owner yet, so its formulas stay as they
// are and resolve against the carrier - right for a stance on yourself
// (Vanguard Stance's 1d10 + CON); a feature's effect on a target would read
// the target's numbers instead.
export function overTimeValue(spec, item, effect, ot) {
  const data = npcRollData(spec)
  const asIs = !!spec?.formulasAsIs
  const value = (formula) => (asIs ? normalizeFormula(formula) : bakeFormula(formula, data)).replace(/\s+/g, '')
  const parts = [`turn=${ot.turn === 'start' ? 'start' : 'end'}`, `label=${(effect.name || item.name || 'Effect').replace(/[,=#]/g, ' ')}`]
  if (ot.saveAbility) {
    const firstSave = (item.activities ?? []).find((a) => a.kind === 'save')
    const own = String(ot.saveDc ?? '').trim()
    const dc = own
      ? asIs ? value(own) : averageFormula(own, data)
      : firstSave
        ? asIs && isFormulaDc(firstSave.dc) ? value(firstSave.dc) : saveDc(spec, firstSave)
        : 10
    parts.push(`saveAbility=${ot.saveAbility}`, `saveDC=${dc}`, ot.saveRemoves !== false ? 'saveCount=1-' : 'saveRemove=false')
  }
  if (String(ot.damage ?? '').trim()) {
    parts.push(`damageRoll=${value(ot.damage)}`)
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
  if (def.build) value = def.build(value)
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
    if (item.usesRecovery === 'none') return { max: normalizeFormula(item.usesMax), spent: 0, recovery: [] }
    const period = item.usesRecovery || 'day'
    const formula = String(item.usesRecoverFormula ?? '').trim()
    return { max: normalizeFormula(item.usesMax), spent: 0, recovery: [formula ? { period, type: 'formula', formula: normalizeFormula(formula) } : { period, type: 'recoverAll' }] }
  }
  return { max: '', spent: 0, recovery: [] }
}

const slugIdentifier = identifierFor

// The item's dnd5e identifier: set by hand (a pool), else from its name.
export function itemIdentifier(item) {
  return identifierFor(item?.identifier) || slugIdentifier(item?.name)
}

// The pools an item's rolls spend from by identifier, for its discount flags.
function spentPools(item) {
  return [...new Set((item.activities ?? []).flatMap((a) => (a.spend ?? []).filter((s) => s.source === 'pool').map((s) => identifierFor(s.target))).filter(Boolean))]
}

// Always-on defaults for the owner flags an item's formulas read, so they
// always exist (a missing @reference breaks a formula):
//   - its costs' discount flags, "at least 0" (upgrade runs after any
//     discount's add, so a discount survives it)
//   - the values its rules store (flags.chrab-sync.stored.<name>), "+ 0" so
//     the stored value shows through
function discountFloorEffect(item) {
  const pools = spentPools(item)
  const stored = storedKeys(item.behavior)
  if (!pools.length && !stored.length) return null
  const keys = pools.length ? [...pools, itemIdentifier(item)] : []
  const changes = [
    ...keys.map((k) => ({ key: `${DISCOUNT_FLAG}.${k}`, value: '0', type: 'upgrade', phase: 'initial' })),
    ...stored.map((k) => ({ key: `flags.chrab-sync.stored.${k}`, value: '0', type: 'add', phase: 'initial' })),
  ]
  return {
    _id: `${String(item.key ?? randomId()).slice(0, 12)}Cost`,
    name: `${item.name || 'Feature'}: ${pools.length ? 'cost' : 'stored values'}`,
    img: item.img || 'icons/svg/aura.svg',
    description: '',
    type: 'base',
    system: { changes },
    statuses: [],
    disabled: false,
    transfer: true,
    duration: { units: 'seconds', value: null, expiry: null, expired: false },
    tint: '#ffffff',
    showIcon: 0,
    flags: { 'chrab-sync': { synthetic: true } },
    _stats: { ...STATS },
  }
}

function defaultImg(item) {
  if (item.img) return item.img
  if (item.section === 'trait') return 'icons/svg/book.svg'
  return item.itemType === 'weapon' ? 'icons/svg/sword.svg' : 'icons/svg/combat.svg'
}

// A behavior's own effect, when the item doesn't supply one: the stance a
// toggle copies onto its owner, or the always-on carrier of a passive one's
// hooks. Its id comes from the behavior key so a re-send keeps it.
function behaviorEffect(item, behavior, suffix, extra) {
  return {
    _id: `${String(behavior.key).slice(0, 12)}${suffix}`,
    name: item.name || 'Feature',
    img: item.img || 'icons/svg/aura.svg',
    description: '',
    type: 'base',
    system: { changes: [] },
    statuses: [],
    disabled: false,
    transfer: false,
    duration: { units: 'seconds', value: null, expiry: null, expired: false },
    tint: '#ffffff',
    showIcon: 1,
    flags: { 'chrab-sync': { synthetic: true } },
    _stats: { ...STATS },
    ...extra,
  }
}

export function buildNpcItem(spec, item, index = 0, { inSpell = false } = {}) {
  const behavior = activeBehavior(item)
  const toggle = behavior?.mode === 'toggle'
  const kept = (item.effects ?? []).filter((e) => e.name || e.statuses?.length || e.changes?.length)
  const effects = kept.map((e) => buildEffect(spec, e, item))
  // Stance effects are templates the toggle copies onto the owner; the icon
  // always shows on the token (showIcon 2) so the table can see it's on.
  const isStance = (e) => toggle && !!e.stance && !e.passive
  kept.forEach((e, i) => {
    // Rule effects: placed only by a behavior rule's "apply an effect" action.
    if (e.byRule && !e.passive && behavior) effects[i].flags = { ...effects[i].flags, 'chrab-sync': { byRule: true } }
    // Aura effects: placed only by an aura's rules (midi's sample marks them dontApply).
    if (e.aura && !e.passive) effects[i].flags = { ...effects[i].flags, dae: { ...effects[i].flags?.dae, dontApply: true }, 'chrab-sync': { ...effects[i].flags?.['chrab-sync'], aura: true } }
    if (!isStance(e)) return
    effects[i].flags = { ...effects[i].flags, 'chrab-sync': { stance: true } }
    effects[i].showIcon = 2
  })
  // An effect lands from every roll unless appliedBy names the ones it
  // belongs to (the Stun save, not the Strike that triggers it).
  const refsFor = (activity) =>
    kept
      .map((e, i) => [e, effects[i]])
      .filter(([e, built]) => !built.transfer && !isStance(e) && !e.byRule && !e.aura && (!e.appliedBy?.length || e.appliedBy.includes(activity.key)))
      .map(([, built]) => ({ _id: built._id, level: {} }))
  // Ids first, so one activity can point at another (midi triggers).
  const acts = item.activities ?? []
  // Effect keys too: an aura rule names the effect it applies by its id.
  const ids = { ...Object.fromEntries(kept.map((e, i) => [e.key, effects[i]._id])), ...Object.fromEntries(acts.map((a) => [a.key, idFor(a)])) }
  const reachedOnlyThroughOthers = new Set([
    ...acts.map((a) => a.triggerKey),
    ...acts.map((a) => a.otherKey),
    ...acts.filter((a) => a.overTime).map((a) => a.key),
    // an aura's "use a roll on it" rolls only happen through the aura
    ...acts.flatMap((a) => (a.aura?.rules ?? []).filter((r) => (r.action || 'useActivity') === 'useActivity').map((r) => r.target)),
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
  // A built flow is one macro listed at every pass it needs.
  const onUseParts = acts.flatMap((a) =>
    hasFlow(a)
      ? flowPasses(a.flow).map((pass) => `[${pass}]ActivityMacro-${ids[a.key]}`)
      : scriptCode(a.script).trim()
        ? [`[${scriptPass(a.script)}]ActivityMacro-${ids[a.key]}`]
        : [],
  )
  // Flows ride along by activity id so an export reads back into the builder.
  const flows = Object.fromEntries(acts.filter(hasFlow).map((a) => [ids[a.key], a.flow]))
  // Chrab Sync reads these: summons that move the one already out instead of
  // adding another (foundry/chrab-sync/scripts/summons.mjs).
  const single = acts.filter((a) => a.kind === 'summon' && a.summonSingle).map((a) => ids[a.key])

  // A behavior's hook goes FIRST: midi resolves the bare "ActivityMacro" in
  // the effect's onUseMacroName change to the item's first activity.
  if (behavior) {
    const hookSpec = {
      ...emptyActivity('utility'),
      key: behavior.key,
      name: toggle ? String(behavior.toggle?.label ?? '').trim() || 'Toggle' : 'Automation',
      activation: toggle ? behavior.toggle?.activation || 'bonus' : 'special',
      targetType: 'self',
    }
    const hook = buildActivity(item, hookSpec, [], -1, ids, !toggle)
    hook.target.affects = { ...hook.target.affects, type: 'self', count: '' }
    hook.macroData = { name: `${item.name || 'Feature'} automation`, command: behaviorMacro(item, behavior) }
    // Turn ticks: hidden activities midi uses at the start / end of the
    // owner's turn (ActivityOverTime below); using one runs the hook through
    // the item's own onUseMacroName, and the macro knows them by id.
    const ticks = turnTicks(behavior).map(({ id, turn }) => {
      const tickSpec = { ...emptyActivity('utility'), key: id, name: turn === 'start' ? 'Start of turn' : 'End of turn', targetType: 'self', overTime: { turn, saveEnds: false, once: false, effectKey: '' } }
      const built = buildActivity(item, tickSpec, [], -1, { ...ids, [id]: id }, true)
      built.overTimeProperties = { ...built.overTimeProperties, rollAs: 'target' }
      return built
    })
    const rest = { ...activities }
    for (const id of Object.keys(activities)) delete activities[id]
    Object.assign(activities, { [hook._id]: hook }, rest, Object.fromEntries(ticks.map((t) => [t._id, t])))
    // The item's own use runs the hook: a toggle, "I use this feature" rules, or a turn tick.
    if (toggle || hasSelfUseRules(behavior)) onUseParts.unshift(`[postActiveEffects]ActivityMacro-${hook._id}`)

    const changes = [
      ...behaviorChanges(behavior),
      ...ticks.map((t) => ({ key: 'flags.midi-qol.ActivityOverTime', value: overTimeIdentifier(t._id), type: 'override', phase: 'initial' })),
    ]
    // Bond effects land on targets and hook the "bonded creature" rules there;
    // midi resolves their bare ActivityMacro through effect.origin, this item.
    const bonds = bondChanges(behavior)
    kept.forEach((e, i) => {
      if (!e.bond || e.passive || isStance(e) || !bonds.length) return
      effects[i].flags = { ...effects[i].flags, 'chrab-sync': { ...effects[i].flags?.['chrab-sync'], bond: true } }
      effects[i].system.changes.push(...bonds)
    })
    if (toggle) {
      let stance = effects.find((e) => e.flags?.['chrab-sync']?.stance)
      if (!stance) {
        stance = behaviorEffect(item, behavior, 'Stnc', { showIcon: 2 })
        stance.flags['chrab-sync'].stance = true
        effects.push(stance)
      }
      stance.system.changes.push(...changes)
      // Every stance effect lasts as long as the stance; the toggle macro
      // clears the start so it counts from the moment it's turned on.
      const minutes = Number(behavior.toggle?.duration) || 0
      if (minutes > 0) {
        for (const e of effects) if (e.flags?.['chrab-sync']?.stance) e.duration = { ...e.duration, units: 'seconds', value: minutes * 60 }
      }
    } else {
      // A passive behavior with only bond rules needs no carrier on the owner.
      if (changes.length) effects.push(behaviorEffect(item, behavior, 'Auto', { transfer: true, system: { changes } }))
    }
  }
  const floor = discountFloorEffect(item)
  if (floor) effects.push(floor)
  const onUse = onUseParts.join(',')

  const generated = [...(item.activities ?? []).map((a) => activitySummary(spec, a, inSpell)), behaviorSummary(behavior, item.name)].filter(Boolean).join(' ')
  const description = textToHtml(item.description) || (generated ? `<p>${escapeHtml(generated)}</p>` : '')

  const isWeapon = item.itemType === 'weapon'
  const firstAttack = (item.activities ?? []).find((a) => a.kind === 'attack')
  const system = {
    description: { value: description, chat: '' },
    source: { custom: 'Chrab Corner', rules: '2024' },
    // Set by hand when other features spend this one's uses by identifier.
    identifier: itemIdentifier(item),
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
    flags: {
      ...(onUse ? { 'midi-qol': { onUseMacroName: onUse } } : {}),
      // The behavior spec rides along so an export reads back into the editor.
      ...(behavior || Object.keys(flows).length || single.length
        ? {
            'chrab-sync': {
              ...(behavior ? { behavior } : {}),
              ...(Object.keys(flows).length ? { flows } : {}),
              ...(single.length ? { singleSummon: single } : {}),
            },
          }
        : {}),
    },
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

  // Spells, plus the statblock entry listing them.
  const spells = spec.spells ?? []
  if (spells.length) {
    items.push(buildNpcItem(spec, spellcastingItem(spec), items.length))
    spells.forEach((spell, i) => items.push(buildNpcSpellItem(spec, spell, items.length + i)))
  }
  const sc = spec.spellcasting ?? emptySpellcasting()
  const slots = {}
  for (let level = 1; level <= 9; level++) {
    const n = sc.slots ? Number(sc.slotCounts?.[level]) || 0 : 0
    slots[`spell${level}`] = { value: n, override: n || null }
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
        spellcasting: spells.length ? spellcastingAbility(spec) : '',
        spell: { level: sc.slots ? Number(sc.casterLevel) || 1 : 0 },
      },
      spells: slots,
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

  const spellItems = (actor?.items ?? []).filter((item) => item.type === 'spell')
  spec.spells = spellItems.map(foundrySpellToNpcSpell)
  const castingFeat = spellItems.length
    ? (actor?.items ?? []).find((i) => i.type === 'feat' && /^spellcasting/i.test(i.name ?? '') && !Object.keys(i.system?.activities ?? {}).length)
    : null
  spec.spellcasting = { ...emptySpellcasting(), ability: s.attributes?.spellcasting || 'int' }
  if (castingFeat) {
    // The entry is regenerated from the spell list; keep its id and section.
    if (isFoundryId(castingFeat._id)) spec.spellcasting.key = castingFeat._id
    spec.spellcasting.section = foundryItemToNpcItem(castingFeat).section === 'trait' ? 'trait' : 'action'
  }
  for (let level = 1; level <= 9; level++) {
    const n = Number(s.spells?.[`spell${level}`]?.override ?? 0) || 0
    spec.spellcasting.slotCounts[level] = n
    if (n) spec.spellcasting.slots = true
  }
  if (spec.spellcasting.slots) spec.spellcasting.casterLevel = Number(s.attributes?.spell?.level) || 1

  spec.items = (actor?.items ?? [])
    .filter((item) => item.type === 'feat' || item.type === 'weapon')
    .filter((item) => item !== castingFeat)
    .filter((item) => item.name !== 'Legendary Resistance' || !spec.legendaryResistances)
    .filter((item) => item.name !== 'Legendary Actions')
    .map((item) => foundryItemToNpcItem(item))
  return spec
}

const SPELL_RANGE_UNITS = ['ft', 'mi', 'self', 'touch', 'spec', 'any']

// A Foundry spell item -> editor spell. Rolls and effects read the same way
// as any item's; the spell's own fields come off system.
export function foundrySpellToNpcSpell(item) {
  const sys = item.system ?? {}
  const asItem = foundryItemToNpcItem({ ...item, type: 'feat' })
  const uses = sys.uses ?? {}
  const perDay = sys.method !== 'spell' && sys.method !== 'pact' && uses.max
  const props = new Set(sys.properties ?? [])
  const legacyMode = sys.preparation?.mode // dnd5e 4.x exports
  const innate = sys.method === 'innate' || sys.method === 'atwill' || legacyMode === 'innate' || legacyMode === 'atwill'
  return {
    ...emptyNpcSpell(),
    key: asItem.key,
    name: item.name ?? '',
    img: item.img ?? '',
    level: Number(sys.level) || 0,
    school: sys.school || 'evo',
    method: perDay ? 'perDay' : innate ? 'atwill' : 'slots',
    usesPerDay: perDay ? Number(uses.max) || 1 : 1,
    activation: { type: sys.activation?.type || 'action', value: Number(sys.activation?.value) || 1, condition: sys.activation?.condition ?? '' },
    range: { value: sys.range?.value ?? '', units: SPELL_RANGE_UNITS.includes(sys.range?.units) ? sys.range.units : 'self' },
    area: { type: sys.target?.template?.type ?? '', size: sys.target?.template?.size ?? '' },
    duration: { value: sys.duration?.value ?? '', units: sys.duration?.units || 'inst' },
    concentration: props.has('concentration'),
    ritual: props.has('ritual'),
    components: { v: props.has('vocal'), s: props.has('somatic'), m: props.has('material') },
    materials: sys.materials?.value ?? '',
    description: sys.description?.value ?? '',
    upcast: spellUpcastFromParts(sys),
    source: { book: sys.source?.book ?? '', page: sys.source?.page ?? '' },
    activities: asItem.activities.map((a) => ({ ...a, activation: '', spend: (a.spend ?? []).filter((x) => x.source !== 'item' || x.target) })),
    effects: asItem.effects,
  }
}

// The per-level step of the first scaled damage/healing part.
function spellUpcastFromParts(sys) {
  for (const act of Object.values(sys.activities ?? {})) {
    for (const part of [...(act.damage?.parts ?? []), ...(act.healing ? [act.healing] : [])]) {
      if (part.scaling?.mode !== 'whole') continue
      if (part.scaling.formula) return part.scaling.formula
      if (part.denomination) return `${Number(part.scaling.number) || 1}d${part.denomination}`
    }
  }
  return ''
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
  // Changes built from a stored value (advSaveVs) share their key with a plain
  // flag, so they're recognized by their value first.
  for (const def of EFFECT_CHANGES.filter((d) => d.parse && d.path === change.key)) {
    const parsed = def.parse(value)
    if (parsed) return { ...row, id: def.id, type: def.types[0], value: parsed, path: '' }
  }
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


// The hook changes a behavior adds to its effect; rebuilt on every export.
const isBehaviorHook = (c) => c.key === 'flags.midi-qol.onUseMacroName' && /^\s*ActivityMacro\s*,/.test(String(c.value ?? ''))

export function foundryItemToNpcItem(item) {
  const sys = item.system ?? {}
  const behavior = item.flags?.['chrab-sync']?.behavior ?? null
  // The behavior's hook and turn ticks are rebuilt from it, not read back.
  const generatedIds = new Set(behavior ? [behavior.key, ...turnTicks(behavior).map((t) => t.id)] : [])
  const acts = Object.values(sys.activities ?? {})
    .filter((a) => !generatedIds.has(a._id))
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
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
    usesRecovery: recovery?.period ?? (sys.uses?.max ? 'none' : ''),
    usesRecoverFormula: recovery?.type === 'formula' ? recovery.formula ?? '' : '',
    rechargeOn: recovery?.period === 'recharge' ? Number(recovery.formula) || 5 : 5,
    // Kept only when it isn't simply the name's (a pool other features spend by it).
    identifier: sys.identifier && sys.identifier !== slugIdentifier(item.name) ? sys.identifier : '',
    magical: (sys.properties ?? []).includes('mgc') || acts.some((a) => a.midiProperties?.magicDamage),
    effects: (item.effects ?? [])
      .filter((e) => !e.flags?.['chrab-sync']?.synthetic)
      .map((e) => ({
        key: isFoundryId(e._id) ? e._id : randomId(),
        name: e.name ?? '',
        img: e.img ?? '',
        statuses: e.statuses ?? [],
        passive: !!e.transfer,
        stance: !!e.flags?.['chrab-sync']?.stance,
        bond: !!e.flags?.['chrab-sync']?.bond,
        byRule: !!e.flags?.['chrab-sync']?.byRule,
        aura: !!e.flags?.['chrab-sync']?.aura,
        onSave: false,
        specialDuration: e.flags?.dae?.specialDuration ?? [],
        // ActivityOverTime links come back as the over-time roll's effectKey.
        changes: (e.system?.changes ?? e.changes ?? [])
          .filter((c) => c.key !== 'flags.midi-qol.ActivityOverTime' && !isBehaviorHook(c))
          .map(changeFromFoundry),
        appliedBy: e.transfer || e.flags?.['chrab-sync']?.stance ? [] : appliedBy(e._id),
      })),
    activities: [],
    behavior: behavior ? structuredClone(behavior) : null,
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
    const a = { ...emptyActivity(['attack', 'save', 'damage', 'heal', 'summon', 'transform'].includes(act.type) ? act.type : 'utility') }
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
        // An item id is 16 mixed-case characters; an identifier is lowercase words.
        const byIdentifier = t.type === 'itemUses' && !isFoundryId(t.target) && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(t.target)
        const source = byIdentifier ? 'pool' : t.type === 'itemUses' ? 'item' : fixed ? fixed.key : 'attribute'
        return { ...emptySpend(), source, target: fixed ? '' : t.target, amount: byIdentifier ? plainCost(t.value ?? '1') : String(t.value ?? '1'), extra: t.scaling?.mode === 'amount' }
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
    a.reactionTrigger = String(act.reactionCondition ?? '').match(/^reaction === "(\w+)"$/)?.[1] ?? ''
    a.ignoreTraits = [...(act.midiProperties?.ignoreTraits ?? [])]
    if (act.duration?.override && act.duration.units === 'perm') a.durationMinutes = 'perm'
    else if (act.duration?.override && act.duration.units === 'minute') a.durationMinutes = String(act.duration.value ?? '')
    const rb = act.regionBehavior
    if (rb?.enabled) {
      const affects = Object.entries(AURA_DISPOSITION).find(([, v]) => v === rb.dispositionFilter)?.[0] ?? 'enemy'
      a.aura = {
        radius: String(act.target?.template?.size ?? ''),
        affects,
        oncePerTurn: rb.oncePerTurn !== false,
        rules: (rb.rules ?? []).map((r) => ({ trigger: r.trigger, action: r.action, target: keyForId[r.targetId] ?? r.targetId })),
      }
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
    const flow = item.flags?.['chrab-sync']?.flows?.[act._id]
    if (flow) a.flow = structuredClone(flow)
    else if (String(act.macroData?.command ?? '').trim()) {
      a.script = { recipe: 'custom', pass: macroPasses[act._id] || 'postActiveEffects', params: {}, code: act.macroData.command, edited: true }
    }
    if (act.type === 'attack') {
      a.attackType = act.attack?.type?.value === 'ranged' ? 'ranged' : 'melee'
      a.classification = act.attack?.type?.classification || 'weapon'
      a.ability = act.attack?.ability && act.attack.ability !== 'none' ? act.attack.ability : ''
      a.toHit = act.attack?.flat ? act.attack.bonus : ''
      a.attackBonus = act.attack?.flat ? '' : act.attack?.bonus ?? ''
      if (a.attackType === 'ranged') {
        a.range = sys.range?.value ?? 30
        a.longRange = sys.range?.long ?? null
      } else {
        a.reach = sys.range?.value ?? 5
      }
    }
    if (act.type === 'save') {
      a.saveAbility = act.save?.ability?.[0] ?? 'dex'
      if (act.save?.dc?.calculation) a.dcAbility = act.save.dc.calculation // an ability key or 'spellcasting'
      else a.dc = act.save?.dc?.formula ?? ''
      a.onSave = act.damage?.onSave ?? 'half'
    }
    if (act.damage?.parts) a.damage = act.damage.parts.map(partToRow)
    if (!a.damage.length) a.damage = [{ formula: '', types: [] }]
    if (act.type === 'summon' || act.type === 'transform') {
      const prof = act.profiles?.[0] ?? {}
      a.creatureUuid = prof.uuid ?? ''
      a.creatureName = prof.name ?? ''
      a.crMax = prof.cr ?? ''
      a.creatureTypes = [...(prof.types ?? [])]
      if (act.type === 'summon') {
        a.creatureCount = String(prof.count ?? '') || '1'
        a.summonMatch = act.match?.attacks !== false || act.match?.saves !== false
        a.summonSingle = (item.flags?.['chrab-sync']?.singleSummon ?? []).includes(act._id)
      }
      else a.transformPreset = act.transform?.customize ? 'custom' : act.transform?.preset || 'polymorph'
    }
    if (act.type === 'heal') {
      a.healing = partToRow(act.healing).formula
      a.healType = (act.healing?.types ?? []).includes('temphp') ? 'temphp' : 'healing'
    }
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
