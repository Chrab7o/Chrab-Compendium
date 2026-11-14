// Run with: npm test
//
// Feature rows edited by level (levelRows.js), the class editor's Levels step.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addFeature, addOption, byLevel, choicePatch, choiceSummary, choiceValue, earlierGroups, ensureKeys, findRow, levelRows, moveRow, removeRow, updateRow } from './levelRows.js'

// The Dark Knight's shape, as the tables store it.
const stored = () => [
  { id: 'f1', level: 1, name: 'Tainted Soul', description: 'a', choice_group: '', choice_count: null },
  { id: 'f2', level: 2, name: 'Dark Arts', description: 'b', choice_group: '', choice_count: null },
  { id: 'o1', level: 2, name: 'Shadow Lance', description: '', choice_group: 'Dark Arts', choice_count: 2, choice_swap: true },
  { id: 'o2', level: 2, name: 'Restore Vitality', description: '', choice_group: 'Dark Arts', choice_count: 2, choice_swap: true },
  { id: 'f3', level: 2, name: 'Soul Surge', description: 'c', choice_group: '', choice_count: null },
  { id: 'f4', level: 6, name: 'Dark Arts Continued', description: '', choice_group: '', choice_count: null },
  { id: 'o3', level: 6, name: 'Curse', description: '', choice_group: 'Dark Arts', choice_count: null },
]
const names = (rows) => rows.map((r) => r.name)

test('rows from the database key off their id; imported ones off their place', () => {
  const rows = ensureKeys([...stored(), { level: 3, name: 'Imported', description: '' }])
  assert.equal(rows[0].ui_key, 'id:f1')
  assert.equal(rows[7].ui_key, 'ix:7')
  assert.deepEqual(ensureKeys([{ level: 1, name: 'x' }]), ensureKeys([{ level: 1, name: 'x' }]), 'the same every call')
  assert.equal(ensureKeys(rows), rows, 'already keyed: the same array')
})

test('nested by level, with options under their feature', () => {
  const levels = byLevel(stored())
  assert.deepEqual([...levels.keys()], [1, 2, 6])
  assert.deepEqual(names(levels.get(2)), ['Dark Arts', 'Soul Surge'])
  const arts = levels.get(2)[0]
  assert.deepEqual(names(arts.children), ['Shadow Lance', 'Restore Vitality'])
  assert.equal(choiceSummary(arts), 'pick 2 of 2, swappable')
  assert.equal(choiceSummary(levels.get(6)[0]), '+1 to Dark Arts')
})

test('a round trip with no edits keeps the stored rows', () => {
  const rows = stored()
  const back = updateRow(rows, 'id:f1', {})
  assert.deepEqual(
    back.map(({ ui_key, sort_order, choice_swap, ...r }) => r),
    rows.map(({ choice_swap, ...r }) => ({ ...r, choice_count: r.choice_group ? r.choice_count : null })),
  )
})

test('adding a feature at a level, and finding it again by its key', () => {
  const { rows, key } = addFeature(stored(), { level: 4 })
  assert.deepEqual(names(byLevel(rows).get(4)), [''])
  const renamed = updateRow(rows, key, { name: 'Ability Score Improvement' })
  assert.equal(findRow(renamed, key).row.name, 'Ability Score Improvement')
  const moved = updateRow(renamed, key, { level: 8 })
  assert.equal(findRow(moved, key).row.level, 8)
})

test('options: add, rename, find with their parent, remove', () => {
  const { rows, key } = addOption(stored(), 'id:f2', { name: 'Grasp of Shadows' })
  const found = findRow(rows, key)
  assert.equal(found.parent.name, 'Dark Arts')
  assert.equal(found.row.level, 2)
  assert.equal(rows.find((r) => r.ui_key === key).choice_group, 'Dark Arts')
  assert.equal(rows.find((r) => r.ui_key === key).choice_count, 2, 'takes the group’s count')
  assert.equal(findRow(updateRow(rows, key, { name: 'Grasp' }), key).row.name, 'Grasp')
  assert.equal(findRow(removeRow(rows, key), key), null)
})

test('renaming a feature carries its options and the features adding to it', () => {
  const rows = updateRow(stored(), 'id:f2', { name: 'Shadow Arts' })
  assert.deepEqual(rows.filter((r) => r.choice_group === 'Shadow Arts').map((r) => r.name), ['Shadow Lance', 'Restore Vitality', 'Curse'])
})

test('changing a feature’s level moves its options with it', () => {
  const rows = updateRow(stored(), 'id:f2', { level: 3 })
  assert.deepEqual(rows.filter((r) => r.choice_group === 'Dark Arts' && r.name !== 'Curse').map((r) => r.level), [3, 3])
})

test('moving stays within the level, and options move within their feature', () => {
  const down = moveRow(stored(), 'id:f2', 1)
  assert.deepEqual(names(byLevel(down).get(2)), ['Soul Surge', 'Dark Arts'])
  const alone = stored()
  assert.equal(moveRow(alone, 'id:f1', 1), alone, 'no neighbour: unchanged')
  assert.deepEqual(names(byLevel(moveRow(stored(), 'id:f1', 1)).get(1)), ['Tainted Soul'])
  const opts = moveRow(stored(), 'id:o2', -1)
  assert.deepEqual(names(byLevel(opts).get(2)[0].children), ['Restore Vitality', 'Shadow Lance'])
})

test('removing a feature removes its options', () => {
  const rows = removeRow(stored(), 'id:f2')
  assert.ok(!rows.some((r) => r.name === 'Shadow Lance'))
  assert.ok(rows.some((r) => r.name === 'Curse'), 'a later group that adds to it stays')
})

test('the Players choice', () => {
  const arts = levelRows(stored()).find((n) => n.name === 'Dark Arts')
  assert.equal(choiceValue(arts), '2')
  assert.deepEqual(choicePatch('0'), { choice_into: '', choice_count: 0 })
  assert.deepEqual(choicePatch('into:Dark Arts'), { choice_into: 'Dark Arts', choice_count: null, choice_swap: false })
  const all = updateRow(stored(), 'id:f2', choicePatch('0'))
  assert.equal(choiceSummary(levelRows(all).find((n) => n.name === 'Dark Arts')), 'all 2')
  assert.deepEqual(earlierGroups(stored(), 'id:f4'), ['Dark Arts'])
  assert.deepEqual(earlierGroups(stored(), 'id:f2'), [])
})

test('a group with no intro feature gets one when it is edited, keeping its key', () => {
  const rows = [{ id: 'o9', level: 3, name: 'Option', description: '', choice_group: 'Fighting Style', choice_count: 1 }]
  const group = levelRows(rows)[0]
  assert.equal(group.key, 'group:3:Fighting Style')
  const edited = updateRow(rows, group.key, { description: 'Pick a style.' })
  assert.equal(findRow(edited, group.key).row.description, 'Pick a style.')
  assert.equal(edited.filter((r) => !r.choice_group).length, 1)
})
