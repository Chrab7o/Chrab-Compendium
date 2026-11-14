// Run with: npm test (from the Compendium root)
//
// Chrab Sync's rules for copies of built items (scripts/copyRules.mjs): what
// a sync keeps, what counts as an edit made in Foundry, and the site links.
// Not shipped: the module zip takes only scripts/ and styles/.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isBuilt, isEditedLocally, isPlayChange, isPlayEffectChange, keepChoices, refreshedData, siteLink, siteRoute } from '../scripts/copyRules.mjs'

const site = {
  _id: 'siteItem00000001',
  name: 'Longsword of Night',
  type: 'weapon',
  folder: 'packFolder000001',
  sort: 500,
  system: {
    quantity: 1,
    equipped: false,
    attuned: false,
    identified: true,
    container: null,
    uses: { max: '3', spent: 0, recovery: [] },
    activities: { atk0000000000001: { type: 'attack', uses: { max: '1', spent: 0 } } },
    damage: { base: { number: 2, denomination: 6 } },
  },
  effects: [{ _id: 'eff0000000000001', name: 'Shadow', disabled: false, changes: [{ key: 'system.bonuses.mwak.damage', value: '1d4' }] }],
  flags: { 'chrab-sync': { featureDraftId: 'draft-1' }, 'midi-qol': { onUseMacroName: '[postActiveEffects]ActivityMacro' } },
}

const copy = {
  _id: 'copyOnActor00001',
  name: 'Longsword of Night',
  type: 'weapon',
  sort: 1200,
  ownership: { default: 0, player1: 3 },
  _stats: { createdTime: 1 },
  system: {
    quantity: 2,
    equipped: true,
    attuned: true,
    identified: true,
    container: 'bagOfHolding0001',
    uses: { max: '2', spent: 1, recovery: [] },
    activities: { atk0000000000001: { type: 'attack', uses: { max: '1', spent: 1 } } },
    damage: { base: { number: 1, denomination: 8 } },
  },
  effects: [{ _id: 'eff0000000000001', name: 'Shadow (old)', disabled: true, changes: [] }],
  flags: { 'chrab-sync': { featureDraftId: 'draft-1', localEdit: true }, dnd5e: { advancementOrigin: 'cls.adv' }, core: { sheetClass: 'x' }, 'old-module': { stale: true } },
}

test('a refresh takes the site’s version but keeps the copy’s play state and place', () => {
  const out = refreshedData(copy, site)
  // The site's version of what the item is…
  assert.deepEqual(out.system.damage, site.system.damage)
  assert.equal(out.system.uses.max, '3')
  assert.equal(out.effects[0].name, 'Shadow')
  assert.deepEqual(out.effects[0].changes, site.effects[0].changes)
  assert.equal(out.flags['midi-qol'].onUseMacroName, site.flags['midi-qol'].onUseMacroName)
  // …the copy's play state, place and records.
  assert.equal(out._id, 'copyOnActor00001')
  assert.equal(out.sort, 1200)
  assert.equal(out.folder, undefined)
  assert.deepEqual(out.ownership, copy.ownership)
  assert.deepEqual(out._stats, copy._stats)
  assert.equal(out.system.quantity, 2)
  assert.equal(out.system.equipped, true)
  assert.equal(out.system.attuned, true)
  assert.equal(out.system.container, 'bagOfHolding0001')
  assert.equal(out.system.uses.spent, 1)
  assert.equal(out.system.activities.atk0000000000001.uses.spent, 1)
  assert.equal(out.effects[0].disabled, true)
  assert.deepEqual(out.flags.dnd5e, copy.flags.dnd5e)
  assert.deepEqual(out.flags.core, copy.flags.core)
  // Flags only the copy had (a module's, not the site's) don't survive; the edit mark is cleared.
  assert.equal(out.flags['old-module'], undefined)
  assert.equal(out.flags['chrab-sync'].localEdit, undefined)
  assert.equal(out.flags['chrab-sync'].featureDraftId, 'draft-1')
  // Neither input changed.
  assert.equal(site.system.quantity, 1)
  assert.equal(copy.flags['chrab-sync'].localEdit, true)
})

test('an Items directory copy keeps its folder; play state the site item lacks isn’t invented', () => {
  const out = refreshedData({ ...copy, folder: 'myFolder00000001' }, site, { keepFolder: true })
  assert.equal(out.folder, 'myFolder00000001')
  const plain = { ...site, system: { ...site.system } }
  delete plain.system.uses
  const out2 = refreshedData(copy, plain)
  assert.equal(out2.system.uses, undefined)
})

test('a spell keeps its preparation', () => {
  const spell = { _id: 's', type: 'spell', system: { prepared: 0, method: 'spell', level: 1 }, effects: [], flags: {} }
  const mine = { _id: 'c', type: 'spell', system: { prepared: 1, method: 'pact', level: 1 }, effects: [], flags: {} }
  const out = refreshedData(mine, { ...spell, system: { ...spell.system, level: 2 } })
  assert.equal(out.system.prepared, 1)
  assert.equal(out.system.method, 'pact')
  assert.equal(out.system.level, 2)
})

test('advancement choices are kept, in the copy’s shape', () => {
  const next = [{ _id: 'a1', type: 'ItemChoice', value: {} }, { _id: 'a2', type: 'ItemGrant', value: {} }]
  const listed = keepChoices([{ _id: 'a1', value: { added: { 2: { x: 'uuid' } } } }], next)
  assert.deepEqual(listed[0].value, { added: { 2: { x: 'uuid' } } })
  assert.deepEqual(listed[1].value, {})
  const keyed = keepChoices({ a1: { _id: 'a1', value: { picked: true } } }, next)
  assert.deepEqual(Object.keys(keyed), ['a1', 'a2'])
  assert.deepEqual(keyed.a1.value, { picked: true })
})

test('play changes aren’t edits; anything else is', () => {
  assert.equal(isPlayChange(['_id', 'system.uses.spent']), true)
  assert.equal(isPlayChange(['system.quantity', 'system.equipped', 'system.attuned', 'system.container', 'sort']), true)
  assert.equal(isPlayChange(['system.activities.atk0000000000001.uses.spent']), true)
  assert.equal(isPlayChange(['system.prepared', 'system.method']), true)
  assert.equal(isPlayChange(['flags.dnd5e.advancementOrigin', 'flags.chrab-sync.-=localEdit', '_stats.modifiedTime']), true)
  assert.equal(isPlayChange(['system.advancement.abc.value.assignments.str']), true)
  assert.equal(isPlayChange(['system.damage.base.number']), false)
  assert.equal(isPlayChange(['name']), false)
  assert.equal(isPlayChange(['system.activities.atk0000000000001.damage.parts']), false)
  assert.equal(isPlayChange(['system.uses.max']), false)
  assert.equal(isPlayChange(['flags.midi-qol.onUseMacroName']), false)
  // Levelling a class rewrites its levels, hit dice and advancements: play for a class only.
  assert.equal(isPlayChange(['system.levels', 'system.hd.spent', 'system.advancement'], 'class'), true)
  assert.equal(isPlayChange(['system.advancement'], 'feat'), false)
  assert.equal(isPlayChange(['system.description.value'], 'class'), false)
  // Effects: switching on and off is play.
  assert.equal(isPlayEffectChange(['_id', 'disabled']), true)
  assert.equal(isPlayEffectChange(['changes']), false)
})

test('built items, edit marks and site links', () => {
  assert.equal(isBuilt(site), true)
  assert.equal(isBuilt({ flags: { 'chrab-sync': { packItem: 'p' } } }), true)
  assert.equal(isBuilt({ flags: {} }), false)
  assert.equal(isEditedLocally(copy), true)
  assert.equal(siteRoute({ flags: { 'chrab-sync': { packItem: 'p', featureDraftId: 'd', edit: '/dm/homebrew/classes/c/edit' } } }), '/dm/homebrew/classes/c/edit')
  assert.equal(siteRoute(site), '/dm/item-forge/draft-1/edit')
  assert.equal(siteRoute({ flags: { 'chrab-sync': { npcDraftId: 'n' } } }), '/dm/npc-forge/n/edit')
  assert.equal(siteRoute({ flags: {} }), null)
  assert.equal(siteLink('https://site.example/', '/dm/x'), 'https://site.example/#/dm/x')
  assert.equal(siteLink('https://site.example/#/', '/dm/x'), 'https://site.example/#/dm/x')
  assert.equal(siteLink('', '/dm/x'), null)
})
