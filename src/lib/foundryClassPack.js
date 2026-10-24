// The Foundry class pack: every public homebrew class and subclass as native
// dnd5e items - class, subclass and feature items with dnd5e's own
// advancements - published as one file that Chrab Sync loads into a world
// compendium ("Chrab Corner Classes"). Players drag a class from it onto their
// sheet and level up with the sheet's own level-up flow. See
// docs/foundry-classes.md.
//
// Pure: callers pass already-loaded class forms (lib/homebrew.js
// classToFormState shape) and the built Foundry items of the linked Feature
// Forge drafts.
//
// Every document id is derived from what it is (the class row's id, the
// feature's level and name), so a republish keeps the same ids. That keeps
// the class's ItemGrant / ItemChoice UUIDs valid, and lets Chrab Sync find
// the copies already on characters (flags.chrab-sync.packItem).

import { buildFeatureItem, featureSpecFromRow } from './foundryFeatures.js'
import { ABILITY_LABELS, ABILITY_SCORES, SKILLS, parseProficiencyText, splitChoiceGroups } from './homebrew.js'

export const CLASS_PACK_FORMAT = 'chrab-class-pack'
export const CLASS_PACK_BUCKET = 'foundry-feed'
export const CLASS_PACK_PATH = 'chrab-classes.json'
// A world compendium: its UUIDs are Compendium.world.<name>.Item.<id>.
export const CLASS_PACK_NAME = 'chrab-classes'
export const CLASS_PACK_LABEL = 'Chrab Corner Classes'

const packUuid = (id) => `Compendium.world.${CLASS_PACK_NAME}.Item.${id}`

const slug = (s) =>
  String(s ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

// ---------------------------------------------------------------------------
// Stable ids: 16 base62 characters (Foundry's id shape) from a key string.

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

function hash32(str, seed) {
  let h = 0x811c9dc5 ^ seed
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  h ^= h >>> 15
  h = Math.imul(h, 0x2c1b3c6d)
  h ^= h >>> 12
  h = Math.imul(h, 0x297a2d39)
  return (h ^ (h >>> 15)) >>> 0
}

export function stableId(key) {
  let out = ''
  for (let part = 0; part < 4; part++) {
    let n = hash32(key, part * 0x9e3779b1)
    for (let i = 0; i < 4; i++) {
      out += BASE62[n % 62]
      n = Math.floor(n / 62)
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// The editors' markdown (bold, italics, lists, pipe tables) as sheet HTML.

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const inline = (s) =>
  escapeHtml(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
const TABLE_SEPARATOR_RE = /^\s*\|?[\s:-]+\|[\s:|-]*\s*$/
const cells = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())

export function markdownToHtml(text) {
  const value = String(text ?? '').trim()
  if (!value) return ''
  if (value.startsWith('<')) return value
  return value
    .split(/\n\s*\n/)
    .map((block) => {
      const lines = block.trim().split('\n')
      if (lines.length >= 2 && lines[0].includes('|') && TABLE_SEPARATOR_RE.test(lines[1])) {
        const head = cells(lines[0]).map((c) => `<th>${inline(c)}</th>`).join('')
        const rows = lines.slice(2).map((l) => `<tr>${cells(l).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')
        return `<table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`
      }
      if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
        return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*]\s+/, ''))}</li>`).join('')}</ul>`
      }
      return `<p>${lines.map(inline).join('<br>')}</p>`
    })
    .join('')
}

// ---------------------------------------------------------------------------
// Advancements

const DICE_RE = /^(\d*)d(\d+)$/i
const BLANK = new Set(['', '-', '—', '–'])

// One class table column -> a dnd5e ScaleValue advancement, so formulas can
// use @scale.<class identifier>.<column identifier> ("Darkness Points" ->
// @scale.the-dark-knight.darkness-points). Numbers become a number scale,
// "1d8"/"d8" a dice scale, anything else a string scale. Only levels where
// the value changes are written, like dnd5e's own advancements.
export function tableColumnScaleValue(column) {
  const levels = Object.entries(column.valuesByLevel ?? {})
    .map(([level, value]) => [Number(level), String(value ?? '').trim()])
    .filter(([level, value]) => level >= 1 && level <= 20 && !BLANK.has(value))
    .sort((a, b) => a[0] - b[0])
  if (!levels.length || !String(column.name ?? '').trim()) return null
  const values = levels.map(([, v]) => v)
  const type = values.every((v) => /^-?\d+$/.test(v)) ? 'number' : values.every((v) => DICE_RE.test(v)) ? 'dice' : 'string'
  const scale = {}
  let previous = null
  for (const [level, value] of levels) {
    if (value === previous) continue
    previous = value
    if (type === 'number') scale[level] = { value: Number(value) }
    else if (type === 'dice') {
      const [, number, faces] = value.match(DICE_RE)
      scale[level] = { number: Number(number) || 1, faces: Number(faces) }
    } else scale[level] = { value }
  }
  return { type: 'ScaleValue', title: column.name.trim(), configuration: { identifier: slug(column.name), type, scale, distance: { units: '' } }, value: {} }
}

const SKILL_KEYS = {
  Acrobatics: 'acr',
  'Animal Handling': 'ani',
  Arcana: 'arc',
  Athletics: 'ath',
  Deception: 'dec',
  History: 'his',
  Insight: 'ins',
  Intimidation: 'itm',
  Investigation: 'inv',
  Medicine: 'med',
  Nature: 'nat',
  Perception: 'prc',
  Performance: 'prf',
  Persuasion: 'per',
  Religion: 'rel',
  'Sleight of Hand': 'slt',
  Stealth: 'ste',
  Survival: 'sur',
}

// Free-text proficiencies -> dnd5e trait keys. Only the standard terms map;
// anything else (firearms, a custom tool) stays in the class text.
function traitKeys(text, terms) {
  const keys = new Set()
  for (const part of parseProficiencyText(text)) {
    const lower = part.toLowerCase()
    for (const [word, key] of terms) if (lower.includes(word)) keys.add(key)
  }
  return [...keys]
}
const ARMOR_KEYS = [['light', 'armor:lgt'], ['medium', 'armor:med'], ['heavy', 'armor:hvy'], ['shield', 'armor:shl']]
const WEAPON_KEYS = [['simple', 'weapon:sim'], ['martial', 'weapon:mar']]

const trait = (title, grants, choices = [], extra = {}) => ({
  type: 'Trait',
  level: 1,
  title,
  configuration: { mode: 'default', allowReplacements: false, grants, choices },
  value: { chosen: [] },
  ...extra,
})

const NO_ABILITY = Object.fromEntries(ABILITY_SCORES.map((a) => [a.toLowerCase(), 0]))
const asi = (level) => ({
  type: 'AbilityScoreImprovement',
  level,
  title: '',
  configuration: { points: 2, fixed: { ...NO_ABILITY }, cap: 2, locked: [], recommendation: null },
  value: {},
})

// "Ability Score Improvement" / "Ability score increase" rows are dnd5e's ASI
// step (which also offers a feat), not a feature item.
const isAsiRow = (row) => /^ability score (improvement|increase)/i.test(row.name.trim())

const grant = (level, uuids, title) => ({
  type: 'ItemGrant',
  level,
  title,
  configuration: { items: uuids.map((uuid) => ({ uuid, optional: false })), optional: false, spell: null },
  value: {},
})

const choice = (level, count, uuids, title) => ({
  type: 'ItemChoice',
  title,
  configuration: {
    allowDrops: false,
    choices: { [level]: { count, replacement: false } },
    pool: uuids.map((uuid) => ({ uuid })),
    restriction: { type: 'feat', subtype: '', list: [], level: '' },
    spell: null,
    type: 'feat',
  },
  value: { added: {}, replaced: {} },
})

// ---------------------------------------------------------------------------
// Items

const SOURCE = (book) => ({ custom: 'Chrab Corner', book, page: '', license: '', rules: '2014', revision: 1 })

function plainFeature(name) {
  return {
    name,
    type: 'feat',
    img: 'icons/svg/upgrade.svg',
    system: {
      description: { value: '', chat: '' },
      identifier: slug(name),
      uses: { max: '', spent: 0, recovery: [] },
      activities: {},
      properties: [],
      type: { value: 'class', subtype: '' },
      requirements: '',
    },
    effects: [],
    flags: {},
  }
}

const tag = (doc, key) => ({ ...doc.flags, 'chrab-sync': { ...doc.flags?.['chrab-sync'], packItem: doc._id, packKey: key } })

// One feature row -> its item: the linked Feature Forge item when there is
// one (activities, effects, uses, macros), otherwise a plain text feature.
// The row owns the words either way.
function featureItem(row, { key, requirements, book, folder, sort, items }) {
  const linked = row.feature_draft_id ? items.get(row.feature_draft_id) : null
  const item = linked ? structuredClone(linked) : plainFeature(row.name.trim())
  item._id = stableId(key)
  item.name = row.name.trim()
  item.folder = folder
  item.sort = sort
  delete item.ownership
  delete item._stats
  item.system = {
    ...item.system,
    description: { value: markdownToHtml(row.description) || item.system?.description?.value || '', chat: '' },
    identifier: item.system?.identifier || slug(row.name),
    requirements,
    source: SOURCE(book),
    type: { value: 'class', subtype: item.system?.type?.subtype ?? '' },
  }
  item.flags = tag(item, key)
  return { item, automated: !!linked }
}

/**
 * One class's or subclass's feature rows -> feature items plus the ItemGrant /
 * ItemChoice / ASI advancements that hand them out level by level.
 */
function featuresAndAdvancements(rows, { keyPrefix, requirementsFor, book, folder, nextSort, items, grantTitle }) {
  const out = { items: [], advancement: [], automated: 0 }
  const named = rows.filter((r) => r.name?.trim())
  const levels = [...new Set(named.map((r) => r.level))].sort((a, b) => a - b)
  const make = (row) => {
    const key = `${keyPrefix}|${row.level}|${row.name.trim().toLowerCase()}`
    const { item, automated } = featureItem(row, { key, requirements: requirementsFor(row.level), book, folder, sort: nextSort(), items })
    out.items.push(item)
    if (automated) out.automated++
    return packUuid(item._id)
  }
  for (const level of levels) {
    const { ungrouped, groups } = splitChoiceGroups(named.filter((r) => r.level === level))
    const granted = []
    for (const row of ungrouped) {
      if (isAsiRow(row)) out.advancement.push(asi(level))
      else granted.push(make(row))
    }
    const choices = []
    for (const g of groups) {
      const count = g.features[0]?.choice_count ?? 1
      const uuids = g.features.map(make)
      // choice_count 0: everyone gets every option.
      if (count > 0) choices.push(choice(level, count, uuids, g.name))
      else granted.push(...uuids)
    }
    if (granted.length) out.advancement.push(grant(level, granted, grantTitle))
    out.advancement.push(...choices)
  }
  return out
}

// Advancement ids: stable per class, by kind and position.
function withIds(advancement, ownerId) {
  const seen = new Map()
  return advancement.map((a) => {
    const base = `${ownerId}|${a.type}|${a.level ?? Object.keys(a.configuration?.choices ?? {})[0] ?? ''}|${a.title ?? ''}`
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    return { _id: stableId(`${base}|${n}`), hint: '', ...a }
  })
}

function primaryAbilities(text) {
  const lower = String(text ?? '').toLowerCase()
  return ABILITY_SCORES.filter((a) => lower.includes(ABILITY_LABELS[a].toLowerCase())).map((a) => a.toLowerCase())
}

function classAdvancement(form, features) {
  const skillPool = form.skill_choices_options?.length
    ? form.skill_choices_options.map((s) => SKILL_KEYS[s] ?? SKILL_KEYS[SKILLS.find((k) => k.name.toLowerCase() === String(s).toLowerCase())?.name]).filter(Boolean).map((k) => `skills:${k}`)
    : ['skills:*']
  const out = [
    { type: 'HitPoints', configuration: {}, value: {}, title: '' },
    trait('Saving Throw Proficiencies', form.saving_throw_proficiencies.map((a) => `saves:${a.toLowerCase()}`), [], { classRestriction: 'primary' }),
  ]
  if (Number(form.skill_choices_count) > 0) {
    out.push(trait('Skill Proficiencies', [], [{ count: Number(form.skill_choices_count), pool: skillPool }], { classRestriction: 'primary' }))
  }
  const armor = traitKeys(form.armor_proficiencies, ARMOR_KEYS)
  if (armor.length) out.push(trait('Armor Training', armor))
  const weapons = traitKeys(form.weapon_proficiencies, WEAPON_KEYS)
  if (weapons.length) out.push(trait('Weapon Proficiencies', weapons))
  out.push(...features.advancement)
  const subclassLevel = Math.min(...(form.subclass_levels ?? []))
  if (Number.isFinite(subclassLevel) && form.subclasses?.length) {
    out.push({ type: 'Subclass', level: subclassLevel, title: form.subclass_label || 'Subclass', configuration: {}, value: { document: null, uuid: null } })
  }
  out.push(...(form.tableColumns ?? []).map(tableColumnScaleValue).filter(Boolean))
  return out
}

/**
 * @param classes   class forms (classToFormState), already limited to public ones;
 *                  each form's subclasses likewise limited to public ones
 * @param standaloneSubclasses  standalone subclass forms (parent_class_name set),
 *                  attached to the official class with that name ("Cleric" -> cleric)
 * @param items     Map feature draft id -> built Foundry item (buildFeatureItem
 *                  with its draftId)
 * @param generatedAt  Date
 */
export function buildClassPack({ classes = [], standaloneSubclasses = [], items = new Map(), generatedAt = new Date() }) {
  const pack = {
    format: CLASS_PACK_FORMAT,
    version: 1,
    generatedAt: generatedAt.toISOString(),
    pack: { name: CLASS_PACK_NAME, label: CLASS_PACK_LABEL },
    folders: [],
    items: [],
    summary: { classes: 0, subclasses: 0, features: 0, automated: 0 },
  }
  let sort = 0
  const nextSort = () => (sort += 100)
  const folderFor = (name) => {
    const _id = stableId(`folder|${name.toLowerCase()}`)
    if (!pack.folders.some((f) => f._id === _id)) pack.folders.push({ _id, name, type: 'Item', sorting: 'm', color: '#c4102f' })
    return _id
  }
  const take = (built) => {
    pack.items.push(...built.items)
    pack.summary.features += built.items.length
    pack.summary.automated += built.automated
  }

  const addSubclass = (sc, { className, classIdentifier, book, folder, classKey }) => {
    const id = stableId(`subclass|${sc.id ?? `${classKey}|${sc.name.toLowerCase()}`}`)
    const subclassName = sc.name.trim()
    const built = featuresAndAdvancements(sc.features ?? [], {
      keyPrefix: `${id}`,
      requirementsFor: (level) => `${className} ${level} (${subclassName})`,
      book,
      folder,
      nextSort,
      items,
      grantTitle: 'Subclass Features',
    })
    pack.items.push({
      _id: id,
      name: subclassName,
      type: 'subclass',
      img: 'icons/svg/book.svg',
      folder,
      sort: nextSort(),
      system: {
        description: { value: markdownToHtml(sc.description), chat: '' },
        identifier: slug(subclassName),
        classIdentifier,
        advancement: withIds(built.advancement, id),
        spellcasting: { progression: 'none', ability: '' },
        source: SOURCE(book),
      },
      effects: [],
      flags: { 'chrab-sync': { packItem: id, packKey: `subclass|${subclassName.toLowerCase()}` } },
    })
    take(built)
    pack.summary.subclasses++
  }

  for (const form of classes) {
    const className = form.name.trim()
    const classIdentifier = slug(className)
    const id = stableId(`class|${form.id ?? classIdentifier}`)
    const book = className
    const folder = folderFor(className)
    const classSort = nextSort()
    const built = featuresAndAdvancements(form.features ?? [], {
      keyPrefix: id,
      requirementsFor: (level) => `${className} ${level}`,
      book,
      folder,
      nextSort,
      items,
      grantTitle: 'Class Features',
    })
    const casting = form.spellcasting_progression && form.spellcasting_progression !== 'none'
    pack.items.push({
      _id: id,
      name: className,
      type: 'class',
      img: 'icons/svg/book.svg',
      folder,
      sort: classSort,
      system: {
        description: { value: markdownToHtml(form.description), chat: '' },
        identifier: classIdentifier,
        levels: 1,
        hd: { denomination: `d${Number(form.hit_die) || 8}`, spent: 0, additional: '' },
        primaryAbility: { value: primaryAbilities(form.primary_ability), all: false },
        spellcasting: { progression: casting ? form.spellcasting_progression : 'none', ability: casting ? String(form.spellcasting_ability ?? '').toLowerCase() : '' },
        advancement: withIds(classAdvancement(form, built), id),
        startingEquipment: [],
        source: SOURCE(book),
      },
      effects: [],
      flags: { 'chrab-sync': { packItem: id, packKey: `class|${classIdentifier}` } },
    })
    take(built)
    pack.summary.classes++
    for (const sc of form.subclasses ?? []) addSubclass(sc, { className, classIdentifier, book, folder, classKey: id })
  }

  for (const sc of standaloneSubclasses) {
    const parent = String(sc.parent_class_name ?? '').trim()
    if (!parent) continue
    addSubclass(sc, { className: parent, classIdentifier: slug(parent), book: sc.name.trim(), folder: folderFor(`${parent} subclasses`), classKey: slug(parent) })
  }

  return pack
}

// Built items for linked drafts, as buildClassPack wants them.
export function draftItems(drafts) {
  const items = new Map()
  for (const d of drafts) if (d.kind === 'feat') items.set(d.id, buildFeatureItem(featureSpecFromRow(d.spec), { draftId: d.id }))
  return items
}

// Counts for the DM page's status line.
export function classPackSummary(pack) {
  if (pack?.format !== CLASS_PACK_FORMAT) return null
  return { ...pack.summary, updatedAt: pack.generatedAt ? new Date(pack.generatedAt) : null }
}
