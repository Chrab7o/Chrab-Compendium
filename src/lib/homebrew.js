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

export const emptySubclassForm = () => ({
  id: null,
  name: '',
  description: '',
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
  features: [],
}

export function standaloneSubclassToFormState(subclassRow, features) {
  return {
    id: subclassRow.id,
    name: subclassRow.name,
    slug: subclassRow.slug ?? '',
    parent_class_name: subclassRow.parent_class_name ?? '',
    description: subclassRow.description,
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
      holderObj.entries.push({
        type: 'options',
        count: g.features[0]?.choice_count || 1,
        entries: g.features.map((gf) => ({ type: 'refClassFeature', classFeature: refString(gf.name, className, source, level) })),
      })
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
        holderObj.entries.push({
          type: 'options',
          count: g.features[0]?.choice_count || 1,
          entries: g.features.map((gf) => ({ type: 'refSubclassFeature', subclassFeature: scRefString(gf.name, level) })),
        })
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

function tagsToInlineMd(str) {
  return String(str)
    .replace(/\{@b ([^}]+)\}/g, '**$1**')
    .replace(/\{@i ([^}]+)\}/g, '*$1*')
    .replace(/\{@(\w+) ([^}]+)\}/g, (_, tag, body) => body.split('|')[0])
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
    return { id: null, name: sc.name.trim(), description: '', features: assignSortOrder(scFeatures) }
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
