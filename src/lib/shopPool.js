// Roll logic for the rotating shop generator.
//
// The pool is compiled offline from a local 5etools release - see
// scripts/5etools-items/README.md - and is plain data:
//
//   { key, name, source, rarity, attunement, text }
//
// Everything here is pure; pass `rng` to get reproducible output, the same way
// src/lib/nameSchemes.js does.

/** Rarities a shop can stock, weakest first. Also the display order. */
export const RARITIES = ['uncommon', 'rare', 'very rare', 'legendary']

// Sources kept by the extract script. Every other book in the corpus is a
// campaign setting or an adventure set in one, and its items name places that
// don't exist in this campaign. Labels are shown next to the roller's
// checkboxes.
export const SOURCE_LABELS = {
  XDMG: "Dungeon Master's Guide (2024)",
  TCE: "Tasha's Cauldron of Everything",
  BMT: 'The Book of Many Things',
  BGG: 'Bigby Presents: Glory of the Giants',
  FTD: "Fizban's Treasury of Dragons",
  XGE: "Xanathar's Guide to Everything",
  MTF: "Mordenkainen's Tome of Foes",
}

export const SETTING_NEUTRAL_SOURCES = Object.keys(SOURCE_LABELS)

/** What a brand-new shop rolls: five of each rarity, from everything available. */
export const DEFAULT_SPEC = {
  sources: SETTING_NEUTRAL_SOURCES,
  counts: { uncommon: 5, rare: 5, 'very rare': 5, legendary: 5 },
  exclude: [],
}

// The 284 KB pool only ever loads on the DM's roller page - players read the
// snapshot stored on each shop_items row instead, so this never reaches them.
let cached = null
export async function loadPool() {
  if (!cached) cached = (await import('../data/shop-items/pool.json')).default
  return cached
}

/** Fisher-Yates over a copy, so the caller's array is left alone. */
function shuffled(arr, rng) {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Roll a shop's stock: `spec.counts[rarity]` items of each rarity, drawn from
 * the items whose source is allowed and whose key isn't excluded.
 *
 * Each rarity is a shuffled deck rather than a fresh random pick. An item that
 * comes up goes to that rarity's discard pile in `history` and cannot be drawn
 * again until every other item of the same rarity has been dealt; then the deck
 * reshuffles. So with 94 uncommon items and five per restock, an uncommon item
 * won't reappear for roughly eighteen restocks.
 *
 * Returns `{ items, shortfalls, history, cycles }` - `history` is the discard
 * pile to persist, and `cycles` names the rarities whose deck ran out and was
 * reshuffled during this roll.
 *
 * A rarity with fewer items than requested in total yields what exists and
 * reports the gap, rather than looping forever looking for items that aren't
 * there.
 */
export function rollStock(pool, spec = DEFAULT_SPEC, { rng = Math.random, history = {}, avoid = [] } = {}) {
  const sources = new Set(spec.sources ?? SETTING_NEUTRAL_SOURCES)
  const excluded = new Set(spec.exclude ?? [])
  const counts = spec.counts ?? DEFAULT_SPEC.counts
  // Keys already on the shelf. Topping a shop up must not deal something it is
  // currently stocking, and that can't be left to the discard pile alone: the
  // pile is cleared when a deck reshuffles, while the shelf is not.
  const onShelf = new Set(avoid)

  const eligible = pool.filter(
    (it) => sources.has(it.source) && !excluded.has(it.key) && !onShelf.has(it.key)
  )

  const items = []
  const shortfalls = []
  const cycles = []
  const nextHistory = {}

  for (const rarity of RARITIES) {
    const candidates = eligible.filter((it) => it.rarity === rarity)
    const dealt = history[rarity] ?? []
    const want = Number(counts[rarity]) || 0
    if (want <= 0) {
      // Keep the discard pile for a rarity this roll skipped, so turning it
      // back on later resumes the cycle instead of restarting it.
      nextHistory[rarity] = dealt
      continue
    }

    const discard = new Set(dealt)
    let picked = shuffled(candidates.filter((it) => !discard.has(it.key)), rng).slice(0, want)
    nextHistory[rarity] = [...dealt, ...picked.map((it) => it.key)]

    if (picked.length < want) {
      // The deck ran out mid-deal. Whatever was left finishes the old cycle;
      // the shortfall is dealt from a reshuffle of everything except what this
      // same roll just took, so one shop never lists a duplicate.
      const taken = new Set(picked.map((it) => it.key))
      const reshuffled = shuffled(candidates.filter((it) => !taken.has(it.key)), rng)
      const topUp = reshuffled.slice(0, want - picked.length)
      picked = [...picked, ...topUp]
      // The new cycle's discard pile starts with only the cards dealt from it.
      nextHistory[rarity] = topUp.map((it) => it.key)
      if (candidates.length > 0) cycles.push(rarity)
    }

    if (picked.length < want) shortfalls.push({ rarity, want, got: picked.length })
    items.push(...picked)
  }

  return { items, shortfalls, history: nextHistory, cycles }
}

/**
 * How many slots each rarity is short of what `spec` asks for, given what is
 * currently on the shelf. Only rolled rows count towards the quota - a homebrew
 * item the DM added by hand is a bonus, not one of the five uncommons.
 *
 * Gaps appear when an item is removed: sold in character, or sent to the
 * never-stock list. Filling them is deliberately separate from a restock, so
 * plugging one hole doesn't reroll the other nineteen items.
 */
export function missingCounts(stock = [], spec = DEFAULT_SPEC) {
  const counts = spec.counts ?? DEFAULT_SPEC.counts
  const have = {}
  for (const row of stock) {
    if (row.origin !== '5etools') continue
    have[row.rarity] = (have[row.rarity] ?? 0) + 1
  }
  const missing = {}
  for (const rarity of RARITIES) {
    missing[rarity] = Math.max(0, (Number(counts[rarity]) || 0) - (have[rarity] ?? 0))
  }
  return missing
}

/** Total across all rarities, for enabling the fill button and labelling it. */
export const totalMissing = (missing) => Object.values(missing).reduce((sum, n) => sum + n, 0)

/** How far through its deck each rarity is, for showing cycle progress. */
export function cycleProgress(pool, spec = DEFAULT_SPEC, history = {}) {
  const sources = new Set(spec.sources ?? SETTING_NEUTRAL_SOURCES)
  const excluded = new Set(spec.exclude ?? [])
  return RARITIES.map((rarity) => {
    const total = pool.filter(
      (it) => it.rarity === rarity && sources.has(it.source) && !excluded.has(it.key)
    ).length
    const keys = new Set(history[rarity] ?? [])
    return { rarity, drawn: Math.min(keys.size, total), total }
  })
}

/** A rolled pool record as a shop_items row. `position` fixes the display order. */
export function toStockRow(item, shopId, position) {
  return {
    shop_id: shopId,
    position,
    name: item.name,
    rarity: item.rarity,
    source: item.source,
    // shop_items.attunement is text, but the pool stores an unconditional
    // requirement as boolean `true`. Stringify it here rather than relying on
    // Postgres to coerce a JSON boolean into a text column.
    attunement: item.attunement === true ? 'true' : item.attunement,
    description: item.text,
    origin: '5etools',
    item_key: item.key,
  }
}

const RARITY_ORDER = Object.fromEntries(RARITIES.map((rarity, i) => [rarity, i]))

/**
 * Shelf order: weakest rarity first, alphabetical within a rarity, anything
 * unrated (hand-typed items with no rarity set) last. Used after every change
 * to the stock so topping a shop up doesn't leave the new items stranded at the
 * bottom of the list.
 */
export function sortStock(rows = []) {
  return [...rows].sort((a, b) => {
    const ra = RARITY_ORDER[a.rarity] ?? RARITIES.length
    const rb = RARITY_ORDER[b.rarity] ?? RARITIES.length
    if (ra !== rb) return ra - rb
    return (a.name ?? '').localeCompare(b.name ?? '')
  })
}

/** Turn a name into the slug its player-facing URL uses. */
export const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/** "requires attunement by a druid" -> "Requires attunement by a druid" */
export const attunementLabel = (attunement) =>
  !attunement
    ? null
    : attunement === true || attunement === 'true'
      ? 'Requires attunement'
      : `Requires attunement ${String(attunement).replace(/^requires attunement\s*/i, '')}`.trim()
