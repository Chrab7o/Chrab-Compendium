// Run with: npm test
//
// Automation templates (automationTemplates.js), starting with Defenses -
// the Dark Knight's Tainted Soul (advantage on saves against being
// frightened), generalized to every condition and damage type.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptyActivity, emptySpend, saveAgainstCondition } from './foundryActorBuilder.js'
import { buildFeatureItem, emptyFeatureSpec, featureItemToSpec, mechanicsSummary } from './foundryFeatures.js'
import { AUTOMATION_TEMPLATES, buildFromTemplate, findTemplate, templateDefaults } from './automationTemplates.js'

const defenses = findTemplate('defenses')

function build(values) {
  const { spec, error } = buildFromTemplate(defenses, { ...templateDefaults(defenses), ...values })
  assert.equal(error, undefined)
  spec.item.name = 'Tainted Soul'
  return { spec, item: buildFeatureItem(spec) }
}

test('Tainted Soul: one always-on effect with advantage on saves against frightened', () => {
  const { item } = build({ saveAdvantage: ['frightened'] })
  assert.deepEqual(item.system.activities, {}, 'nothing to click: it is passive')
  assert.equal(item.effects.length, 1)
  const [effect] = item.effects
  assert.equal(effect.transfer, true)
  assert.equal(effect.name, 'Tainted Soul')
  assert.equal(effect.system.changes.length, 1)
  const [change] = effect.system.changes
  assert.equal(change.key, 'flags.midi-qol.advantage.ability.save.all')
  assert.equal(change.type, 'custom')
  assert.equal(change.value, saveAgainstCondition('frightened'))
})

// The condition midi evaluates, with the workflow that asked for the save.
const evaluate = (expr, workflow) => Function('workflow', `return (${expr})`)(workflow)
const fx = (statuses, name = 'Effect') => ({ statuses: new Set(statuses), name })
// Foundry Collections iterate their values, like a Map's values.
const collection = (...docs) => new Map(docs.map((d, i) => [i, d])).values()

test('the save condition: true only for saves against something that frightens', () => {
  const expr = saveAgainstCondition('frightened')
  // Wyrmling's Frightful Presence: a save activity whose effect has the status.
  assert.equal(evaluate(expr, { saveActivity: { effects: [{ _id: 'a', effect: fx(['frightened']) }] } }), true)
  // An over-time repeat save: rolled from the item, effect only named for it.
  assert.equal(evaluate(expr, { activity: { effects: [] }, item: { effects: [...collection(fx([], 'Frightened'))] } }), true)
  // Anything else: a poison save, a save with no effects, no workflow at all.
  assert.equal(evaluate(expr, { saveActivity: { effects: [{ effect: fx(['poisoned'], 'Poisoned') }] }, item: { effects: [] } }), false)
  assert.equal(evaluate(expr, { activity: {}, item: {} }), false)
  assert.equal(evaluate(expr, undefined), false)
})

test('every choice becomes its own change, and the whole lot reads back', () => {
  const { item } = build({ saveAdvantage: ['frightened', 'charmed'], conditionImmune: ['poisoned'], resist: ['necrotic'], immune: ['poison'], vulnerable: ['radiant'] })
  assert.deepEqual(
    item.effects[0].system.changes.map((c) => [c.key, c.key.startsWith('flags.midi-qol') ? 'expr' : c.value]),
    [
      ['flags.midi-qol.advantage.ability.save.all', 'expr'],
      ['flags.midi-qol.advantage.ability.save.all', 'expr'],
      ['system.traits.ci.value', 'poisoned'],
      ['system.traits.dr.value', 'necrotic'],
      ['system.traits.di.value', 'poison'],
      ['system.traits.dv.value', 'radiant'],
    ],
  )
  const back = featureItemToSpec(item).item.effects[0].changes.map((c) => [c.id, c.value])
  assert.deepEqual(back, [
    ['advSaveVs', 'frightened'],
    ['advSaveVs', 'charmed'],
    ['condImmune', 'poisoned'],
    ['resist', 'necrotic'],
    ['immune', 'poison'],
    ['vulnerable', 'radiant'],
  ])
})

test('plain "advantage on all saves" still reads back as itself', () => {
  const item = { type: 'feat', name: 'Lucky', system: { activities: {} }, effects: [{ _id: 'e1', name: 'Lucky', transfer: true, system: { changes: [{ key: 'flags.midi-qol.advantage.ability.save.all', value: '1', type: 'custom' }] } }], flags: {} }
  assert.deepEqual(featureItemToSpec(item).item.effects[0].changes.map((c) => [c.id, c.param]), [['advSave', 'all']])
})

test('a template with nothing chosen says so instead of building', () => {
  assert.deepEqual(buildFromTemplate(defenses, templateDefaults(defenses)), { error: 'Pick at least one condition or damage type.' })
})

// ---------------------------------------------------------------------------
// Resource pools (the Dark Knight's Darkness) and the features that spend them.

test('Darkness: a pool feature with a fixed identifier, sized by the class table', () => {
  const pool = findTemplate('resourcePool')
  const { spec } = buildFromTemplate(pool, templateDefaults(pool))
  spec.item.name = 'Dark Arts'
  const item = buildFeatureItem(spec)
  assert.equal(item.system.identifier, 'darkness', 'not "dark-arts": spenders name the pool, not the feature')
  assert.deepEqual(item.system.uses, { max: '@scale.the-dark-knight.darkness-points', spent: 0, recovery: [{ period: 'lr', type: 'recoverAll' }] })
  assert.deepEqual(item.system.activities, {})
  assert.equal(featureItemToSpec(item).item.identifier, 'darkness', 'reads back')
  assert.match(mechanicsSummary(spec), /pool “darkness”/)
  assert.deepEqual(buildFromTemplate(pool, { ...templateDefaults(pool), identifier: ' ' }), { error: 'Give the pool an identifier, e.g. darkness.' })
})

function spender(activity) {
  const spec = emptyFeatureSpec('feat')
  spec.item = { ...spec.item, name: 'Restore Vitality', activities: [{ ...emptyActivity('heal'), ...activity }] }
  return buildFeatureItem(spec)
}

test('Restore Vitality: spends 3 Darkness by identifier, more for +1d8 each', () => {
  const item = spender({ healing: '2d8 + @abilities.con.mod', spend: [{ ...emptySpend(), source: 'pool', target: 'Darkness', amount: '3', extra: true }] })
  const [act] = Object.values(item.system.activities)
  assert.deepEqual(act.consumption.targets, [
    { type: 'itemUses', target: 'darkness', value: 'max(1, 3 - @flags.chrab-sync.discount.darkness - @flags.chrab-sync.discount.restore-vitality)', scaling: { mode: 'amount', formula: '1' } },
  ])
  assert.equal(act.consumption.scaling.allowed, true)
  assert.deepEqual(act.healing.scaling, { mode: 'whole', number: 1 }, 'each extra point: +1d8')
  const back = featureItemToSpec(item).item.activities[0].spend
  assert.deepEqual(back.map((s) => [s.source, s.target, s.amount, s.extra]), [['pool', 'darkness', '3', true]])
})

test('a fixed cost stays fixed, and a custom damage formula grows by its first die', () => {
  const fixed = Object.values(spender({ healing: '2d8', spend: [{ ...emptySpend(), source: 'pool', target: 'darkness', amount: '2' }] }).system.activities)[0]
  assert.equal(fixed.consumption.scaling.allowed, false)
  assert.deepEqual(fixed.consumption.targets[0].scaling, {})
  assert.notEqual(fixed.healing.scaling.mode, 'whole')

  const spec = emptyFeatureSpec('feat')
  spec.item = {
    ...spec.item,
    name: 'Grasp of Shadows',
    activities: [{ ...emptyActivity('save'), damage: [{ formula: '3d10 + 1d4', types: ['necrotic'] }], spend: [{ ...emptySpend(), source: 'pool', target: 'darkness', amount: '5', extra: true }] }],
  }
  const [grasp] = Object.values(buildFeatureItem(spec).system.activities)
  assert.deepEqual(grasp.damage.parts[0].scaling, { mode: 'whole', number: 1, formula: '1d10' })
})

test('an NPC’s spend of another of its own items still reads back as that item', () => {
  const item = { type: 'feat', name: 'Flurry', system: { activities: { a: { _id: 'aaaaaaaaaaaaaaaa', type: 'utility', consumption: { targets: [{ type: 'itemUses', target: 'Ab3dEf6hIj9kLm2n', value: '1' }] } } } }, effects: [], flags: {} }
  assert.deepEqual(featureItemToSpec(item).item.activities[0].spend.map((s) => [s.source, s.target]), [['item', 'Ab3dEf6hIj9kLm2n']])
})

// ---------------------------------------------------------------------------
// The rest of the types, each as the Dark Knight feature it was made for.

const fromTemplate = (key, values = {}) => {
  const { spec, error } = buildFromTemplate(findTemplate(key), values)
  assert.equal(error, undefined, `${key}: ${error}`)
  spec.item.name = spec.item.name || key
  return { spec, item: buildFeatureItem(spec) }
}
const acts = (item) => Object.values(item.system.activities)
const DARK = { pool: 'darkness' }

test('every type template builds a valid item from its defaults or a minimal setting', () => {
  const minimal = { defenses: { resist: ['fire'] }, passiveBonus: { ac: '1' }, selfBuff: { ac: '1' }, mark: {}, utility: {}, stance: {}, saveOrSuffer: { condition: 'prone' }, reaction: { ac: '2' }, aura: { ac: '1' }, turnReminder: { text: 'Hi' }, summon: { crMax: '1' }, transform: { crMax: '1' } }
  for (const t of AUTOMATION_TEMPLATES.filter((x) => x.kind === 'type')) {
    const { item } = fromTemplate(t.key, minimal[t.key] ?? {})
    assert.equal(item.type, 'feat', t.key)
  }
})

test('shared costs: action type, limited uses, and spending from a pool', () => {
  const { item } = fromTemplate('heal', { ...DARK, activation: 'reaction', uses: 'prof-lr', poolCost: 3, poolExtra: true, formula: '2d10 + @abilities.con.mod' })
  const [heal] = acts(item)
  assert.equal(heal.activation.type, 'reaction')
  assert.deepEqual(item.system.uses, { max: '@prof', spent: 0, recovery: [{ period: 'lr', type: 'recoverAll' }] })
  assert.deepEqual(heal.consumption.targets.map((c) => [c.type, c.target, c.value]), [
    ['itemUses', '', '1'],
    ['itemUses', 'darkness', 'max(1, 3 - @flags.chrab-sync.discount.darkness - @flags.chrab-sync.discount.heal)'],
  ])
  assert.equal(heal.healing.scaling.mode, 'whole')
  const special = acts(fromTemplate('bonusDamage', { damage: '2d10' }).item)[0]
  assert.equal(special.activation.type, 'special', 'extra damage after a hit takes no action by default')
  const temp = acts(fromTemplate('heal', { gives: 'temphp', formula: '1d10' }).item)[0]
  assert.deepEqual(temp.healing.types, ['temphp'])
})

test('Shadow Lance: a CON spell attack with its own range', () => {
  const [lance] = acts(fromTemplate('attack', { range: 60, longRange: 120 }).item)
  assert.equal(lance.attack.ability, 'con')
  assert.deepEqual(lance.attack.type, { value: 'ranged', classification: 'spell' })
  assert.equal(lance.range.value, '120')
  const [claw] = acts(fromTemplate('attack', { attackType: 'melee', classification: 'weapon', ability: 'str', range: 10, damage: '1d6 + @abilities.str.mod' }).item)
  assert.equal(claw.range.value, '10', 'melee: the reach')
})

test('Despairing Cry: save in an area, frightened, and a repeat save of its own', () => {
  const DC = '10 + @prof + @abilities.con.mod'
  const { item } = fromTemplate('saveOrSuffer', { ...DARK, saveAbility: 'wis', dc: DC, target: 'enemies', area: 'radius', areaSize: 30, condition: 'frightened', repeatSave: true })
  const [cry, repeat] = acts(item)
  assert.notEqual(cry._id, repeat._id, 'two rolls, not one overwritten')
  assert.equal(cry.save.dc.formula, DC)
  assert.equal(cry.target.affects.type, 'enemy')
  assert.deepEqual([cry.target.template.type, cry.target.template.size], ['radius', '30'])
  assert.equal(repeat.isOverTimeFlag, true)
  const [effect] = item.effects
  assert.deepEqual(effect.statuses, ['frightened'])
  assert.deepEqual(cry.effects.map((e) => e._id), [effect._id], 'the save applies the condition')
  assert.equal(effect.system.changes[0].key, 'flags.midi-qol.ActivityOverTime')
  assert.deepEqual(buildFromTemplate(findTemplate('saveOrSuffer'), {}), { error: 'Give it damage, a condition, or both.' })
})

test('Shadow Veil and Wings of Darkness: short self buffs', () => {
  const veil = fromTemplate('selfBuff', { activation: 'reaction', lasts: 'turnStart', ac: '5' }).item
  assert.deepEqual(veil.effects[0].flags.dae.specialDuration, ['turnStart'])
  assert.deepEqual(veil.effects[0].system.changes.map((c) => [c.key, c.value]), [['system.attributes.ac.bonus', '5']])
  const wings = fromTemplate('selfBuff', { lasts: '', fly: 50 }).item
  assert.deepEqual(wings.effects[0].system.changes.map((c) => [c.key, c.value, c.type]), [['system.attributes.movement.fly', '50', 'upgrade']])
})

test('passive bonus: skill advantage, save advantage, senses', () => {
  const { item } = fromTemplate('passiveBonus', { skillAdvantage: ['itm'], saveAdvantage: ['wis'], darkvision: 60 })
  assert.deepEqual(item.effects[0].system.changes.map((c) => c.key), [
    'system.attributes.senses.ranges.darkvision',
    'flags.midi-qol.advantage.ability.save.wis',
    'flags.midi-qol.advantage.skill.itm',
  ])
  assert.equal(item.effects[0].transfer, true)
})

test('mark: a named effect on the target, with an optional save penalty', () => {
  const { item, spec } = fromTemplate('mark', { effectName: 'Cursed by Darkness', savePenalty: '-2', penaltyAbility: 'wis' })
  const effect = item.effects.find((e) => e.name === 'Cursed by Darkness')
  assert.deepEqual(effect.system.changes.map((c) => [c.key, c.value]), [['system.abilities.wis.bonuses.save', '-2']])
  // Placed by the feature's own "I use this feature" rule, not by the roll.
  assert.equal(effect.flags['chrab-sync'].byRule, true)
  const [use] = acts(item).filter((a) => a.name !== 'Automation')
  assert.equal(use.target.affects.count, '1')
  assert.deepEqual(use.effects, [])
  const [rule] = spec.item.behavior.rules
  assert.deepEqual([rule.event, rule.ask, rule.actions[0].to, rule.actions[0].unique], ['used', false, 'target', true])
})

test('Mark of Darkness: offered on a hit for a use; Curse: the player picks the ability', () => {
  const { spec } = fromTemplate('mark', { activation: 'special', uses: 'prof-lr', effectName: 'Marked by Darkness', onHit: true, onDrop: 'use', flavor: 'Shadows coil.' })
  const onHit = spec.item.behavior.rules.find((r) => r.event === 'hit')
  assert.deepEqual([onHit.outcome, onHit.ask, onHit.costOwnUses, onHit.flavor], ['nothing', true, true, 'Shadows coil.'])
  assert.equal(onHit.actions[0].unique, true)
  assert.match(buildFromTemplate(findTemplate('mark'), { onHit: true }).error, /limited uses or a resource/)

  const curse = fromTemplate('mark', { ...DARK, poolCost: 2, effectName: 'Cursed by Darkness', savePenalty: '-2', penaltyAbility: 'pick' })
  const cursed = curse.item.effects.find((e) => e.name === 'Cursed by Darkness')
  assert.deepEqual(cursed.system.changes.map((c) => [c.key, c.value]), [['system.abilities.{ability}.bonuses.save', '-2']])
  assert.equal(curse.spec.item.behavior.rules[0].actions[0].pickAbility, true)
})

test('Mark of Devastation: advantage and disadvantage only between it and you', () => {
  const { item } = fromTemplate('mark', { effectName: 'Devastated', grantsAdvantage: true, disAttacks: true, disSaves: true, onlyYou: true })
  const effect = item.effects.find((e) => e.name === 'Devastated')
  assert.deepEqual(effect.system.changes.map((c) => [c.key, c.value]), [
    ['flags.midi-qol.grants.advantage.attack.all', 'workflow?.actor?.uuid === "{owner}"'],
    ['flags.midi-qol.disadvantage.attack.all', 'targetActorUuid === "{owner}"'],
    ['flags.midi-qol.disadvantage.ability.save.all', 'workflow?.actor?.uuid === "{owner}"'],
  ])
})

test('Vanguard Stance: a toggle with disadvantage and temp HP each turn', () => {
  const { spec, item } = fromTemplate('stance', { uses: 'prof-lr', minutes: 1, visual: 'frost', disAttacks: true, tempHp: '1d10' })
  assert.equal(spec.item.behavior.mode, 'toggle')
  assert.equal(spec.item.behavior.toggle.duration, '1')
  assert.equal(spec.item.behavior.toggle.freeOff, false, 'limited uses: no refund for leaving early')
  const stance = item.effects.find((e) => e.flags['chrab-sync']?.stance)
  assert.equal(stance.duration.value, 60)
  const changes = Object.fromEntries(stance.system.changes.map((c) => [c.key, c.value]))
  assert.equal(changes['flags.midi-qol.disadvantage.attack.all'], '1')
  assert.match(changes['flags.midi-qol.OverTime'], /turn=start.*damageRoll=1d10, damageType=temphp/)
})

test('Deflecting Darkness: a reaction to taking damage that reduces it', () => {
  const { item } = fromTemplate('reaction', { trigger: 'isDamaged', ...DARK, poolCost: 3, reduce: '2d10 + @abilities.con.mod' })
  const [deflect] = acts(item)
  assert.equal(deflect.activation.type, 'reaction')
  assert.equal(deflect.reactionCondition, 'reaction === "isDamaged"')
  assert.deepEqual(deflect.consumption.targets.map((c) => c.target), ['darkness'])
  const [effect] = item.effects
  assert.deepEqual(effect.system.changes.map((c) => [c.key, c.value]), [['system.traits.dm.midi.all', '-(2d10 + @abilities.con.mod)']])
  assert.deepEqual(effect.flags.dae.specialDuration, ['isDamaged'], 'only for the damage that set it off')
  assert.equal(featureItemToSpec(item).item.activities[0].reactionTrigger, 'isDamaged', 'reads back')
})

test('Shadow Veil: when hit, +5 AC until your next turn', () => {
  const { item } = fromTemplate('reaction', { trigger: 'isHit', ...DARK, poolCost: 3, ac: '5' })
  assert.equal(acts(item)[0].reactionCondition, 'reaction === "isHit"')
  assert.deepEqual(item.effects[0].flags.dae.specialDuration, ['turnStart'])
  assert.deepEqual(buildFromTemplate(findTemplate('reaction'), {}), { error: 'Give it an AC bonus, damage reduction, a resistance, or healing.' })
})

test('Shadow Smite on every hit: an always-on rule that asks and spends Darkness', () => {
  const { spec, item } = fromTemplate('onHitDamage', { attackRange: 'any', ...DARK, poolCost: 3, poolExtra: true, damage: '2d10' })
  const [rule] = spec.item.behavior.rules
  assert.equal(spec.item.behavior.mode, 'passive')
  assert.deepEqual([rule.event, rule.outcome, rule.formula, rule.damageType, rule.ask], ['damage', 'bonusDamage', '2d10', 'necrotic', true])
  assert.deepEqual([rule.costPool, rule.costAmount, rule.costExtra], ['darkness', '3', true])
  assert.ok(item.effects.some((e) => e.transfer && e.system.changes.some((c) => c.value === 'ActivityMacro, damageBonus')))
})

test('drain: heal for half the damage dealt', () => {
  const { spec } = fromTemplate('onHitBenefit', { event: 'dealt', attackRange: 'any', formula: 'floor(@dealt / 2)' })
  const [rule] = spec.item.behavior.rules
  assert.deepEqual([rule.event, rule.outcome, rule.formula], ['dealt', 'healSelf', 'floor(@dealt / 2)'])
})

test('passive bonuses: Dueling, a wider crit range, and spell DC', () => {
  const { item } = fromTemplate('passiveBonus', { meleeDamage: '2', critRange: 19, spellDc: '1', weaponAttack: '1' })
  assert.deepEqual(item.effects[0].system.changes.map((c) => [c.key, c.value, c.type]), [
    ['system.bonuses.mwak.attack', '1', 'add'],
    ['system.bonuses.rwak.attack', '1', 'add'],
    ['system.bonuses.mwak.damage', '2', 'add'],
    ['system.bonuses.spell.dc', '1', 'add'],
    ['flags.dnd5e.weaponCriticalThreshold', '19', 'downgrade'],
  ])
})

test('defenses: always-on damage reduction', () => {
  const { item } = fromTemplate('defenses', { reduceAll: '3', reducePhysical: '@prof' })
  assert.deepEqual(item.effects[0].system.changes.map((c) => [c.key, c.value]), [
    ['system.traits.dm.midi.all', '-(3)'],
    ['system.traits.dm.midi.non-magical-physical', '-(@prof)'],
  ])
})

test('Defend the Weak: a bond effect that hooks the bonded creature, and no carrier on you', () => {
  const { spec, item } = fromTemplate('bond', { ...DARK, poolCost: 3, share: 50, effectName: 'Defended by Darkness' })
  assert.equal(spec.item.behavior.rules[0].outcome, 'shareDamage')
  const [hook, bind] = acts(item)
  assert.equal(hook._id, spec.item.behavior.key, 'the hook comes first')
  assert.equal(bind.target.affects.type, 'ally')
  const bondEffect = item.effects.find((e) => e.name === 'Defended by Darkness')
  assert.equal(bondEffect.flags['chrab-sync'].bond, true)
  assert.equal(bondEffect.transfer, false)
  assert.deepEqual(bondEffect.system.changes.map((c) => c.value), ['ActivityMacro, preTargetDamageApplication'])
  assert.deepEqual(bind.effects.map((e) => e._id), [bondEffect._id], 'the Bind roll puts the bond on the ally')
  assert.equal(item.effects.filter((e) => !e.flags['chrab-sync']?.synthetic || e.flags['chrab-sync']?.bond).length, 1, 'only bond rules: no hook carrier on the owner')
  const back = featureItemToSpec(item).item
  assert.equal(back.effects[0].bond, true)
  assert.deepEqual(back.effects[0].changes, [], 'the hook is rebuilt, not read back')
})

test('scripted templates: teleport, take a hit, sacrifice', () => {
  const warp = acts(fromTemplate('teleport', { ...DARK, poolCost: 2, range: 30 }).item)[0]
  assert.match(warp.macroData.command, /MidiQOL\.moveToken\(self, point, \{ teleport: true, autoRotate: false \}\)/)
  assert.match(warp.macroData.command, /const range = 30;/)
  const absorb = fromTemplate('takeHit', { ...DARK, poolCost: 3 }).item
  assert.equal(acts(absorb)[0].activation.type, 'reaction')
  assert.match(acts(absorb)[0].macroData.command, /executeAsGM\("updateActor"/)
  assert.match(absorb.flags['midi-qol'].onUseMacroName, /^\[postActiveEffects\]ActivityMacro-/)
  const bulwark = acts(fromTemplate('sacrifice', { formula: '3d10', range: 30 }).item)[0]
  assert.match(bulwark.macroData.command, /DamageRoll\("3d10"/)
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor
  for (const code of [warp, acts(absorb)[0], bulwark].map((a) => a.macroData.command)) {
    assert.doesNotThrow(() => new AsyncFunction('workflow', 'args', 'actor', 'token', 'item', code))
  }
})

test('Curse and Mark of Devastation: what being marked does', () => {
  const { item } = fromTemplate('mark', { effectName: 'Devastated', extraDamage: '1d8', grantsAdvantage: true, disAttacks: true, disSaves: true })
  assert.deepEqual(item.effects[0].system.changes.map((c) => [c.key, c.value]), [
    ['flags.midi-qol.grants.advantage.attack.all', '1'],
    ['flags.midi-qol.disadvantage.attack.all', '1'],
    ['flags.midi-qol.disadvantage.ability.save.all', '1'],
    // Extra damage: not midi's dm.midi (a reduction field), but the feature's
    // hook on the marked creature's incoming damage.
    ['flags.midi-qol.onUseMacroName', 'ActivityMacro, preTargetDamageApplication'],
  ])
  assert.equal(item.effects[0].flags['chrab-sync'].extraDamage, '1d8')
  assert.equal(featureItemToSpec(item).item.effects[0].extraDamage, '1d8', 'reads back')
})

test('Vanguard L7: a feature’s over-time temp HP keeps its formula for the real owner', () => {
  const { item } = fromTemplate('stance', { tempHp: '1d10 + @abilities.con.mod' })
  const stance = item.effects.find((e) => e.flags['chrab-sync']?.stance)
  const overTime = stance.system.changes.find((c) => c.key === 'flags.midi-qol.OverTime').value
  assert.match(overTime, /damageRoll=1d10\+@abilities\.con\.mod/, 'not baked to the stand-in owner’s +0')
  assert.equal(buildFromTemplate(findTemplate('stance'), { tempHp: '1d10 + max(0, 1)' }).error, undefined, 'commas are fine: midi splits only at ", key="')
})

test('Unstoppable from Defenses: immunities plus a resistance-bypass rule', () => {
  const { spec, item } = fromTemplate('defenses', { conditionImmune: ['restrained', 'stunned'], bypass: ['bludgeoning', 'piercing', 'slashing'] })
  assert.deepEqual(spec.item.behavior.rules.map((r) => [r.event, r.outcome, r.ignoreTypes.join(',')]), [['damage', 'ignoreResistance', 'bludgeoning,piercing,slashing']])
  assert.ok(item.effects.some((e) => e.transfer && e.system.changes.some((c) => c.value === 'ActivityMacro, damageBonus')))
  assert.ok(item.effects.some((e) => e.system.changes.some((c) => c.key === 'system.traits.ci.value')))
})

test('Mark of Darkness and Curse: getting the cost back when the mark drops', () => {
  const mark = fromTemplate('mark', { uses: 'prof-lr', effectName: 'Marked by Darkness', onDrop: 'use' })
  const markEffect = mark.item.effects.find((e) => e.name === 'Marked by Darkness')
  assert.equal(markEffect.flags['chrab-sync'].bond, true)
  assert.deepEqual(markEffect.system.changes.map((c) => c.value), ['ActivityMacro, preTargetDamageApplication'])
  const refunds = (spec) => spec.item.behavior.rules.filter((r) => r.outcome === 'refund')
  assert.deepEqual(refunds(mark.spec).map((r) => [r.event, r.outcome, r.refundPool]), [['bondedDowned', 'refund', '']])
  const curse = fromTemplate('mark', { ...DARK, poolCost: 2, effectName: 'Cursed', onDrop: 'cost' })
  assert.deepEqual(refunds(curse.spec).map((r) => [r.refundPool, r.refundAmount]), [['darkness', '2']])
  assert.deepEqual(buildFromTemplate(findTemplate('mark'), { onDrop: 'cost' }), { error: '“Give back the resource it cost” needs a resource it spends.' })
})

// ---------------------------------------------------------------------------
// Cost reductions (Magus L7 / L19, The Final Art)

test('a spender’s cost reads the discounts, and a floor effect keeps the flags defined', () => {
  const spec = fromTemplate('attack', { ...DARK, poolCost: 3 }).spec
  spec.item.name = 'Shadow Lance'
  const lance = buildFeatureItem(spec)
  assert.equal(acts(lance)[0].consumption.targets[0].value, 'max(1, 3 - @flags.chrab-sync.discount.darkness - @flags.chrab-sync.discount.shadow-lance)')
  const floor = lance.effects.find((e) => e.flags['chrab-sync']?.synthetic)
  assert.equal(floor.transfer, true)
  assert.deepEqual(floor.system.changes.map((c) => [c.key, c.value, c.type]), [
    ['flags.chrab-sync.discount.darkness', '0', 'upgrade'],
    ['flags.chrab-sync.discount.shadow-lance', '0', 'upgrade'],
  ])
  // Reads back as the plain cost, with no floor effect in the editor.
  const back = featureItemToSpec(lance).item
  assert.equal(back.activities[0].spend[0].amount, '3')
  assert.equal(back.effects.length, 0)
  // No pool: no floor effect.
  assert.equal(fromTemplate('heal', { formula: '1d8' }).item.effects.length, 0)
})

test('Magus L7 and L19: cheaper Dark Arts, some or all', () => {
  const l7 = fromTemplate('costReduction', { amount: 1, features: 'Shadow Lance, Grasp of Shadows' }).item
  assert.deepEqual(l7.effects[0].system.changes.map((c) => [c.key, c.value, c.type]), [
    ['flags.chrab-sync.discount.shadow-lance', '1', 'add'],
    ['flags.chrab-sync.discount.grasp-of-shadows', '1', 'add'],
  ])
  const l19 = fromTemplate('costReduction', { amount: 2 }).item
  assert.deepEqual(l19.effects[0].system.changes.map((c) => [c.key, c.value]), [['flags.chrab-sync.discount.darkness', '2']])
  assert.equal(l19.effects[0].transfer, true)
})

test('The Final Art: a stance with healing each turn and Dark Arts 4 cheaper while on', () => {
  const { item } = fromTemplate('stance', { uses: '', healEachTurn: '2d8', discountPool: 'darkness', discountAmount: 4 })
  const stance = item.effects.find((e) => e.flags['chrab-sync']?.stance)
  assert.deepEqual(
    stance.system.changes.filter((c) => !c.key.includes('onUseMacro')).map((c) => [c.key, c.value]),
    [
      ['flags.midi-qol.OverTime', 'turn=start, label=' + item.name + ', damageRoll=2d8, damageType=healing'],
      ['flags.chrab-sync.discount.darkness', '4'],
    ],
  )
})

test('an attack can carry a +3 bonus and ignore resistance and immunity', () => {
  const [weapon] = acts(fromTemplate('attack', { attackType: 'melee', classification: 'weapon', ability: 'str', range: 5, damage: '3d12 + @abilities.con.mod + 3', toHitBonus: '3', ignoresDefenses: true }).item)
  assert.equal(weapon.attack.bonus, '3')
  assert.deepEqual(weapon.midiProperties.ignoreTraits, ['idr', 'idi'])
})

test('templates are types first, finished features as examples', () => {
  assert.equal(AUTOMATION_TEMPLATES[0].kind, 'type')
  const example = findTemplate('deathStance')
  assert.equal(example.kind, 'example')
  assert.equal(buildFromTemplate(example).spec.item.name, 'Death Stance')
  for (const t of AUTOMATION_TEMPLATES) for (const p of t.params) assert.ok(p.key && p.label && p.kind, `${t.key} params are complete`)
})

test('Imposing Presence: an aura that applies an effect inside and rolls a save on entry and each turn', () => {
  const { item, spec } = fromTemplate('aura', { ...DARK, poolCost: 2, radius: 15, minutes: '1', effectName: 'Imposing Presence', savePenalty: '-1d4', damage: '2d6', saveAbility: 'wis', dc: '10 + @prof + @abilities.con.mod', failCondition: 'frightened' })
  const [main, hurt] = acts(item)
  assert.equal(main.range.units, 'self')
  assert.deepEqual([main.target.template.type, main.target.template.size], ['radius', '15'])
  assert.deepEqual([main.duration.value, main.duration.units], ['1', 'minute'])
  const rb = main.regionBehavior
  assert.equal(rb.enabled, true)
  assert.equal(rb.dispositionFilter, -1)
  const inside = item.effects.find((e) => e.name === 'Imposing Presence')
  assert.equal(inside.flags.dae.dontApply, true)
  assert.deepEqual(
    rb.rules.map((r) => [r.trigger, r.action, r.targetId]),
    [
      ['entry', 'applyEffect', inside._id],
      ['exit', 'removeEffect', inside._id],
      ['entry', 'useActivity', hurt._id],
      ['turnStart', 'useActivity', hurt._id],
    ],
  )
  // Only the use spends Darkness; the aura's save is midi's to roll.
  assert.equal(main.consumption.targets.length, 1)
  assert.deepEqual(hurt.consumption.targets, [])
  assert.equal(hurt.type, 'save')
  assert.deepEqual(main.effects, [], 'the aura places its effects, not the use')
  assert.deepEqual(hurt.effects.map((r) => item.effects.find((e) => e._id === r._id).name), ['Frightened'])
  // Read back into the editor: same rules, by key.
  const back = featureItemToSpec(item).item.activities[0].aura
  assert.equal(back.radius, '15')
  assert.deepEqual(back.rules.map((r) => r.target), [inside._id, inside._id, hurt._id, hurt._id])
  assert.ok(spec.item.effects.find((e) => e.aura))
})

test('Wither: a lingering effect ticks damage each turn, rolled as the caster, save ends', () => {
  const { item } = fromTemplate('lingering', { formula: '1d6 + @abilities.cha.mod', saveAbility: 'con', dc: '13', repeatSave: true, effectName: 'Withering', minutes: '1' })
  const [apply, tick] = acts(item)
  assert.equal(apply.type, 'save')
  assert.deepEqual(apply.effects.map((r) => r._id), [item.effects[0]._id])
  assert.equal(tick.type, 'save')
  assert.deepEqual(tick.effects, [])
  assert.equal(tick.overTimeProperties.rollAs, 'source')
  assert.equal(tick.overTimeProperties.saveRemoves, true)
  assert.equal(tick.overTimeProperties.turnChoice, 'start')
  const ot = item.effects[0].system.changes.find((c) => c.key === 'flags.midi-qol.ActivityOverTime')
  assert.ok(ot, 'the effect names the tick')
  const healing = fromTemplate('lingering', { gives: 'healing', formula: '1d4', target: 'ally' }).item
  assert.equal(acts(healing)[1].type, 'heal')
})

test('summon and transform: dnd5e activities by uuid or by CR, read back', () => {
  const { item } = fromTemplate('summon', { uuid: 'Compendium.world.dk.Actor.abc', name: 'Shadow Image', count: '1 + @scaling.increase', minutes: '1' })
  const [s] = acts(item)
  assert.equal(s.type, 'summon')
  assert.equal(s.summon.mode, '')
  assert.deepEqual([s.profiles[0].uuid, s.profiles[0].count, s.profiles[0].name], ['Compendium.world.dk.Actor.abc', '1 + @scaling.increase', 'Shadow Image'])
  const back = featureItemToSpec(item).item.activities[0]
  assert.deepEqual([back.kind, back.creatureUuid, back.creatureCount], ['summon', 'Compendium.world.dk.Actor.abc', '1 + @scaling.increase'])
  assert.deepEqual([back.summonMatch, back.summonSingle], [true, false])
  assert.equal(item.flags['chrab-sync']?.singleSummon, undefined)

  // A familiar: its own numbers, one at a time, placed within 10 ft.
  const spec = featureItemToSpec(item)
  Object.assign(spec.item.activities[0], { summonMatch: false, summonSingle: true, range: 10 })
  const familiar = buildFeatureItem(spec)
  const f = acts(familiar)[0]
  assert.deepEqual([f.match.attacks, f.match.saves, f.match.proficiency, f.match.disposition], [false, false, false, true])
  assert.deepEqual(f.range, { value: '10', units: 'ft', override: true })
  assert.deepEqual(familiar.flags['chrab-sync'].singleSummon, [f._id])
  const again = featureItemToSpec(familiar).item.activities[0]
  assert.deepEqual([again.summonMatch, again.summonSingle, again.range], [false, true, 10])

  const t = acts(fromTemplate('transform', { crMax: '2', preset: 'custom' }).item)[0]
  assert.equal(t.type, 'transform')
  assert.equal(t.transform.mode, 'cr')
  assert.equal(t.transform.customize, true)
  assert.ok(t.settings.keep.includes('class'))
  const wild = acts(fromTemplate('transform', { uuid: 'Actor.x', preset: 'wildshape' }).item)[0]
  assert.deepEqual([wild.transform.mode, wild.transform.preset, wild.settings], ['', 'wildshape', null])
  assert.equal(featureItemToSpec(fromTemplate('transform', { uuid: 'Actor.x', preset: 'wildshape' }).item).item.activities[0].transformPreset, 'wildshape')
})

test('save or suffer: one more target per extra point spent', () => {
  const [roll] = acts(fromTemplate('saveOrSuffer', { ...DARK, poolExtra: true, condition: 'prone', extraTargets: true }).item)
  assert.equal(roll.target.affects.count, '1 + @scaling.increase')
  assert.equal(roll.consumption.targets[0].scaling.mode, 'amount')
  assert.match(buildFromTemplate(findTemplate('saveOrSuffer'), { condition: 'prone', extraTargets: true }).error, /Can spend more/)
})

test('stance formulas may use commas now (min / max)', () => {
  const { item } = fromTemplate('stance', { tempHp: '1d10 + min(1, floor(@classes.the-dark-knight.levels / 7)) * @abilities.con.mod' })
  assert.ok(item.effects.some((e) => e.system.changes.some((c) => /min\(1,\s*floor\(/.test(String(c.value)))))
  assert.match(buildFromTemplate(findTemplate('stance'), { tempHp: '1d10, label=x' }).error, /name=/)
})

test('Harbinger L19: aura damage on entry and each turn, the save only locks in, and you drain half', () => {
  const { spec, item } = fromTemplate('aura', { radius: 20, saveAbility: 'wis', dc: '13', failEffect: 'Locked in the Aura', damage: '3d6', onSave: 'full', drain: true })
  const hurt = acts(item).find((a) => a.type === 'save')
  assert.equal(hurt.damage.onSave, 'full')
  const locked = item.effects.find((e) => e.name === 'Locked in the Aura')
  assert.deepEqual(locked.flags.dae.specialDuration, ['turnStart'])
  const [rule] = spec.item.behavior.rules
  assert.deepEqual([rule.event, rule.outcome, rule.formula], ['dealt', 'healSelf', 'floor(@dealt / 2)'])
  assert.match(rule.when, /^c\.activity/)
  const vanguard = fromTemplate('aura', { ac: '-3', abilityPenalty: 3 }).item
  const inside = vanguard.effects.find((e) => e.flags['chrab-sync']?.aura)
  assert.deepEqual(inside.system.changes.filter((c) => c.key.startsWith('system.abilities')).map((c) => c.value), ['-3', '-3', '-3', '-3', '-3', '-3'])
})

test('Death Wave and Soul Surge: script recipes that report in a flavored card', () => {
  const wave = fromTemplate('weaponWave', { ...DARK, poolCost: 5, flavor: 'A wave of darkness.', cardColor: 'necrotic' })
  const [roll] = acts(wave.item)
  assert.deepEqual([roll.target.template.type, roll.target.template.size, roll.target.affects.type], ['line', '30', 'enemy'])
  assert.match(roll.macroData.command, /completeActivityUse/)
  assert.match(roll.macroData.command, /A wave of darkness\./)
  assert.match(roll.macroData.command, /#c4102f/)
  assert.match(roll.macroData.command, /system\.bonuses\.mwak\.damage/)

  const surge = fromTemplate('utility', { activation: 'bonus', uses: '1-lr', announce: '@actor can take one more action this turn.' })
  assert.match(acts(surge.item)[0].macroData.command, /can take one more action this turn/)
  assert.equal(acts(fromTemplate('utility', {}).item)[0].macroData, undefined, 'no announcement: no script')
})

test('Inevitable: a reminder card at the start of your turn, only while something holds you', async () => {
  const { spec, item } = fromTemplate('turnReminder', { whileAny: ['grappled', 'restrained'], text: '@name is held (@statuses).', flavor: 'Nothing holds you.' })
  const [rule] = spec.item.behavior.rules
  assert.deepEqual([rule.event, rule.outcome, rule.ask], ['turnStart', 'nothing', false])
  // The hidden start-of-turn tick, named by an always-on effect.
  const tick = acts(item).find((a) => a.isOverTimeFlag)
  assert.equal(tick.overTimeProperties.turnChoice, 'start')
  assert.ok(item.effects.some((e) => e.transfer && e.system.changes.some((c) => c.key === 'flags.midi-qol.ActivityOverTime')))
  assert.match(buildFromTemplate(findTemplate('turnReminder'), {}).error, /Write what/)

  // Run the tick: a card only while grappled or restrained.
  const posted = []
  globalThis.foundry = { utils: { escapeHTML: (s) => String(s), getProperty: (o, p) => p.split('.').reduce((x, k) => x?.[k], o) }, applications: { api: {} } }
  globalThis.ChatMessage = { getSpeaker: () => ({}), implementation: { create: async (m) => posted.push(m) } }
  globalThis.CONFIG = { statusEffects: [{ id: 'restrained', name: 'Restrained' }] }
  globalThis.game = {}
  const actor = { name: 'Bhern', uuid: 'Actor.bhern', statuses: new Set(['restrained']), effects: [], items: [], getRollData: () => ({}) }
  const feature = { id: item._id, uuid: `Actor.bhern.Item.${item._id}`, effects: [], flags: {}, system: {}, getRollData: () => ({}) }
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor
  const hook = acts(item).find((a) => a.macroData?.command?.includes('const SETUP'))
  const run = new AsyncFunction('workflow', 'args', 'actor', 'token', 'rolledItem', 'rolledActivity', 'macroItem', hook.macroData.command)
  await run({}, [{ macroPass: 'postActiveEffects' }], actor, undefined, feature, { id: tick._id }, feature)
  assert.equal(posted.length, 1)
  assert.match(posted[0].content, /Bhern is held \(Restrained\)\./)
  assert.match(posted[0].content, /Nothing holds you\./)
  actor.statuses = new Set(['poisoned'])
  await run({}, [{ macroPass: 'postActiveEffects' }], actor, undefined, feature, { id: tick._id }, feature)
  assert.equal(posted.length, 1, 'not held: no card')
  for (const k of ['foundry', 'ChatMessage', 'CONFIG', 'game']) delete globalThis[k]
})

// Shadow Warp's teleport, run against a stand-in canvas: the reach is drawn
// while the player picks, and the token keeps facing the way it was.
test('teleport: a range ring while picking, and the token keeps its rotation', async () => {
  const warp = acts(fromTemplate('teleport', { ...DARK, poolCost: 2, range: 30 }).item)[0]
  const drawn = []
  const listeners = {}
  const doc = {
    rotation: 90,
    isOwner: true,
    async update(d) {
      Object.assign(doc, d)
    },
  }
  const self = { center: { x: 500, y: 500 }, document: doc }
  let moveOptions = null
  globalThis.PIXI = {
    Graphics: class {
      constructor() {
        drawn.push(this)
        this.destroyed = false
      }
      lineStyle() {
        return this
      }
      beginFill() {
        return this
      }
      drawCircle(x, y, r) {
        this.circle = { x, y, r }
        return this
      }
      endFill() {
        return this
      }
      destroy() {
        this.destroyed = true
      }
    },
  }
  globalThis.canvas = {
    ready: true,
    dimensions: { distance: 5, size: 100 },
    grid: { distance: 5, size: 100, measurePath: ([a, b]) => ({ distance: (Math.hypot(b.x - a.x, b.y - a.y) / 100) * 5 }) },
    tokens: { placeables: [] },
    interface: { addChild: () => {} },
    stage: {
      addEventListener: (event, fn, options) => {
        assert.equal(options?.capture, true, 'ahead of the token under the cursor')
        listeners[event] = fn
        // The player clicks 20 ft to the right.
        queueMicrotask(() => fn({ button: 0, getLocalPosition: () => ({ x: 900, y: 500 }), stopPropagation() {} }))
      },
      removeEventListener: () => {},
    },
  }
  globalThis.ui = { notifications: { info: () => {}, warn: () => {} } }
  globalThis.MidiQOL = {
    moveToken: async (token, point, options) => {
      moveOptions = options
      doc.rotation = 270 // as if something turned it anyway
    },
  }
  globalThis.foundry = { utils: { escapeHTML: (s) => String(s) }, applications: { api: { DialogV2: { confirm: async () => true } } } }
  globalThis.ChatMessage = { getSpeaker: () => ({}), implementation: { create: async () => {} } }
  globalThis.CONFIG = {}
  globalThis.game = { user: { isGM: false } }
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor
  const run = new AsyncFunction('workflow', 'args', 'actor', 'token', 'item', warp.macroData.command)
  const actor = { name: 'Rezire', uuid: 'Actor.rez', getActiveTokens: () => [self] }
  await run({}, [{ macroPass: 'postActiveEffects' }], actor, self, { name: 'Shadow Warp', img: 'warp.webp', flags: {} })
  assert.equal(drawn.length, 1)
  assert.deepEqual(drawn[0].circle, { x: 500, y: 500, r: 600 }, '30 ft is 6 squares of 100 px')
  assert.equal(drawn[0].destroyed, true, 'gone once a spot is picked')
  assert.deepEqual(moveOptions, { teleport: true, autoRotate: false })
  assert.equal(doc.rotation, 90, 'turned back to where it faced')
  for (const k of ['PIXI', 'canvas', 'ui', 'MidiQOL', 'foundry', 'ChatMessage', 'CONFIG', 'game']) delete globalThis[k]
})

// Lunar Missile Barrage: 3 missiles of 1d6 + 1 radiant, one more per slot
// level up. Cast at level 2 (4 missiles), the player clicks a goblin twice,
// takes one back, then shift-clicks an ogre for the rest.
test('missiles: a blue ring, a target per missile, damage per creature', async () => {
  const roll = fromTemplate('missiles', { count: 3, perLevel: 1, formula: '1d6 + 1', damageType: 'radiant', range: 120 })
  const [act] = acts(roll.item)
  assert.match(roll.item.flags['midi-qol'].onUseMacroName, /^\[postActiveEffects\]ActivityMacro-/)
  assert.equal(act.target.affects.type, 'self', 'midi asks for no targets; the macro picks them')
  const drawn = []
  const g = () => ({ lineStyle() { return this }, beginFill() { return this }, endFill() { return this }, moveTo() { return this }, lineTo() { return this }, clear() {}, drawCircle(x, y, r) { this.circle ??= { x, y, r }; return this } })
  globalThis.PIXI = {
    Graphics: class { constructor() { Object.assign(this, g()); drawn.push(this) } },
    Container: class { constructor() { this.children = [] } addChild(...c) { this.children.push(...c) } destroy() { this.destroyed = true } },
    Text: class { constructor(text) { this.text = text; this.anchor = { set() {} }; this.position = { set() {} } } destroy() {} },
  }
  const square = (name, x, size = 1) => ({
    name, actor: { uuid: `Actor.${name}` }, center: { x, y: 500 }, x: x - 50 * size, y: 500 - 50 * size, w: 100 * size, h: 100 * size,
    document: { width: size, height: size },
    bounds: { contains: (px, py) => Math.abs(px - x) <= 50 * size && Math.abs(py - 500) <= 50 * size },
  })
  const self = square('Lyra', 500)
  const goblin = square('Goblin', 1500) // 50 ft
  const ogre = square('Ogre', 2950, 2) // 122.5 ft to its center, 120 to its near side
  const far = square('Far', 4000) // 175 ft
  const at = (t, o = {}) => ({ button: 0, shiftKey: false, getLocalPosition: () => t.center, stopPropagation() {}, ...o })
  const clicks = [at(goblin), at(far), at(goblin), at(goblin, { button: 2 }), at(ogre, { shiftKey: true })]
  const ring = { layer: null }
  globalThis.canvas = {
    ready: true,
    dimensions: { distance: 5, size: 100 },
    grid: { distance: 5, size: 100, measurePath: ([a, b]) => ({ distance: (Math.hypot(b.x - a.x, b.y - a.y) / 100) * 5 }) },
    tokens: { placeables: [self, goblin, ogre, far] },
    interface: { addChild: (c) => (ring.layer = c) },
    stage: {
      // The pickers listen in the capture phase, ahead of the token under the cursor.
      addEventListener: (event, fn, options) => {
        assert.equal(options?.capture, true)
        const next = () => {
          const c = clicks.shift()
          if (!c) return
          fn(c)
          queueMicrotask(next)
        }
        queueMicrotask(next)
      },
      removeEventListener: () => {},
    },
  }
  const warned = []
  globalThis.ui = { notifications: { info: () => {}, warn: (m) => warned.push(m) } }
  const applied = []
  globalThis.MidiQOL = { applyTokenDamage: async (detail, total, targets) => applied.push([[...targets][0].name, total, detail[0].type]) }
  // Every die rolls 4: 1d6 + 1 is 5 a missile.
  globalThis.CONFIG = {
    Dice: {
      DamageRoll: class {
        constructor(formula, data, options) { this.n = 1; this.options = options }
        alter(n, add, { multiplyNumeric }) { assert.equal(multiplyNumeric, true); this.n = n; return this }
        async evaluate() { this.total = 5 * this.n; return this }
      },
    },
  }
  const posted = []
  globalThis.foundry = { utils: { escapeHTML: (s) => String(s) }, applications: { api: {} } }
  globalThis.ChatMessage = { getSpeaker: () => ({}), implementation: { create: async (m) => posted.push(m) } }
  globalThis.game = { user: { isGM: false } }
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor
  const run = new AsyncFunction('workflow', 'args', 'actor', 'token', 'item', act.macroData.command)
  const actor = { name: 'Lyra', uuid: 'Actor.lyra', getActiveTokens: () => [self], getRollData: () => ({}) }
  await run({ chatCard: { system: { scaling: 1 } } }, [{ macroPass: 'postActiveEffects' }], actor, self, { name: 'Lunar Missile Barrage', img: 'moon.webp', flags: {} })
  assert.deepEqual(drawn[0].circle, { x: 500, y: 500, r: 2400 }, '120 ft is 24 squares of 100 px')
  assert.equal(ring.layer.destroyed, true, 'gone once every missile is placed')
  assert.match(warned[0], /Far is out of range \(175 ft\)/)
  assert.deepEqual(applied, [['Goblin', 5, 'radiant'], ['Ogre', 15, 'radiant']], 'goblin 1 missile, ogre the other 3')
  assert.equal(posted.length, 1)
  assert.match(posted[0].content, /looses 4 missiles/)
  assert.match(posted[0].content, /Ogre<\/strong>: 3 missiles, 15 radiant damage/)
  for (const k of ['PIXI', 'canvas', 'ui', 'MidiQOL', 'foundry', 'ChatMessage', 'CONFIG', 'game']) delete globalThis[k]
})

// Acrobat's Launch: speed 45, aimed at a goblin 30 ft to the right. The monk
// stops against it (25 ft flown, 2d4), then flies the other way into a wall;
// then Dash (asked first) doubles the reach.
test('launch: flies along the aim, stops at the first creature or wall, 1d4 per 10 ft', async () => {
  const spec = fromTemplate('launch', { pool: 'monks-focus', poolCost: 1 })
  const [act] = acts(spec.item)
  assert.equal(act.activation.type, 'bonus')
  assert.equal(act.consumption.targets[0].target, 'monks-focus')
  const doc = { rotation: 0, isOwner: true, async update(d) { Object.assign(doc, d) } }
  const self = { center: { x: 500, y: 500 }, w: 100, h: 100, document: doc }
  const goblin = { name: 'Goblin', actor: {}, center: { x: 1100, y: 500 }, w: 100, h: 100 }
  const ally = { name: 'Off the line', actor: {}, center: { x: 800, y: 800 }, w: 100, h: 100 }
  const ogre = { name: 'Ogre', actor: {}, center: { x: 500, y: -700 }, w: 100, h: 100 } // 60 ft up
  let click = { x: 1100, y: 500 }
  let dashAnswer = false
  const asked = []
  let wall = null
  const rings = []
  globalThis.PIXI = { Graphics: class { constructor() { this.r = []; rings.push(this) } lineStyle() { return this } beginFill() { return this } drawCircle(x, y, r) { this.r.push(r); return this } endFill() { return this } destroy() {} } }
  let stopped = 0
  globalThis.canvas = {
    ready: true,
    dimensions: { distance: 5, size: 100 },
    grid: { distance: 5, size: 100, measurePath: ([a, b]) => ({ distance: (Math.hypot(b.x - a.x, b.y - a.y) / 100) * 5 }) },
    tokens: { placeables: [self, goblin, ally, ogre] },
    interface: { addChild: () => {} },
    stage: {
      // Capture phase, so a click on the goblin's token isn't swallowed by it.
      addEventListener: (event, fn, options) => {
        assert.equal(options?.capture, true)
        queueMicrotask(() => fn({ button: 0, getLocalPosition: () => click, stopPropagation: () => stopped++ }))
      },
      removeEventListener: () => {},
    },
  }
  globalThis.ui = { notifications: { info: () => {}, warn: () => {} } }
  const moves = []
  const applied = []
  globalThis.MidiQOL = {
    moveToken: async (token, point, options) => moves.push([point, options]),
    applyTokenDamage: async (detail, total, targets) => applied.push([[...targets][0].name, total, detail[0].type]),
  }
  const formulas = []
  globalThis.CONFIG = {
    Canvas: { polygonBackends: { move: { testCollision: () => wall } } },
    Dice: { DamageRoll: class { constructor(formula) { formulas.push(formula); this.total = 6 } async evaluate() { return this } } },
  }
  const posted = []
  globalThis.foundry = { utils: { escapeHTML: (s) => String(s) }, applications: { api: { DialogV2: { confirm: async (c) => (asked.push(c), dashAnswer) } } } }
  globalThis.ChatMessage = { getSpeaker: () => ({}), implementation: { create: async (m) => posted.push(m) } }
  globalThis.game = { user: { isGM: false } }
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor
  const run = new AsyncFunction('workflow', 'args', 'actor', 'token', 'item', act.macroData.command)
  const actor = { name: 'Bhern', uuid: 'Actor.bhern', system: { attributes: { movement: { walk: 45 } } }, effects: [], getActiveTokens: () => [self], getRollData: () => ({}) }
  const item = { name: 'Launch', img: 'launch.webp', flags: {} }
  await run({}, [{ macroPass: 'postActiveEffects' }], actor, self, item)
  assert.equal(stopped, 1, 'the click is the aim, not a token select')
  assert.deepEqual(rings[0].r, [900], 'his 45 ft')
  assert.match(asked[0].content, /Did you Dash this turn\?.*90 ft instead of 45/)
  assert.equal(asked[0].yes.label, 'Yes, I Dashed')
  assert.deepEqual(moves[0], [{ x: 1000, y: 500 }, { ignoreTokens: true, autoRotate: false }], 'stops beside the goblin')
  assert.deepEqual(formulas, ['2d4'])
  assert.deepEqual(applied, [['Goblin', 6, 'bludgeoning']])
  assert.match(posted[0].content, /launches 25 ft into <strong>Goblin/)

  // Aimed left, the full 45 ft, but a wall 20 ft away: stops short of it.
  click = { x: 400, y: 500 }
  wall = { x: 100, y: 500 }
  await run({}, [{ macroPass: 'postActiveEffects' }], actor, self, item)
  assert.deepEqual(moves[1][0], { x: 150, y: 500 })
  assert.deepEqual(formulas, ['2d4', '1d4'], '17.5 ft rounds to 18: one die')
  assert.equal(applied.length, 1, 'nobody to damage')
  assert.match(posted[1].content, /launches 18 ft into a wall/)

  // He Dashed: 90 ft, so the ogre 60 ft up is in reach: 55 ft, 5d4.
  wall = null
  click = { x: 500, y: 400 }
  dashAnswer = true
  await run({}, [{ macroPass: 'postActiveEffects' }], actor, self, item)
  assert.deepEqual(moves[2][0], { x: 500, y: -600 })
  assert.deepEqual(formulas.at(-1), '5d4')
  assert.deepEqual(applied.at(-1), ['Ogre', 6, 'bludgeoning'])
  assert.deepEqual(rings.at(-1).r, [1800], 'the ring is the Dash reach')
  assert.match(posted[2].content, /Bhern Dashes and launches 55 ft into <strong>Ogre/)

  // Without the Dash, the same aim falls short of the ogre: 45 ft, nothing hit.
  dashAnswer = false
  await run({}, [{ macroPass: 'postActiveEffects' }], actor, self, item)
  assert.deepEqual(moves[3][0], { x: 500, y: -400 })
  assert.match(posted[3].content, /Bhern launches 45 ft<\/li>/)

  // A Dashing effect on him counts without asking.
  actor.effects = [{ name: 'Dashing', disabled: false }]
  const before = asked.length
  await run({}, [{ macroPass: 'postActiveEffects' }], actor, self, item)
  assert.deepEqual(rings.at(-1).r, [1800])
  assert.deepEqual(moves[4][0], { x: 500, y: -600 })
  assert.equal(asked.length, before, 'not asked')
  for (const k of ['PIXI', 'canvas', 'ui', 'MidiQOL', 'foundry', 'ChatMessage', 'CONFIG', 'game']) delete globalThis[k]
})

// Witness My Superiority: a statue of light placed up to 30 ft away, 15 ft
// around. Allies entering get 1d4 temp HP (only a higher roll replaces what
// they have); enemies are Awed (disadvantage on Perception) for a round.
test('zone: a placed, glowing area; allies get temp HP, enemies an effect, and its roll costs nothing', async () => {
  const { item } = fromTemplate('zone', { uses: 'prof-lr', place: 30, radius: 15, allyTempHp: '1d4', effectName: 'Awed', disSkills: ['prc'] })
  const [main, touch] = acts(item)
  assert.deepEqual(main.range, { value: '30', units: 'ft', special: '', override: true })
  assert.equal(main.target.template.size, '15')
  assert.equal(main.regionBehavior.attachToken, 'default', 'stays where it was placed')
  assert.equal(main.regionBehavior.dispositionFilter, 0, 'everyone: the script sorts friend from foe')
  assert.deepEqual(main.regionBehavior.rules.map((r) => [r.trigger, r.targetId]), [['entry', touch._id], ['turnStart', touch._id]])
  assert.equal(main.regionLight.color, '#ffd76a')
  assert.equal(main.consumption.targets.length, 1, 'placing it spends a use')
  assert.deepEqual(touch.consumption.targets, [], 'someone walking in spends nothing')
  assert.equal(item.flags['midi-qol'].onUseMacroName, `[postActiveEffects]ActivityMacro-${touch._id}`)
  const awed = item.effects.find((e) => e.name === 'Awed')
  assert.deepEqual(awed.system.changes.map((c) => c.key), ['flags.midi-qol.disadvantage.skill.prc'])
  assert.deepEqual(main.effects, [], 'nothing lands on whoever is targeted when it is placed')

  const actorFor = (name, temp, owner = false) => {
    const a = { name, uuid: `Actor.${name}`, isOwner: owner, system: { attributes: { hp: { temp } } }, effects: [], created: [], deleted: [] }
    a.createEmbeddedDocuments = async (_, list) => a.created.push(...list)
    a.deleteEmbeddedDocuments = async (_, ids) => a.deleted.push(...ids)
    return a
  }
  const mava = { document: { disposition: 1 } }
  const lyra = { name: 'Lyra', actor: actorFor('Lyra', 0), document: { disposition: 1 } }
  const tank = { name: 'Tank', actor: actorFor('Tank', 9), document: { disposition: 1 } }
  const goblin = { name: 'Goblin', actor: actorFor('Goblin', 0), document: { disposition: -1 } }
  const applied = []
  const gm = []
  globalThis.MidiQOL = {
    applyTokenDamage: async (detail, total, targets) => applied.push([[...targets][0].name, total, detail[0].type]),
    socket: () => ({ executeAsGM: async (what, data) => gm.push([what, data]) }),
  }
  globalThis.Roll = class { constructor(f) { this.formula = f } async evaluate() { this.total = 3; return this } }
  globalThis.CONFIG = {}
  const posted = []
  globalThis.foundry = { utils: { escapeHTML: (s) => String(s), deepClone: (o) => JSON.parse(JSON.stringify(o)) }, applications: { api: {} } }
  globalThis.ChatMessage = { getSpeaker: () => ({}), implementation: { create: async (m) => posted.push(m) } }
  globalThis.game = { user: { isGM: false } }
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor
  const run = new AsyncFunction('workflow', 'args', 'actor', 'token', 'item', touch.macroData.command)
  const source = { name: 'Awed', toObject: () => ({ _id: 'src', name: 'Awed', flags: { dae: { dontApply: true } }, system: { changes: awed.system.changes } }) }
  const featureItem = { name: 'Witness My Superiority', uuid: 'Item.witness', img: 'statue.webp', effects: [source] }
  const actor = { name: 'Mava', getRollData: () => ({}), getActiveTokens: () => [mava] }
  await run({ targets: new Set([lyra, tank, goblin]) }, [{ macroPass: 'postActiveEffects' }], actor, mava, featureItem)
  assert.deepEqual(applied, [['Lyra', 3, 'temphp']], 'the tank already has 9: a 3 doesn’t replace it')
  const [[what, data]] = gm
  assert.equal(what, 'createEffects', 'the goblin isn’t Mava’s: the GM adds it')
  assert.equal(data.actorUuid, 'Actor.Goblin')
  assert.deepEqual(data.effects[0].duration, { value: 1, units: 'rounds', expiry: null })
  assert.equal(data.effects[0].origin, 'Item.witness')
  assert.equal(data.effects[0].flags.dae.dontApply, undefined)
  assert.match(posted[0].content, /Lyra gains 3 temporary HP/)
  assert.match(posted[0].content, /Tank keeps 9 temporary HP/)
  assert.match(posted[0].content, /Goblin: <strong>Awed/)

  // Starting its turn still inside: the old one is replaced, not stacked.
  goblin.actor.effects = [{ id: 'e1', name: 'Awed', origin: 'Item.witness' }]
  gm.length = 0
  await run({ targets: new Set([goblin]) }, [{ macroPass: 'postActiveEffects' }], actor, mava, featureItem)
  assert.deepEqual(gm.map(([w, d]) => [w, d.effects]), [['removeEffects', ['e1']], ['createEffects', gm[1][1].effects]])
  for (const k of ['MidiQOL', 'Roll', 'CONFIG', 'foundry', 'ChatMessage', 'game']) delete globalThis[k]
})
