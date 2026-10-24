// Run with: npm test
//
// The Plutonium feed (homebrewFeed.js): public classes and subclasses as one
// 5etools file, with linked Feature Forge items attached as Foundry overlays
// that Plutonium matches to their features by identity keys.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptyClassForm } from './homebrew.js'
import {
  FEATURE_TEMPLATES,
  buildFeatureItem,
  classFeatureSpec,
  classFeatureTextChanged,
  emptyFeatureSpec,
  mechanicsSummary,
} from './foundryFeatures.js'
import { buildHomebrewFeed, feedSummary, foundryOverlay, tableColumnScaleValue } from './homebrewFeed.js'
import { attachMechanicsFile, mechanicsFile } from './classMechanicsFile.js'

const row = (level, name, extra = {}) => ({ id: null, level, name, description: `${name} text.`, sort_order: 0, choice_group: '', choice_count: null, feature_draft_id: null, ...extra })

function darkKnight() {
  return {
    ...emptyClassForm,
    name: 'The Dark Knight',
    hit_die: 10,
    saving_throw_proficiencies: ['STR', 'CON'],
    subclass_label: 'Dark Archetype',
    subclass_levels: [3],
    features: [
      row(1, 'Tainted Soul'),
      row(2, 'Dark Arts'),
      row(2, 'Shadow Smite', { choice_group: 'Dark Arts', choice_count: 2, feature_draft_id: 'draft-smite' }),
      row(2, 'Restore Vitality', { choice_group: 'Dark Arts', choice_count: 2 }),
    ],
    tableColumns: [
      { id: null, name: 'Darkness Points', valuesByLevel: { 2: '9', 3: '9', 6: '12', 10: '16' } },
      { id: null, name: 'Dark Arts Die', valuesByLevel: { 2: '1d8', 11: 'd10' } },
      { id: null, name: 'Aura', valuesByLevel: { 1: '-', 9: '20 ft.' } },
      { id: null, name: 'Empty', valuesByLevel: { 1: '—' } },
    ],
    subclasses: [
      {
        id: null,
        name: 'Harbinger of Darkness',
        description: 'Melee offense.',
        visibility: 'public',
        features: [row(3, 'Death Stance', { feature_draft_id: 'draft-ds' }), row(7, 'Death Archetype Upgrade', { feature_draft_id: 'draft-missing' })],
      },
    ],
  }
}

const godless = { id: null, name: 'Godless Domain', parent_class_name: 'Cleric', description: '', visibility: 'public', features: [row(1, 'Faithless Strike', { feature_draft_id: 'draft-ds' })] }

function items() {
  const ds = FEATURE_TEMPLATES.find((t) => t.key === 'deathStance').build()
  const smite = emptyFeatureSpec('feat')
  smite.item = { ...smite.item, name: 'Shadow Smite' }
  return new Map([
    ['draft-ds', buildFeatureItem(ds, { draftId: 'draft-ds' })],
    ['draft-smite', buildFeatureItem(smite, { draftId: 'draft-smite' })],
  ])
}

const KEYS = ['name', 'source', 'className', 'classSource', 'level']
const SUB_KEYS = [...KEYS, 'subclassShortName', 'subclassSource']
const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]))
// Plutonium pairs an overlay with the feature that has exactly its keys.
function baseFor(overlay, list, keys) {
  return list.filter((f) => JSON.stringify(pick(f, keys)) === JSON.stringify(pick(overlay, keys)))
}

test('one file: the class, its subclass and a standalone subclass of an official class', () => {
  const feed = buildHomebrewFeed({ classes: [darkKnight()], standaloneSubclasses: [godless], items: items(), generatedAt: new Date('2026-10-23T12:00:00Z') })
  assert.deepEqual(feed._meta.sources.map((s) => s.json), ['TDK', 'GD'])
  assert.equal(feed._meta.dateLastModified, Date.UTC(2026, 9, 23, 12) / 1000)
  assert.deepEqual(feed.class.map((c) => [c.name, c.source]), [['The Dark Knight', 'TDK']])
  assert.deepEqual(feed.subclass.map((s) => [s.name, s.className, s.classSource, s.source]), [
    ['Harbinger of Darkness', 'The Dark Knight', 'TDK', 'TDK'],
    ['Godless Domain', 'Cleric', 'PHB', 'GD'],
  ])
  // The standalone subclass points at the official class by its PHB source.
  assert.deepEqual(feed.subclass[1].subclassFeatures, ['Faithless Strike|Cleric|PHB|Godless Domain|GD|1'])
  assert.deepEqual(feedSummary(feed), { classes: 1, subclasses: 2, automated: 3, updatedAt: new Date('2026-10-23T12:00:00Z') })
})

test('a linked subclass feature carries the whole Feature Forge item, keyed to its feature', () => {
  const feed = buildHomebrewFeed({ classes: [darkKnight()], items: items() })
  const [overlay] = feed.foundrySubclassFeature.filter((o) => o.name === 'Death Stance')
  assert.equal(baseFor(overlay, feed.subclassFeature, SUB_KEYS).length, 1, 'exactly one feature has these keys')
  assert.equal(overlay.level, 3)
  // What made the toggle work in the Plutonium probe: flags, the hook macro, effects, uses.
  assert.equal(overlay.flags['chrab-sync'].featureDraftId, 'draft-ds', 'so Chrab Sync can update copies later')
  assert.match(overlay.flags['midi-qol'].onUseMacroName, /^\[postActiveEffects\]ActivityMacro-/)
  assert.match(overlay.activities[0].macroData.command, /const SETUP = /)
  assert.equal(overlay.effects[0].flags['chrab-sync'].stance, true)
  assert.equal(overlay.system.uses.max, '@prof')
  assert.equal(overlay.system.description, undefined, 'the class text stays the description')
  // The level 7 row links a draft that no longer exists: no overlay, no error.
  assert.equal(feed.foundrySubclassFeature.filter((o) => o.name === 'Death Archetype Upgrade').length, 0)
})

test('a linked choice option (one of the Dark Arts) gets its own class feature overlay', () => {
  const feed = buildHomebrewFeed({ classes: [darkKnight()], items: items() })
  assert.deepEqual(feed.foundryClassFeature.map((o) => o.name), ['Shadow Smite'])
  const [overlay] = feed.foundryClassFeature
  assert.equal(baseFor(overlay, feed.classFeature, KEYS).length, 1)
  // ...and that feature is one of the picks in the Dark Arts options block.
  const intro = feed.classFeature.find((f) => f.name === 'Dark Arts')
  const options = intro.entries.find((e) => e.type === 'options')
  assert.equal(options.count, 2)
  assert.ok(options.entries.some((e) => e.classFeature === 'Shadow Smite|The Dark Knight|TDK|2'))
})

test('the standalone subclass overlay matches its own feature too', () => {
  const feed = buildHomebrewFeed({ standaloneSubclasses: [godless], items: items() })
  const [overlay] = feed.foundrySubclassFeature
  assert.deepEqual(pick(overlay, SUB_KEYS), {
    name: 'Faithless Strike',
    source: 'GD',
    className: 'Cleric',
    classSource: 'PHB',
    level: 1,
    subclassShortName: 'Godless Domain',
    subclassSource: 'GD',
  })
  assert.equal(baseFor(overlay, feed.subclassFeature, SUB_KEYS).length, 1)
  assert.equal(feed.class.length, 0)
})

test('class table columns become ScaleValue advancements', () => {
  const [cls] = buildHomebrewFeed({ classes: [darkKnight()] }).class
  const byId = Object.fromEntries(cls.foundryAdvancement.map((a) => [a.configuration.identifier, a]))
  assert.deepEqual(Object.keys(byId), ['darkness-points', 'dark-arts-die', 'aura'], 'an all-blank column is skipped')
  assert.deepEqual(byId['darkness-points'], {
    type: 'ScaleValue',
    title: 'Darkness Points',
    configuration: { identifier: 'darkness-points', type: 'number', scale: { 2: { value: 9 }, 6: { value: 12 }, 10: { value: 16 } } },
  })
  assert.equal(byId['dark-arts-die'].configuration.type, 'dice')
  assert.deepEqual(byId['dark-arts-die'].configuration.scale, { 2: { number: 1, faces: 8, die: 8 }, 11: { number: 1, faces: 10, die: 10 } })
  assert.deepEqual(byId.aura.configuration, { identifier: 'aura', type: 'string', scale: { 9: { value: '20 ft.' } } })
  assert.equal(tableColumnScaleValue({ name: '', valuesByLevel: { 1: '2' } }), null)
})

test('with nothing linked, the feed is plain 5etools content', () => {
  const plain = { ...darkKnight(), features: darkKnight().features.map((f) => ({ ...f, feature_draft_id: null })), subclasses: [] }
  const feed = buildHomebrewFeed({ classes: [plain], items: items() })
  assert.equal(feed.foundryClassFeature, undefined)
  assert.equal(feed.foundrySubclassFeature, undefined)
  assert.equal(feedSummary(feed).automated, 0)
})

// ---------------------------------------------------------------------------
// Mechanics edited in a class's feature row: the row owns the words, the
// draft owns the mechanics.

test('a row’s mechanics take the row’s name, text and place in the class', () => {
  const template = FEATURE_TEMPLATES.find((t) => t.key === 'deathStance').build()
  const ctx = { className: 'The Dark Knight', subclassName: 'Harbinger of Darkness', level: 3, name: 'Death Stance', description: 'Row text.' }
  const spec = classFeatureSpec(template, ctx)
  assert.equal(spec.item.name, 'Death Stance')
  assert.equal(spec.item.description, 'Row text.')
  assert.equal(spec.requirements, 'The Dark Knight 3 (Harbinger of Darkness)')
  assert.equal(spec.featType, 'class')
  // mechanics untouched
  assert.deepEqual(spec.item.behavior.rules, template.item.behavior.rules)
  assert.equal(spec.item.usesMax, '@prof')
  assert.equal(spec.item.behavior.levelClass, 'the-dark-knight', 'set by hand on the template, kept')

  // A blank feature with a stance: level tiers count the class it belongs to.
  const blank = emptyFeatureSpec('feat')
  blank.item.behavior = { ...template.item.behavior, levelClass: '' }
  assert.equal(classFeatureSpec(blank, { ...ctx, className: 'Cleric', subclassName: 'Godless Domain' }).item.behavior.levelClass, 'cleric')
  assert.equal(classFeatureSpec(emptyFeatureSpec('feat'), { className: 'Oracle', level: 2, name: 'Portent' }).requirements, 'Oracle 2')
})

test('only a change to the row’s words counts as a text change', () => {
  const ctx = { className: 'The Dark Knight', subclassName: 'Harbinger of Darkness', level: 3, name: 'Death Stance', description: 'Row text.' }
  const saved = classFeatureSpec(FEATURE_TEMPLATES.find((t) => t.key === 'deathStance').build(), ctx)
  assert.equal(classFeatureTextChanged(saved, ctx), false)
  assert.equal(classFeatureTextChanged(saved, { ...ctx, description: 'New text.' }), true)
  assert.equal(classFeatureTextChanged(saved, { ...ctx, level: 7 }), true, 'requirements follow the level')
  assert.equal(classFeatureTextChanged(saved, { ...ctx, name: 'Stance of Death' }), true)
})

test('mechanicsSummary reads like the panel badge', () => {
  assert.equal(mechanicsSummary(FEATURE_TEMPLATES.find((t) => t.key === 'deathStance').build()), '1 effect · toggle · 4 rules · @prof per long rest')
  assert.equal(mechanicsSummary(emptyFeatureSpec('feat')), '')
})

test('a pool keeps its identifier through the overlay, so spenders find it after Plutonium', () => {
  const spec = emptyFeatureSpec('feat')
  spec.item = { ...spec.item, name: 'Dark Arts', usesMax: '9', usesRecovery: 'lr', identifier: 'darkness', activities: [] }
  assert.equal(foundryOverlay(buildFeatureItem(spec)).system.identifier, 'darkness')
})

test('class features run in level order, subclass placeholders included', () => {
  // Subclass levels 3 and 7 have no class feature of their own, so they get
  // "Dark Archetype" placeholders - which used to land after level 20.
  const form = { ...darkKnight(), subclass_levels: [3, 7], features: [row(1, 'Tainted Soul'), row(2, 'Dark Arts'), row(5, 'Extra Attack'), row(20, 'The Final Art')] }
  const [cls] = buildHomebrewFeed({ classes: [form] }).class
  const levels = cls.classFeatures.map((r) => Number((typeof r === 'string' ? r : r.classFeature).split('|').pop()))
  assert.deepEqual(levels, [1, 2, 3, 5, 7, 20])
  assert.deepEqual(cls.classFeatures.filter((r) => r.gainSubclassFeature).map((r) => r.classFeature), ['Dark Archetype|The Dark Knight|TDK|3', 'Dark Archetype|The Dark Knight|TDK|7'])
})

test('a mechanics file fills the matching rows, unsaved, and reports the rest', () => {
  const ds = FEATURE_TEMPLATES.find((t) => t.key === 'deathStance').build()
  const pool = emptyFeatureSpec('feat')
  pool.item = { ...pool.item, usesMax: '9', usesRecovery: 'lr', identifier: 'darkness' }
  const file = mechanicsFile('The Dark Knight', [
    { subclass: '', name: 'Dark Arts', level: 2, spec: pool },
    { subclass: 'harbinger of darkness', name: 'death stance', level: 3, spec: ds },
    { subclass: 'Harbinger of Darkness', name: 'Death Stance', level: 7, spec: ds },
    { subclass: 'Vanguard of Darkness', name: 'Vanguard Stance', level: 3, spec: ds },
  ])
  const { form, attached, unmatched, classMismatch } = attachMechanicsFile(darkKnight(), file)
  assert.deepEqual(attached, ['level 2 › Dark Arts', 'harbinger of darkness › level 3 › death stance'])
  assert.deepEqual(unmatched, ['Harbinger of Darkness › level 7 › Death Stance', 'Vanguard of Darkness › level 3 › Vanguard Stance'])
  assert.equal(classMismatch, null)
  const darkArts = form.features.find((f) => f.name === 'Dark Arts')
  assert.equal(darkArts.mechanics.item.identifier, 'darkness')
  assert.equal(darkArts.mechanicsDirty, true)
  assert.equal(form.subclasses[0].features[0].mechanics.item.behavior.mode, 'toggle')
  assert.equal(form.features.find((f) => f.name === 'Tainted Soul').mechanics, undefined)
  assert.throws(() => attachMechanicsFile(darkKnight(), { mechanics: [] }), /class mechanics file/)
  assert.equal(attachMechanicsFile(darkKnight(), mechanicsFile('Oracle', [])).classMismatch, 'Oracle')
})

test('foundryOverlay keeps activities in order with the hook first', () => {
  const item = items().get('draft-ds')
  assert.deepEqual(
    foundryOverlay(item).activities.map((a) => a._id),
    Object.keys(item.system.activities),
  )
})
