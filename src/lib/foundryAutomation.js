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

const HEADER = (title) => `// ${title}\n// Chrab Corner script - a midi-qol activity macro, run by whoever uses the item.\n`

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
  // --- Used by the Feature Forge templates (automationTemplates.js); these run
  // on the client of whoever uses the item, often a player, so anything that
  // touches another creature goes through midi's GM socket.
  {
    id: 'teleport',
    label: 'Teleport yourself',
    help: 'After use, click a spot within range; your token moves there instantly. Right-click cancels.',
    pass: 'postActiveEffects',
    params: { range: '30' },
    code: (p) =>
      `${HEADER(`Teleport up to ${num(p.range, 30)} ft.`)}const self = token ?? actor.getActiveTokens?.()[0];
if (!self || !canvas?.ready) return;
const range = ${num(p.range, 30)};
ui.notifications.info("Click where to go (up to " + range + " ft). Right-click to cancel.");
const point = await new Promise((resolve) => {
  const stage = canvas.stage;
  const onDown = (event) => {
    stage.off("pointerdown", onDown);
    resolve(event.button === 2 ? null : event.getLocalPosition(stage));
  };
  stage.on("pointerdown", onDown);
});
if (!point) return;
const from = self.center ?? self.object?.center;
const distance = canvas.grid.measurePath([from, point]).distance;
if (distance > range) return ui.notifications.warn("Too far: " + Math.round(distance) + " ft (up to " + range + ").");
await MidiQOL.moveToken(self, point, { teleport: true });
`,
  },
  {
    id: 'takeHit',
    label: 'Take a creature’s damage instead',
    help: 'After use, asks how much damage the target took: they regain that much and you take it instead.',
    pass: 'postActiveEffects',
    params: { damageType: '' },
    code: (p) =>
      `${HEADER('Take the target’s damage instead')}const target = workflow.targets.first();
if (!target?.actor) return ui.notifications.warn("Target the creature whose damage you take first.");
const DialogV2 = foundry.applications.api.DialogV2;
const amount = Math.floor(Number(await DialogV2.prompt({
  window: { title: item.name },
  content: "<p>How much damage did <strong>" + target.name + "</strong> take? You take it instead.</p><input type=\\"number\\" name=\\"amount\\" min=\\"1\\" autofocus>",
  ok: { label: "Take it", callback: (event, button) => Number(button.form.elements.amount.value) },
  rejectClose: false,
})) || 0);
if (amount <= 0) return;
const hp = target.actor.system.attributes.hp;
await MidiQOL.socket().executeAsGM("updateActor", { actorUuid: target.actor.uuid, updates: { "system.attributes.hp.value": Math.min(hp.max, hp.value + amount) } });
await actor.applyDamage([${p.damageType ? `{ value: amount, type: ${js(p.damageType)} }` : '{ value: amount }'}]);
await ChatMessage.implementation.create({ speaker: ChatMessage.getSpeaker({ actor }), content: "<p>" + actor.name + " takes " + amount + " damage in place of " + target.name + ".</p>" });
`,
  },
  {
    id: 'sacrifice',
    label: 'Hurt yourself, allies gain temp HP',
    help: 'Rolls damage to yourself; each ally within range gains temporary hit points equal to it (not stacking).',
    pass: 'postActiveEffects',
    params: { formula: '3d10', damageType: 'necrotic', range: '30' },
    code: (p) =>
      `${HEADER(`Take ${p.formula || '3d10'}; allies within ${num(p.range, 30)} ft. gain that much temp HP`)}const self = token ?? actor.getActiveTokens?.()[0];
const roll = await new CONFIG.Dice.DamageRoll(${js(p.formula || '3d10')}, actor.getRollData(), { type: ${p.damageType ? js(p.damageType) : 'undefined'} }).evaluate();
await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: item.name });
const amount = roll.total;
await actor.applyDamage([${p.damageType ? `{ value: amount, type: ${js(p.damageType)} }` : '{ value: amount }'}], { ignore: true });
if (!self || !canvas?.ready) return;
const range = ${num(p.range, 30)};
const allies = canvas.tokens.placeables.filter((t) => t !== self && t.actor && t.document.disposition === self.document.disposition
  && canvas.grid.measurePath([self.center, t.center]).distance <= range);
for (const ally of allies) {
  const temp = Number(ally.actor.system.attributes.hp.temp) || 0;
  if (amount <= temp) continue;
  await MidiQOL.socket().executeAsGM("updateActor", { actorUuid: ally.actor.uuid, updates: { "system.attributes.hp.temp": amount } });
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
