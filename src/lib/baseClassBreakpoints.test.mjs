// Run with: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyBreakpoints, breakpointsOf, BASE_CLASSES } from './baseClassBreakpoints.js'
import { emptyClassForm } from './homebrew.js'

const top = (form) => form.features.filter((r) => !r.choice_group)
const levelsNamed = (form, re) => top(form).filter((r) => re.test(r.name)).map((r) => r.level).sort((a, b) => a - b)

test('every base class has ASIs and subclass levels', () => {
  for (const c of BASE_CLASSES) {
    const bp = breakpointsOf(c.key)
    assert.ok(bp.asi.length >= 4 && bp.subclass.length >= 3, c.key)
    assert.ok(bp.asi.every((l) => l >= 1 && l <= 20) && bp.subclass.every((l) => l >= 1 && l <= 20))
    assert.equal(bp.subclass[0], 3, c.key)
    assert.equal(bp.boon, 19)
  }
})

test('a new class from the Fighter: its ASIs, an Epic Boon, its subclass levels', () => {
  const { form, added } = applyBreakpoints(emptyClassForm, 'fighter')
  assert.deepEqual(levelsNamed(form, /^Ability Score Improvement$/), [4, 6, 8, 12, 14, 16])
  assert.deepEqual(levelsNamed(form, /^Epic Boon$/), [19])
  assert.deepEqual(form.subclass_levels, [3, 7, 10, 15, 18])
  assert.deepEqual(added, { asi: [4, 6, 8, 12, 14, 16], boon: 19, subclass: [7, 10, 15, 18] })
})

test('adds only what is missing, and keeps the class’s own rows', () => {
  const start = {
    ...emptyClassForm,
    features: [
      { level: 4, name: 'Ability Score Increase', description: 'mine' },
      { level: 19, name: 'Epic Boon Feat', description: 'mine' },
      { level: 5, name: 'Extra Attack', description: '' },
    ],
    subclasses: [{ name: 'Path', features: [{ level: 5, name: 'Odd one' }] }],
  }
  const { form, added } = applyBreakpoints(start, 'barbarian')
  assert.deepEqual(added.asi, [8, 12, 16])
  assert.equal(added.boon, null)
  assert.ok(top(form).some((r) => r.name === 'Extra Attack'))
  assert.equal(top(form).find((r) => r.level === 4).description, 'mine')
  // A level a subclass already has features at stays a subclass level.
  assert.deepEqual(form.subclass_levels, [3, 5, 6, 10, 14])
  // Applying again adds nothing.
  assert.deepEqual(applyBreakpoints(form, 'barbarian').added, { asi: [], boon: null, subclass: [] })
})

test('parts can be left out', () => {
  const { form, added } = applyBreakpoints(emptyClassForm, 'rogue', { asi: false, boon: false, subclass: true })
  assert.equal(form.features.length, 0)
  assert.deepEqual(form.subclass_levels, [3, 9, 13, 17])
  assert.deepEqual(added.asi, [])
})
