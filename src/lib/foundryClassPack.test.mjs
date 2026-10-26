// Run with: npm test
//
// The Foundry class pack (foundryClassPack.js): public classes and subclasses
// as native dnd5e class / subclass / feature items with dnd5e advancements,
// the linked Feature Forge items as the features. Also the class editor's
// mechanics helpers and the 5etools export, which share these fixtures.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classFormToFiveToolsJson, emptyClassForm, fiveToolsJsonToClassForm, flattenFeatureRows, nestFeatureRows } from './homebrew.js'
import {
  FEATURE_TEMPLATES,
  buildFeatureItem,
  classFeatureSpec,
  classFeatureTextChanged,
  emptyFeatureSpec,
  mechanicsSummary,
} from './foundryFeatures.js'
import { buildClassPack, classPackSummary, markdownToHtml, stableId, tableColumnScaleValue } from './foundryClassPack.js'
import { attachMechanicsFile, mechanicsFile } from './classMechanicsFile.js'

const row = (level, name, extra = {}) => ({ id: null, level, name, description: `${name} text.`, sort_order: 0, choice_group: '', choice_count: null, feature_draft_id: null, ...extra })

function darkKnight() {
  return {
    ...emptyClassForm,
    id: 'class-tdk',
    name: 'The Dark Knight',
    description: 'A warrior who **embraces** the dark.',
    hit_die: 10,
    primary_ability: 'Strength',
    saving_throw_proficiencies: ['STR', 'CON'],
    armor_proficiencies: 'Light armor, Medium armor, Heavy armor',
    weapon_proficiencies: 'Simple weapons, Martial weapons, Firearms',
    skill_choices_count: 2,
    skill_choices_options: ['Insight', 'Deception', 'Intimidation', 'Athletics'],
    subclass_label: 'Dark Archetype',
    subclass_levels: [3, 7],
    features: [
      row(1, 'Tainted Soul'),
      row(2, 'Dark Arts', { feature_draft_id: 'draft-pool' }),
      row(2, 'Shadow Smite', { choice_group: 'Dark Arts', choice_count: 2, feature_draft_id: 'draft-smite' }),
      row(2, 'Restore Vitality', { choice_group: 'Dark Arts', choice_count: 2 }),
      row(4, 'Ability Score Improvement'),
      row(6, 'Dark Arts Continued'),
      row(6, 'Curse', { choice_group: 'Dark Arts', choice_count: 1 }),
      row(6, 'Shadow Warp', { choice_group: 'Dark Arts', choice_count: 1 }),
    ],
    tableColumns: [
      { id: null, name: 'Darkness Points', valuesByLevel: { 2: '9', 3: '9', 6: '12', 10: '16' } },
      { id: null, name: 'Dark Arts Die', valuesByLevel: { 2: '1d8', 11: 'd10' } },
      { id: null, name: 'Aura', valuesByLevel: { 1: '-', 9: '20 ft.' } },
      { id: null, name: 'Empty', valuesByLevel: { 1: '—' } },
    ],
    subclasses: [
      {
        id: 'sub-harbinger',
        name: 'Harbinger of Darkness',
        description: 'Melee offense.',
        visibility: 'public',
        features: [row(3, 'Death Stance', { feature_draft_id: 'draft-ds' }), row(7, 'Death Archetype Upgrade', { feature_draft_id: 'draft-missing' })],
      },
    ],
  }
}

const godless = { id: 'sub-godless', name: 'Godless Domain', parent_class_name: 'Cleric', description: '', visibility: 'public', features: [row(1, 'Faithless Strike', { feature_draft_id: 'draft-ds' })] }

function items() {
  const ds = FEATURE_TEMPLATES.find((t) => t.key === 'deathStance').build()
  const smite = emptyFeatureSpec('feat')
  smite.item = { ...smite.item, name: 'Shadow Smite' }
  const pool = emptyFeatureSpec('feat')
  pool.item = { ...pool.item, name: 'Dark Arts', usesMax: '@scale.the-dark-knight.darkness-points', usesRecovery: 'lr', identifier: 'darkness', activities: [] }
  return new Map([
    ['draft-ds', buildFeatureItem(ds, { draftId: 'draft-ds' })],
    ['draft-smite', buildFeatureItem(smite, { draftId: 'draft-smite' })],
    ['draft-pool', buildFeatureItem(pool, { draftId: 'draft-pool' })],
  ])
}

const UUID_RE = /^Compendium\.world\.chrab-classes\.Item\.[0-9A-Za-z]{16}$/
const byName = (pack, name, type = 'feat') => pack.items.filter((i) => i.name === name && i.type === type)
const one = (pack, name, type) => {
  const found = byName(pack, name, type)
  assert.equal(found.length, 1, `exactly one ${type ?? 'feat'} named ${name}`)
  return found[0]
}
const uuidOf = (item) => `Compendium.world.chrab-classes.Item.${item._id}`
const adv = (item, type) => item.system.advancement.filter((a) => a.type === type)

// ---------------------------------------------------------------------------
// The class pack

test('one file: the class, its subclass and a standalone subclass of an official class', () => {
  const pack = buildClassPack({ classes: [darkKnight()], standaloneSubclasses: [godless], items: items(), generatedAt: new Date('2026-10-23T12:00:00Z') })
  assert.equal(pack.format, 'chrab-class-pack')
  assert.deepEqual(pack.pack, { name: 'chrab-classes', label: 'Chrab Corner Classes' })
  assert.deepEqual(pack.items.filter((i) => i.type !== 'feat').map((i) => [i.type, i.name]), [
    ['class', 'The Dark Knight'],
    ['subclass', 'Harbinger of Darkness'],
    ['subclass', 'Godless Domain'],
  ])
  assert.deepEqual(pack.folders.map((f) => f.name), ['The Dark Knight', 'Cleric subclasses'])
  // The standalone subclass hangs off the official class by its identifier.
  assert.equal(one(pack, 'Godless Domain', 'subclass').system.classIdentifier, 'cleric')
  assert.equal(one(pack, 'Harbinger of Darkness', 'subclass').system.classIdentifier, 'the-dark-knight')
  // ASI rows are an advancement, not a feature: 9 rows - 1 ASI + 3 subclass features.
  assert.deepEqual(classPackSummary(pack), { classes: 1, subclasses: 2, features: 10, automated: 4, updatedAt: new Date('2026-10-23T12:00:00Z') })
  for (const item of pack.items) assert.match(item._id, /^[0-9A-Za-z]{16}$/)
  assert.equal(new Set(pack.items.map((i) => i._id)).size, pack.items.length, 'ids are unique')
})

test('a republish keeps every id, so the grants and characters’ copies still point at the same items', () => {
  const a = buildClassPack({ classes: [darkKnight()], items: items() })
  const b = buildClassPack({ classes: [darkKnight()], items: items(), generatedAt: new Date('2030-01-01') })
  assert.deepEqual(a.items.map((i) => i._id), b.items.map((i) => i._id))
  assert.deepEqual(one(a, 'The Dark Knight', 'class').system.advancement.map((x) => x._id), one(b, 'The Dark Knight', 'class').system.advancement.map((x) => x._id))
  // A renamed class keeps its id (it's keyed on the row), a feature doesn't.
  const renamed = buildClassPack({ classes: [{ ...darkKnight(), name: 'Dark Knight' }], items: items() })
  assert.equal(one(renamed, 'Dark Knight', 'class')._id, one(a, 'The Dark Knight', 'class')._id)
  assert.equal(stableId('x'), stableId('x'))
  assert.notEqual(stableId('x'), stableId('y'))
})

test('the class item: hit dice, proficiencies, scale values and the subclass step', () => {
  const pack = buildClassPack({ classes: [darkKnight()], items: items() })
  const cls = one(pack, 'The Dark Knight', 'class')
  assert.equal(cls.system.identifier, 'the-dark-knight')
  assert.deepEqual(cls.system.hd, { denomination: 'd10', spent: 0, additional: '' })
  assert.deepEqual(cls.system.primaryAbility, { value: ['str'], all: false })
  assert.equal(cls.system.description.value, '<p>A warrior who <strong>embraces</strong> the dark.</p>')
  assert.equal(adv(cls, 'HitPoints').length, 1)
  const traits = Object.fromEntries(adv(cls, 'Trait').map((t) => [t.title, t.configuration]))
  assert.deepEqual(traits['Saving Throw Proficiencies'].grants, ['saves:str', 'saves:con'])
  assert.deepEqual(traits['Skill Proficiencies'].choices, [{ count: 2, pool: ['skills:ins', 'skills:dec', 'skills:itm', 'skills:ath'] }])
  assert.deepEqual(traits['Armor Training'].grants, ['armor:lgt', 'armor:med', 'armor:hvy'])
  assert.deepEqual(traits['Weapon Proficiencies'].grants, ['weapon:sim', 'weapon:mar'], 'firearms stays text-only')
  // One subclass step, at the first subclass level; later levels are the subclass's own grants.
  assert.deepEqual(adv(cls, 'Subclass').map((a) => [a.level, a.title]), [[3, 'Dark Archetype']])
  assert.deepEqual(adv(cls, 'AbilityScoreImprovement').map((a) => a.level), [4])
  const scales = Object.fromEntries(adv(cls, 'ScaleValue').map((a) => [a.configuration.identifier, a.configuration]))
  assert.deepEqual(Object.keys(scales), ['darkness-points', 'dark-arts-die', 'aura'])
  assert.deepEqual(scales['darkness-points'].scale, { 2: { value: 9 }, 6: { value: 12 }, 10: { value: 16 } })
})

test('features are granted level by level, and choice groups are dnd5e choices from a pool', () => {
  const pack = buildClassPack({ classes: [darkKnight()], items: items() })
  const cls = one(pack, 'The Dark Knight', 'class')
  const grants = Object.fromEntries(adv(cls, 'ItemGrant').map((g) => [g.level, g.configuration.items.map((i) => i.uuid)]))
  assert.deepEqual(Object.keys(grants).map(Number), [1, 2, 6])
  assert.deepEqual(grants[2], [uuidOf(one(pack, 'Dark Arts'))], 'the options are not granted outright')
  assert.deepEqual(grants[6], [uuidOf(one(pack, 'Dark Arts Continued'))])
  for (const uuid of Object.values(grants).flat()) assert.match(uuid, UUID_RE)

  const choices = adv(cls, 'ItemChoice')
  assert.deepEqual(choices.map((c) => c.configuration.choices), [{ 2: { count: 2, replacement: false } }, { 6: { count: 1, replacement: false } }])
  assert.deepEqual(choices[0].configuration.pool.map((p) => p.uuid), [uuidOf(one(pack, 'Shadow Smite')), uuidOf(one(pack, 'Restore Vitality'))])
  assert.deepEqual(choices[1].configuration.pool.map((p) => p.uuid), [uuidOf(one(pack, 'Curse')), uuidOf(one(pack, 'Shadow Warp'))])
  assert.equal(choices[0].configuration.type, 'feat')
})

// The Dark Knight's real shape: Dark Arts at 2 (choose 2, swappable), more
// arts at 6 and 11 that add options but no pick, and the table's Dark Arts
// Known column saying how many the player knows.
function swappingDarkKnight({ known = true } = {}) {
  const art = (level, name, extra = {}) => row(level, name, { choice_group: 'Dark Arts', choice_count: level === 2 ? 2 : null, choice_swap: level === 2, ...extra })
  const form = darkKnight()
  form.features = [
    row(2, 'Dark Arts'),
    art(2, 'Shadow Smite'),
    art(2, 'Restore Vitality'),
    art(2, 'Shadow Veil'),
    row(6, 'Dark Arts Continued'),
    art(6, 'Curse'),
    art(6, 'Shadow Warp'),
    row(11, 'Dark Arts Expanded'),
    art(11, 'Bulwark'),
  ]
  if (known) form.tableColumns = [{ id: null, name: 'Dark Arts Known', valuesByLevel: { 1: '—', 2: '2', 3: '3', 5: '3', 6: '4', 11: '4', 12: '5', 17: '6' } }]
  return form
}

test('a swap group is one choice: options unlock at their level, picks follow the Known column, every level-up can swap', () => {
  const pack = buildClassPack({ classes: [swappingDarkKnight()], items: items() })
  const cls = one(pack, 'The Dark Knight', 'class')
  const [arts, ...others] = adv(cls, 'ItemChoice')
  assert.equal(others.length, 0)
  assert.equal(arts.title, 'Dark Arts')
  assert.deepEqual(
    arts.configuration.pool.map((p) => p.uuid),
    ['Shadow Smite', 'Restore Vitality', 'Shadow Veil', 'Curse', 'Shadow Warp', 'Bulwark'].map((n) => uuidOf(one(pack, n))),
  )
  const { choices } = arts.configuration
  assert.deepEqual(Object.keys(choices).map(Number), Array.from({ length: 19 }, (_, i) => i + 2))
  const picks = Object.fromEntries(Object.entries(choices).filter(([, c]) => c.count).map(([l, c]) => [l, c.count]))
  assert.deepEqual(picks, { 2: 2, 3: 1, 6: 1, 12: 1, 17: 1 })
  assert.equal(choices[2].replacement, false)
  assert.ok(Object.entries(choices).every(([l, c]) => Number(l) === 2 || c.replacement))
  assert.equal(one(pack, 'Shadow Smite').system.prerequisites.level, 2)
  assert.equal(one(pack, 'Curse').system.prerequisites.level, 6)
  assert.equal(one(pack, 'Bulwark').system.prerequisites.level, 11)
  assert.equal(one(pack, 'Dark Arts Continued').system.prerequisites, undefined, 'the intro features stay plain grants')

  // Same id as the level 2 choice before swapping existed, so characters'
  // level 2 picks carry over on Sync classes.
  const before = adv(one(buildClassPack({ classes: [darkKnight()], items: items() }), 'The Dark Knight', 'class'), 'ItemChoice')[0]
  assert.equal(arts._id, before._id)
})

test('a swap group without a Known column takes its picks from the rows', () => {
  const cls = one(buildClassPack({ classes: [swappingDarkKnight({ known: false })], items: items() }), 'The Dark Knight', 'class')
  const { choices } = adv(cls, 'ItemChoice')[0].configuration
  assert.deepEqual(Object.fromEntries(Object.entries(choices).filter(([, c]) => c.count).map(([l, c]) => [l, c.count])), { 2: 2 })
})

test('the editor nests options under the feature at their own level, and later lists add to the group', () => {
  const rows = swappingDarkKnight().features
  const nested = nestFeatureRows(rows)
  assert.deepEqual(nested.map((r) => [r.level, r.name, r.children.map((c) => c.name), r.choice_into, r.choice_swap]), [
    [2, 'Dark Arts', ['Shadow Smite', 'Restore Vitality', 'Shadow Veil'], '', true],
    [6, 'Dark Arts Continued', ['Curse', 'Shadow Warp'], 'Dark Arts', false],
    [11, 'Dark Arts Expanded', ['Bulwark'], 'Dark Arts', false],
  ])
  const flat = flattenFeatureRows(nested)
  assert.deepEqual(
    flat.map((r) => [r.level, r.name, r.choice_group, r.choice_count, r.choice_swap]),
    rows.map((r) => [r.level, r.name, r.choice_group, r.choice_count, !!r.choice_swap]),
    'a save round-trips: levels, groups, counts and the swap flag unchanged',
  )
  // A group named a little differently from its feature is still its own choice.
  const own = nestFeatureRows([row(2, 'Metamagic Options'), row(2, 'Twinned', { choice_group: 'Metamagic', choice_count: 2 })])
  assert.equal(own[0].choice_into, '')
  assert.equal(own[0].choice_count, 2)

  // The same feature name at two levels (a gunslinger's Specialty Upgrade at
  // 6 and 11): each keeps its own options at its own level.
  const upgrades = [
    row(6, 'Specialty Upgrade'),
    row(6, 'Short Range Specialist Upgrade', { choice_group: 'Specialty Upgrade' }),
    row(11, 'Specialty Upgrade'),
    row(11, 'Short Range Upgrade', { choice_group: 'Specialty Upgrade' }),
  ]
  const twice = nestFeatureRows(upgrades)
  assert.deepEqual(twice.map((r) => [r.level, r.children.map((c) => c.name), r.choice_into]), [
    [6, ['Short Range Specialist Upgrade'], ''],
    [11, ['Short Range Upgrade'], ''],
  ])
  assert.deepEqual(flattenFeatureRows(twice).map((r) => [r.level, r.name]), upgrades.map((r) => [r.level, r.name]))
})

test('a linked feature is the whole Feature Forge item, with the row’s words', () => {
  const pack = buildClassPack({ classes: [darkKnight()], items: items() })
  const ds = one(pack, 'Death Stance')
  // What made the toggle work in the Plutonium probe: flags, the hook macro, effects, uses.
  assert.equal(ds.flags['chrab-sync'].featureDraftId, 'draft-ds')
  assert.match(ds.flags['midi-qol'].onUseMacroName, /^\[postActiveEffects\]ActivityMacro-/)
  assert.match(Object.values(ds.system.activities)[0].macroData.command, /const SETUP = /)
  assert.equal(ds.effects[0].flags['chrab-sync'].stance, true)
  assert.equal(ds.system.uses.max, '@prof')
  assert.equal(ds.system.description.value, '<p>Death Stance text.</p>', 'the row owns the words')
  assert.equal(ds.system.requirements, 'The Dark Knight 3 (Harbinger of Darkness)')
  assert.equal(ds.flags['chrab-sync'].packItem, ds._id, 'Chrab Sync finds characters’ copies by this')

  // The Darkness pool keeps its identifier, so spenders find it on any character.
  const pool = one(pack, 'Dark Arts')
  assert.equal(pool.system.identifier, 'darkness')
  assert.equal(pool.system.uses.max, '@scale.the-dark-knight.darkness-points')

  // Unlinked rows (and a link to a draft that's gone) are plain text features.
  const plain = one(pack, 'Death Archetype Upgrade')
  assert.deepEqual(plain.system.activities, {})
  assert.equal(plain.system.identifier, 'death-archetype-upgrade')
  assert.equal(plain.system.type.value, 'class')
})

test('the subclass item grants its own features by level', () => {
  const pack = buildClassPack({ classes: [darkKnight()], items: items() })
  const sub = one(pack, 'Harbinger of Darkness', 'subclass')
  assert.equal(sub.system.description.value, '<p>Melee offense.</p>')
  assert.deepEqual(
    adv(sub, 'ItemGrant').map((g) => [g.level, g.configuration.items.map((i) => i.uuid)]),
    [
      [3, [uuidOf(one(pack, 'Death Stance'))]],
      [7, [uuidOf(one(pack, 'Death Archetype Upgrade'))]],
    ],
  )
})

test('choice_count 0 grants every option instead of a choice', () => {
  const form = { ...darkKnight(), features: [row(1, 'Origins'), row(1, 'Claws', { choice_group: 'Origins', choice_count: 0 }), row(1, 'Wings', { choice_group: 'Origins', choice_count: 0 })], subclasses: [] }
  const cls = one(buildClassPack({ classes: [form] }), 'The Dark Knight', 'class')
  assert.equal(adv(cls, 'ItemChoice').length, 0)
  assert.equal(adv(cls, 'ItemGrant')[0].configuration.items.length, 3)
  assert.equal(adv(cls, 'Subclass').length, 0, 'no subclasses, no subclass step')
})

test('markdown becomes sheet HTML', () => {
  assert.equal(markdownToHtml(''), '')
  assert.equal(markdownToHtml('a *b* & c\nd\n\n- one\n- two'), '<p>a <em>b</em> &amp; c<br>d</p><ul><li>one</li><li>two</li></ul>')
  assert.equal(markdownToHtml('| A | B |\n|---|---|\n| 1 | **2** |'), '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td><strong>2</strong></td></tr></tbody></table>')
  assert.equal(markdownToHtml('<p>already</p>'), '<p>already</p>')
})

test('class table columns become ScaleValue advancements', () => {
  assert.deepEqual(tableColumnScaleValue({ name: 'Dark Arts Die', valuesByLevel: { 2: '1d8', 11: 'd10' } }).configuration.scale, {
    2: { number: 1, faces: 8 },
    11: { number: 1, faces: 10 },
  })
  assert.deepEqual(tableColumnScaleValue({ name: 'Aura', valuesByLevel: { 1: '-', 9: '20 ft.' } }).configuration.scale, { 9: { value: '20 ft.' } })
  assert.equal(tableColumnScaleValue({ name: '', valuesByLevel: { 1: '2' } }), null)
  assert.equal(tableColumnScaleValue({ name: 'Empty', valuesByLevel: { 1: '—' } }), null)
})

// ---------------------------------------------------------------------------
// The 5etools export (Export to 5etools in the class editor)

test('5etools: only the picks are listed, the options hang off the intro feature', () => {
  const json = classFormToFiveToolsJson(darkKnight())
  const intro = json.classFeature.find((f) => f.name === 'Dark Arts')
  const options = intro.entries.find((e) => e.type === 'options')
  assert.equal(options.count, 2)
  assert.ok(options.entries.some((e) => e.classFeature === 'Shadow Smite|The Dark Knight|TDK|2'))
  const refs = json.class[0].classFeatures.map((r) => (typeof r === 'string' ? r : r.classFeature))
  assert.deepEqual(refs.filter((r) => r.endsWith('|2')), ['Dark Arts|The Dark Knight|TDK|2'])
})

test('5etools: a subclass leads with a header named after it, and reads back', () => {
  const json = classFormToFiveToolsJson(darkKnight())
  const [sub] = json.subclass
  assert.deepEqual(sub.subclassFeatures, [
    'Harbinger of Darkness|The Dark Knight|TDK|Harbinger of Darkness|TDK|3',
    'Death Archetype Upgrade|The Dark Knight|TDK|Harbinger of Darkness|TDK|7',
  ])
  const header = json.subclassFeature.find((f) => f.name === 'Harbinger of Darkness')
  assert.deepEqual(header.entries, [
    'Melee offense.',
    { type: 'refSubclassFeature', subclassFeature: 'Death Stance|The Dark Knight|TDK|Harbinger of Darkness|TDK|3' },
  ])
  const [back] = fiveToolsJsonToClassForm(json).subclasses
  assert.equal(back.description, 'Melee offense.')
  assert.deepEqual(back.features.map((f) => [f.level, f.name]), [[3, 'Death Stance'], [7, 'Death Archetype Upgrade']])
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
