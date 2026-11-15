// Run with: npm test
//
// Feature rows edited by level (levelRows.js), the class editor's Levels step.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addFeature, addOption, byLevel, choicePatch, choiceSummary, choiceValue, earlierGroups, ensureKeys, findRow, laterAdditions, levelRows, moveOption, moveRow, optionHomes, removeRow, updateRow } from './levelRows.js'

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

test('options a later feature adds: listed on the group, summarised, and movable between levels', () => {
  const rows = stored()
  assert.deepEqual(laterAdditions(rows, 'id:f2').map((n) => [n.level, n.name]), [[6, 'Dark Arts Continued']])
  assert.deepEqual(laterAdditions(rows, 'id:f1'), [])
  const arts = levelRows(rows).find((n) => n.name === 'Dark Arts')
  assert.equal(choiceSummary(arts, laterAdditions(rows, 'id:f2')), 'pick 2 of 2, swappable, +1 at 6')

  const homes = optionHomes(rows, 'id:o3')
  assert.deepEqual(homes.map((h) => [h.level, h.name, h.own]), [[2, 'Dark Arts', true], [6, 'Dark Arts Continued', false]])
  assert.deepEqual(optionHomes(rows, 'id:o1').map((h) => h.level), [2, 6], 'the same homes from a base option')
  assert.deepEqual(optionHomes(rows, 'id:f2'), [], 'a feature has none')

  // Curse down to level 2: it joins Dark Arts' own options with their count.
  const down = moveOption(rows, 'id:o3', 'id:f2')
  const curse = down.find((r) => r.name === 'Curse')
  assert.equal(curse.level, 2)
  assert.equal(curse.choice_group, 'Dark Arts')
  assert.equal(curse.choice_count, 2)
  // Shadow Lance up to 6: unlocks with Dark Arts Continued, still in Dark Arts.
  const up = moveOption(rows, 'id:o1', 'id:f4')
  const lance = up.find((r) => r.name === 'Shadow Lance')
  assert.equal(lance.level, 6)
  assert.equal(lance.choice_group, 'Dark Arts')
  assert.equal(lance.choice_count, null)
  assert.equal(findRow(up, 'id:o1').parent.name, 'Dark Arts Continued')
  assert.equal(moveOption(rows, 'id:o1', 'id:f2'), rows, 'already there: unchanged')
})

test('options a later feature adds keep its level though neither name contains the other', () => {
  const rows = [
    { id: 'i', level: 1, name: 'Illustrate', description: '', choice_group: '', choice_count: null },
    { id: 'a', level: 1, name: 'Bleeding Scar', description: '', choice_group: 'Illustrate', choice_count: 1 },
    { id: 'm', level: 7, name: 'Intermediate Illustrations', description: '', choice_group: '', choice_count: null },
    { id: 'f', level: 7, name: 'Frozen Maw', description: '', choice_group: 'Illustrate', choice_count: null },
  ]
  const mid = levelRows(rows).find((n) => n.name === 'Intermediate Illustrations')
  assert.equal(mid.choice_into, 'Illustrate')
  assert.deepEqual(names(mid.children), ['Frozen Maw'])
  const saved = updateRow(rows, 'id:i', {})
  assert.equal(saved.find((r) => r.name === 'Frozen Maw').level, 7, 'a save keeps it at 7')
  // Set from the editor: "add these to Illustrate".
  const own = [rows[0], rows[1], rows[2], { id: 'k', level: 7, name: 'Mark of Acceleration', description: '', choice_group: 'Intermediate Illustrations', choice_count: 1 }]
  const into = updateRow(own, 'id:m', choicePatch('into:Illustrate'))
  assert.equal(into.find((r) => r.name === 'Mark of Acceleration').level, 7)
  assert.equal(findRow(into, 'id:k').parent.name, 'Intermediate Illustrations')
})
