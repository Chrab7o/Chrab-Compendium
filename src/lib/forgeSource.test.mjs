// Run with: npm test
//
// Specs that remember their template (lib/forgeSource.js, and
// buildFromTemplate in automationTemplates.js, rebuildFromSource in forgeBlocks.js).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AUTOMATION_TEMPLATES, buildFromTemplate, findTemplate } from './automationTemplates.js'
import { rebuildFromSource } from './forgeBlocks.js'
import { buildFeatureItem, classFeatureSpec, featureSpecFromRow } from './foundryFeatures.js'
import { draftItems } from './foundryClassPack.js'
import { canonicalSpec, followsTemplate, seededId, specFingerprint } from './forgeSource.js'

const lance = () => buildFromTemplate(findTemplate('attack'), { ability: 'con', range: 60, longRange: 120, damage: '1d8 + @abilities.con.mod', damageType: 'necrotic' }).spec
// What a save does to a spec: through JSON (jsonb), and the editor's load.
const saved = (spec) => featureSpecFromRow(JSON.parse(JSON.stringify(spec)))
const ids = (item) => Object.keys(item.system.activities).sort()

test('a template build remembers its template and settings', () => {
  const spec = lance()
  assert.equal(spec.source.template, 'attack')
  assert.equal(spec.source.settings.range, 60)
  assert.equal(spec.source.settings.damageType, 'necrotic')
  assert.equal(spec.source.fingerprint, specFingerprint(spec))
  assert.ok(followsTemplate(spec))
})

test('saving, renaming and putting it on a class row still follows the template', () => {
  const spec = saved(lance())
  assert.ok(followsTemplate(spec))
  const onRow = classFeatureSpec(spec, { className: 'The Dark Knight', subclassName: '', level: 2, name: 'Shadow Lance', description: 'A lance of shadow.' })
  assert.ok(followsTemplate(onRow), 'name, text, requirements and feature type are the row’s')
  assert.ok(followsTemplate({ ...onRow, sandboxPush: { fingerprint: 'x', from: 'mechanics/dark-knight.mjs' } }))
})

test('a hand edit stops it following, and then it is used as saved', () => {
  const spec = saved(lance())
  spec.item.activities[0].range = '90'
  assert.ok(!followsTemplate(spec))
  assert.equal(rebuildFromSource(spec, 'draft-1'), spec)
})

test('the fingerprint ignores random keys', () => {
  const a = lance()
  const b = lance()
  assert.notEqual(a.item.activities[0].key, b.item.activities[0].key)
  assert.deepEqual(canonicalSpec(a), canonicalSpec(b))
  assert.equal(a.source.fingerprint, b.source.fingerprint)
})

test('rebuilding with the same template code gives back the same spec, keys and all', () => {
  const stored = saved(classFeatureSpec(lance(), { className: 'The Dark Knight', level: 2, name: 'Shadow Lance', description: 'Text.' }))
  const rebuilt = rebuildFromSource(stored, 'draft-1')
  assert.deepEqual(saved(rebuilt), stored)
  assert.deepEqual(ids(buildFeatureItem(rebuilt)), ids(buildFeatureItem(stored)))
})

test('a template change reaches a following spec, keeping its words and Foundry ids', () => {
  const stored = saved(lance())
  stored.item.name = 'Shadow Lance'
  stored.item.description = 'Text.'
  stored.requirements = 'The Dark Knight 2'
  // Stand-in for a template fix: the same settings now build a longer range.
  // A changed setting with the old fingerprint is what a changed build looks like.
  stored.source.settings.range = 90
  const rebuilt = rebuildFromSource(stored, 'draft-1')
  assert.equal(rebuilt.item.activities[0].range, 90)
  assert.equal(rebuilt.item.activities[0].key, stored.item.activities[0].key)
  assert.equal(rebuilt.item.name, 'Shadow Lance')
  assert.equal(rebuilt.item.description, 'Text.')
  assert.equal(rebuilt.requirements, 'The Dark Knight 2')
  assert.ok(followsTemplate(rebuilt))
  assert.deepEqual(ids(buildFeatureItem(rebuilt)), ids(buildFeatureItem(stored)))
})

test('parts a template now adds get the same ids on every publish', () => {
  const stored = saved(buildFromTemplate(findTemplate('selfBuff'), { ac: '1' }).spec)
  // A rebuild that makes more parts than were stored: pretend the stored spec
  // had none of its keys by giving the build an extra effect.
  const extra = saved(buildFromTemplate(findTemplate('selfBuff'), { ac: '1', fly: 30 }).spec)
  extra.source = { ...extra.source, settings: { ...extra.source.settings, fly: 30 } }
  const one = rebuildFromSource({ ...stored, source: { ...stored.source, settings: extra.source.settings } }, 'draft-9')
  const two = rebuildFromSource({ ...stored, source: { ...stored.source, settings: extra.source.settings } }, 'draft-9')
  assert.deepEqual(one, two)
})

test('a template that is gone, or now refuses the settings, leaves the spec as saved', () => {
  const gone = saved(lance())
  gone.source = { ...gone.source, template: 'no-such-template' }
  gone.source.fingerprint = specFingerprint(gone)
  assert.equal(rebuildFromSource(gone, 'x'), gone)
  const refused = saved(buildFromTemplate(findTemplate('summon'), { crMax: '1' }).spec)
  refused.source.settings = { ...refused.source.settings, crMax: '', uuid: '' }
  assert.equal(rebuildFromSource(refused, 'x'), refused)
})

test('specs with no source, and older drafts, are left alone', () => {
  const plain = saved({ kind: 'feat', item: { name: 'Text only' } })
  assert.ok(!followsTemplate(plain))
  assert.equal(rebuildFromSource(plain, 'x'), plain)
})

test('every type template follows itself after a save and rebuilds unchanged', () => {
  const minimal = { defenses: { resist: ['fire'] }, passiveBonus: { ac: '1' }, selfBuff: { ac: '1' }, reaction: { ac: '2' }, aura: { ac: '1' }, turnReminder: { text: 'Hi' }, summon: { crMax: '1' }, transform: { crMax: '1' }, saveOrSuffer: { condition: 'prone' } }
  for (const t of AUTOMATION_TEMPLATES) {
    const { spec, error } = buildFromTemplate(t, minimal[t.key] ?? {})
    assert.equal(error, undefined, `${t.key}: ${error}`)
    const stored = saved(spec)
    assert.ok(followsTemplate(stored), t.key)
    assert.deepEqual(saved(rebuildFromSource(stored, 'd')), stored, t.key)
  }
})

test('the class pack builds a following draft from its settings', () => {
  const stored = saved(lance())
  stored.source.settings.longRange = 150
  const item = draftItems([{ id: 'draft-1', kind: 'feat', spec: stored }]).get('draft-1')
  assert.equal(Object.values(item.system.activities)[0].range.value, '150')
})

test('seeded ids are Foundry ids, the same for the same seed', () => {
  assert.match(seededId('a:1'), /^[A-Za-z0-9]{16}$/)
  assert.equal(seededId('a:1'), seededId('a:1'))
  assert.notEqual(seededId('a:1'), seededId('a:2'))
})
