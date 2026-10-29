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

import { CHAT_RUNTIME, cardColor } from './foundryChat.js'

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

// Feature Forge recipes report in a flavored chat card (foundryChat.js):
// `card` starts with the item's name, icon and flavor line; steps are added
// as the script goes, and chrabPost(card, actor) sends it.
const CARD_PARAMS = { flavor: '', color: '' }
const cardStart = (p) =>
  `${CHAT_RUNTIME}const card = { title: item.name, img: item.img, color: ${js(cardColor(p.color))}, flavor: ${js(String(p.flavor ?? '').trim())}, steps: [], rolls: [] };\n`

// One click on the map (the teleport and launch recipes). Capture phase, like
// the picker below: a token the user controls (any token, for a GM) takes the
// click and stops it, so a plain stage listener never hears a click on a
// creature. Resolves to { point } on a left-click, null on a right-click
// or Esc.
export const CLICK_RUNTIME = `function chrabClickPoint() {
  return new Promise((resolve) => {
    const stage = canvas.stage;
    const finish = (value) => {
      stage.removeEventListener("pointerdown", onDown, { capture: true });
      globalThis.document?.removeEventListener("keydown", onKey, true);
      resolve(value);
    };
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      event.preventDefault();
      finish(null);
    };
    const onDown = (event) => {
      event.stopPropagation();
      finish(event.button === 0 ? { point: event.getLocalPosition(stage) } : null);
    };
    stage.addEventListener("pointerdown", onDown, { capture: true });
    globalThis.document?.addEventListener("keydown", onKey, true);
  });
}
`

// Picking creatures on the map, shared by the missiles recipe and the
// Automation Builder's "Pick targets on the map" line. A blue ring shows the
// reach on the picker's screen only. Left-click picks a creature (again: one
// more on it when picks stack, else unpicks it), shift-click puts all the
// rest on it, right-click takes one back, Enter finishes early, Esc cancels.
// Resolves to a Map of token -> times picked, or null when cancelled. range
// is in the scene's units: chrabRange turns a dnd5e range into them.
export const PICK_RUNTIME = `// A dnd5e range ({ value, units }, e.g. a spell's or an activity's) in the scene's grid units.
// Touch is the reach (5 ft); self, any, special or none is 0: no limit, no ring.
function chrabRange(range) {
  const units = CONFIG.DND5E?.movementUnits ?? {};
  const feet = (u) => units[u]?.conversion ?? { ft: 1, mi: 5280, m: 10 / 3, km: 10000 / 3 }[u];
  let ft = 0;
  if (range?.units === "touch") ft = Number(range.reach) || 5;
  else if (feet(range?.units)) ft = (Number(range.value) || 0) * feet(range.units);
  return ft / (feet(canvas?.scene?.grid?.units) || 1);
}
async function chrabPickTargets(self, { range = 0, count = 1, who = "any", stack = false, title = "", what = "target" } = {}) {
  if (!self || !canvas?.ready) return null;
  const total = Math.max(1, Math.floor(Number(count) || 1));
  const from = self.center ?? self.object?.center;
  const far = (point) => canvas.grid.measurePath([from, point]).distance;
  const unit = canvas.scene?.grid?.units || "ft";
  // Range counts to a creature's near side, so a big one is reached sooner.
  const inReach = (t) => !(range > 0) || far(t.center) - ((Math.max(t.document.width, t.document.height) - 1) * canvas.dimensions.distance) / 2 <= range;
  const side = self.document?.disposition;
  const fits = (t) => (who === "allies" ? t.document?.disposition === side : who === "enemies" ? t.document?.disposition !== side : true);
  const candidates = () => canvas.tokens.placeables.filter((t) => t !== self && t.actor && t.visible !== false && fits(t));
  const kind = who === "allies" ? "ally" : who === "enemies" ? "enemy" : "creature";
  const kinds = who === "allies" ? "allies" : who === "enemies" ? "enemies" : "creatures";
  if (!candidates().some(inReach)) {
    ui.notifications.warn(title + ": no " + kind + (range > 0 ? " within " + Math.round(range) + " " + unit + "." : " to pick."));
    return null;
  }
  const picks = new Map();
  const left = () => total - [...picks.values()].reduce((sum, n) => sum + n, 0);
  const BLUE = 0x2f7bff;
  let layer = null;
  let marks = null;
  let labels = [];
  const label = (text, x, y) => {
    const t = new PIXI.Text(text, { fontFamily: "Signika", fontSize: 30, fontWeight: "bold", fill: 0xffffff, stroke: 0x0b2a80, strokeThickness: 6 });
    t.anchor.set(0.5, 1);
    t.position.set(x, y);
    layer.addChild(t);
    labels.push(t);
  };
  const draw = () => {
    if (!layer) return;
    try {
      marks.clear();
      for (const t of labels) t.destroy();
      labels = [];
      for (const [t, n] of picks) {
        marks.lineStyle(3, BLUE, 0.7).moveTo(from.x, from.y).lineTo(t.center.x, t.center.y);
        marks.lineStyle(5, BLUE, 1).drawCircle(t.center.x, t.center.y, Math.max(t.w, t.h) / 2 + 8);
        if (stack) label("×" + n, t.center.x, t.y - 6);
      }
      label(left() + " left", from.x, self.y - 6);
    } catch (err) {
      console.warn("chrab-sync | target marks", err);
    }
  };
  try {
    layer = new PIXI.Container();
    const ring = new PIXI.Graphics();
    if (range > 0) ring.lineStyle(4, BLUE, 0.9).beginFill(BLUE, 0.12).drawCircle(from.x, from.y, (range / canvas.dimensions.distance) * canvas.dimensions.size).endFill();
    marks = new PIXI.Graphics();
    layer.addChild(ring, marks);
    (canvas.interface ?? canvas.stage).addChild(layer);
  } catch (err) {
    console.warn("chrab-sync | range ring", err);
    layer = null;
  }
  draw();
  ui.notifications.info(title + ": click " + (stack ? "a " + kind + " for each of " + total + " " + what + "s" : "up to " + total + " " + (total === 1 ? kind : kinds)) + (range > 0 ? " (up to " + Math.round(range) + " " + unit + ")" : "") + "." + (stack ? " Shift-click sends the rest, right-click takes one back." : " Click again to unpick.") + " Enter finishes, Esc cancels.");
  const done = await new Promise((resolve) => {
    const stage = canvas.stage;
    const finish = (value) => {
      stage.removeEventListener("pointerdown", onDown, { capture: true });
      globalThis.document?.removeEventListener("keydown", onKey, true);
      resolve(value);
    };
    // Ahead of Foundry's own keys (it listens on window).
    const onKey = (event) => {
      if (event.key === "Escape") finish(false);
      else if (event.key === "Enter" && picks.size) finish(true);
      else return;
      event.stopPropagation();
      event.preventDefault();
    };
    // Capture phase: a token the user controls (any token, for a GM) takes
    // the click and stops it (Token#_onClickLeft), so the stage would never
    // hear it. A click on a creature is the picker's: no select, no HUD.
    const onDown = (event) => {
      const point = event.getLocalPosition(stage);
      const t = candidates().filter((c) => c.bounds?.contains(point.x, point.y)).at(-1);
      if (!t) return;
      event.stopPropagation();
      if (event.button === 2 || (!stack && event.button === 0 && picks.has(t))) {
        const n = (picks.get(t) ?? 0) - 1;
        if (n > 0) picks.set(t, n);
        else picks.delete(t);
        return draw();
      }
      if (event.button !== 0) return;
      if (!inReach(t)) return ui.notifications.warn(t.name + " is out of range (" + Math.round(far(t.center)) + " " + unit + ").");
      picks.set(t, (picks.get(t) ?? 0) + (stack && event.shiftKey ? left() : 1));
      draw();
      if (left() <= 0) finish(true);
    };
    stage.addEventListener("pointerdown", onDown, { capture: true });
    globalThis.document?.addEventListener("keydown", onKey, true);
  });
  layer?.destroy({ children: true });
  if (!done) {
    ui.notifications.info(title + ": cancelled.");
    return null;
  }
  return picks;
}
`

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
    help: 'After use, click a spot within range; your token moves there instantly. Right-click cancels. With a mark named, it first offers to warp next to the creature you marked, seen or not.',
    pass: 'postActiveEffects',
    params: { range: '30', toMark: '', ...CARD_PARAMS },
    code: (p) =>
      `${HEADER(`Teleport up to ${num(p.range, 30)} ft.`)}${cardStart(p)}${CLICK_RUNTIME}const self = token ?? actor.getActiveTokens?.()[0];
if (!self || !canvas?.ready) return;
const range = ${num(p.range, 30)};
const center = (t) => t.center ?? t.object?.center;
const from = center(self);
const far = (point) => canvas.grid.measurePath([from, point]).distance;
let point = null;
let onto = null;
const markName = ${js(String(p.toMark ?? '').trim())};
if (markName) {
  // A creature carrying this actor's mark, within range: no sight needed.
  const marked = canvas.tokens.placeables.find((t) => t !== self && t.actor?.effects?.some((e) => e.name?.startsWith(markName)
    && (e.flags?.["chrab-sync"]?.appliedBy === actor.uuid || String(e.origin ?? "").startsWith(actor.uuid))) && far(t.center) <= range + canvas.grid.distance);
  if (marked && await chrabConfirm(actor, { ...card, steps: [chrabEsc(marked.name) + " carries your " + chrabEsc(markName) + ", " + Math.round(far(marked.center)) + " ft away"] }, "Warp next to " + chrabEsc(marked.name) + "?")) {
    // The square beside it, on your side.
    const size = canvas.grid.size;
    const dx = Math.sign(from.x - marked.center.x);
    const dy = Math.sign(from.y - marked.center.y);
    point = { x: marked.center.x + (dx || 1) * size, y: marked.center.y + dy * size };
    onto = marked;
  }
}
if (!point) {
  ui.notifications.info("Click where to go (up to " + range + " ft). Right-click or Esc cancels.");
  // The reach, drawn around you while you pick (only on your screen).
  let ring = null;
  try {
    ring = new PIXI.Graphics();
    ring.lineStyle(4, 0x7a2cff, 0.9).beginFill(0x7a2cff, 0.12).drawCircle(from.x, from.y, (range / canvas.dimensions.distance) * canvas.dimensions.size).endFill();
    (canvas.interface ?? canvas.stage).addChild(ring);
  } catch (err) {
    console.warn("chrab-sync | range ring", err);
  }
  point = (await chrabClickPoint())?.point ?? null;
  ring?.destroy();
  if (!point) return;
  if (far(point) > range) return ui.notifications.warn("Too far: " + Math.round(far(point)) + " ft (up to " + range + ").");
}
const moved = Math.round(far(point));
// Facing stays as it was: no turning toward where you went.
const rotation = self.document?.rotation ?? 0;
await MidiQOL.moveToken(self, point, { teleport: true, autoRotate: false });
if ((self.document?.rotation ?? 0) !== rotation && self.document?.isOwner) await self.document.update({ rotation });
card.steps.push(chrabEsc(actor.name) + " vanishes and reappears " + (onto ? "beside " + chrabEsc(onto.name) : moved + " ft away"));
await chrabPost(card, actor);
`,
  },
  {
    id: 'launch',
    label: 'Launch yourself in a line, damage by distance',
    help: 'After use, click a creature or a spot to aim. Your token flies that way (the full distance, or only to the spot), stops against the first creature or wall in its path, and that creature takes damage per distance flown (Launch: 1d4 per 10 ft). With the range blank (your speed), it first asks whether you Dashed this turn, to fly double; an effect named Dash or Dashing on you counts without asking.',
    pass: 'postActiveEffects',
    params: { range: '', fullDistance: true, perFeet: '10', die: 'd4', damageType: 'bludgeoning', ...CARD_PARAMS },
    code: (p) =>
      `${HEADER(`Launch ${num(p.range) > 0 ? `${num(p.range)} ft.` : 'your speed'} in a line; 1${p.die || 'd4'} per ${num(p.perFeet, 10)} ft. to what it hits`)}${cardStart(p)}${CLICK_RUNTIME}const self = token ?? actor.getActiveTokens?.()[0];
if (!self || !canvas?.ready) return;
const unit = canvas.scene?.grid?.units || "ft";
// Blank range: the walking speed (Unarmored Movement and the like included).
const bySpeed = ${num(p.range) > 0 ? 'false' : 'true'};
const speed = ${num(p.range) > 0 ? num(p.range) : 'Number(actor.system?.attributes?.movement?.walk) || 0'};
if (!(speed > 0)) return ui.notifications.warn(item.name + ": no speed to launch with.");
// Dash doubles the movement this turn. dnd5e doesn't track it, so an effect
// named Dash / Dashing / Dashed on you counts, and otherwise you're asked.
const dashEffect = bySpeed && [...(actor.appliedEffects ?? actor.effects ?? [])].some((e) => !e.disabled && /^dash(ing|ed)?\\b/i.test(e.name ?? ""));
const dashed = dashEffect || (bySpeed && !!(await chrabDialog(actor, "confirm", {
  window: { title: item.name },
  content: chrabCardHtml(card) + "<p><strong>Did you Dash this turn?</strong> Then you launch double your speed (" + speed * 2 + " " + unit + " instead of " + speed + ").</p>",
  yes: { label: "Yes, I Dashed" },
  no: { label: "No" },
})));
const perFeet = ${num(p.perFeet, 10)};
const fullDistance = ${p.fullDistance === false ? 'false' : 'true'};
const center = (t) => t.center ?? t.object?.center;
const from = center(self);
const far = (point) => canvas.grid.measurePath([from, point]).distance;
const pxPerUnit = canvas.dimensions.size / canvas.dimensions.distance;
const radius = (t) => Math.max(t.w ?? 0, t.h ?? 0) / 2;
const range = dashed ? speed * 2 : speed;
ui.notifications.info(item.name + ": click a creature or a spot to launch toward (" + range + " " + unit + (dashed ? ", Dashing" : "") + (fullDistance ? ", the full distance" : "") + "). Right-click or Esc cancels.");
let ring = null;
try {
  ring = new PIXI.Graphics();
  ring.lineStyle(4, 0x2f7bff, 0.9).beginFill(0x2f7bff, 0.12).drawCircle(from.x, from.y, range * pxPerUnit).endFill();
  (canvas.interface ?? canvas.stage).addChild(ring);
} catch (err) {
  console.warn("chrab-sync | range ring", err);
}
const click = await chrabClickPoint();
ring?.destroy();
if (!click) return;
const aim = click.point;
const length = Math.hypot(aim.x - from.x, aim.y - from.y);
if (length < 1) return;
const ux = (aim.x - from.x) / length;
const uy = (aim.y - from.y) / length;
const at = (d) => ({ x: from.x + ux * d, y: from.y + uy * d });
// How far it flies (in pixels), then where it stops: against a wall, or
// against the first creature whose space the line passes through.
let stop = fullDistance ? range * pxPerUnit : Math.min(range * pxPerUnit, length);
let hitWall = false;
try {
  const wall = CONFIG.Canvas.polygonBackends.move.testCollision(from, at(stop), { type: "move", mode: "closest", source: self.document });
  if (wall) {
    stop = Math.max(0, Math.hypot(wall.x - from.x, wall.y - from.y) - radius(self));
    hitWall = true;
  }
} catch (err) {
  console.warn("chrab-sync | launch wall check", err);
}
let struck = null;
for (const t of canvas.tokens.placeables) {
  if (t === self || !t.actor || t.visible === false) continue;
  const c = center(t);
  const along = (c.x - from.x) * ux + (c.y - from.y) * uy;
  const aside = Math.abs((c.x - from.x) * uy - (c.y - from.y) * ux);
  const gap = radius(t) + radius(self);
  if (along <= 0 || aside >= gap * 0.9) continue;
  const short = Math.max(0, along - gap);
  if (short < stop) {
    stop = short;
    struck = t;
    hitWall = false;
  }
}
const point = at(stop);
const moved = Math.round(far(point));
const rotation = self.document?.rotation ?? 0;
await MidiQOL.moveToken(self, point, { ignoreTokens: true, autoRotate: false });
if ((self.document?.rotation ?? 0) !== rotation && self.document?.isOwner) await self.document.update({ rotation });
const dice = Math.floor(moved / perFeet);
card.steps.push(chrabEsc(actor.name) + (dashed ? " Dashes and" : "") + " launches " + moved + " " + unit + (struck ? " into <strong>" + chrabEsc(struck.name) + "</strong>" : hitWall ? " into a wall" : ""));
const type = ${js(p.damageType || '')} || undefined;
if ((struck || hitWall) && dice > 0) {
  const roll = await new CONFIG.Dice.DamageRoll(dice + ${js(p.die || 'd4')}, actor.getRollData(), { type }).evaluate();
  card.rolls.push(roll);
  if (struck) {
    await MidiQOL.applyTokenDamage([{ value: roll.total, type: type || "none" }], roll.total, new Set([struck]), item, new Set(), { existingDamage: [], superSavers: new Set(), semiSuperSavers: new Set(), workflow, forceApply: false });
    card.steps.push("<strong>" + chrabEsc(struck.name) + "</strong> takes " + roll.total + (type ? " " + type : "") + " damage (" + dice + ${js(p.die || 'd4')} + ")");
  } else {
    card.steps.push("The impact deals " + roll.total + (type ? " " + type : "") + " damage (" + dice + ${js(p.die || 'd4')} + ") to the wall or object");
  }
} else if (struck || hitWall) {
  card.steps.push("Not far enough to deal damage (under " + perFeet + " " + unit + ")");
}
await chrabPost(card, actor);
`,
  },
  {
    id: 'missiles',
    label: 'Missiles: pick a target for each',
    help: 'After use, a blue ring shows the range (blank: the spell’s or feature’s own) and you click a creature for each missile; click one again to stack another on it, shift-click to send it all the rest, right-click to take one back, Enter to fire what’s placed, Esc to cancel. Each creature then takes its missiles’ damage. Cast with a higher slot, a spell fires more.',
    pass: 'postActiveEffects',
    params: { count: '3', perLevel: '1', formula: '1d4 + 1', damageType: 'force', range: '', sameRoll: false, ...CARD_PARAMS },
    code: (p) =>
      `${HEADER(`${num(p.count, 3)} missiles (+${num(p.perLevel)} per slot level up), ${p.formula || '1d4 + 1'} ${p.damageType || ''} each, ${num(p.range) > 0 ? `up to ${num(p.range)} ft` : 'in its own range'}.`)}${cardStart(p)}${PICK_RUNTIME}const self = token ?? actor.getActiveTokens?.()[0];
if (!self || !canvas?.ready) return;
// Blank: the range of what was used (the activity follows its item unless overridden).
const range = ${num(p.range) > 0 ? `chrabRange({ value: ${num(p.range)}, units: "ft" })` : 'chrabRange(workflow.activity?.range ?? item.system?.range)'};
const formula = ${js(p.formula || '1d4 + 1')};
const type = ${js(p.damageType || '')} || undefined;
// dnd5e's scaling: how many slot levels above the spell's own it was cast at.
const upcast = Math.max(0, Number(workflow.chatCard?.system?.scaling ?? item.flags?.dnd5e?.scaling) || 0);
const total = Math.max(1, ${num(p.count, 3)} + ${num(p.perLevel)} * upcast);
const picks = await chrabPickTargets(self, { range, count: total, stack: true, title: item.name, what: "missile" });
if (!picks) return;
const fired = [...picks.values()].reduce((sum, n) => sum + n, 0);
card.steps.push(chrabEsc(actor.name) + " looses " + fired + (fired === 1 ? " missile" : " missiles"));
// One roll per creature: its missiles' dice and bonuses together (1d6 + 1 x3 = 3d6 + 3).
// With "roll once", a single roll sets every missile's damage.
const roll = async (n) => new CONFIG.Dice.DamageRoll(formula, actor.getRollData(), { type }).alter(n, 0, { multiplyNumeric: true }).evaluate();
const shared = ${p.sameRoll ? 'await roll(1)' : 'null'};
if (shared) card.rolls.push(shared);
for (const [t, n] of picks) {
  let dealt = shared ? shared.total * n : 0;
  if (!shared) {
    const r = await roll(n);
    card.rolls.push(r);
    dealt = r.total;
  }
  await MidiQOL.applyTokenDamage([{ value: dealt, type: type || "none" }], dealt, new Set([t]), item, new Set(), { existingDamage: [], superSavers: new Set(), semiSuperSavers: new Set(), workflow, forceApply: false });
  card.steps.push("<strong>" + chrabEsc(t.name) + "</strong>: " + n + (n === 1 ? " missile, " : " missiles, ") + dealt + (type ? " " + type : "") + " damage");
}
await chrabPost(card, actor);
`,
  },
  {
    id: 'takeHit',
    label: 'Take a creature’s damage instead',
    help: 'After use, asks how much damage the target took: they regain that much and you take it instead.',
    pass: 'postActiveEffects',
    params: { damageType: '', ...CARD_PARAMS },
    code: (p) =>
      `${HEADER('Take the target’s damage instead')}${cardStart(p)}const target = workflow.targets.first();
if (!target?.actor) return ui.notifications.warn("Target the creature whose damage you take first.");
const answer = await chrabDialog(actor, "input", {
  window: { title: item.name },
  content: chrabCardHtml(card) + "<p><strong>How much damage did " + chrabEsc(target.name) + " take?</strong> You take it instead.</p><input type=\\"number\\" name=\\"amount\\" min=\\"1\\" autofocus>",
  ok: { label: "Take it" },
});
const amount = Math.floor(Number(answer?.amount) || 0);
if (amount <= 0) return;
const hp = target.actor.system.attributes.hp;
await MidiQOL.socket().executeAsGM("updateActor", { actorUuid: target.actor.uuid, updates: { "system.attributes.hp.value": Math.min(hp.max, hp.value + amount) } });
await actor.applyDamage([${p.damageType ? `{ value: amount, type: ${js(p.damageType)} }` : '{ value: amount }'}]);
card.steps.push(chrabEsc(target.name) + " regains " + amount + " HP", "<strong>" + chrabEsc(actor.name) + " takes " + amount + " damage in their place</strong>");
await chrabPost(card, actor);
`,
  },
  {
    id: 'sacrifice',
    label: 'Hurt yourself, allies gain temp HP',
    help: 'Rolls damage to yourself; each ally within range gains temporary hit points equal to it (not stacking).',
    pass: 'postActiveEffects',
    params: { formula: '3d10', damageType: 'necrotic', range: '30', ...CARD_PARAMS },
    code: (p) =>
      `${HEADER(`Take ${p.formula || '3d10'}; allies within ${num(p.range, 30)} ft. gain that much temp HP`)}${cardStart(p)}const self = token ?? actor.getActiveTokens?.()[0];
const roll = await new CONFIG.Dice.DamageRoll(${js(p.formula || '3d10')}, actor.getRollData(), { type: ${p.damageType ? js(p.damageType) : 'undefined'} }).evaluate();
card.rolls.push(roll);
const amount = roll.total;
await actor.applyDamage([${p.damageType ? `{ value: amount, type: ${js(p.damageType)} }` : '{ value: amount }'}], { ignore: true });
card.steps.push("<strong>" + chrabEsc(actor.name) + " takes " + amount + ${js(p.damageType ? ` ${p.damageType}` : '')} + " damage</strong>");
const range = ${num(p.range, 30)};
const allies = !self || !canvas?.ready ? [] : canvas.tokens.placeables.filter((t) => t !== self && t.actor && t.document.disposition === self.document.disposition
  && canvas.grid.measurePath([self.center, t.center]).distance <= range);
for (const ally of allies) {
  const temp = Number(ally.actor.system.attributes.hp.temp) || 0;
  if (amount <= temp) {
    card.steps.push(chrabEsc(ally.name) + " already has " + temp + " temporary HP");
    continue;
  }
  await MidiQOL.socket().executeAsGM("updateActor", { actorUuid: ally.actor.uuid, updates: { "system.attributes.hp.temp": amount } });
  card.steps.push(chrabEsc(ally.name) + " gains " + amount + " temporary HP");
}
if (!allies.length) card.steps.push("No allies within " + range + " ft");
await chrabPost(card, actor);
`,
  },
  {
    id: 'announce',
    label: 'Announce it in chat',
    help: 'Posts the feature’s card with its flavor and what it lets you do, for features the table resolves (Soul Surge: take another action).',
    pass: 'postActiveEffects',
    params: { text: '', ...CARD_PARAMS },
    code: (p) =>
      `${HEADER('Announce in chat')}${cardStart(p)}card.steps.push(${js(String(p.text ?? '').trim())}.replace(/@actor/g, chrabEsc(actor.name)));
await chrabPost(card, actor);
`,
  },
  {
    id: 'weaponWave',
    label: 'Weapon attack against everyone in the area',
    help: 'After the area is placed, asks which melee weapon (if you carry more than one) and attacks every creature caught in it with one attack roll against each AC, adding extra damage to each hit (Death Wave).',
    pass: 'postActiveEffects',
    params: { extra: '1d8', ...CARD_PARAMS },
    code: (p) =>
      `${HEADER(`One weapon attack against every creature in the area, +${p.extra || 0} damage`)}${cardStart(p)}const self = token ?? actor.getActiveTokens?.()[0];
const targets = [...(workflow.targets ?? [])].filter((t) => t.actor && t !== self && t.document?.uuid !== self?.document?.uuid);
if (!targets.length) {
  card.steps.push("No creatures caught in it");
  return chrabPost(card, actor);
}
const meleeAttack = (w) => [...(w.system?.activities ?? [])].find((a) => a.type === "attack" && a.attack?.type?.value === "melee");
const weapons = actor.items.filter((i) => i.type === "weapon" && i.system?.equipped !== false && meleeAttack(i));
if (!weapons.length) return ui.notifications.warn(item.name + ": equip a melee weapon first.");
let weapon = weapons[0];
if (weapons.length > 1) {
  const picked = await chrabDialog(actor, "input", {
    window: { title: item.name },
    content: chrabCardHtml(card) + "<p><strong>Which weapon?</strong></p><select name=\\"weapon\\">" + weapons.map((w) => '<option value="' + w.id + '">' + chrabEsc(w.name) + "</option>").join("") + "</select>",
    ok: { label: "Strike" },
  });
  weapon = weapons.find((w) => w.id === picked?.weapon);
  if (!weapon) return;
}
const extra = ${js(String(p.extra ?? '').trim())};
card.steps.push(chrabEsc(actor.name) + " channels " + chrabEsc(weapon.name) + " into the wave", "Strikes " + targets.map((t) => chrabEsc(t.name)).join(", ") + ": one attack roll against each AC" + (extra ? ", +" + chrabEsc(extra) + " damage on each hit" : ""));
await chrabPost(card, actor);
// The extra dice ride on a short-lived bonus to melee weapon damage.
const bonus = extra
  ? (await actor.createEmbeddedDocuments("ActiveEffect", [{ name: item.name, img: item.img, origin: item.uuid, transfer: false,
      system: { changes: [{ key: "system.bonuses.mwak.damage", value: extra, type: "add", phase: "initial" }] } }]))[0]
  : null;
try {
  await MidiQOL.completeActivityUse(meleeAttack(weapon), { midiOptions: { targetUuids: targets.map((t) => t.document.uuid) } }, {}, {});
} finally {
  await bonus?.delete();
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
// A behavior hook's "ActivityMacro.<id>" reads the same way.
export function parseOnUseMacros(value) {
  const out = {}
  for (const part of String(value ?? '').split(',')) {
    const m = part.trim().match(/^\[(\w+)\]ActivityMacro[-.](\w+)$/)
    if (m) out[m[2]] = m[1]
  }
  return out
}
