import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nestFeatureRows } from './homebrew.js'
import { linkTextPatch, placedRow, placementsFor, rowFromDraft } from './forgeClassRows.js'

const spec = (name, description) => ({ kind: 'feat', item: { name, description, activities: [], effects: [] } })
const row = (level, name, extra = {}) => ({ level, name, description: `${name} text.`, sort_order: 0, choice_group: '', choice_count: null, choice_swap: false, feature_draft_id: null, ...extra })

// Pictomancer as stored: Illustrate with one option, Open Wound on its own.
const picto = [
  row(1, 'Illustrate', { sort_order: 0 }),
  row(1, 'Bleeding Scar', { sort_order: 1, choice_group: 'Illustrate', choice_count: 0 }),
  row(1, 'Open Wound', { sort_order: 2 }),
]

test('a row from a draft carries its name, text and link', () => {
  const r = rowFromDraft('d1', spec(' Mark of Healing ', 'Heals.'))
  assert.equal(r.name, 'Mark of Healing')
  assert.equal(r.description, 'Heals.')
  assert.equal(r.feature_draft_id, 'd1')
  assert.equal(r.mechanicsDirty, false)
})

test('linking: blank text is filled from the draft, different text is a conflict', () => {
  assert.deepEqual(linkTextPatch({ name: '', description: '' }, spec('Mark', 'Heals.')), { patch: { name: 'Mark', description: 'Heals.' }, conflicts: [], forge: {} })
  assert.deepEqual(linkTextPatch({ name: 'mark', description: '' }, spec('Mark', 'Heals.')).conflicts, [], 'same name, other case')
  const both = linkTextPatch({ name: 'Healing Mark', description: 'Mine.' }, spec('Mark', 'Heals.'))
  assert.deepEqual(both.conflicts, ['name', 'text'])
  assert.deepEqual(both.forge, { name: 'Mark', description: 'Heals.' })
  assert.deepEqual(linkTextPatch({ name: 'Mark', description: 'Mine.' }, spec('Mark', '')).conflicts, [], "a draft with no text doesn't argue")
})

test('placements: the top-level features, with their option counts', () => {
  assert.deepEqual(placementsFor(picto), [
    { name: 'Illustrate', level: 1, options: 1 },
    { name: 'Open Wound', level: 1, options: 0 },
  ])
})

test('placed under a feature: its group, level and pick settings; nests back under it', () => {
  const r = placedRow(picto, { name: 'Mark of Healing', description: 'Heals.', draftId: 'd1', level: 9, under: 'illustrate' })
  assert.deepEqual(
    { level: r.level, group: r.choice_group, count: r.choice_count, sort: r.sort_order, draft: r.feature_draft_id },
    { level: 1, group: 'Illustrate', count: 0, sort: 3, draft: 'd1' },
  )
  const illustrate = nestFeatureRows([...picto, r]).find((n) => n.name === 'Illustrate')
  assert.deepEqual(illustrate.children.map((c) => c.name), ['Bleeding Scar', 'Mark of Healing'])
})

test('placed under a feature with no options yet: they pick 1; on its own: the level given', () => {
  assert.equal(placedRow(picto, { name: 'X', draftId: 'd', under: 'Open Wound' }).choice_count, 1)
  const own = placedRow(picto, { name: 'X', draftId: 'd', level: '5' })
  assert.deepEqual([own.level, own.choice_group, own.choice_count], [5, '', null])
  assert.throws(() => placedRow(picto, { name: 'X', draftId: 'd', under: 'Nope' }), /No feature named/)
})

test('under a feature that adds to an earlier group: joins that group', () => {
  const rows = [
    row(2, 'Dark Arts'),
    row(2, 'Shadow Smite', { choice_group: 'Dark Arts', choice_count: 2 }),
    row(6, 'Dark Arts Continued'),
    row(6, 'Night Veil', { choice_group: 'Dark Arts' }),
  ]
  const r = placedRow(rows, { name: 'Gloom', draftId: 'd', under: 'Dark Arts Continued' })
  assert.deepEqual([r.level, r.choice_group, r.choice_count], [6, 'Dark Arts', null])
})
