// Chat cards and prompts for the generated Foundry macros (feature behaviors
// and script recipes): one shared runtime, pasted into each macro, so every
// automation step reads the same way at the table.
//
// Cards: a feature's step-by-step report in chat - its name and icon, a line
// of flavor text, then what the automation did ("Spent 3 Darkness, 2 left",
// "Regains 9 HP"), with its dice. Colored by the feature (CARD_COLORS).
//
// Prompts: "use it?" goes to the player who owns the creature, wherever the
// macro runs. Rules inside someone else's attack (I'm about to drop to 0) run
// on the attacker's client - usually the GM's - so the dialog is sent with
// Foundry's user queries (DialogV2.query's "dialog" query; QUERY_USER is a
// player permission by default). Nobody to ask, or no answer in two minutes,
// counts as no.

// Accent colors, by the feature's look (behavior toggle visuals share these keys).
export const CARD_COLORS = {
  necrotic: '#c4102f',
  radiant: '#e8a400',
  fire: '#ff5a00',
  frost: '#1aa6e8',
  arcane: '#9b30ff',
  nature: '#1fb24a',
  shadow: '#7a2cff',
}
export const DEFAULT_CARD_COLOR = CARD_COLORS.shadow

export const CARD_COLOR_OPTIONS = [
  ['shadow', 'Shadow (violet)'],
  ['necrotic', 'Necrotic (blood red)'],
  ['radiant', 'Radiant (gold)'],
  ['fire', 'Fire (orange)'],
  ['frost', 'Frost (ice blue)'],
  ['arcane', 'Arcane (purple)'],
  ['nature', 'Nature (green)'],
]

// A color key or a #rrggbb.
export function cardColor(value) {
  const v = String(value ?? '').trim()
  if (/^#[0-9a-f]{6}$/i.test(v)) return v
  return CARD_COLORS[v] ?? DEFAULT_CARD_COLOR
}

// The runtime itself. Expects `foundry`, `game`, `ChatMessage` in scope (any
// midi macro has them). Defines:
//   chrabEsc(text)                       HTML-escaped text
//   chrabCardHtml(card, extraHtml)       a card's HTML: { title, img, color, flavor, steps: [html] }
//   chrabPost(card, actor)               posts it, rendering card.rolls (dice show for 3D dice too)
//   chrabDecider(actor)                  the user who answers for that creature
//   chrabDialog(actor, type, config)     DialogV2 confirm / input / prompt, on the decider's screen
//   chrabConfirm(actor, card, question)  yes / no with the card as context
export const CHAT_RUNTIME = `// --- Chrab Corner chat cards and prompts (shared runtime).
const chrabEsc = (s) => (foundry.utils?.escapeHTML ? foundry.utils.escapeHTML(String(s ?? "")) : String(s ?? ""));
function chrabCardHtml(card, extra = "") {
  const color = /^#[0-9a-f]{6}$/i.test(card.color ?? "") ? card.color : "${DEFAULT_CARD_COLOR}";
  const steps = (card.steps ?? []).filter(Boolean);
  return '<div class="chrab-card" style="border:1px solid ' + color + ';border-left:5px solid ' + color + ';border-radius:4px;padding:4px 8px;background:' + color + '1a">' +
    '<div style="display:flex;align-items:center;gap:6px;font-weight:700;color:' + color + '">' +
    (card.img ? '<img src="' + chrabEsc(card.img) + '" width="26" height="26" style="border:0;flex:none">' : "") +
    "<span>" + chrabEsc(card.title) + "</span></div>" +
    (card.flavor ? '<p style="margin:4px 0;font-style:italic">' + chrabEsc(card.flavor) + "</p>" : "") +
    (steps.length ? '<ul style="margin:4px 0;padding-left:18px">' + steps.map((s) => "<li>" + s + "</li>").join("") + "</ul>" : "") +
    extra + "</div>";
}
async function chrabPost(card, who) {
  const rolls = (card.rolls ?? []).filter(Boolean);
  let dice = "";
  for (const r of rolls) dice += r.render ? await r.render() : "";
  return ChatMessage.implementation.create({ speaker: ChatMessage.getSpeaker({ actor: who }), content: chrabCardHtml(card, dice), rolls });
}
function chrabDecider(who) {
  const users = game.users ? [...game.users] : [];
  if (!users.length) return null;
  const owners = users.filter((u) => u.active && !u.isGM && who?.testUserPermission?.(u, "OWNER"));
  return owners.find((u) => u.character?.id === who?.id) ?? owners[0] ?? game.users.activeGM ?? users.find((u) => u.active && u.isGM) ?? null;
}
async function chrabDialog(who, type, config) {
  const D = foundry.applications?.api?.DialogV2;
  if (!D) return type === "confirm" ? true : null;
  const full = { rejectClose: false, modal: true, ...config };
  const user = chrabDecider(who);
  const self = !user || user.isSelf || user.id === game.user?.id;
  if (self || !user.query || !game.user?.hasPermission?.("QUERY_USER")) return D[type](full);
  try {
    return await user.query("dialog", { type, config: full }, { timeout: 120000 });
  } catch (err) {
    console.warn("chrab-sync | no answer from " + user.name + ", so no", err);
    return type === "confirm" ? false : null;
  }
}
async function chrabConfirm(who, card, question) {
  return !!(await chrabDialog(who, "confirm", {
    window: { title: card.title },
    content: chrabCardHtml(card) + "<p><strong>" + question + "</strong></p>",
    yes: { label: "Use it" },
    no: { label: "Not now" },
  }));
}
`
