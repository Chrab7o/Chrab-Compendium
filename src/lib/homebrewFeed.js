// The Plutonium feed: every public homebrew class and subclass as ONE 5etools
// homebrew file, with the Foundry automation of linked Feature Forge items
// riding along. Published to a fixed public URL (homebrewFeedPublish.js) that
// Plutonium loads as a custom source, so class imports and level-ups always
// get the current version. See docs/homebrew-feed.md.
//
// Pure: callers pass already-loaded class forms (lib/homebrew.js
// classToFormState shape) and the built Foundry items of the linked drafts.
//
// How automation gets in: a feature row's feature_draft_id names a Feature
// Forge draft. Its built item goes in a foundryClassFeature /
// foundrySubclassFeature entry with the same identity keys as the feature
// (name, className, classSource, level, + subclass keys). Plutonium merges
// that overlay onto the item it creates - activities, effects, flags, uses -
// while the text still comes from the class (probed 2026-10-23, the sandbox's
// probes/plutonium-class-import.md).

import { classFormToFiveToolsJson, deriveSourceAbbr, subclassToFiveTools } from './homebrew.js'

export const FEED_BUCKET = 'foundry-feed'
export const FEED_PATH = 'chrab-homebrew.json'

const FIVETOOLS_SCHEMA_URL = 'https://raw.githubusercontent.com/TheGiddyLimit/5etools-utils/master/schema/brew-fast/homebrew.json'

// Standalone subclasses hang off an official class; 5etools/Plutonium find
// that class by name + source.
export const OFFICIAL_CLASS_SOURCE = 'PHB'

// What Plutonium takes from a built Feature Forge item. The description is
// left out on purpose: the class text (entries) is the source of truth.
export function foundryOverlay(item) {
  const system = { uses: item.system?.uses }
  if (item.system?.requirements) system.requirements = item.system.requirements
  if (item.system?.type) system.type = item.system.type
  return {
    system,
    activities: Object.values(item.system?.activities ?? {}),
    effects: item.effects ?? [],
    flags: item.flags ?? {},
    img: item.img,
  }
}

const slug = (s) =>
  String(s ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

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
      // faces is dnd5e's current key; die is the older one real Plutonium
      // files (LaserLlama's) still use.
      scale[level] = { number: Number(number) || 1, faces: Number(faces), die: Number(faces) }
    } else scale[level] = { value }
  }
  return { type: 'ScaleValue', title: column.name.trim(), configuration: { identifier: slug(column.name), type, scale } }
}

// Overlay entries for every linked feature row that has a built item.
function overlaysFor(rows, keysFor, items) {
  const out = []
  for (const row of rows) {
    const item = row.feature_draft_id && row.name?.trim() ? items.get(row.feature_draft_id) : null
    if (item) out.push({ ...keysFor(row), ...foundryOverlay(item) })
  }
  return out
}

/**
 * @param classes   class forms (classToFormState), already limited to public ones;
 *                  each form's subclasses likewise limited to public ones
 * @param standaloneSubclasses  standalone subclass forms (parent_class_name set)
 * @param items     Map feature draft id -> built Foundry item (buildFeatureItem
 *                  with its draftId, so Chrab Sync can find the copies later)
 * @param generatedAt  Date, for _meta.dateLastModified
 */
export function buildHomebrewFeed({ classes = [], standaloneSubclasses = [], items = new Map(), generatedAt = new Date() }) {
  const feed = {
    $schema: FIVETOOLS_SCHEMA_URL,
    _meta: { sources: [], dateLastModified: Math.floor(generatedAt.getTime() / 1000) },
    class: [],
    subclass: [],
    classFeature: [],
    subclassFeature: [],
    foundryClassFeature: [],
    foundrySubclassFeature: [],
  }
  const sources = new Map()
  const addSource = (abbr, full) => {
    if (!sources.has(abbr)) sources.set(abbr, { json: abbr, abbreviation: abbr, full, authors: ['Chrab Corner'], version: '1.0.0' })
    else if (!sources.get(abbr).full.split(' / ').includes(full)) sources.get(abbr).full += ` / ${full}`
  }

  for (const form of classes) {
    const json = classFormToFiveToolsJson(form)
    const source = json.class[0].source
    const className = form.name
    addSource(source, className)

    const advancement = (form.tableColumns ?? []).map(tableColumnScaleValue).filter(Boolean)
    feed.class.push(advancement.length ? { ...json.class[0], foundryAdvancement: advancement } : json.class[0])
    feed.classFeature.push(...json.classFeature)
    feed.subclass.push(...json.subclass)
    feed.subclassFeature.push(...json.subclassFeature)

    feed.foundryClassFeature.push(
      ...overlaysFor(form.features ?? [], (f) => ({ name: f.name, source, className, classSource: source, level: f.level }), items),
    )
    for (const sc of form.subclasses ?? []) {
      const { subclass } = subclassToFiveTools(sc, { className, classSource: source, source })
      feed.foundrySubclassFeature.push(...overlaysFor(sc.features ?? [], subclassKeys(subclass, className, source, source), items))
    }
  }

  for (const sc of standaloneSubclasses) {
    const className = String(sc.parent_class_name ?? '').trim()
    if (!className) continue
    const source = deriveSourceAbbr(sc.name)
    addSource(source, sc.name)
    const { subclass, features } = subclassToFiveTools(sc, { className, classSource: OFFICIAL_CLASS_SOURCE, source })
    feed.subclass.push(subclass)
    feed.subclassFeature.push(...features)
    feed.foundrySubclassFeature.push(...overlaysFor(sc.features ?? [], subclassKeys(subclass, className, OFFICIAL_CLASS_SOURCE, source), items))
  }

  feed._meta.sources = [...sources.values()]
  for (const key of ['foundryClassFeature', 'foundrySubclassFeature']) if (!feed[key].length) delete feed[key]
  return feed
}

function subclassKeys(subclass, className, classSource, source) {
  return (f) => ({ name: f.name, source, className, classSource, subclassShortName: subclass.shortName, subclassSource: source, level: f.level })
}

// Counts for the DM page's status line.
export function feedSummary(feed) {
  return {
    classes: feed?.class?.length ?? 0,
    subclasses: feed?.subclass?.length ?? 0,
    automated: (feed?.foundryClassFeature?.length ?? 0) + (feed?.foundrySubclassFeature?.length ?? 0),
    updatedAt: feed?._meta?.dateLastModified ? new Date(feed._meta.dateLastModified * 1000) : null,
  }
}
