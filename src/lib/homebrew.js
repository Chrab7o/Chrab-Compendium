// Pure data-shape helpers for the homebrew Class/Subclass builder — no
// React, same "helpers separate from the editor component" split as
// src/lib/skillTrees.js.

export const ABILITY_SCORES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']

export const ABILITY_LABELS = {
  STR: 'Strength',
  DEX: 'Dexterity',
  CON: 'Constitution',
  INT: 'Intelligence',
  WIS: 'Wisdom',
  CHA: 'Charisma',
}

export const SPELLCASTING_PROGRESSIONS = [
  { value: 'none', label: 'None' },
  { value: 'full', label: 'Full caster' },
  { value: 'half', label: 'Half caster' },
  { value: 'third', label: 'Third caster' },
  { value: 'pact', label: 'Pact magic' },
]

// Pick-list options for the proficiency fields. These are the standard 5e
// terms, offered as dropdown choices so the common case is a click instead
// of retyping "Light armor, Medium armor, Shields" by hand — but every
// picker still takes a custom entry, since homebrew classes routinely grant
// proficiencies that aren't on any official list.
export const ARMOR_PROFICIENCY_OPTIONS = ['Light armor', 'Medium armor', 'Heavy armor', 'Shields']

export const WEAPON_PROFICIENCY_OPTIONS = [
  {
    group: 'Categories',
    options: ['Simple weapons', 'Martial weapons', 'Improvised weapons', 'Firearms'],
  },
  {
    group: 'Simple weapons',
    options: [
      'Clubs',
      'Daggers',
      'Greatclubs',
      'Handaxes',
      'Javelins',
      'Light hammers',
      'Maces',
      'Quarterstaffs',
      'Sickles',
      'Spears',
      'Light crossbows',
      'Darts',
      'Shortbows',
      'Slings',
    ],
  },
  {
    group: 'Martial weapons',
    options: [
      'Battleaxes',
      'Flails',
      'Glaives',
      'Greataxes',
      'Greatswords',
      'Halberds',
      'Lances',
      'Longswords',
      'Mauls',
      'Morningstars',
      'Pikes',
      'Rapiers',
      'Scimitars',
      'Shortswords',
      'Tridents',
      'War picks',
      'Warhammers',
      'Whips',
      'Blowguns',
      'Hand crossbows',
      'Heavy crossbows',
      'Longbows',
      'Nets',
    ],
  },
]

export const TOOL_PROFICIENCY_OPTIONS = [
  {
    group: 'Artisan’s tools',
    options: [
      "Alchemist's supplies",
      "Brewer's supplies",
      "Calligrapher's supplies",
      "Carpenter's tools",
      "Cartographer's tools",
      "Cobbler's tools",
      "Cook's utensils",
      "Glassblower's tools",
      "Jeweler's tools",
      "Leatherworker's tools",
      "Mason's tools",
      "Painter's supplies",
      "Potter's tools",
      "Smith's tools",
      "Tinker's tools",
      "Weaver's tools",
      "Woodcarver's tools",
    ],
  },
  {
    group: 'Kits & gear',
    options: [
      "Thieves' tools",
      'Disguise kit',
      'Forgery kit',
      'Herbalism kit',
      "Navigator's tools",
      "Poisoner's kit",
      'Vehicles (land)',
      'Vehicles (water)',
    ],
  },
  {
    group: 'Gaming sets',
    options: ['Dice set', 'Dragonchess set', 'Playing card set', 'Three-Dragon Ante set', 'Any one gaming set'],
  },
  {
    group: 'Musical instruments',
    options: [
      'Bagpipes',
      'Drum',
      'Dulcimer',
      'Flute',
      'Lute',
      'Lyre',
      'Horn',
      'Pan flute',
      'Shawm',
      'Viol',
      'Any one musical instrument',
    ],
  },
]

// The 18 skills with the ability they key off, so the skill picker can show
// "Athletics (STR)" without a second lookup table.
export const SKILLS = [
  { name: 'Acrobatics', ability: 'DEX' },
  { name: 'Animal Handling', ability: 'WIS' },
  { name: 'Arcana', ability: 'INT' },
  { name: 'Athletics', ability: 'STR' },
  { name: 'Deception', ability: 'CHA' },
  { name: 'History', ability: 'INT' },
  { name: 'Insight', ability: 'WIS' },
  { name: 'Intimidation', ability: 'CHA' },
  { name: 'Investigation', ability: 'INT' },
  { name: 'Medicine', ability: 'WIS' },
  { name: 'Nature', ability: 'INT' },
  { name: 'Perception', ability: 'WIS' },
  { name: 'Performance', ability: 'CHA' },
  { name: 'Persuasion', ability: 'CHA' },
  { name: 'Religion', ability: 'INT' },
  { name: 'Sleight of Hand', ability: 'DEX' },
  { name: 'Stealth', ability: 'DEX' },
  { name: 'Survival', ability: 'WIS' },
]

// The proficiency columns are a single free-text string in the schema (and
// in both import/export formats), but the wizard edits them as a list of
// picked options. These two convert between the two shapes. Splitting on
// "or" as well as commas keeps text typed by hand before the pickers
// existed ("Light armor, medium armor, and shields", "Strength or
// Dexterity") from coming back as one giant chip.
export function parseProficiencyText(text) {
  return (text || '')
    .split(/,|\bor\b|\band\b/i)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function joinProficiencyList(list, separator = ', ') {
  return list.join(separator)
}

export const emptySubclassForm = () => ({
  id: null,
  name: '',
  description: '',
  visibility: 'dm',
  features: [],
})

export const emptyClassForm = {
  id: null,
  name: '',
  slug: '',
  description: '',
  hit_die: 8,
  primary_ability: '',
  saving_throw_proficiencies: [],
  armor_proficiencies: '',
  weapon_proficiencies: '',
  tool_proficiencies: '',
  skill_choices_count: 2,
  skill_choices_options: [],
  starting_equipment: '',
  spellcasting_ability: '',
  spellcasting_progression: 'none',
  subclass_label: 'Subclass',
  subclass_levels: [3],
  campaign_id: '',
  visibility: 'dm',
  features: [],
  tableColumns: [], // [{ id, name, valuesByLevel: { [level]: value } }]
  subclasses: [], // [emptySubclassForm(), ...]
}

// A subclass for a class this app doesn't track itself (e.g. an official
// Monk monastic tradition) - no hit die/proficiencies/spellcasting to carry,
// just a name, which class it belongs to (plain text, not a link), and its
// own features. `parent_class_name` mirrors `class_id`-linked subclasses'
// role but as free text instead of a foreign key.
export const emptyStandaloneSubclassForm = {
  id: null,
  name: '',
  slug: '',
  parent_class_name: '',
  description: '',
  visibility: 'dm',
  features: [],
}

export function standaloneSubclassToFormState(subclassRow, features) {
  return {
    id: subclassRow.id,
    name: subclassRow.name,
    slug: subclassRow.slug ?? '',
    parent_class_name: subclassRow.parent_class_name ?? '',
    description: subclassRow.description,
    visibility: subclassRow.visibility ?? 'public',
    features: sortByLevel(features).map((f) => ({
      id: f.id,
      level: f.level,
      name: f.name,
      description: f.description,
      sort_order: f.sort_order,
      choice_group: f.choice_group ?? '',
      choice_count: f.choice_count ?? null,
    })),
  }
}

// --- Races -----------------------------------------------------------------
// A race is a fixed stat line (the fields below) plus a free trait list.
// Traits reuse the feature row shape minus `level` - RepeatableRows and
// NestedFeatureList work on them unchanged, including sub-features for
// "choose one" traits like a subrace or a draconic ancestry.

export const RACE_SIZES = ['Tiny', 'Small', 'Medium', 'Large']

export const CREATURE_TYPES = [
  'Aberration',
  'Beast',
  'Celestial',
  'Construct',
  'Dragon',
  'Elemental',
  'Fey',
  'Fiend',
  'Giant',
  'Humanoid',
  'Monstrosity',
  'Ooze',
  'Plant',
  'Undead',
]

export const RACE_SPEEDS = [
  { key: 'speed_fly', label: 'Fly' },
  { key: 'speed_swim', label: 'Swim' },
  { key: 'speed_climb', label: 'Climb' },
  { key: 'speed_burrow', label: 'Burrow' },
]

export const LANGUAGE_OPTIONS = [
  {
    group: 'Standard',
    options: ['Common', 'Dwarvish', 'Elvish', 'Giant', 'Gnomish', 'Goblin', 'Halfling', 'Orc'],
  },
  {
    group: 'Exotic',
    options: ['Abyssal', 'Celestial', 'Draconic', 'Deep Speech', 'Infernal', 'Primordial', 'Sylvan', 'Undercommon'],
  },
  { group: 'Choice', options: ['One extra language of your choice', 'Two extra languages of your choice'] },
]

export const emptyRaceForm = {
  id: null,
  name: '',
  slug: '',
  description: '',
  creature_type: 'Humanoid',
  sizes: ['Medium'],
  speed_walk: 30,
  speed_fly: null,
  speed_swim: null,
  speed_climb: null,
  speed_burrow: null,
  darkvision: null,
  ability_bonuses: {},
  ability_bonus_note: '',
  languages: ['Common'],
  visibility: 'dm',
  traits: [],
}

export function raceToFormState(raceRow, traits) {
  return {
    ...emptyRaceForm,
    ...raceRow,
    ability_bonuses: raceRow.ability_bonuses ?? {},
    traits: [...traits]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        sort_order: t.sort_order,
        choice_group: t.choice_group ?? '',
        choice_count: t.choice_count ?? null,
      })),
  }
}

// JSON export/import - same idea as classFormToExportJson below: the form's
// own field names, minus ids/visibility, with traits as a flat list where a
// sub-trait names its parent in choice_group.
export function raceFormToExportJson(form) {
  return {
    name: form.name,
    slug: form.slug,
    description: form.description,
    creature_type: form.creature_type,
    sizes: form.sizes,
    speed_walk: form.speed_walk,
    speed_fly: form.speed_fly,
    speed_swim: form.speed_swim,
    speed_climb: form.speed_climb,
    speed_burrow: form.speed_burrow,
    darkvision: form.darkvision,
    ability_bonuses: form.ability_bonuses,
    ability_bonus_note: form.ability_bonus_note,
    languages: form.languages,
    traits: form.traits.map(({ name, description, choice_group, choice_count }) => ({
      name,
      description,
      choice_group: choice_group || undefined,
      choice_count: choice_group ? choice_count ?? undefined : undefined,
    })),
  }
}

export function raceJsonToFormState(json) {
  return {
    ...emptyRaceForm,
    name: json.name ?? '',
    slug: json.slug ?? '',
    description: json.description ?? '',
    creature_type: json.creature_type ?? emptyRaceForm.creature_type,
    sizes: json.sizes ?? emptyRaceForm.sizes,
    speed_walk: json.speed_walk ?? emptyRaceForm.speed_walk,
    speed_fly: json.speed_fly ?? null,
    speed_swim: json.speed_swim ?? null,
    speed_climb: json.speed_climb ?? null,
    speed_burrow: json.speed_burrow ?? null,
    darkvision: json.darkvision ?? null,
    ability_bonuses: json.ability_bonuses ?? {},
    ability_bonus_note: json.ability_bonus_note ?? '',
    languages: json.languages ?? emptyRaceForm.languages,
    traits: (json.traits ?? []).map((t, i) => ({
      id: null,
      name: t.name,
      description: t.description ?? '',
      sort_order: i,
      choice_group: t.choice_group ?? '',
      choice_count: t.choice_count ?? null,
    })),
  }
}

// "30 ft., fly 30 ft., swim 20 ft." - the walking speed is always shown,
// the others only when set.
export function formatRaceSpeed(race) {
  const parts = [`${race.speed_walk} ft.`]
  for (const { key, label } of RACE_SPEEDS) {
    if (race[key] != null) parts.push(`${label.toLowerCase()} ${race[key]} ft.`)
  }
  return parts.join(', ')
}

// { STR: 2, WIS: 1 } + note -> "Strength +2, Wisdom +1; ...note", in the
// standard STR..CHA order regardless of insertion order.
export function formatAbilityBonuses(bonuses, note) {
  const fixed = ABILITY_SCORES.filter((a) => bonuses?.[a])
    .map((a) => `${ABILITY_LABELS[a]} ${bonuses[a] > 0 ? '+' : ''}${bonuses[a]}`)
    .join(', ')
  return [fixed, note?.trim()].filter(Boolean).join('; ')
}

// Sorted for display: by level first, then whatever order they were added
// in within that level.
export function sortByLevel(rows) {
  return [...rows].sort((a, b) => a.level - b.level || a.sort_order - b.sort_order)
}

// Splits one level's features into plain (ungrouped) ones and clusters of
// named choice groups (e.g. "Dark Arts") - preserves first-seen order for
// both the ungrouped list and the group names themselves.
export function splitChoiceGroups(features) {
  const ungrouped = []
  const groupOrder = []
  const groups = new Map()
  for (const f of features) {
    if (!f.choice_group) {
      ungrouped.push(f)
      continue
    }
    if (!groups.has(f.choice_group)) {
      groups.set(f.choice_group, [])
      groupOrder.push(f.choice_group)
    }
    groups.get(f.choice_group).push(f)
  }
  return { ungrouped, groups: groupOrder.map((name) => ({ name, features: groups.get(name) })) }
}

// Rebuilds the parent/sub-feature tree one level's features describe. The
// storage shape stays flat — a sub-feature is a row whose choice_group
// names its parent feature (the shape the 5etools importer already
// produces) — but "Metamagic" and the metamagic options the player picks
// from are one thing to read and one thing to edit, so both the detail page
// and the wizard work with this nested view instead.
//
// Matching is by name: exact first, then the same "parent name contains the
// group name" fallback the 5etools export uses, so a group called "Dark
// Arts" still finds a feature named "Dark Arts Continued". A group whose
// parent is missing entirely (older data, or an import with no intro
// feature) gets a synthesized stand-in parent so its options never vanish.
export function nestFeatures(features) {
  const nodes = []
  const byName = new Map()
  for (const f of features) {
    if (f.choice_group) continue
    const node = { feature: f, children: [], choiceCount: null, synthetic: false }
    nodes.push(node)
    byName.set(f.name.trim().toLowerCase(), node)
  }
  for (const f of features) {
    if (!f.choice_group) continue
    const key = f.choice_group.trim().toLowerCase()
    let node = byName.get(key) ?? nodes.find((n) => !n.synthetic && n.feature.name.toLowerCase().includes(key))
    if (!node) {
      node = {
        feature: { id: `group:${f.choice_group}`, level: f.level, name: f.choice_group, description: '' },
        children: [],
        choiceCount: null,
        synthetic: true,
      }
      nodes.push(node)
      byName.set(key, node)
    }
    node.children.push(f)
  }
  for (const node of nodes) {
    if (node.children.length === 0) continue
    // The count lives on the option rows (one column, set the same on each)
    // — null is the pre-existing "choose 1" default, 0 means everyone gets
    // all of them rather than picking.
    node.choiceCount = node.children[0].choice_count ?? 1
  }
  return nodes
}

// The editor's half of the same transform: flat rows in, nested rows out,
// where each parent carries its own `children` array and `choice_count`.
export function nestFeatureRows(rows) {
  return nestFeatures(rows).map((node) => {
    // A synthesized parent's id is a display-only placeholder ("group:Dark
    // Arts"), not a row that exists - dropping it here means saving turns
    // the stand-in into a real intro feature instead of trying to reuse it.
    const { id, ...feature } = node.feature
    return {
      ...(node.synthetic ? feature : { id, ...feature }),
      choice_group: '',
      choice_count: node.choiceCount,
      children: node.children.map(({ children: _drop, ...child }) => child),
    }
  })
}

// Nested rows back to the flat shape the tables store: each parent followed
// by its own options, every option stamped with the parent's name and level
// so the pairing survives a rename or a level change made in the editor.
export function flattenFeatureRows(nested) {
  const flat = []
  for (const parent of nested) {
    const { children = [], ...row } = parent
    flat.push({ ...row, choice_group: '', choice_count: null, sort_order: flat.length })
    for (const child of children) {
      flat.push({
        ...child,
        level: row.level,
        choice_group: row.name,
        choice_count: row.choice_count ?? 1,
        sort_order: flat.length,
      })
    }
  }
  return flat
}

// Reshapes the DB rows for one class into the flat form object the wizard
// edits — mirrors SkillTreeNodeEditor.startEdit()'s reshape-into-form-state.
export function classToFormState(classRow, features, tableColumns, tableValues, subclasses, subclassFeaturesBySubclassId) {
  const valuesByColumn = new Map()
  for (const v of tableValues) {
    if (!valuesByColumn.has(v.column_id)) valuesByColumn.set(v.column_id, {})
    valuesByColumn.get(v.column_id)[v.level] = v.value
  }

  return {
    id: classRow.id,
    name: classRow.name,
    slug: classRow.slug,
    description: classRow.description,
    hit_die: classRow.hit_die,
    primary_ability: classRow.primary_ability,
    saving_throw_proficiencies: classRow.saving_throw_proficiencies ?? [],
    armor_proficiencies: classRow.armor_proficiencies,
    weapon_proficiencies: classRow.weapon_proficiencies,
    tool_proficiencies: classRow.tool_proficiencies,
    skill_choices_count: classRow.skill_choices_count,
    skill_choices_options: classRow.skill_choices_options ?? [],
    starting_equipment: classRow.starting_equipment,
    spellcasting_ability: classRow.spellcasting_ability ?? '',
    spellcasting_progression: classRow.spellcasting_progression,
    subclass_label: classRow.subclass_label,
    subclass_levels: classRow.subclass_levels ?? [],
    campaign_id: classRow.campaign_id ?? '',
    visibility: classRow.visibility ?? 'public',
    features: sortByLevel(features).map((f) => ({
      id: f.id,
      level: f.level,
      name: f.name,
      description: f.description,
      sort_order: f.sort_order,
      choice_group: f.choice_group ?? '',
      choice_count: f.choice_count ?? null,
    })),
    tableColumns: [...tableColumns]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((c) => ({ id: c.id, name: c.name, valuesByLevel: valuesByColumn.get(c.id) ?? {} })),
    subclasses: subclasses.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      visibility: s.visibility ?? 'public',
      features: sortByLevel(subclassFeaturesBySubclassId.get(s.id) ?? []).map((f) => ({
        id: f.id,
        level: f.level,
        name: f.name,
        description: f.description,
        sort_order: f.sort_order,
        choice_group: f.choice_group ?? '',
        choice_count: f.choice_count ?? null,
      })),
    })),
  }
}

// JSON export/import — same idea as skillTrees.js's treeToExportJson, kept
// close to the wizard's own form shape (snake_case fields, tableColumns with
// valuesByLevel, nested subclasses) rather than inventing a second shape to
// translate through, since this format is only ever read by this app.

export function classFormToExportJson(form) {
  return {
    name: form.name,
    slug: form.slug,
    description: form.description,
    hit_die: form.hit_die,
    primary_ability: form.primary_ability,
    saving_throw_proficiencies: form.saving_throw_proficiencies,
    armor_proficiencies: form.armor_proficiencies,
    weapon_proficiencies: form.weapon_proficiencies,
    tool_proficiencies: form.tool_proficiencies,
    skill_choices_count: form.skill_choices_count,
    skill_choices_options: form.skill_choices_options,
    starting_equipment: form.starting_equipment,
    spellcasting_ability: form.spellcasting_ability,
    spellcasting_progression: form.spellcasting_progression,
    subclass_label: form.subclass_label,
    subclass_levels: form.subclass_levels,
    features: form.features.map(({ level, name, description, choice_group, choice_count }) => ({
      level,
      name,
      description,
      choice_group: choice_group || undefined,
      choice_count: choice_group ? choice_count ?? undefined : undefined,
    })),
    tableColumns: form.tableColumns.map(({ name, valuesByLevel }) => ({ name, valuesByLevel })),
    subclasses: form.subclasses.map((s) => ({
      name: s.name,
      description: s.description,
      features: s.features.map(({ level, name, description, choice_group, choice_count }) => ({
        level,
        name,
        description,
        choice_group: choice_group || undefined,
        choice_count: choice_group ? choice_count ?? undefined : undefined,
      })),
    })),
  }
}

export function classJsonToFormState(json) {
  return {
    id: null,
    name: json.name ?? '',
    slug: json.slug ?? '',
    description: json.description ?? '',
    hit_die: json.hit_die ?? 8,
    primary_ability: json.primary_ability ?? '',
    saving_throw_proficiencies: json.saving_throw_proficiencies ?? [],
    armor_proficiencies: json.armor_proficiencies ?? '',
    weapon_proficiencies: json.weapon_proficiencies ?? '',
    tool_proficiencies: json.tool_proficiencies ?? '',
    skill_choices_count: json.skill_choices_count ?? 0,
    skill_choices_options: json.skill_choices_options ?? [],
    starting_equipment: json.starting_equipment ?? '',
    spellcasting_ability: json.spellcasting_ability ?? '',
    spellcasting_progression: json.spellcasting_progression ?? 'none',
    subclass_label: json.subclass_label ?? 'Subclass',
    subclass_levels: json.subclass_levels ?? [3],
    campaign_id: '',
    visibility: 'dm',
    features: (json.features ?? []).map((f, i) => ({
      id: null,
      level: f.level,
      name: f.name,
      description: f.description ?? '',
      sort_order: i,
      choice_group: f.choice_group ?? '',
      choice_count: f.choice_count ?? null,
    })),
    tableColumns: (json.tableColumns ?? []).map((c) => ({ id: null, name: c.name, valuesByLevel: c.valuesByLevel ?? {} })),
    subclasses: (json.subclasses ?? []).map((s) => ({
      id: null,
      name: s.name,
      description: s.description ?? '',
      visibility: 'dm',
      features: (s.features ?? []).map((f, i) => ({
        id: null,
        level: f.level,
        name: f.name,
        description: f.description ?? '',
        sort_order: i,
        choice_group: f.choice_group ?? '',
        choice_count: f.choice_count ?? null,
      })),
    })),
  }
}

// --- 5etools homebrew export ---------------------------------------------
// See docs/5etools-class-schema.md for the full researched format this
// targets and the field-by-field mapping this function implements.

const FIVETOOLS_SCHEMA_URL =
  'https://raw.githubusercontent.com/TheGiddyLimit/5etools-utils/master/schema/brew-fast/homebrew.json'

const CASTER_PROGRESSION_5E = { full: 'full', half: '1/2', third: '1/3', pact: 'pact' }

const ARMOR_TERMS = ['light', 'medium', 'heavy', 'shield']
const WEAPON_TERMS = ['simple', 'martial']

const SUBCLASS_PREFIX_RE = /^(path of|order of|circle of|oath of|way of|calling of|domain of|the)\s+/i

function deriveSourceAbbr(name) {
  const initials = (name || '')
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .join('')
    .toUpperCase()
  return initials || 'HB'
}

function deriveShortName(name) {
  return (name || '').replace(SUBCLASS_PREFIX_RE, '').trim() || name
}

function refString(name, className, source, level) {
  return `${name}|${className}|${source}|${level}`
}

function subclassRefString(name, className, source, subclassShortName, subclassSource, level) {
  return `${name}|${className}|${source}|${subclassShortName}|${subclassSource}|${level}`
}

// Best-effort free-text -> array normalizer for proficiency fields that are
// a single comma-separated string in our schema but a string array in
// 5etools' - matches against the small set of standard terms 5etools uses
// and falls back to the lowercased phrase itself for anything else.
function normalizeProficiencyList(text, knownTerms) {
  return (text || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .map((s) => knownTerms.find((t) => s.includes(t)) ?? s)
}

// Our free-text primaryAbility ("Strength" / "Strength or Dexterity") into
// 5etools' [{str: true}, {dex: true}] shape - matched by scanning for each
// ability's full name in the text rather than trying to parse "X or Y"
// grammar, since DMs phrase this inconsistently.
function primaryAbilityToFiveTools(text) {
  if (!text) return undefined
  const found = ABILITY_SCORES.filter((a) => text.toLowerCase().includes(ABILITY_LABELS[a].toLowerCase()))
  if (found.length === 0) return undefined
  return found.map((a) => ({ [a.toLowerCase()]: true }))
}

function inlineMdToTags(str) {
  return str.replace(/\*\*(.+?)\*\*/g, '{@b $1}').replace(/(^|[^*])\*(?!\*)(.+?)\*(?!\*)/g, '$1{@i $2}')
}

const TABLE_SEPARATOR_RE = /^\s*\|?[\s:-]+\|[\s:|-]*\s*$/

function markdownTableToEntry(lines) {
  const colLabels = lines[0]
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
  const rows = lines.slice(2).map((line) =>
    line
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean)
      .map(inlineMdToTags)
  )
  return { type: 'table', colLabels, colStyles: colLabels.map(() => 'col-2'), rows }
}

// Good-enough markdown -> 5etools "entries" converter for the plain-text
// descriptions this app's textareas produce - not a full commonmark parser,
// just the subset we actually generate (paragraphs, **bold**/*italic*, GFM
// pipe tables, "- " bullet lists). Anything unrecognized degrades to a
// plain string, which is always valid 5etools content.
export function markdownToEntries(text) {
  if (!text) return []
  const blocks = text
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)
  return blocks.map((block) => {
    const lines = block.split('\n')
    if (lines.length >= 2 && lines[0].includes('|') && TABLE_SEPARATOR_RE.test(lines[1])) {
      return markdownTableToEntry(lines)
    }
    if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
      return { type: 'list', items: lines.map((l) => inlineMdToTags(l.replace(/^\s*[-*]\s+/, ''))) }
    }
    return inlineMdToTags(block.replace(/\n/g, ' '))
  })
}

// Builds the full 5etools homebrew JSON for one class - see
// docs/5etools-class-schema.md for the researched format and the reasoning
// behind each mapping decision (synthesized subclass-gate placeholder
// features, choice groups -> options+refClassFeature, etc).
export function classFormToFiveToolsJson(form) {
  const source = deriveSourceAbbr(form.name)
  const className = form.name

  const classFeatureRefs = []
  const classFeatureObjs = []

  const levels = [...new Set(form.features.map((f) => f.level))].sort((a, b) => a - b)
  for (const level of levels) {
    const levelFeatures = form.features.filter((f) => f.level === level)
    const { ungrouped, groups } = splitChoiceGroups(levelFeatures)

    for (const f of ungrouped) {
      classFeatureObjs.push({ name: f.name, source, className, classSource: source, level, entries: markdownToEntries(f.description) })
      classFeatureRefs.push(refString(f.name, className, source, level))
    }

    // Attach each group's "choose N of the following" block to whichever
    // ungrouped feature at this level actually introduces it (matched by
    // name, e.g. group "Dark Arts" -> feature "Dark Arts Continued") -
    // NOT just "the last ungrouped feature," which could be something
    // unrelated (e.g. "Soul Surge" also happens to sit at level 2). If
    // nothing matches by name, synthesize a minimal intro feature instead
    // of misattaching the block to an unrelated feature - same as real
    // files do for a level with no other content (e.g. Cleric's "Domain
    // Feature" placeholders).
    for (const g of groups) {
      const groupNameLower = g.name.toLowerCase()
      const holderFeature = ungrouped.find((f) => f.name.toLowerCase().includes(groupNameLower))
      let holderObj
      if (holderFeature) {
        holderObj = classFeatureObjs.find((o) => o.name === holderFeature.name && o.level === level)
      } else {
        holderObj = { name: g.name, source, className, classSource: source, level, entries: [] }
        classFeatureObjs.push(holderObj)
        classFeatureRefs.push(refString(g.name, className, source, level))
      }
      // choice_count 0 means everyone gets every sub-feature, so there is
      // no choice to express - the options are just further features at the
      // same level, referenced in order.
      const groupCount = g.features[0]?.choice_count ?? 1
      if (groupCount > 0) {
        holderObj.entries.push({
          type: 'options',
          count: groupCount,
          entries: g.features.map((gf) => ({ type: 'refClassFeature', classFeature: refString(gf.name, className, source, level) })),
        })
      }
      for (const gf of g.features) {
        classFeatureObjs.push({ name: gf.name, source, className, classSource: source, level, entries: markdownToEntries(gf.description) })
        classFeatureRefs.push(refString(gf.name, className, source, level))
      }
    }

    if (form.subclass_levels.includes(level)) {
      const lastRef = classFeatureRefs[classFeatureRefs.length - 1]
      const lastRefStr = typeof lastRef === 'string' ? lastRef : lastRef.classFeature
      classFeatureRefs[classFeatureRefs.length - 1] = { classFeature: lastRefStr, gainSubclassFeature: true }
    }
  }

  // A subclass_level with base features has its gate piggybacked onto the
  // last ref above; a subclass_level with NO base content at all (common —
  // e.g. "you choose your archetype now" with nothing else happening)
  // never entered the loop body's ref list, so needs its own synthesized
  // placeholder + reference.
  for (const level of form.subclass_levels) {
    if (levels.includes(level)) continue
    const name = form.subclass_label || 'Subclass'
    classFeatureObjs.push({ name, source, className, classSource: source, level, entries: [] })
    classFeatureRefs.push({ classFeature: refString(name, className, source, level), gainSubclassFeature: true })
  }

  const subclassObjs = []
  const subclassFeatureObjs = []
  for (const sc of form.subclasses) {
    const shortName = deriveShortName(sc.name)
    const namedFeatures = sc.features.filter((f) => f.name.trim() !== '')
    const scRefString = (name, level) => subclassRefString(name, className, source, shortName, source, level)

    const featureRefs = []
    const scLevels = [...new Set(namedFeatures.map((f) => f.level))].sort((a, b) => a - b)
    for (const level of scLevels) {
      const levelFeatures = namedFeatures.filter((f) => f.level === level)
      const { ungrouped, groups } = splitChoiceGroups(levelFeatures)

      for (const f of ungrouped) {
        subclassFeatureObjs.push({
          name: f.name,
          source,
          className,
          classSource: source,
          subclassShortName: shortName,
          subclassSource: source,
          level,
          entries: markdownToEntries(f.description),
        })
        featureRefs.push(scRefString(f.name, level))
      }

      // Same "match the choice group to an ungrouped feature by name, else
      // synthesize an intro" approach as the base class features above.
      for (const g of groups) {
        const groupNameLower = g.name.toLowerCase()
        const holderFeature = ungrouped.find((f) => f.name.toLowerCase().includes(groupNameLower))
        let holderObj
        if (holderFeature) {
          holderObj = subclassFeatureObjs.find(
            (o) => o.name === holderFeature.name && o.level === level && o.subclassShortName === shortName
          )
        } else {
          holderObj = {
            name: g.name,
            source,
            className,
            classSource: source,
            subclassShortName: shortName,
            subclassSource: source,
            level,
            entries: [],
          }
          subclassFeatureObjs.push(holderObj)
          featureRefs.push(scRefString(g.name, level))
        }
        const groupCount = g.features[0]?.choice_count ?? 1
        if (groupCount > 0) {
          holderObj.entries.push({
            type: 'options',
            count: groupCount,
            entries: g.features.map((gf) => ({ type: 'refSubclassFeature', subclassFeature: scRefString(gf.name, level) })),
          })
        }
        for (const gf of g.features) {
          subclassFeatureObjs.push({
            name: gf.name,
            source,
            className,
            classSource: source,
            subclassShortName: shortName,
            subclassSource: source,
            level,
            entries: markdownToEntries(gf.description),
          })
          featureRefs.push(scRefString(gf.name, level))
        }
      }
    }

    subclassObjs.push({ name: sc.name, shortName, source, className, classSource: source, subclassFeatures: featureRefs })
  }

  const classTableGroups = form.tableColumns.map((col) => ({
    colLabels: [col.name],
    rows: Array.from({ length: 20 }, (_, i) => [col.valuesByLevel[i + 1] ?? '—']),
  }))

  const classObj = {
    name: className,
    source,
    hd: { number: 1, faces: form.hit_die },
    proficiency: form.saving_throw_proficiencies.map((a) => a.toLowerCase()),
    startingProficiencies: {
      armor: normalizeProficiencyList(form.armor_proficiencies, ARMOR_TERMS),
      weapons: normalizeProficiencyList(form.weapon_proficiencies, WEAPON_TERMS),
      tools: form.tool_proficiencies
        ? form.tool_proficiencies.split(',').map((s) => s.trim()).filter(Boolean)
        : [],
      skills:
        form.skill_choices_count > 0
          ? [
              {
                choose: {
                  from: form.skill_choices_options.length > 0 ? form.skill_choices_options.map((s) => s.toLowerCase()) : ['any'],
                  count: form.skill_choices_count,
                },
              },
            ]
          : undefined,
    },
    startingEquipment: form.starting_equipment
      ? { default: form.starting_equipment.split('\n').map((s) => s.trim()).filter(Boolean) }
      : undefined,
    primaryAbility: primaryAbilityToFiveTools(form.primary_ability),
    subclassTitle: form.subclass_label,
    classTableGroups: classTableGroups.length > 0 ? classTableGroups : undefined,
    classFeatures: classFeatureRefs,
  }
  if (form.spellcasting_progression !== 'none') {
    classObj.spellcastingAbility = form.spellcasting_ability.toLowerCase()
    classObj.casterProgression = CASTER_PROGRESSION_5E[form.spellcasting_progression]
  }

  return {
    $schema: FIVETOOLS_SCHEMA_URL,
    _meta: {
      sources: [{ json: source, abbreviation: source, full: className, authors: ['Chrab Corner'], version: '1.0.0' }],
    },
    class: [classObj],
    subclass: subclassObjs,
    classFeature: classFeatureObjs,
    subclassFeature: subclassFeatureObjs,
  }
}

// --- 5etools homebrew import ----------------------------------------------
// The reverse direction: a real 5etools class JSON -> our wizard's form
// shape. Real homebrew files are messier than our own export (name typos,
// className mismatches between a class and its own features, duplicate or
// dangling feature references) — this reads defensively from the flat
// classFeature/subclassFeature arrays themselves rather than trusting the
// classFeatures/subclassFeatures reference-string arrays to be internally
// consistent, since in practice they aren't always.

// Tags are {@tag name|source|display}; the display segment, when present,
// is what 5etools renders ("Proficiency|XPHB|Proficiency Bonus"). A few
// tags put something else in later segments (filter params, book page
// numbers). Tags nest, so this runs innermost-first until nothing changes.
function tagDisplayText(tag, body) {
  const parts = body.split('|')
  if (tag === 'filter' || tag === 'quickref') return parts[0]
  if (tag === 'book' || tag === 'adventure') return parts[3] || parts[0]
  return parts[2] || parts[0]
}

function tagsToInlineMd(str) {
  let out = String(str)
  for (;;) {
    const next = out
      .replace(/\{@b ([^{}]+)\}/g, '**$1**')
      .replace(/\{@i ([^{}]+)\}/g, '*$1*')
      .replace(/\{@(\w+) ([^{}]+)\}/g, (_, tag, body) => tagDisplayText(tag, body))
    if (next === out) return out
    out = next
  }
}

// One entry (string or typed object) -> a markdown-ish block. Reference
// types (options/refClassFeature/refSubclassFeature/refOptionalfeature) are
// dropped here - `options` groups are pulled out separately by
// splitEntriesIntoChoiceRows before this ever sees them, and a bare ref
// with no surrounding options block just points at content that's already
// being imported as its own feature elsewhere, so inlining it would
// duplicate it.
function entryToMarkdownBlock(entry) {
  if (typeof entry === 'string') return tagsToInlineMd(entry)
  if (!entry || typeof entry !== 'object') return ''
  switch (entry.type) {
    case 'entries':
    case 'section':
    case 'inset':
      return [entry.name ? `**${tagsToInlineMd(entry.name)}**` : null, entriesToMarkdown(entry.entries)]
        .filter(Boolean)
        .join('\n')
    case 'list':
      return (entry.items ?? [])
        .map((item) => `- ${typeof item === 'string' ? tagsToInlineMd(item) : entryToMarkdownBlock(item)}`)
        .join('\n')
    case 'table': {
      const cols = entry.colLabels ?? []
      const cell = (c) => (typeof c === 'string' ? tagsToInlineMd(c) : entryToMarkdownBlock(c))
      const header = `| ${cols.map(tagsToInlineMd).join(' | ')} |`
      const sep = `|${cols.map(() => '---').join('|')}|`
      const rows = (entry.rows ?? []).map((row) => `| ${row.map(cell).join(' | ')} |`)
      return [header, sep, ...rows].join('\n')
    }
    case 'options':
    case 'refClassFeature':
    case 'refSubclassFeature':
    case 'refOptionalfeature':
      return ''
    default:
      return entry.entries ? entriesToMarkdown(entry.entries) : ''
  }
}

export function entriesToMarkdown(entries) {
  return (entries ?? [])
    .map(entryToMarkdownBlock)
    .filter(Boolean)
    .join('\n\n')
}

// A feature whose entries contain 2+ named nested "entries" sections (e.g.
// Desperado's "Desperado Specialty" listing Short/Mid/Long Range Specialist
// as sub-sections) is really a choice group in our model - the top-level
// text becomes the intro feature, each named section becomes its own
// choice_group-tagged row. A feature with 0-1 such sections is just one
// ordinary feature with everything folded into its description.
function splitEntriesIntoChoiceRows(name, level, entries) {
  const namedSections = (entries ?? []).filter((e) => e && typeof e === 'object' && e.type === 'entries' && e.name)
  if (namedSections.length < 2) {
    return [{ name, level, description: entriesToMarkdown(entries), choice_group: '', choice_count: null }]
  }
  const topLevelOnly = (entries ?? []).filter((e) => !namedSections.includes(e))
  const rows = [{ name, level, description: entriesToMarkdown(topLevelOnly), choice_group: '', choice_count: null }]
  for (const section of namedSections) {
    rows.push({
      name: section.name.trim(),
      level,
      description: entriesToMarkdown(section.entries),
      choice_group: name,
      choice_count: null,
    })
  }
  return rows
}

function assignSortOrder(rows) {
  const nextIndexByLevel = new Map()
  return rows.map((r) => {
    const i = nextIndexByLevel.get(r.level) ?? 0
    nextIndexByLevel.set(r.level, i + 1)
    return { ...r, id: null, sort_order: i }
  })
}

function refStringParts(ref) {
  if (typeof ref !== 'string') return null
  const parts = ref.split('|')
  return { name: parts[0].trim(), level: Number(parts[parts.length - 1]) }
}

// Builds the wizard's form-state object directly from a parsed 5etools
// homebrew JSON file. Only the first `class` entry in the file is used —
// this app models one class per builder entity, same as the export side.
export function fiveToolsJsonToClassForm(json) {
  const cls = json.class?.[0]
  if (!cls) throw new Error('No "class" entry found in this file.')

  const proficiencyText = (list, pluck) =>
    (list ?? []).map((v) => (typeof v === 'string' ? v : pluck(v))).join(', ')

  const skillChoose = cls.startingProficiencies?.skills?.find((s) => s.choose)?.choose
  const skillOptions = (skillChoose?.from ?? [])
    .filter((s) => s.toLowerCase() !== 'any')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))

  const CASTER_PROGRESSION_APP = { full: 'full', '1/2': 'half', '1/3': 'third', pact: 'pact' }

  const tableColumns = (cls.classTableGroups ?? []).flatMap((group) => {
    const rows = group.rowsSpellProgression ?? group.rows ?? []
    return (group.colLabels ?? []).map((label, colIdx) => ({
      id: null,
      name: tagsToInlineMd(label),
      valuesByLevel: Object.fromEntries(
        rows
          .map((row, i) => [i + 1, String(row[colIdx] ?? '').trim()])
          .filter(([, v]) => v && v !== '-' && v !== '—')
      ),
    }))
  })

  // Read straight from the flat classFeature array - the classFeatures
  // reference-string array on the class itself can be buggy in real files
  // (duplicate refs, refs to the wrong level) and isn't needed here since
  // we're not preserving 5etools' own ordering/gating mechanism, just the
  // feature content.
  const features = assignSortOrder(
    (json.classFeature ?? []).flatMap((f) => splitEntriesIntoChoiceRows(f.name.trim(), f.level, f.entries))
  )

  const subclassFeaturePool = json.subclassFeature ?? []
  const subclasses = (json.subclass ?? []).map((sc) => {
    const refs = (sc.subclassFeatures ?? []).map(refStringParts).filter(Boolean)
    const scFeatures = refs.flatMap((ref) => {
      // Matched by name+level only, not the full compound key - some real
      // files reference a subclassShortName that doesn't actually match
      // the feature object it's pointing at (see docs/5etools-class-schema.md).
      const match = subclassFeaturePool.find(
        (sf) => sf.name.trim().toLowerCase() === ref.name.toLowerCase() && sf.level === ref.level
      )
      if (!match) return [{ name: ref.name, level: ref.level, description: '', choice_group: '', choice_count: null }]
      return splitEntriesIntoChoiceRows(match.name.trim(), match.level, match.entries)
    })
    return { id: null, name: sc.name.trim(), description: '', visibility: 'dm', features: assignSortOrder(scFeatures) }
  })

  const subclassLevels = [...new Set(subclasses.flatMap((s) => s.features.map((f) => f.level)))].sort((a, b) => a - b)

  return {
    ...emptyClassForm,
    name: (cls.name ?? '').trim(),
    slug: '',
    hit_die: Number(cls.hd?.faces) || 8,
    primary_ability: (cls.primaryAbility ?? [])
      .map((obj) => ABILITY_LABELS[Object.keys(obj)[0]?.toUpperCase()])
      .filter(Boolean)
      .join(' or '),
    saving_throw_proficiencies: (cls.proficiency ?? []).map((a) => a.toUpperCase()),
    armor_proficiencies: proficiencyText(cls.startingProficiencies?.armor, (v) => v.full ?? v.proficiency ?? ''),
    weapon_proficiencies: proficiencyText(cls.startingProficiencies?.weapons, (v) => v.proficiency ?? ''),
    tool_proficiencies: (cls.startingProficiencies?.tools ?? []).join(', '),
    skill_choices_count: skillChoose?.count ?? 0,
    skill_choices_options: skillOptions,
    starting_equipment: (cls.startingEquipment?.default ?? []).map(tagsToInlineMd).join('\n'),
    spellcasting_ability: cls.spellcastingAbility ? cls.spellcastingAbility.toUpperCase() : '',
    spellcasting_progression: cls.casterProgression ? CASTER_PROGRESSION_APP[cls.casterProgression] ?? 'none' : 'none',
    subclass_label: cls.subclassTitle || 'Subclass',
    subclass_levels: subclassLevels.length > 0 ? subclassLevels : [3],
    features,
    tableColumns,
    subclasses,
  }
}

// --- Feats & Backgrounds ----------------------------------------------------
// Same shape as races: a fixed stat line on the parent row plus a free list
// of child rows (a feat's benefits, a background's features) in the trait
// row shape, so RepeatableRows and NestedFeatureList work on them unchanged.
// Fields mirror 5etools' feats.json / backgrounds.json - see the 5etools
// import/export at the end of this section.

export const FEAT_CATEGORIES = ['General', 'Origin', 'Fighting Style', 'Epic Boon']

export const emptyFeatForm = {
  id: null,
  name: '',
  slug: '',
  description: '',
  category: 'General',
  prerequisite: '',
  repeatable: false,
  ability_bonuses: {},
  ability_bonus_note: '',
  visibility: 'dm',
  benefits: [],
}

export const emptyBackgroundForm = {
  id: null,
  name: '',
  slug: '',
  description: '',
  ability_options: [],
  ability_note: '',
  feat: '',
  skill_proficiencies: [],
  tool_proficiencies: [],
  languages: [],
  equipment: '',
  visibility: 'dm',
  features: [],
}

// The stat-line columns each entity saves and exports - everything on the
// form except id, visibility and the child list.
export const FEAT_FIELDS = [
  'name',
  'slug',
  'description',
  'category',
  'prerequisite',
  'repeatable',
  'ability_bonuses',
  'ability_bonus_note',
]

export const BACKGROUND_FIELDS = [
  'name',
  'slug',
  'description',
  'ability_options',
  'ability_note',
  'feat',
  'skill_proficiencies',
  'tool_proficiencies',
  'languages',
  'equipment',
]

function pickFields(source, fields, defaults) {
  return Object.fromEntries(fields.map((k) => [k, source?.[k] ?? defaults[k]]))
}

function childRowsFromDb(rows) {
  return [...rows]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      sort_order: r.sort_order,
      choice_group: r.choice_group ?? '',
      choice_count: r.choice_count ?? null,
    }))
}

function childRowsToJson(rows) {
  return rows.map(({ name, description, choice_group, choice_count }) => ({
    name,
    description,
    choice_group: choice_group || undefined,
    choice_count: choice_group ? choice_count ?? undefined : undefined,
  }))
}

function childRowsFromJson(rows) {
  return (rows ?? []).map((r, i) => ({
    id: null,
    name: r.name,
    description: r.description ?? '',
    sort_order: i,
    choice_group: r.choice_group ?? '',
    choice_count: r.choice_count ?? null,
  }))
}

export function featToFormState(featRow, benefits) {
  return { ...emptyFeatForm, ...featRow, ability_bonuses: featRow.ability_bonuses ?? {}, benefits: childRowsFromDb(benefits) }
}

export function backgroundToFormState(backgroundRow, features) {
  return { ...emptyBackgroundForm, ...backgroundRow, features: childRowsFromDb(features) }
}

// Own-format JSON export/import - same idea as raceFormToExportJson: the
// form's field names minus ids/visibility, children as a flat list.
export function featFormToExportJson(form) {
  return { ...pickFields(form, FEAT_FIELDS, emptyFeatForm), benefits: childRowsToJson(form.benefits) }
}

export function featJsonToFormState(json) {
  return { ...emptyFeatForm, ...pickFields(json, FEAT_FIELDS, emptyFeatForm), benefits: childRowsFromJson(json.benefits) }
}

export function backgroundFormToExportJson(form) {
  return { ...pickFields(form, BACKGROUND_FIELDS, emptyBackgroundForm), features: childRowsToJson(form.features) }
}

export function backgroundJsonToFormState(json) {
  return {
    ...emptyBackgroundForm,
    ...pickFields(json, BACKGROUND_FIELDS, emptyBackgroundForm),
    features: childRowsFromJson(json.features),
  }
}

// ['CON', 'INT', 'WIS'] + note -> "Constitution, Intelligence, Wisdom; note".
export function formatBackgroundAbilities(options, note) {
  const listed = ABILITY_SCORES.filter((a) => options?.includes(a))
    .map((a) => ABILITY_LABELS[a])
    .join(', ')
  return [listed, note?.trim()].filter(Boolean).join('; ')
}

// One-line summaries for list rows and index cards.
export function formatFeatMeta(feat) {
  return [feat.category ? `${feat.category} feat` : 'Feat', feat.prerequisite].filter(Boolean).join(' · ')
}

export function formatBackgroundMeta(background) {
  return (
    [background.ability_options.join('/'), background.skill_proficiencies.join(', ')].filter(Boolean).join(' · ') ||
    'Background'
  )
}

// --- 5etools feats/backgrounds ----------------------------------------------
// Import reads one entry out of a 5etools file ({ feat: [...] } /
// { background: [...] }) - which may be a single homebrew entry or the whole
// official feats.json, hence fiveToolsEntryList + a picker in the editor.
// 5etools' structured prerequisite/proficiency objects collapse into our
// free-text and chip fields; nothing round-trips losslessly, but everything
// lands somewhere readable.

const FIVETOOLS_FEAT_CATEGORIES = {
  G: 'General',
  O: 'Origin',
  FS: 'Fighting Style',
  'FS:P': 'Fighting Style (Paladin)',
  'FS:R': 'Fighting Style (Ranger)',
  EB: 'Epic Boon',
  D: 'Dragonmark',
  DG: 'Dark Gift',
}

const NUMBER_WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five']

function countWord(n) {
  return NUMBER_WORDS[n] ?? String(n)
}

const TITLE_SMALL_WORDS = new Set(['a', 'an', 'and', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with'])

// "initiate of high sorcery" -> "Initiate of High Sorcery". Only letters
// after whitespace/brackets count as word starts, so the s after an
// apostrophe stays lowercase ("Calligrapher's").
function titleCase(s) {
  return String(s).replace(/(^|[\s(/-])([a-z]+)/g, (match, pre, word, offset) =>
    offset > 0 && TITLE_SMALL_WORDS.has(word) ? match : pre + word.charAt(0).toUpperCase() + word.slice(1)
  )
}

// ['Strength'] / ['Strength', 'Dexterity'] / [...3+] -> "A", "A or B",
// "A, B, or C".
function joinOr(list) {
  if (list.length <= 2) return list.join(' or ')
  return `${list.slice(0, -1).join(', ')}, or ${list[list.length - 1]}`
}

function sentenceCase(s) {
  const str = String(s)
  return str.charAt(0).toUpperCase() + str.slice(1)
}

// "name|source|display" -> the display text if given, else the name.
function fiveToolsRefName(ref) {
  const parts = String(ref).split('|')
  return titleCase(parts[2] || parts[0])
}

function abilityLabel(code) {
  return ABILITY_LABELS[String(code).toUpperCase()] ?? titleCase(code)
}

export function fiveToolsEntryList(json, key) {
  if (Array.isArray(json?.[key])) return json[key]
  if (Array.isArray(json)) return json
  if (json?.name) return [json]
  throw new Error(`No "${key}" entries found in this file.`)
}

function prerequisitePartToText(key, value) {
  switch (key) {
    case 'level':
      if (typeof value === 'number') return `Level ${value}+`
      return value.class ? `${value.class.name} level ${value.level}+` : `Level ${value.level}+`
    case 'ability':
      return value
        .map((obj) =>
          Object.entries(obj)
            .map(([a, n]) => `${abilityLabel(a)} ${n}+`)
            .join(' and ')
        )
        .join(' or ')
    case 'race':
      return value
        .map((r) => r.displayEntry ?? titleCase([r.name, r.subrace && `(${r.subrace})`].filter(Boolean).join(' ')))
        .join(' or ')
    case 'background':
      return value.map((b) => b.displayEntry ?? titleCase(b.name)).join(' or ') + ' background'
    case 'feat':
      return value.map(fiveToolsRefName).join(' or ') + ' feat'
    case 'feature':
      return value.join(' or ') + ' feature'
    case 'spellcasting':
    case 'spellcasting2020':
      return 'The ability to cast at least one spell'
    case 'spellcastingFeature':
      return 'Spellcasting or Pact Magic feature'
    case 'proficiency':
      return value
        .map((obj) =>
          Object.entries(obj)
            .map(([kind, what]) => `Proficiency with ${what} ${kind}`)
            .join(' and ')
        )
        .join(' or ')
    case 'campaign':
      return `${value.join(' or ')} campaign`
    case 'other':
      return value
    case 'otherSummary':
      return value.entrySummary ?? value.entry
    default:
      return null
  }
}

// [{ level: 4, ability: [{ str: 13 }] }, ...alternatives] ->
// "Level 4+, Strength 13+; or ..."
function fiveToolsPrerequisiteToText(prereqs) {
  return (prereqs ?? [])
    .map((alt) =>
      Object.entries(alt)
        .map(([k, v]) => prerequisitePartToText(k, v))
        .filter(Boolean)
        .map(tagsToInlineMd)
        .join(', ')
    )
    .filter(Boolean)
    .join('; or ')
}

function describeAbilityChoice(alt) {
  const { choose, max, hidden: _hidden, ...fixed } = alt
  const parts = Object.entries(fixed).map(([a, n]) => `${abilityLabel(a)} +${n}`)
  if (choose?.from) {
    const amount = choose.amount ?? 1
    const count = choose.count ?? 1
    const from = choose.from.length === 6 ? 'any ability score' : joinOr(choose.from.map(abilityLabel))
    parts.push(count > 1 ? `+${amount} to ${countWord(count).toLowerCase()} of ${from}` : `+${amount} to ${from}`)
  }
  const text = parts.join(', ')
  return text && max ? `${text} (to a maximum of ${max})` : text
}

// A single fixed alternative ({ str: 1 }) fits ability_bonuses; anything
// with a choice or several alternatives is prose, so it goes in the note.
// `hidden` choices (the ASI feat) are described in the feat's own text.
function fiveToolsFeatAbility(ability) {
  const shown = (ability ?? []).filter((alt) => !alt.hidden)
  if (shown.length === 1 && !shown[0].choose) {
    const { max, ...fixed } = shown[0]
    const bonuses = Object.fromEntries(Object.entries(fixed).map(([a, n]) => [a.toUpperCase(), n]))
    return { ability_bonuses: bonuses, ability_bonus_note: max ? `To a maximum of ${max}` : '' }
  }
  return { ability_bonuses: {}, ability_bonus_note: shown.map(describeAbilityChoice).filter(Boolean).join('; or ') }
}

// A named `entries` section is one row; one with 2+ named sub-sections
// becomes a parent plus choice rows, exactly as class features import.
function fiveToolsEntriesToRows(entries, mapName = (n) => n) {
  const named = (entries ?? []).filter((e) => e && typeof e === 'object' && e.type === 'entries' && e.name)
  const rest = (entries ?? []).filter((e) => !named.includes(e))
  const rows = assignSortOrder(
    named.flatMap((section) =>
      splitEntriesIntoChoiceRows(mapName(tagsToInlineMd(section.name).trim()), 0, section.entries)
    )
  ).map(({ level: _level, ...row }) => row)
  return { description: entriesToMarkdown(rest), rows }
}

export function fiveToolsFeatToForm(feat) {
  const { description, rows } = fiveToolsEntriesToRows(feat.entries)
  return {
    ...emptyFeatForm,
    name: (feat.name ?? '').trim(),
    description,
    category: FIVETOOLS_FEAT_CATEGORIES[feat.category] ?? feat.category ?? '',
    prerequisite: fiveToolsPrerequisiteToText(feat.prerequisite),
    repeatable: Boolean(feat.repeatable),
    ...fiveToolsFeatAbility(feat.ability),
    benefits: rows,
  }
}

function fiveToolsChoiceText(choose, nameFn) {
  const from = (choose.from ?? []).map(nameFn).join(', ')
  return `${countWord(choose.count ?? 1)} of: ${from}`
}

function fiveToolsSkills(list) {
  const skillName = (k) => SKILLS.find((s) => s.name.toLowerCase() === k.toLowerCase())?.name ?? titleCase(k)
  return Object.entries(list?.[0] ?? {}).map(([k, v]) => {
    if (k === 'choose') return fiveToolsChoiceText(v, skillName)
    if (k === 'any') return `${countWord(v)} skill${v === 1 ? '' : 's'} of your choice`
    return skillName(k)
  })
}

const FIVETOOLS_ANY_TOOL = {
  anyArtisansTool: "artisan's tools",
  anyGamingSet: 'gaming set',
  anyMusicalInstrument: 'musical instrument',
  anyTool: 'tool',
}

function fiveToolsTools(list) {
  return Object.entries(list?.[0] ?? {}).map(([k, v]) => {
    if (k === 'choose') return fiveToolsChoiceText(v, sentenceCase)
    if (FIVETOOLS_ANY_TOOL[k]) return `${countWord(v)} type${v === 1 ? '' : 's'} of ${FIVETOOLS_ANY_TOOL[k]}`
    return sentenceCase(k)
  })
}

function fiveToolsLanguages(list) {
  return Object.entries(list?.[0] ?? {}).map(([k, v]) => {
    if (k === 'choose') return fiveToolsChoiceText(v, titleCase)
    if (k === 'anyStandard') return `${countWord(v)} standard language${v === 1 ? '' : 's'} of your choice`
    if (k === 'any') return `${countWord(v)} language${v === 1 ? '' : 's'} of your choice`
    return titleCase(k)
  })
}

// { "magic initiate; wizard|xphb": true } -> "Magic Initiate (Wizard)"
function fiveToolsBackgroundFeat(feats) {
  return Object.keys(feats?.[0] ?? {})
    .map((key) => {
      const [name, variant] = key
        .split('|')[0]
        .split(';')
        .map((s) => s.trim())
      return titleCase(variant ? `${name} (${variant})` : name)
    })
    .join(', ')
}

export function fiveToolsBackgroundToForm(bg) {
  // The hanging summary list (Ability Scores:, Feat:, Skill
  // Proficiencies:, Equipment:) restates the structured fields, so it's
  // dropped - except Equipment, whose structured form isn't worth parsing.
  const summary = (bg.entries ?? []).find((e) => e?.type === 'list' && String(e.style ?? '').startsWith('list-hang'))
  const equipmentItem = summary?.items?.find((i) => /^equipment/i.test(i.name ?? ''))
  const { description, rows } = fiveToolsEntriesToRows(
    (bg.entries ?? []).filter((e) => e !== summary),
    (name) => name.replace(/^Feature:\s*/i, '')
  )
  const weighted = bg.ability?.find((a) => a.choose?.weighted)?.choose.weighted.from
  const plainChoice = bg.ability?.find((a) => a.choose?.from)?.choose.from
  return {
    ...emptyBackgroundForm,
    name: (bg.name ?? '').trim(),
    description,
    ability_options: (weighted ?? plainChoice ?? []).map((a) => a.toUpperCase()),
    feat: fiveToolsBackgroundFeat(bg.feats),
    skill_proficiencies: fiveToolsSkills(bg.skillProficiencies),
    tool_proficiencies: fiveToolsTools(bg.toolProficiencies),
    languages: fiveToolsLanguages(bg.languageProficiencies),
    equipment: equipmentItem ? tagsToInlineMd(equipmentItem.entry ?? entriesToMarkdown(equipmentItem.entries)) : '',
    features: rows,
  }
}

// Child rows -> named 5etools entries, sub-rows nested inside their parent.
function childRowsToFiveToolsEntries(rows) {
  return nestFeatureRows(rows.filter((r) => r.name.trim())).map((parent) => ({
    type: 'entries',
    name: parent.name,
    entries: [
      ...markdownToEntries(parent.description),
      ...parent.children.map((c) => ({ type: 'entries', name: c.name, entries: markdownToEntries(c.description) })),
    ],
  }))
}

function fiveToolsWrapper(source, fullName, key, obj) {
  return {
    $schema: FIVETOOLS_SCHEMA_URL,
    _meta: {
      sources: [{ json: source, abbreviation: source, full: fullName, authors: ['Chrab Corner'], version: '1.0.0' }],
    },
    [key]: [obj],
  }
}

export function featFormToFiveToolsJson(form) {
  const source = deriveSourceAbbr(form.name)
  const categoryCode = Object.keys(FIVETOOLS_FEAT_CATEGORIES).find((k) => FIVETOOLS_FEAT_CATEGORIES[k] === form.category)
  const fixed = ABILITY_SCORES.filter((a) => form.ability_bonuses?.[a])
  return fiveToolsWrapper(source, form.name, 'feat', {
    name: form.name,
    source,
    page: 0,
    category: categoryCode,
    prerequisite: form.prerequisite.trim() ? [{ other: form.prerequisite.trim() }] : undefined,
    repeatable: form.repeatable || undefined,
    ability: fixed.length > 0 ? [Object.fromEntries(fixed.map((a) => [a.toLowerCase(), form.ability_bonuses[a]]))] : undefined,
    entries: [
      ...markdownToEntries(form.description),
      ...(form.ability_bonus_note.trim()
        ? [{ type: 'entries', name: 'Ability Score Increase', entries: [form.ability_bonus_note.trim()] }]
        : []),
      ...childRowsToFiveToolsEntries(form.benefits),
    ],
  })
}

// Only proficiencies that match a standard 5e name become structured
// 5etools keys; custom ones still show in the summary list text.
function knownKeys(list, known) {
  const lowerKnown = known.map((k) => k.toLowerCase())
  const keys = list.map((v) => v.toLowerCase()).filter((v) => lowerKnown.includes(v))
  return keys.length > 0 ? [Object.fromEntries(keys.map((k) => [k, true]))] : undefined
}

export function backgroundFormToFiveToolsJson(form) {
  const source = deriveSourceAbbr(form.name)
  const abilities = ABILITY_SCORES.filter((a) => form.ability_options.includes(a)).map((a) => a.toLowerCase())
  const summaryItems = [
    ['Ability Scores:', formatBackgroundAbilities(form.ability_options, form.ability_note)],
    ['Feat:', form.feat],
    ['Skill Proficiencies:', form.skill_proficiencies.join(', ')],
    ['Tool Proficiencies:', form.tool_proficiencies.join(', ')],
    ['Languages:', form.languages.join(', ')],
    ['Equipment:', form.equipment.replace(/\n+/g, ' ')],
  ]
    .filter(([, text]) => text.trim())
    .map(([name, entry]) => ({ type: 'item', name, entry: inlineMdToTags(entry) }))
  const allTools = TOOL_PROFICIENCY_OPTIONS.flatMap((g) => (typeof g === 'string' ? [g] : g.options))
  const allLanguages = LANGUAGE_OPTIONS.filter((g) => g.group !== 'Choice').flatMap((g) => g.options)
  return fiveToolsWrapper(source, form.name, 'background', {
    name: form.name,
    source,
    page: 0,
    edition: abilities.length > 0 ? 'one' : undefined,
    ability:
      abilities.length >= 2
        ? [
            { choose: { weighted: { from: abilities, weights: [2, 1] } } },
            { choose: { weighted: { from: abilities, weights: abilities.map(() => 1) } } },
          ]
        : undefined,
    skillProficiencies: knownKeys(
      form.skill_proficiencies,
      SKILLS.map((s) => s.name)
    ),
    toolProficiencies: knownKeys(form.tool_proficiencies, allTools),
    languageProficiencies: knownKeys(form.languages, allLanguages),
    entries: [
      ...(summaryItems.length > 0 ? [{ type: 'list', style: 'list-hang-notitle', items: summaryItems }] : []),
      ...markdownToEntries(form.description),
      ...childRowsToFiveToolsEntries(form.features),
    ],
  })
}
