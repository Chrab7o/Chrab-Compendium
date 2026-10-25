// Run with: npm test
//
// The item library (itemLibrary.js): NPC items linked to Item Forge drafts,
// resolved before the NPC is built, and moved in and out of the library.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildNpcActor, emptyActivity, emptyNpcItem, emptyNpcSpec, emptySpend } from './foundryActorBuilder.js'
import { emptyFeatureSpec } from './foundryFeatures.js'
import { inlineCopy, isLinked, itemLink, librarySpecFromNpcItem, linkFromNpcItem, linkedDraftIds, missingLinks, resolveNpcSpec } from './itemLibrary.js'

function biteSpec() {
  const spec = emptyFeatureSpec('feat')
  spec.featType = 'monster'
  spec.item = { ...emptyNpcItem('action'), name: 'Bite', activities: [{ ...emptyActivity('attack'), damage: [{ formula: '1d10 + @mod', types: ['piercing'] }] }] }
  return spec
}

test('a link resolves to its library item, placed where the NPC put it', () => {
  const link = itemLink('draft-1', { section: 'legendary', legendaryCost: 2 })
  const npc = { ...emptyNpcSpec(), name: 'Wyrm', items: [link] }
  const resolved = resolveNpcSpec(npc, new Map([['draft-1', biteSpec()]]))
  const [item] = resolved.items
  assert.equal(item.name, 'Bite')
  assert.equal(item.key, link.key)
  assert.equal(item.section, 'legendary')
  assert.equal(item.legendaryCost, 2)
  assert.equal(item.draftId, 'draft-1')
  assert.equal(npc.items[0], link, 'the stored spec is left alone')
})

test('a resolved NPC builds the library item with its own stats', () => {
  const npc = { ...emptyNpcSpec(), name: 'Wyrm', abilities: { ...emptyNpcSpec().abilities, str: 20 }, items: [itemLink('draft-1')] }
  const actor = buildNpcActor(resolveNpcSpec(npc, new Map([['draft-1', biteSpec()]])))
  const bite = actor.items.find((i) => i.name === 'Bite')
  assert.ok(bite, 'Bite is on the actor')
  assert.equal(Object.values(bite.system.activities)[0].type, 'attack')
})

test('missing drafts are left out and reported', () => {
  const inline = { ...emptyNpcItem('trait'), name: 'Keen Smell' }
  const npc = { ...emptyNpcSpec(), items: [inline, itemLink('gone'), itemLink('draft-1')] }
  const drafts = new Map([['draft-1', biteSpec()]])
  assert.deepEqual(resolveNpcSpec(npc, drafts).items.map((i) => i.name), ['Keen Smell', 'Bite'])
  assert.deepEqual(missingLinks(npc, drafts).map((l) => l.draftId), ['gone'])
  assert.deepEqual(linkedDraftIds({ items: [...npc.items, itemLink('draft-1')] }), ['gone', 'draft-1'])
  assert.equal(isLinked(inline), false)
})

test('moving an inline item to the library keeps its key and placement', () => {
  const pool = { ...emptyNpcItem('legendary'), name: 'Tail Swipe', legendaryCost: 2, itemType: 'weapon' }
  const spender = { ...emptyNpcItem('action'), activities: [{ ...emptyActivity('save'), spend: [{ ...emptySpend(), source: 'item', target: pool.key }] }] }
  const librarySpec = librarySpecFromNpcItem(pool)
  assert.equal(librarySpec.featType, 'monster')
  assert.equal(librarySpec.item.section, 'action', 'legendary is placement, not part of the item')
  assert.equal(librarySpec.item.itemType, 'feat')

  const link = linkFromNpcItem(pool, 'draft-9')
  assert.deepEqual({ ...link }, { key: pool.key, draftId: 'draft-9', section: 'legendary', legendaryCost: 2, itemType: 'weapon' })

  const resolved = resolveNpcSpec({ ...emptyNpcSpec(), items: [link, spender] }, new Map([['draft-9', librarySpec]]))
  assert.equal(resolved.items[0].key, resolved.items[1].activities[0].spend[0].target, 'spends still point at it')
})

test('a private copy is the library item, inline and unlinked', () => {
  const link = itemLink('draft-1', { section: 'bonus' })
  const copy = inlineCopy(link, biteSpec())
  assert.equal(copy.name, 'Bite')
  assert.equal(copy.section, 'bonus')
  assert.equal(copy.key, link.key)
  assert.equal(isLinked(copy), false)
})
