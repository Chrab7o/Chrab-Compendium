// Pure helpers for the Story Engine board (see the story_engine migration).
// Nothing in here touches Supabase.

export const SPHERE_RADIUS = 22

// Links are undirected and stored once, in canonical order (a < b). Postgres
// compares uuids byte-wise, which matches comparing their lowercase hex
// strings, so the same ordering works on both sides.
export function orderPair(id1, id2) {
  return id1 < id2 ? [id1, id2] : [id2, id1]
}

export const linkKey = (id1, id2) => orderPair(id1, id2).join('|')

/** Map of sphere id -> Set of linked sphere ids. */
export function adjacency(links) {
  const map = new Map()
  for (const { a, b } of links) {
    if (!map.has(a)) map.set(a, new Set())
    if (!map.has(b)) map.set(b, new Set())
    map.get(a).add(b)
    map.get(b).add(a)
  }
  return map
}

export function nearestSphere(spheres, point) {
  let best = null
  let bestDist = Infinity
  for (const s of spheres) {
    const d = Math.hypot(s.x - point.x, s.y - point.y)
    if (d < bestDist) {
      best = s
      bestDist = d
    }
  }
  return best
}

/**
 * Board positions for `count` new spheres. They land in a loose ring around
 * `anchor` (roughly `distance` away), and each one is nudged until it keeps
 * `minSpacing` from everything already on the board - including the ones
 * placed earlier in the same batch.
 */
export function placeNear(anchor, count, occupied, { distance = 150, minSpacing = 80, rng = Math.random } = {}) {
  const taken = occupied.map((p) => ({ x: p.x, y: p.y }))
  const out = []
  const startAngle = rng() * Math.PI * 2
  for (let i = 0; i < count; i++) {
    let best = null
    let bestClearance = -Infinity
    for (let attempt = 0; attempt < 40; attempt++) {
      // Widen the ring as attempts fail, so a crowded spot still resolves.
      const ring = distance * (1 + Math.floor(attempt / 10) * 0.6)
      const angle = startAngle + (i / Math.max(count, 1)) * Math.PI * 2 + (attempt ? (rng() - 0.5) * 1.6 : 0)
      const r = ring * (0.85 + rng() * 0.3)
      const candidate = { x: anchor.x + Math.cos(angle) * r, y: anchor.y + Math.sin(angle) * r }
      const clearance = taken.reduce((min, p) => Math.min(min, Math.hypot(p.x - candidate.x, p.y - candidate.y)), Infinity)
      if (clearance >= minSpacing) {
        best = candidate
        break
      }
      if (clearance > bestClearance) {
        best = candidate
        bestClearance = clearance
      }
    }
    const placed = { x: Math.round(best.x), y: Math.round(best.y) }
    taken.push(placed)
    out.push(placed)
  }
  return out
}

export function centroid(points) {
  if (!points.length) return { x: 0, y: 0 }
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 })
  return { x: sum.x / points.length, y: sum.y / points.length }
}

const normalize = (name) => name.trim().toLowerCase()

/**
 * Up to `count` names from a curated pool, drawn without repeats. Names in
 * `exclude` (already on the board, or already in the draft) are skipped, so
 * a pool runs out rather than handing back a duplicate - the caller reports
 * the shortfall.
 */
export function drawFromPool(names, count, exclude = [], rng = Math.random) {
  const skip = new Set(exclude.map(normalize))
  const seen = new Set()
  const available = []
  for (const raw of names) {
    const name = raw.trim()
    const key = normalize(name)
    if (!name || skip.has(key) || seen.has(key)) continue
    seen.add(key)
    available.push(name)
  }
  for (let i = available.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[available[i], available[j]] = [available[j], available[i]]
  }
  return available.slice(0, count)
}

/** One-name-per-line text <-> a clean array, for the pool editor. */
export function parsePoolText(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

/** Resolve what was typed in the tag field to a tag value, by value or label. */
export function resolveTag(input, tags) {
  const q = normalize(input ?? '')
  if (!q) return { value: null }
  const match = tags.find((t) => t.value === q || t.label.toLowerCase() === q)
  return match ? { value: match.value } : { error: `"${input.trim()}" is not one of the story tags.` }
}
