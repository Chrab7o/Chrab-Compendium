import { test } from 'node:test'
import assert from 'node:assert/strict'
import { effectiveRegionTarget, regionEntries } from './tags.js'

const region = { id: 'r1', tag_query: ['location', 'ashfall'], entry_ids: ['e9'] }
const links = [{ region_id: 'r1', campaign_id: 'c2', tag_query: [], entry_ids: ['e3'] }]

test('default target is the region’s own tags and entries', () => {
  assert.deepEqual(effectiveRegionTarget(region, links, 'c1'), {
    tagQuery: ['location', 'ashfall'],
    entryIds: ['e9'],
  })
  assert.deepEqual(effectiveRegionTarget(region, links, ''), {
    tagQuery: ['location', 'ashfall'],
    entryIds: ['e9'],
  })
})

test('a timeline override replaces tags and entries together', () => {
  assert.deepEqual(effectiveRegionTarget(region, links, 'c2'), { tagQuery: [], entryIds: ['e3'] })
})

test('rows from before entry_ids existed read as no picked entries', () => {
  assert.deepEqual(effectiveRegionTarget({ id: 'r2', tag_query: ['x'] }, [], null), {
    tagQuery: ['x'],
    entryIds: [],
  })
})

test('region entries are the tag matches plus the picked ones, once each', () => {
  const entries = [
    { id: 'e1', tags: ['Location', 'Ashfall'] },
    { id: 'e2', tags: ['Location'] },
    { id: 'e3', tags: [] },
    { id: 'e9', tags: ['location', 'ashfall'] },
  ]
  const ids = (t) => regionEntries(entries, t).map((e) => e.id)
  assert.deepEqual(ids({ tagQuery: ['location', 'ashfall'], entryIds: ['e9', 'e3'] }), ['e1', 'e3', 'e9'])
  assert.deepEqual(ids({ tagQuery: [], entryIds: ['e2', 'gone'] }), ['e2'])
  assert.deepEqual(ids({ tagQuery: [], entryIds: [] }), [])
})
