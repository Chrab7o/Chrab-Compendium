// Summon placement, for everyone (players summon too). dnd5e 5.3 lets a
// summons go anywhere on the scene and adds a new token every time; this wraps
// SummonActivity#getPlacement so that:
//   - a blue ring shows the activity's range around the summoner while placing,
//     and a spot outside it is refused and asked again (right-click still skips);
//   - a summon the Compendium marks "one at a time" (flags.chrab-sync.singleSummon,
//     activity ids - lib/foundryActorBuilder.js) moves the creature it already has
//     on the scene to the new spot instead of adding another. Same token, same HP
//     and facing; at 0 HP it comes back at full.
// The handlers on dnd5e's TokenPlacement are private, so the wrap re-runs the
// stock placement until the spot is in range. midi's summon subclass falls back
// to this same method (super.getPlacement) when nothing is pre-placed.

import { MODULE_ID } from './constants.mjs'

const BLUE = 0x2f7bff

// A range in scene units; 0 = no limit (self, any, special). Same as
// chrabRange in the site's src/lib/foundryAutomation.js.
function sceneRange(range) {
  const units = CONFIG.DND5E?.movementUnits ?? {}
  const feet = (u) => units[u]?.conversion ?? { ft: 1, mi: 5280, m: 10 / 3, km: 10000 / 3 }[u]
  let ft = 0
  if (range?.units === 'touch') ft = Number(range.reach) || 5
  else if (feet(range?.units)) ft = (Number(range.value) || 0) * feet(range.units)
  return ft / (feet(canvas?.scene?.grid?.units) || 1)
}

// The tokens on this scene that this activity's item already summoned, of the
// actor being summoned now. dnd5e writes flags.dnd5e.summon.origin (the item
// uuid) onto every summons, linked or not.
function alreadyOut(activity, token) {
  const single = activity.item?.getFlag(MODULE_ID, 'singleSummon') ?? []
  if (!single.includes(activity.id)) return []
  const actorId = token.parent?.id
  return (canvas.scene?.tokens ?? []).filter(
    (t) => t.actorId === actorId && t.actor?.getFlag('dnd5e', 'summon.origin') === activity.item.uuid,
  )
}

async function placeInRange(activity, place, token, profile, options) {
  const origin = activity.getUsageToken()?.object
  const range = sceneRange(activity.range)
  if (!origin || !(range > 0)) return place.call(activity, token, profile, options)

  const from = origin.center
  const unit = canvas.scene?.grid?.units || 'ft'
  const { size, distance } = canvas.dimensions
  // Range counts to the summons' near side, like the site's chrabPickTargets.
  const far = (p) => {
    const center = { x: p.x + (token.width * size) / 2, y: p.y + (token.height * size) / 2 }
    return canvas.grid.measurePath([from, center]).distance - ((Math.max(token.width, token.height) - 1) * distance) / 2
  }

  let ring = null
  try {
    ring = new PIXI.Graphics()
    ring.lineStyle(4, BLUE, 0.9).beginFill(BLUE, 0.12).drawCircle(from.x, from.y, (range / distance) * size).endFill()
    ;(canvas.interface ?? canvas.stage).addChild(ring)
  } catch (err) {
    console.warn(`${MODULE_ID} | summon range ring`, err)
  }
  try {
    ui.notifications.info(`${activity.item.name}: place it within ${Math.round(range)} ${unit}. Right-click skips.`)
    for (;;) {
      const placements = await place.call(activity, token, profile, options)
      const out = placements.find((p) => far(p) > range + 0.01)
      if (!out) return placements
      ui.notifications.warn(`${activity.item.name}: that's ${Math.round(far(out))} ${unit} away, out of range (${Math.round(range)} ${unit}). Pick again.`)
    }
  } finally {
    ring?.destroy()
  }
}

// Teleports a summons already out to a placement (top-left x, y). midi moves it
// through the GM, so it works whoever owns the token.
async function moveOut(doc, placement) {
  const { size } = canvas.dimensions
  const center = { x: placement.x + (doc.width * size) / 2, y: placement.y + (doc.height * size) / 2 }
  if (globalThis.MidiQOL?.moveToken) await MidiQOL.moveToken(doc, center, { teleport: true, autoRotate: false })
  else if (doc.isOwner) await doc.update({ x: placement.x, y: placement.y }, { animate: false })
  if (doc.isOwner && doc.rotation !== placement.rotation) await doc.update({ rotation: placement.rotation })
  const hp = doc.actor?.system?.attributes?.hp
  if (hp && hp.value <= 0 && doc.actor.isOwner) await doc.actor.update({ 'system.attributes.hp.value': hp.max })
}

export function setupSummons() {
  const Summon = globalThis.dnd5e?.documents?.activity?.SummonActivity
  if (!Summon?.prototype?.getPlacement) return console.warn(`${MODULE_ID} | dnd5e SummonActivity not found; summon range is off`)
  const place = Summon.prototype.getPlacement
  Summon.prototype.getPlacement = async function (token, profile, options) {
    const out = alreadyOut(this, token)
    // The preview starts facing the way the one already out does.
    if (out.length) token = token.clone({ rotation: out[0].rotation })
    const placements = await placeInRange(this, place, token, profile, options)
    if (!out.length) return placements
    // The first spots move the ones already out; any left over are new.
    for (const [i, doc] of out.entries()) if (placements[i]) await moveOut(doc, placements[i])
    if (placements.length) ui.notifications.info(`${this.item.name}: ${out[0].name} moves to the new spot.`)
    return placements.slice(out.length)
  }
}
