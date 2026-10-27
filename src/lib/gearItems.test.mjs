// Run with: npm test
//
// Item Forge gear (foundryFeatures.js, kind 'gear'): the Foundry items it
// builds, reading them back, the written description (itemDescription.js),
// and importing the old Item Maker's records.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptyActivity, emptyEffect, emptyChange } from './foundryActorBuilder.js'
import { buildFeatureItem, emptyFeatureSpec, emptyGear, featureItemToSpec, featureSpecFromRow, itemMakerRecordToSpec } from './foundryFeatures.js'
import { descriptionHtml, descriptionMarkdown, emptyAbilityBlock } from './itemDescription.js'

function gearSpec(key, patch = {}, item = {}) {
  const spec = emptyFeatureSpec('gear')
  spec.gear = { ...emptyGear(key), ...patch }
  spec.item = { ...spec.item, name: 'Test', ...item }
  return spec
}

test('a weapon builds as a dnd5e weapon with its rarity, bonus, properties and base damage', () => {
  const attack = { ...emptyActivity('attack'), damage: [{ formula: '1d8 + @mod', types: ['slashing'] }] }
  const built = buildFeatureItem(gearSpec('weapon', { subtype: 'martialM', baseItem: 'longsword', rarity: 'rare', attunement: true, magicalBonus: '+2', properties: ['ver'] }, { name: 'Dusk Blade', activities: [attack] }))
  assert.equal(built.type, 'weapon')
  assert.deepEqual(built.system.type, { value: 'martialM', baseItem: 'longsword' })
  assert.equal(built.system.rarity, 'rare')
  assert.equal(built.system.attunement, 'required')
  assert.equal(built.system.magicalBonus, 2)
  assert.ok(built.system.properties.includes('ver') && built.system.properties.includes('mgc'))
  assert.equal(built.system.damage.base.number, 1)
  assert.equal(built.system.damage.base.denomination, 8)
  assert.deepEqual(built.system.damage.base.types, ['slashing'])
  assert.equal(Object.values(built.system.activities)[0].type, 'attack')
})

test('armor, wondrous items and consumables build as their dnd5e types', () => {
  const armor = buildFeatureItem(gearSpec('armor', { subtype: 'medium', armorValue: '15', dexCap: '2', magicalBonus: '1', stealthDisadvantage: true }))
  assert.equal(armor.type, 'equipment')
  assert.deepEqual(armor.system.armor, { value: 15, dex: 2, magicalBonus: 1 })
  assert.ok(armor.system.properties.includes('stealthDisadvantage'))
  assert.equal(buildFeatureItem(gearSpec('armor', { subtype: 'heavy', armorValue: '18' })).system.armor.dex, 0)

  const cloak = buildFeatureItem(gearSpec('wondrous', {}, { effects: [{ ...emptyEffect(), passive: true, changes: [emptyChange('ac')] }] }))
  assert.equal(cloak.type, 'equipment')
  assert.equal(cloak.system.type.value, 'trinket')
  assert.equal(cloak.effects.length, 1)

  const potion = buildFeatureItem(gearSpec('consumable', { subtype: 'potion' }, { activities: [{ ...emptyActivity('heal'), healing: '2d4 + 2' }] }))
  assert.equal(potion.type, 'consumable')
  assert.equal(potion.system.uses.max, '1', 'used once by default')
  assert.equal(potion.system.uses.autoDestroy, true)
})

test('charges that come back at dawn with a formula, or never', () => {
  const wand = buildFeatureItem(gearSpec('wondrous', { subtype: 'wand' }, { usesMax: '7', usesRecovery: 'dawn', usesRecoverFormula: '1d6 + 1' }))
  assert.deepEqual(wand.system.uses.recovery, [{ period: 'dawn', type: 'formula', formula: '1d6 + 1' }])
  const spent = buildFeatureItem(gearSpec('wondrous', {}, { usesMax: '3', usesRecovery: 'none' }))
  assert.deepEqual(spent.system.uses.recovery, [])
  assert.equal(spent.system.uses.max, '3')
})

test('the description comes from the blocks, as the Item Maker rendered it', () => {
  const blocks = [{ ...emptyAbilityBlock(), name: 'Drink Deep', subtitle: '1/day', description: 'Regain **2d6** hit points.\n\n- one\n- two' }, { type: 'text', content: '*Cold to the touch.*' }]
  const built = buildFeatureItem(gearSpec('wondrous', { blocks }))
  const html = built.system.description.value
  assert.match(html, /<li><strong>Drink Deep<\/strong> — <strong>1\/day<\/strong><\/li>/)
  assert.match(html, /<p>Regain <strong>2d6<\/strong> hit points\.<\/p>/)
  assert.match(html, /<ul><li>one<\/li><li>two<\/li><\/ul>/)
  assert.match(html, /<em>Cold to the touch\.<\/em>/)
  assert.equal(descriptionHtml([{ type: 'text', content: '<script>' }]), '<p>&lt;script&gt;</p>', 'markup is escaped')
  assert.equal(descriptionMarkdown(blocks), '**Drink Deep — 1/day.** Regain **2d6** hit points.\n\n- one\n- two\n\n*Cold to the touch.*')
})

test('a built weapon reads back into the same gear spec', () => {
  const attack = { ...emptyActivity('attack'), damage: [{ formula: '1d8 + @mod', types: ['slashing'] }] }
  const built = buildFeatureItem(gearSpec('weapon', { subtype: 'martialM', rarity: 'veryRare', attunement: true, magicalBonus: '3', properties: ['fin'] }, { name: 'Needle', activities: [attack] }))
  const spec = featureItemToSpec(built)
  assert.equal(spec.kind, 'gear')
  assert.equal(spec.gear.type, 'weapon')
  assert.equal(spec.gear.rarity, 'veryRare')
  assert.equal(spec.gear.attunement, true)
  assert.equal(spec.gear.magicalBonus, '3')
  assert.deepEqual(spec.gear.properties, ['fin'])
  assert.equal(spec.item.name, 'Needle')
  assert.equal(spec.item.activities[0].kind, 'attack')
})

test('the attack’s first damage line is the weapon’s base damage, not rolled twice', () => {
  const attack = { ...emptyActivity('attack'), damage: [{ formula: '1d8 + @mod + 1', types: ['slashing'] }, { formula: '1d6', types: ['fire'] }] }
  const built = buildFeatureItem(gearSpec('weapon', { properties: ['ver'], versatile: '1d10', mastery: 'sap' }, { activities: [attack] }))
  assert.deepEqual([built.system.damage.base.number, built.system.damage.base.denomination, built.system.damage.base.bonus], [1, 8, '1'])
  assert.deepEqual([built.system.damage.versatile.number, built.system.damage.versatile.denomination], [1, 10])
  assert.deepEqual(built.system.damage.versatile.types, ['slashing'])
  assert.equal(built.system.mastery, 'sap')
  const act = Object.values(built.system.activities)[0]
  assert.equal(act.damage.includeBase, true)
  assert.deepEqual(act.damage.parts.map((p) => [p.number, p.denomination, p.types]), [[1, 6, ['fire']]], 'only the extra damage stays on the attack')
})

// Rezire's Ravanous Necrolight, trimmed: a longsword (1d8 slashing, 1d10
// two-handed, Sap) whose attack adds 1d8 cold and 1d8 necrotic.
function necrolight() {
  const part = (denomination, types) => ({ number: 1, denomination, bonus: '', types, custom: { enabled: false, formula: '' }, scaling: { number: 1 } })
  return {
    name: 'Ravanous Necrolight',
    type: 'weapon',
    img: 'Alva/Alva%20Tokens/enchantedsword.webp',
    system: {
      description: { value: '<p>Ravenous.</p>' },
      type: { value: 'martialM', baseItem: 'longsword' },
      rarity: 'legendary',
      attunement: 'required',
      properties: ['mgc', 'ver'],
      mastery: 'sap',
      damage: { base: { ...part(8, ['slashing']), scaling: { mode: '', number: 1 } }, versatile: part(10, ['slashing']) },
      activities: {
        gI0X7slZ1taq0NFX: { _id: 'gI0X7slZ1taq0NFX', type: 'attack', activation: { type: 'action' }, attack: { type: { value: 'melee', classification: 'weapon' } }, damage: { includeBase: true, parts: [part(8, ['cold']), part(8, ['necrotic'])] } },
      },
    },
    effects: [],
  }
}

test('a Foundry weapon export keeps its base, two-handed and extra damage and its mastery', () => {
  const spec = featureItemToSpec(necrolight())
  assert.deepEqual(spec.item.activities[0].damage.map((d) => [d.formula, d.types]), [
    ['1d8 + @mod', ['slashing']],
    ['1d8', ['cold']],
    ['1d8', ['necrotic']],
  ])
  assert.equal(spec.gear.versatile, '1d10')
  assert.equal(spec.gear.mastery, 'sap')
  const built = buildFeatureItem(spec)
  assert.deepEqual(built.system.damage.base.types, ['slashing'])
  assert.equal(built.system.damage.versatile.denomination, 10)
  assert.equal(built.system.mastery, 'sap')
  assert.deepEqual(Object.values(built.system.activities)[0].damage.parts.map((p) => p.types[0]), ['cold', 'necrotic'])
})

test('an Item Maker record becomes a wondrous item with its blocks and where it came from', () => {
  const record = { id: 'item_1699999999999', name: 'Lantern of Echoes', item: { name: 'Lantern of Echoes', blocks: [{ type: 'text', content: 'It hums.' }] } }
  const spec = itemMakerRecordToSpec(record)
  assert.equal(spec.kind, 'gear')
  assert.equal(spec.item.name, 'Lantern of Echoes')
  assert.equal(spec.gear.type, 'wondrous')
  assert.equal(spec.gear.rarity, '')
  assert.deepEqual(spec.gear.source, { itemMaker: 'item_1699999999999' })
  assert.match(buildFeatureItem(spec).system.description.value, /It hums\./)
})

test('feature drafts saved before gear existed still load', () => {
  const old = featureSpecFromRow({ kind: 'feat', item: { name: 'Old' } })
  assert.equal(old.gear.type, 'wondrous')
  assert.equal(buildFeatureItem(old).type, 'feat')
})

test('a food consumable that gives the eater a damage threshold', () => {
  const eat = { ...emptyActivity('utility'), targetType: 'self' }
  const threshold = { ...emptyChange('damageThreshold'), value: '15' }
  const built = buildFeatureItem(gearSpec('consumable', { subtype: 'food' }, { name: 'Spike Metal Worm Meat', activities: [eat], effects: [{ ...emptyEffect(), name: 'Metal Hide', changes: [threshold] }] }))
  assert.equal(built.type, 'consumable')
  assert.equal(built.system.type.value, 'food')
  assert.equal(built.effects.length, 1)
  assert.equal(built.effects[0].transfer, false, 'applied when eaten, not while carried')
  assert.deepEqual(built.effects[0].system.changes, [{ key: 'system.attributes.hp.dt', value: '15', type: 'upgrade', phase: 'initial' }])
  const activity = Object.values(built.system.activities)[0]
  assert.equal(activity.target.affects.type, 'self')
  assert.deepEqual(activity.effects.map((e) => e._id), [built.effects[0]._id])
})
