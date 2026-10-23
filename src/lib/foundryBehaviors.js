// Feature behaviors: "while this is on, when I do X, Y happens" automation
// that reacts to the owner's OTHER items (any melee weapon, any spell), which
// a plain activity macro can't - those only run when their own item is used.
//
// How it works in Foundry (midi-qol 14; citations in the sandbox repo's
// probes/midi-qol-v14-reference.md and probes/feature-behaviors.md):
//   - The item's first activity carries one generated macro (macroData), the
//     "hook". Everything below runs that same code.
//   - An effect on the owner carries flags.midi-qol.onUseMacroName changes,
//     "ActivityMacro, <pass>". Midi resolves the bare "ActivityMacro" to the
//     first activity of the effect's item (transfer) or origin item (applied),
//     and then runs the hook for every item the owner uses, at that pass.
//   - passive: that effect is a transfer effect, always on.
//     toggle:  using the item runs the hook from the item's own onUseMacroName
//     ([postActiveEffects]ActivityMacro-<hook id>), which copies the item's
//     stance effects onto the owner (origin = the item) or removes them. While
//     they're on, the hooks fire. A visual (Sequencer if installed, else a
//     token light) follows the stance.
//
// The code is self-contained in the item - no Macro documents, no DAE, and no
// dependency on the Chrab Sync module at play time.

import { conditionText } from './foundryAutomation.js'

export const BEHAVIOR_MODES = [
  { key: 'passive', label: 'Always on' },
  { key: 'toggle', label: 'Toggle on / off (a stance)' },
]

// When a rule fires. pass: the midi-qol workflow pass the hook listens on.
// attack: only attack rolls can fire it; hit: at least one target was hit.
export const BEHAVIOR_EVENTS = [
  { key: 'attackRoll', label: 'I make an attack roll', pass: 'postAttackRoll', attack: true },
  { key: 'hit', label: 'I hit with an attack', pass: 'postAttackRoll', attack: true, hit: true },
  { key: 'damage', label: 'I roll damage on a hit (or any damage roll)', pass: 'damageBonus' },
  { key: 'dealt', label: 'My damage has landed', pass: 'postActiveEffects', dealt: true },
]

// What happens. events: the only events it makes sense on (bonus damage has
// to be returned from the damageBonus pass).
export const BEHAVIOR_OUTCOMES = [
  { key: 'healSelf', label: 'I regain hit points' },
  { key: 'tempHpSelf', label: 'I gain temporary hit points' },
  { key: 'damageSelf', label: 'I take damage' },
  { key: 'bonusDamage', label: 'The target takes extra damage', events: ['damage'] },
]

// The persistent visual while a toggle is on. files: Sequencer database
// entries tried in order (the first that exists plays, attached under the
// token). They're best guesses at free JB2A names - a path picked in
// Sequencer's Database Viewer (toggle.sequencerFile) always wins. With no
// Sequencer or no match, the token gets a pulsing light of `color` instead.
export const TOGGLE_VISUALS = [
  { key: 'none', label: 'Just the effect icon' },
  {
    key: 'necrotic',
    label: 'Necrotic (blood red)',
    color: '#c4102f',
    files: ['jb2a.energy_strands.overlay.dark_red', 'jb2a.static_electricity.03.dark_red', 'jb2a.markers.02.dark_red', 'jb2a.energy_field.02.below.purple'],
  },
  { key: 'radiant', label: 'Radiant (gold)', color: '#ffc928', files: ['jb2a.markers.light.loop.yellow', 'jb2a.energy_field.02.below.yellow', 'jb2a.static_electricity.03.yellow'] },
  { key: 'fire', label: 'Fire (orange)', color: '#ff5a00', files: ['jb2a.flames.02.orange', 'jb2a.energy_field.02.below.orange', 'jb2a.static_electricity.03.orange'] },
  { key: 'frost', label: 'Frost (ice blue)', color: '#38c8ff', files: ['jb2a.energy_field.02.below.blue', 'jb2a.static_electricity.03.blue', 'jb2a.markers.02.blue'] },
  { key: 'arcane', label: 'Arcane (violet)', color: '#9b30ff', files: ['jb2a.energy_field.02.below.purple', 'jb2a.static_electricity.03.purple', 'jb2a.markers.02.purple'] },
  { key: 'nature', label: 'Nature (green)', color: '#2fd25b', files: ['jb2a.energy_field.02.below.green', 'jb2a.static_electricity.03.green', 'jb2a.markers.02.green'] },
]

const ABILITY_NAMES = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' }

const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
function newId() {
  let id = ''
  for (let i = 0; i < 16; i++) id += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)]
  return id
}

const js = (value) => JSON.stringify(value)

// ---------------------------------------------------------------------------
// Empty shapes for the editor

// key doubles as the hook activity's Foundry id, so it stays stable across
// re-sends (effects on characters point at it through their origin item).
export function emptyBehavior(mode = 'toggle') {
  return {
    key: newId(),
    mode,
    toggle: {
      label: '', // the activity's name on the sheet; blank = "Toggle"
      activation: 'bonus', // an ACTIVATION_TYPES key
      freeOff: true, // turning it off gives back the use it spent
      visual: 'necrotic',
      sequencerFile: '',
      announce: true, // a chat line when it turns on or off
    },
    rules: [],
  }
}

export function emptyBehaviorRule(outcome = 'healSelf') {
  return {
    key: newId(),
    label: '', // shown in chat and in the "use it?" prompt
    event: outcome === 'bonusDamage' ? 'damage' : 'attackRoll',
    attackRange: 'any', // 'any' | 'melee' | 'ranged'
    attackSource: 'any', // 'any' | 'weapon' | 'spell'
    naturalMin: '', // natural d20 at least this (attack events)
    critOnly: false,
    oncePerTurn: false,
    ask: false, // "Use <label>?" before it happens
    targetConditions: [], // foundryAutomation condition rows, against the first target
    when: '', // extra JavaScript condition, advanced
    outcome,
    formula: outcome === 'bonusDamage' ? '1d6' : '1d10',
    damageType: outcome === 'bonusDamage' || outcome === 'damageSelf' ? 'necrotic' : '',
    selfCost: 'none', // bonusDamage: 'same' = I take the same amount
    critDoubles: true, // bonusDamage: dice double on a critical hit
  }
}

// An item's behavior, or null when there's nothing to build (a passive one
// with no rules does nothing).
export function activeBehavior(item) {
  const b = item?.behavior
  if (!b || !b.key) return null
  if (b.mode !== 'toggle' && !(b.rules ?? []).length) return null
  return b
}

export function ruleEvent(rule) {
  return BEHAVIOR_EVENTS.find((e) => e.key === rule.event) ?? BEHAVIOR_EVENTS[0]
}

// Bonus damage only works from the damageBonus pass; anything else keeps its event.
export function ruleOutcomeFits(rule) {
  const outcome = BEHAVIOR_OUTCOMES.find((o) => o.key === rule.outcome)
  return !outcome?.events || outcome.events.includes(rule.event)
}

// The midi passes the hook has to listen on, one onUseMacroName change each.
export function behaviorPasses(behavior) {
  return [...new Set((behavior?.rules ?? []).filter(ruleOutcomeFits).map((r) => ruleEvent(r).pass))]
}

export function behaviorChanges(behavior) {
  return behaviorPasses(behavior).map((pass) => ({ key: 'flags.midi-qol.onUseMacroName', value: `ActivityMacro, ${pass}`, type: 'custom', phase: 'initial' }))
}

// ---------------------------------------------------------------------------
// Text for the item description and the editor preview

// "1d10 + @abilities.con.mod" -> "1d10 + your Constitution modifier"
export function formulaWords(formula) {
  return String(formula ?? '')
    .trim()
    .replace(/@abilities\.(\w+)\.mod/g, (_, a) => `your ${ABILITY_NAMES[a] ?? a.toUpperCase()} modifier`)
    .replace(/@prof\b/g, 'your proficiency bonus')
    .replace(/@details\.level\b/g, 'your level')
    .replace(/@classes\.(\w+)\.levels/g, (_, c) => `your ${c} level`)
    .replace(/@dealt\b/g, 'the damage dealt')
    .replace(/\s+/g, ' ')
}

function attackWords(rule) {
  const range = { melee: 'melee ', ranged: 'ranged ' }[rule.attackRange] ?? ''
  const source = { weapon: 'weapon ', spell: 'spell ' }[rule.attackSource] ?? ''
  return `${range}${source}attack`
}

export function ruleSummary(rule) {
  const ev = ruleEvent(rule)
  const attack = attackWords(rule)
  let when
  if (ev.key === 'attackRoll') when = `When you make a ${attack} roll`
  else if (ev.key === 'hit') when = `When you hit with a ${attack}`
  else if (ev.key === 'damage') when = rule.attackRange !== 'any' || rule.attackSource !== 'any' ? `When you hit with a ${attack}` : 'When you hit or deal damage'
  else when = rule.attackRange !== 'any' || rule.attackSource !== 'any' ? `After your ${attack} deals damage` : 'After you deal damage'
  const extra = []
  const n = Number(rule.naturalMin)
  if (n > 1) extra.push(n >= 20 ? 'and roll a 20 on the d20' : `and roll a ${n === 19 ? '19 or 20' : `${n} or higher`} on the d20`)
  if (rule.critOnly) extra.push('and score a critical hit')
  const lead = [when, ...extra].join(' ')
  const amount = formulaWords(rule.formula) || '0'
  const type = rule.damageType ? ` ${rule.damageType}` : ''
  const can = rule.ask ? 'can ' : ''
  let what
  switch (rule.outcome) {
    case 'healSelf':
      what = `you ${can}regain ${amount} hit points`
      break
    case 'tempHpSelf':
      what = `you ${can}gain ${amount} temporary hit points`
      break
    case 'damageSelf':
      what = `you take ${amount}${type} damage`
      break
    case 'bonusDamage':
      what = `you ${can}deal an extra ${amount}${type} damage${rule.selfCost === 'same' ? ', and you take the same amount of damage' : ''}`
      break
    default:
      what = 'nothing happens'
  }
  const once = rule.oncePerTurn ? ' This can happen only once per turn.' : ''
  return `${lead}, ${what}.${once}`
}

const ACTIVATION_WORDS = { action: 'As an action', bonus: 'As a bonus action', reaction: 'As a reaction', special: 'At any time' }

export function behaviorSummary(behavior, itemName = '') {
  if (!behavior) return ''
  const rules = (behavior.rules ?? []).filter(ruleOutcomeFits).map(ruleSummary)
  if (behavior.mode !== 'toggle') return rules.join(' ')
  const how = ACTIVATION_WORDS[behavior.toggle?.activation] ?? 'As a bonus action'
  const name = itemName || 'this stance'
  const intro = `${how}, you can enter or leave ${name}.`
  return rules.length ? `${intro} While it's active: ${rules.join(' ')}` : intro
}

// ---------------------------------------------------------------------------
// The hook macro

// Only what the runtime reads, with defaults resolved here so the macro
// doesn't have to.
function runtimeRule(rule) {
  const ev = ruleEvent(rule)
  return {
    key: rule.key,
    label: String(rule.label ?? '').trim(),
    pass: ev.pass,
    attackOnly: !!ev.attack || rule.attackRange !== 'any' || rule.attackSource !== 'any',
    range: rule.attackRange === 'any' ? '' : rule.attackRange,
    source: rule.attackSource === 'any' ? '' : rule.attackSource,
    needsHit: !!ev.hit,
    needsDamage: !!ev.dealt,
    naturalMin: Number(rule.naturalMin) > 1 ? Number(rule.naturalMin) : 0,
    critOnly: !!rule.critOnly,
    oncePerTurn: !!rule.oncePerTurn,
    ask: !!rule.ask,
    outcome: rule.outcome,
    formula: String(rule.formula ?? '').trim() || '0',
    type: rule.damageType || '',
    selfCost: rule.outcome === 'bonusDamage' && rule.selfCost === 'same',
    critDoubles: rule.outcome === 'bonusDamage' && rule.critDoubles !== false,
  }
}

// A rule's extra condition as code: the guided target rows (midi condition
// syntax, evaluated by MidiQOL against the first target) and/or a raw
// expression over the hook's own variables.
function whenCode(rule) {
  const parts = []
  const target = conditionText(rule.targetConditions)
  if (target) parts.push(`await targetPasses(${js(target)})`)
  const raw = String(rule.when ?? '').trim()
  if (raw) parts.push(`(${raw})`)
  return parts.length ? parts.join(' && ') : ''
}

function visualFor(behavior) {
  const t = behavior.toggle ?? {}
  const preset = TOGGLE_VISUALS.find((v) => v.key === t.visual)
  if (!preset || preset.key === 'none') return t.sequencerFile ? { files: [t.sequencerFile], color: '' } : null
  return { files: [t.sequencerFile, ...(preset.files ?? [])].filter(Boolean), color: preset.color }
}

const HEADER = (name) => `// ${name} - Chrab Corner feature behavior, generated by the Feature Forge.
// One midi-qol activity macro: it runs when this item is used (the toggle) and,
// through flags.midi-qol.onUseMacroName on its effect, whenever the owner uses
// any other item. Edit it on the Compendium site, not here - a re-send replaces it.
`

// The macro's whole code. It's the body of an async function midi calls with
// workflow, args, actor, token, rolledItem, rolledActivity and macroItem in
// scope (src/module/workflow.ts executeMacroWithScope).
export function behaviorMacro(item, behavior) {
  const rules = (behavior.rules ?? []).filter(ruleOutcomeFits)
  const setup = {
    name: String(item?.name ?? '').trim() || 'Feature',
    toggle:
      behavior.mode === 'toggle'
        ? { freeOff: behavior.toggle?.freeOff !== false, announce: behavior.toggle?.announce !== false, visual: visualFor(behavior) }
        : null,
    rules: rules.map(runtimeRule),
  }
  const whens = rules
    .map((r) => [r.key, whenCode(r)])
    .filter(([, code]) => code)
    .map(([key, code]) => `  ${js(key)}: async (c) => ${code},`)
    .join('\n')

  return `${HEADER(setup.name)}const SETUP = ${JSON.stringify(setup, null, 2)};
const WHEN = {
${whens}
};
const FLAG = "chrab-sync";
const pass = String(args?.[0]?.macroPass ?? "");
const feature = macroItem;
const me = actor;
if (!feature || !me) return;
const speaker = ChatMessage.getSpeaker({ actor: me });
const say = (html) => ChatMessage.implementation.create({ speaker, content: html });
const esc = (s) => foundry.utils.escapeHTML ? foundry.utils.escapeHTML(String(s)) : String(s);
const isStance = (e) => e.origin === feature.uuid && !!e.flags?.[FLAG]?.stance;
const myToken = () => {
  const t = token ?? me.getActiveTokens?.()[0];
  return t ? { object: t.document ? t : t.object, doc: t.document ?? t } : null;
};

// --- Visual: a Sequencer effect tied to the stance effect, else a token light.
async function visualOn(effect) {
  const v = SETUP.toggle?.visual;
  const t = myToken();
  if (!v || !t?.doc) return;
  const S = globalThis.Sequencer;
  const file = S ? v.files.find((f) => f.includes("/") || S.Database?.entryExists?.(f)) : null;
  if (file && globalThis.Sequence) {
    await new Sequence()
      .effect()
      .file(file)
      .attachTo(t.object ?? t.doc)
      .scaleToObject(1.8)
      .belowTokens()
      .fadeIn(400)
      .fadeOut(400)
      .persist()
      .name("chrab-" + feature.id)
      .tieToDocuments(effect)
      .play();
    return;
  }
  if (!v.color) return;
  const before = t.doc.light?.toObject?.() ?? foundry.utils.deepClone(t.doc._source.light);
  await t.doc.update({
    light: { dim: 10, bright: 0, color: v.color, alpha: 0.6, animation: { type: "pulse", speed: 3, intensity: 5 } },
    ["flags." + FLAG + ".light." + feature.id]: before,
  });
}

async function visualOff() {
  const t = myToken();
  if (!t?.doc) return;
  globalThis.Sequencer?.EffectManager?.endEffects?.({ name: "chrab-" + feature.id, object: t.object ?? t.doc });
  const before = t.doc.flags?.[FLAG]?.light?.[feature.id];
  if (before) await t.doc.update({ light: before, ["flags." + FLAG + ".light.-=" + feature.id]: null });
}

// --- The toggle: this item's own use. Both the item's onUse flag and (when a
// rule listens on postActiveEffects) the actor hook land here, so only the
// first call per workflow does anything.
if (rolledItem?.uuid === feature.uuid) {
  if (!SETUP.toggle || pass.toLowerCase() !== "postactiveeffects" || workflow?.chrabToggled?.has(feature.uuid)) return;
  (workflow.chrabToggled ??= new Set()).add(feature.uuid);
  const active = me.effects.filter(isStance);
  if (active.length) {
    await visualOff();
    await me.deleteEmbeddedDocuments("ActiveEffect", active.map((e) => e.id));
    const uses = feature.system?.uses;
    if (SETUP.toggle.freeOff && uses?.max && Number(uses.spent) > 0) await feature.update({ "system.uses.spent": Number(uses.spent) - 1 });
    if (SETUP.toggle.announce) await say("<p><strong>" + esc(SETUP.name) + "</strong> ends.</p>");
  } else {
    const data = feature.effects.filter((e) => e.flags?.[FLAG]?.stance).map((e) => {
      const d = e.toObject();
      delete d._id;
      return foundry.utils.mergeObject(d, { origin: feature.uuid, transfer: false, disabled: false });
    });
    if (!data.length) return ui.notifications.warn(SETUP.name + ": this item has no stance effect to turn on.");
    const created = await me.createEmbeddedDocuments("ActiveEffect", data);
    await visualOn(created[0]);
    if (SETUP.toggle.announce) await say("<p><strong>" + esc(SETUP.name) + "</strong> is active.</p>");
  }
  return;
}

// --- Rules: some other item of the owner's is being used.
const activity = rolledActivity;
const isAttack = activity?.type === "attack";
const range = activity?.attack?.type?.value ?? "";
const source = activity?.attack?.type?.classification ?? "";
const natural = Number(workflow?.diceRoll) || 0;
const hits = workflow?.hitTargets?.size ?? 0;
const dealt = (workflow?.damageList ?? []).reduce((sum, d) => sum + (Number(d.hpDamage) || 0) + (Number(d.tempDamage) || 0), 0);
const target = workflow?.hitTargets?.first?.() ?? workflow?.targets?.first?.();
const rollData = { ...(feature.getRollData?.() ?? me.getRollData()), natural, hits, dealt };

async function targetPasses(expression) {
  if (!target || !globalThis.MidiQOL?.evalCondition) return false;
  const data = MidiQOL.createConditionData({ workflow, target, actor: me, item: rolledItem, activity });
  return !!(await MidiQOL.evalCondition(expression, data, { async: true }));
}

const turnKey = () => (game.combat?.started ? game.combat.id + ":" + game.combat.round + ":" + game.combat.turn : "");
const usedThisTurn = (rule) => !!turnKey() && feature.flags?.[FLAG]?.turns?.[rule.key] === turnKey();
const markTurn = (rule) => (turnKey() ? feature.update({ ["flags." + FLAG + ".turns." + rule.key]: turnKey() }) : null);

async function ask(rule) {
  const text = rule.label || SETUP.name;
  const DialogV2 = foundry.applications?.api?.DialogV2;
  if (!DialogV2) return true;
  return !!(await DialogV2.confirm({
    window: { title: SETUP.name },
    content: "<p>Use <strong>" + esc(text) + "</strong>?</p>",
    rejectClose: false,
    modal: true,
  }));
}

async function roll(rule, options = {}) {
  const r = new CONFIG.Dice.DamageRoll(rule.formula, rollData, { type: rule.type || undefined, ...options });
  await r.evaluate();
  return r;
}

async function hurtMe(amount, type, why) {
  if (amount <= 0) return;
  // ignore: exactly this amount - the owner's resistances don't change a cost.
  await me.applyDamage([type ? { value: amount, type } : { value: amount }], { ignore: true });
  await say("<p><strong>" + esc(why) + "</strong>: " + esc(me.name) + " takes " + amount + (type ? " " + esc(type) : "") + " damage.</p>");
}

const bonus = [];
for (const rule of SETUP.rules) {
  if (rule.pass.toLowerCase() !== pass.toLowerCase()) continue;
  if (rule.attackOnly && !isAttack) continue;
  if (rule.range && range !== rule.range) continue;
  if (rule.source && (rule.source === "weapon" ? !["weapon", "unarmed"].includes(source) : source !== rule.source)) continue;
  if ((rule.needsHit || (rule.pass === "damageBonus" && isAttack)) && !hits) continue;
  if (rule.naturalMin && natural < rule.naturalMin) continue;
  if (rule.critOnly && !workflow?.isCritical) continue;
  if (rule.needsDamage && dealt <= 0) continue;
  if (rule.oncePerTurn && usedThisTurn(rule)) continue;
  try {
    if (WHEN[rule.key] && !(await WHEN[rule.key]({ workflow, actor: me, item: feature, activity, natural, hits, dealt, target }))) continue;
  } catch (err) {
    console.warn("chrab-sync | " + SETUP.name + ": condition failed", err);
    continue;
  }
  if (rule.ask && !(await ask(rule))) continue;
  if (rule.oncePerTurn) await markTurn(rule);
  const label = rule.label || SETUP.name;
  if (rule.outcome === "bonusDamage") {
    const r = await roll(rule, { flavor: label, isCritical: rule.critDoubles && !!workflow?.isCritical });
    bonus.push(r);
    if (rule.selfCost) await hurtMe(r.total, rule.type, label);
  } else if (rule.outcome === "healSelf") {
    const r = await roll(rule, { type: "healing" });
    await r.toMessage({ speaker, flavor: label + " - healing" });
    await me.applyDamage([{ value: r.total, type: "healing" }]);
  } else if (rule.outcome === "tempHpSelf") {
    const r = await roll(rule, { type: "temphp" });
    await r.toMessage({ speaker, flavor: label + " - temporary hit points" });
    await me.applyTempHP(r.total);
  } else if (rule.outcome === "damageSelf") {
    const r = await roll(rule);
    await r.toMessage({ speaker, flavor: label });
    await hurtMe(r.total, rule.type, label);
  }
}
if (pass.toLowerCase() === "damagebonus") return bonus;
`
}

// ---------------------------------------------------------------------------
// Ready-made behaviors

// Death Stance (Chrab's homebrew): a bonus-action stance with a blood-red
// aura. Melee attack rolls of a natural 19-20 heal 1d10 + CON; on a melee hit
// the attacker may add 1d10 necrotic and takes the same amount.
export function deathStanceBehavior() {
  const heal = {
    ...emptyBehaviorRule('healSelf'),
    label: 'Death Stance: Blood Harvest',
    event: 'attackRoll',
    attackRange: 'melee',
    naturalMin: '19',
    formula: '1d10 + @abilities.con.mod',
  }
  const strike = {
    ...emptyBehaviorRule('bonusDamage'),
    label: 'Death Stance: Necrotic Strike',
    event: 'damage',
    attackRange: 'melee',
    ask: true,
    formula: '1d10',
    damageType: 'necrotic',
    selfCost: 'same',
  }
  return { ...emptyBehavior('toggle'), rules: [heal, strike] }
}
