// Midi-qol automation for the NPC Forge: guided target conditions and
// script recipes, turned into the strings midi-qol 14 reads. Shapes and
// variables come from the midi-qol 14.0.16 source; the sandbox repo's
// probes/midi-qol-v14-reference.md has the citations.
//
// Conditions are midi's condition expressions: the rolling actor's roll data
// plus target.* (the target's roll data), raceOrType (the target's),
// targetUuid (its token), workflow and helpers such as hasCondition. They are
// evaluated per target for effects, against the first target for "use".
//
// Scripts are activity macros (activity.macroData.command) wired up through
// the item's flags["midi-qol"].onUseMacroName as "[pass]ActivityMacro-<id>",
// so the code lives inside the exported actor - no Macro documents, no DAE.

export const SIZE_ORDER = ['tiny', 'sm', 'med', 'lg', 'huge', 'grg']
export const SIZE_LABELS = { tiny: 'Tiny', sm: 'Small', med: 'Medium', lg: 'Large', huge: 'Huge', grg: 'Gargantuan' }

export const CREATURE_TYPES = [
  'aberration', 'beast', 'celestial', 'construct', 'dragon', 'elemental', 'fey', 'fiend', 'giant', 'humanoid',
  'monstrosity', 'ooze', 'plant', 'undead',
]

const js = (value) => JSON.stringify(value)
const num = (value, fallback = 0) => (Number.isFinite(Number(value)) && String(value).trim() !== '' ? Number(value) : fallback)

// `where` limits a preset to the condition slots it makes sense in:
// use (can the roll be used), effect (does the effect land on this target),
// trigger (does the follow-up roll happen). Save-based ones only make sense
// once saves have been rolled.
export const CONDITION_PRESETS = [
  { id: 'typeIs', label: 'Creature type is', params: { types: [] }, text: (p) => (p.types?.length ? `${js(p.types)}.includes(raceOrType)` : '') },
  { id: 'typeIsNot', label: 'Creature type is not', params: { types: [] }, text: (p) => (p.types?.length ? `!${js(p.types)}.includes(raceOrType)` : '') },
  { id: 'hpAtMost', label: 'Current HP is at most', params: { value: '25' }, text: (p) => `target.attributes.hp.value <= ${num(p.value)}` },
  { id: 'bloodied', label: 'Is below half HP', params: {}, text: () => 'target.attributes.hp.value < target.attributes.hp.max / 2' },
  { id: 'hurt', label: 'Is missing any HP', params: {}, text: () => 'target.attributes.hp.value < target.attributes.hp.max' },
  {
    id: 'sizeAtLeast',
    label: 'Size is at least',
    params: { size: 'lg' },
    text: (p) => `${js(SIZE_ORDER)}.indexOf(target.traits.size) >= ${Math.max(0, SIZE_ORDER.indexOf(p.size))}`,
  },
  {
    id: 'sizeAtMost',
    label: 'Size is at most',
    params: { size: 'med' },
    text: (p) => `${js(SIZE_ORDER)}.indexOf(target.traits.size) <= ${Math.max(0, SIZE_ORDER.indexOf(p.size))}`,
  },
  { id: 'hasStatus', label: 'Has the condition', params: { status: 'prone' }, text: (p) => `hasCondition(targetUuid, ${js(p.status)})` },
  { id: 'lacksStatus', label: 'Does not have the condition', params: { status: 'prone' }, text: (p) => `!hasCondition(targetUuid, ${js(p.status)})` },
  {
    id: 'failedBy',
    label: 'Failed its save by at least',
    params: { value: '5' },
    where: ['effect', 'trigger'],
    // tokenSaves is keyed by the target's token document uuid, which is
    // exactly targetUuid in condition data.
    text: (p) => `target.failedSave && (workflow.saveDC - (workflow.tokenSaves?.[targetUuid]?.total ?? workflow.saveDC)) >= ${num(p.value, 1)}`,
  },
  { id: 'raw', label: 'Custom expression', params: { text: '' }, text: (p) => String(p.text ?? '').trim() },
]

export function conditionPresets(slot) {
  return CONDITION_PRESETS.filter((p) => !p.where || p.where.includes(slot))
}

export function emptyCondition(id = 'typeIs') {
  const preset = CONDITION_PRESETS.find((p) => p.id === id) ?? CONDITION_PRESETS[0]
  return { key: Math.random().toString(36).slice(2, 12), id: preset.id, ...structuredClone(preset.params) }
}

// Rows -> one midi expression, all of them required. A single row is left
// unwrapped so a custom expression read back from Foundry round-trips as is.
export function conditionText(rows) {
  const parts = (rows ?? [])
    .map((row) => CONDITION_PRESETS.find((p) => p.id === row.id)?.text(row) ?? '')
    .filter(Boolean)
  if (parts.length <= 1) return parts[0] ?? ''
  return parts.map((t) => `(${t})`).join(' && ')
}

// Foundry text -> rows. Anything non-empty comes back as one custom row.
export function conditionRows(text) {
  const value = String(text ?? '').trim()
  return value ? [{ ...emptyCondition('raw'), text: value }] : []
}

// ---------------------------------------------------------------------------
// Scripts

export const SCRIPT_PASSES = [
  { key: 'preItemRoll', label: 'Before anything rolls (return false to cancel)' },
  { key: 'postAttackRoll', label: 'After the attack roll and hits' },
  { key: 'preDamageRoll', label: 'Before damage is rolled' },
  { key: 'damageBonus', label: 'Add bonus damage (return { damageRoll, damageType })' },
  { key: 'postDamageRoll', label: 'After damage is rolled' },
  { key: 'postSave', label: 'After saving throws' },
  { key: 'preActiveEffects', label: 'Before effects are applied' },
  { key: 'postActiveEffects', label: 'After everything (effects applied)' },
]

const HEADER = (title) => `// ${title}\n// Chrab Corner NPC Forge script - runs in the GM's Foundry as a midi-qol activity macro.\n`

export const SCRIPT_RECIPES = [
  {
    id: 'targetStatDamage',
    label: 'Extra damage from a target stat',
    help: 'Reads a number off the first target hit (e.g. its CON modifier) and adds it as damage.',
    pass: 'damageBonus',
    params: { stat: 'abilities.con.mod', multiplier: '1', damageType: '', minimum: '0', label: '' },
    code: (p) =>
      `${HEADER(`Extra damage: ${p.multiplier || 1} x the target's ${p.stat}`)}const target = workflow.hitTargets.first() ?? workflow.targets.first();
if (!target?.actor) return;
const stat = Number(foundry.utils.getProperty(target.actor.getRollData(), ${js(p.stat)})) || 0;
const bonus = Math.max(${num(p.minimum)}, Math.floor(stat * ${num(p.multiplier, 1)}));
if (bonus <= 0) return;
return { damageRoll: String(bonus), damageType: ${js(p.damageType || '')}, flavor: ${js(p.label || 'Bonus damage')} };
`,
  },
  {
    id: 'sizeDamage',
    label: 'Extra damage against big (or small) targets',
    help: 'Adds damage when the first target hit is at least (or at most) a size.',
    pass: 'damageBonus',
    params: { compare: 'atLeast', size: 'lg', formula: '2d6', damageType: '', label: '' },
    code: (p) =>
      `${HEADER(`Extra ${p.formula} damage vs ${p.compare === 'atMost' ? 'at most' : 'at least'} ${SIZE_LABELS[p.size] ?? p.size} targets`)}const sizes = ${js(SIZE_ORDER)};
const target = workflow.hitTargets.first() ?? workflow.targets.first();
if (!target?.actor) return;
const size = sizes.indexOf(target.actor.system.traits.size);
if (!(size ${p.compare === 'atMost' ? '<=' : '>='} ${Math.max(0, SIZE_ORDER.indexOf(p.size))})) return;
return { damageRoll: ${js(p.formula || '1d6')}, damageType: ${js(p.damageType || '')}, flavor: ${js(p.label || 'Size bonus')} };
`,
  },
  {
    id: 'drain',
    label: 'Heal itself for part of the damage dealt',
    help: 'After damage lands, the NPC regains a share of the HP it took from its targets.',
    pass: 'postActiveEffects',
    params: { percent: '50' },
    code: (p) =>
      `${HEADER(`Drain: heal for ${num(p.percent, 50)}% of the damage dealt`)}const dealt = (workflow.damageList ?? []).reduce((sum, d) => sum + (d.hpDamage ?? 0) + (d.tempDamage ?? 0), 0);
const heal = Math.floor(dealt * ${num(p.percent, 50) / 100});
if (heal <= 0) return;
await actor.applyDamage([{ value: heal, type: "healing" }]);
`,
  },
  {
    id: 'push',
    label: 'Push targets away',
    help: 'Moves each target hit (or each target that failed its save) straight away from the NPC.',
    pass: 'postActiveEffects',
    params: { distance: '10', who: 'hit' },
    code: (p) =>
      `${HEADER(`Push ${num(p.distance, 10)} ft. (${p.who === 'failed' ? 'failed saves' : 'hits'})`)}if (!token) return;
const targets = ${p.who === 'failed' ? 'workflow.failedSaves' : 'workflow.hitTargets'};
for (const target of targets) {
  await MidiQOL.moveTokenAwayFromPoint(target, ${num(p.distance, 10)}, token.center);
}
`,
  },
  {
    id: 'custom',
    label: 'Blank script',
    help: 'Write it yourself. The cheat sheet lists what midi hands the script.',
    pass: 'postActiveEffects',
    params: {},
    code: () =>
      `${HEADER('Custom script')}// workflow.hitTargets / failedSaves / targets are Sets of tokens: .first(), for...of
// const target = workflow.hitTargets.first();
// const con = target?.actor?.system.abilities.con.mod;
`,
  },
]

export function emptyScript(recipeId = 'targetStatDamage') {
  const recipe = SCRIPT_RECIPES.find((r) => r.id === recipeId) ?? SCRIPT_RECIPES[0]
  return { recipe: recipe.id, pass: recipe.pass, params: structuredClone(recipe.params), code: '', edited: false }
}

// The code a script exports: hand-edited code wins, otherwise the recipe's.
export function scriptCode(script) {
  if (!script) return ''
  if (script.edited) return String(script.code ?? '')
  const recipe = SCRIPT_RECIPES.find((r) => r.id === script.recipe)
  return recipe ? recipe.code(script.params ?? {}) : String(script.code ?? '')
}

export function scriptPass(script) {
  if (!script) return ''
  const recipe = SCRIPT_RECIPES.find((r) => r.id === script.recipe)
  return recipe && recipe.id !== 'custom' ? recipe.pass : script.pass || 'postActiveEffects'
}

// "[postDamageRoll]ActivityMacro-abc,[damageBonus]ActivityMacro-def" ->
// { abc: 'postDamageRoll', def: 'damageBonus' }, for reading exports back.
export function parseOnUseMacros(value) {
  const out = {}
  for (const part of String(value ?? '').split(',')) {
    const m = part.trim().match(/^\[(\w+)\]ActivityMacro-(\w+)$/)
    if (m) out[m[2]] = m[1]
  }
  return out
}
