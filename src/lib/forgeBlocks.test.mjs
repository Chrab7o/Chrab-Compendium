// Run with: npm test
//
// Building blocks (forgeBlocks.js): a feature as "how it's used" plus blocks.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AUTOMATION_TEMPLATES, buildFromTemplate, findTemplate } from './automationTemplates.js'
import { BLOCKS, BLOCK_GROUPS, blocksOf, buildFeatureFromBlocks, findBlock, rebuildFromSource, specFromSource } from './forgeBlocks.js'
import { buildFeatureItem, featureSpecFromRow } from './foundryFeatures.js'
import { canonicalSpec, followsTemplate, specFingerprint } from './forgeSource.js'

const saved = (spec) => featureSpecFromRow(JSON.parse(JSON.stringify(spec)))
const MINIMAL = {
  defenses: { resist: ['fire'] },
  passiveBonus: { ac: '1' },
  selfBuff: { ac: '1' },
  reaction: { ac: '2' },
  aura: { ac: '1' },
  turnReminder: { text: 'Hi' },
  summon: { crMax: '1' },
  transform: { crMax: '1' },
  saveOrSuffer: { condition: 'prone' },
  condition: { name: 'Marked' },
}

test('every type template is a block, in a known group, without the use settings', () => {
  const groups = new Set(BLOCK_GROUPS.map((g) => g.key))
  for (const t of AUTOMATION_TEMPLATES.filter((x) => x.kind === 'type')) assert.ok(findBlock(t.key), t.key)
  for (const block of BLOCKS) {
    assert.ok(groups.has(block.group), block.key)
    if (block.used) for (const key of ['activation', 'uses', 'pool', 'poolCost', 'poolExtra']) assert.ok(!block.params.some((p) => p.key === key), `${block.key}.${key}`)
  }
  assert.ok(findBlock('onHitDamage').params.some((p) => p.key === 'pool'), 'a rule’s own cost stays: it isn’t the feature’s use')
})

test('every block builds on its own into a valid item', () => {
  for (const block of BLOCKS) {
    const spec = buildFeatureFromBlocks({ blocks: [{ id: 'a', block: block.key, settings: MINIMAL[block.key] ?? {} }] })
    assert.equal(buildFeatureItem(spec).type, 'feat', block.key)
    assert.ok(followsTemplate(spec), block.key)
  }
})

test('the use goes to the first used block; later ones are second buttons', () => {
  const spec = buildFeatureFromBlocks({
    use: { activation: 'bonus', uses: 'prof-lr', pool: 'darkness', poolCost: 3 },
    blocks: [
      { id: 'a', block: 'attack', settings: {} },
      { id: 'h', block: 'heal', settings: {} },
    ],
  })
  const [attack, heal] = spec.item.activities
  assert.notEqual(attack.activation, 'special', 'the feature’s own button (its section says bonus action)')
  assert.equal(attack.spend[0].target, 'darkness')
  assert.equal(attack.spend[0].amount, '3')
  assert.equal(heal.activation, 'special')
  assert.equal(heal.spend.length, 0)
  assert.equal(spec.item.usesMax, '@prof')
  assert.equal(spec.item.section, 'bonus')
})

test('a spell slot and a formula for uses', () => {
  const spec = buildFeatureFromBlocks({ use: { slot: '3', uses: 'custom', usesMax: '@abilities.int.mod', usesRecovery: 'sr' }, blocks: [{ id: 'a', block: 'attack', settings: {} }] })
  assert.deepEqual(spec.item.activities[0].spend.map((s) => [s.source, s.target]), [['attribute', 'spells.spell3.value']])
  assert.equal(spec.item.usesMax, '@abilities.int.mod')
  assert.equal(spec.item.usesRecovery, 'sr')
})

test('roll names, and a condition tied to the roll it names', () => {
  const spec = buildFeatureFromBlocks({
    blocks: [
      { id: 'a', block: 'attack', settings: { rollName: 'Lance' } },
      { id: 'b', block: 'extraRoll', settings: { rollName: 'Bow down', target: 'creatures' } },
      { id: 'c', block: 'condition', settings: { statuses: ['prone'], from: 'b' } },
      { id: 'd', block: 'condition', settings: { name: 'Marked' } },
    ],
  })
  const [lance, bow] = spec.item.activities
  assert.equal(lance.name, 'Lance')
  assert.equal(bow.name, 'Bow down')
  assert.equal(bow.targetCount, '')
  const [prone, marked] = spec.item.effects
  assert.equal(prone.name, 'Prone')
  assert.deepEqual(prone.appliedBy, [bow.key])
  assert.deepEqual(marked.appliedBy, [lance.key], 'no “from”: the first roll')
})

test('with rolls from several blocks, each block’s target effects stay on its own roll', () => {
  const spec = buildFeatureFromBlocks({
    blocks: [
      { id: 's', block: 'saveOrSuffer', settings: { condition: 'charmed' } },
      { id: 'x', block: 'extraRoll', settings: {} },
    ],
  })
  const charm = spec.item.effects.find((e) => e.statuses.includes('charmed'))
  assert.deepEqual(charm.appliedBy, [spec.item.activities[0].key])
  const alone = buildFeatureFromBlocks({ blocks: [{ id: 's', block: 'saveOrSuffer', settings: { condition: 'charmed' } }] })
  assert.deepEqual(alone.item.effects[0].appliedBy, [], 'one roll block: as the template builds it')
})

test('behavior rules from several blocks join one behavior; a stance’s toggle wins', () => {
  const spec = buildFeatureFromBlocks({
    use: { activation: 'bonus' },
    blocks: [
      { id: 'h', block: 'onHitBenefit', settings: { formula: '1d6' } },
      { id: 's', block: 'stance', settings: {} },
      { id: 'd', block: 'drain', settings: {} },
    ],
  })
  assert.equal(spec.item.behavior.mode, 'toggle')
  assert.equal(spec.item.behavior.rules.length, 3)
  assert.equal(new Set(spec.item.behavior.rules.map((r) => r.key)).size, 3, 'every rule its own key')
})

test('the drain block heals from this feature’s damage, overflow as temp HP', () => {
  const spec = buildFeatureFromBlocks({ blocks: [{ id: 'a', block: 'attack', settings: {} }, { id: 'd', block: 'drain', settings: { label: 'Drain Life' } }] })
  const [temp, heal] = spec.item.behavior.rules
  assert.equal(temp.outcome, 'tempHpSelf')
  assert.equal(heal.outcome, 'healSelf')
  assert.equal(heal.label, 'Drain Life')
  assert.match(heal.when, /c\.activity\?\.item\?\.id === c\.item\.id/)
})

test('the custom block adds its own parts beside the others', () => {
  const part = buildFeatureFromBlocks({ blocks: [{ id: 'x', block: 'extraRoll', settings: { rollName: 'Hand-made' } }] }).item
  const spec = buildFeatureFromBlocks({ blocks: [{ id: 'a', block: 'attack', settings: {} }, { id: 'c', block: 'custom', settings: { part: { activities: part.activities, effects: [] } } }] })
  assert.deepEqual(spec.item.activities.map((a) => a.name), ['', 'Hand-made'])
})

test('a block that can’t build says which', () => {
  assert.throws(() => buildFeatureFromBlocks({ blocks: [{ id: 'a', block: 'summon', settings: {} }] }), /Summon a creature: Give the creature/)
  assert.throws(() => buildFeatureFromBlocks({ blocks: [] }), /at least one block/)
})

test('block features rebuild from their source, keeping keys and ids', () => {
  const stored = saved(buildFeatureFromBlocks({ use: { activation: 'action' }, blocks: [{ id: 'a', block: 'attack', settings: { range: 60 } }, { id: 'c', block: 'condition', settings: { name: 'Marked' } }] }))
  stored.item.name = 'Shadow Lance'
  assert.ok(followsTemplate(stored))
  assert.deepEqual(saved(rebuildFromSource(stored, 'd1')), stored)
  // A changed setting with the old fingerprint is what a fixed block looks like.
  stored.source.blocks[0].settings.range = 90
  const rebuilt = rebuildFromSource(stored, 'd1')
  assert.equal(rebuilt.item.activities[0].range, 90)
  assert.equal(rebuilt.item.activities[0].key, stored.item.activities[0].key)
  assert.deepEqual(rebuilt.item.effects[0].appliedBy, [stored.item.activities[0].key])
  assert.equal(rebuilt.item.name, 'Shadow Lance')
  assert.equal(rebuilt.source.fingerprint, specFingerprint(rebuilt))
})

test('a hand edit to a block feature stops it following', () => {
  const stored = saved(buildFeatureFromBlocks({ blocks: [{ id: 'a', block: 'attack', settings: {} }] }))
  stored.item.activities[0].range = '5'
  assert.ok(!followsTemplate(stored))
  assert.equal(rebuildFromSource(stored, 'x'), stored)
})

test('a template feature opens as one block, its use settings moved out (Phase 2c)', () => {
  const { spec } = buildFromTemplate(findTemplate('attack'), { activation: 'bonus', uses: '1-sr', pool: 'darkness', poolCost: '2', damage: '2d6', damageType: 'fire' })
  const def = blocksOf(spec.source)
  assert.equal(def.blocks.length, 1)
  assert.equal(def.blocks[0].block, 'attack')
  assert.equal(def.use.activation, 'bonus')
  assert.equal(def.use.uses, '1-sr')
  assert.equal(def.use.pool, 'darkness')
  assert.equal(def.blocks[0].settings.activation, undefined)
  assert.equal(def.blocks[0].settings.damage, '2d6')
  // Saved unchanged, it's the same feature.
  assert.deepEqual(canonicalSpec(buildFeatureFromBlocks(def)), canonicalSpec(spec))
  // Blocks open as they are; an example template, or none, doesn't open.
  const blocks = { use: { activation: 'action' }, blocks: [{ id: 'a', block: 'heal', settings: { formula: '1d8' } }] }
  assert.deepEqual(blocksOf(blocks).blocks, blocks.blocks)
  assert.equal(blocksOf({ template: 'deathStance', settings: {} }), null)
  assert.equal(blocksOf(null), null)
})

test('saving blocks over a stored spec keeps its words and Foundry ids (Phase 2c)', () => {
  const def = { use: { activation: 'action' }, blocks: [{ id: 'a', block: 'attack', settings: { damage: '1d8' } }] }
  const stored = saved({ ...buildFeatureFromBlocks(def), requirements: 'Dark Knight 3' })
  stored.item = { ...stored.item, name: 'Lance', description: 'Pierce.' }
  const changed = { ...def, blocks: [{ ...def.blocks[0], settings: { damage: '2d8' } }, { id: 'b', block: 'condition', settings: { name: 'Pierced', from: 'a' } }] }
  const { spec, error } = specFromSource(changed, stored, 'draft-1')
  assert.equal(error, undefined)
  assert.equal(spec.item.name, 'Lance')
  assert.equal(spec.item.description, 'Pierce.')
  assert.equal(spec.requirements, 'Dark Knight 3')
  assert.equal(spec.item.activities[0].key, stored.item.activities[0].key)
  assert.equal(spec.item.activities[0].damage[0].formula, '2d8')
  assert.deepEqual(spec.item.effects[0].appliedBy, [stored.item.activities[0].key])
  assert.ok(followsTemplate(spec))
  // Again from the same draft: the same new ids.
  assert.deepEqual(specFromSource(changed, stored, 'draft-1').spec, spec)
  // Nothing stored: a fresh build.
  assert.equal(specFromSource(def).spec.source.blocks[0].block, 'attack')
  assert.match(specFromSource({ use: {}, blocks: [] }).error, /at least one block/)
})
