// Pure helpers for the Sphere Grid (see the sphere_grid migration).
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

// Vivid fallbacks for Type tags that have no color of their own, picked by a
// stable hash so a tag keeps the same color across grids and reloads.
const FALLBACK_COLORS = [
  '#a3172e', '#1f5fa8', '#2f6b3a', '#b5651d', '#7c2d92', '#0f766e',
  '#be185d', '#8a5a12', '#4d7d14', '#c2410c', '#0e7490', '#5b2a86',
]

function hashColor(value) {
  let h = 0
  for (let i = 0; i < value.length; i++) h = (Math.imul(h, 31) + value.charCodeAt(i)) | 0
  return FALLBACK_COLORS[Math.abs(h) % FALLBACK_COLORS.length]
}

/**
 * What a sphere is colored by: its Type tag (the wiki's exclusive "kind"
 * group), falling back to the first tag it carries. Returns the tag row and
 * a color, or nulls for an untagged entry.
 */
export function sphereKind(entryTags, tags, typeGroupId) {
  const owned = entryTags ?? []
  if (!owned.length) return { tag: null, color: null }
  const byValue = new Map(tags.map((t) => [t.value, t]))
  const typeValue = owned.find((v) => byValue.get(v)?.group_id === typeGroupId)
  const value = typeValue ?? owned[0]
  const tag = byValue.get(value) ?? { value, label: value }
  return { tag, color: tag.color || hashColor(value) }
}

// --- Guided prompts --------------------------------------------------------
// Answers are written into an entry's markdown as `**Label:** answer` lines,
// and a prompt counts as answered when its line is there. See the
// sphere_prompts migration.

// --- Kinds -----------------------------------------------------------------
// Kinds nest (Location > Cave / Dungeon) through parent_id alone; everything
// inherited is worked out here by walking up the chain.

/** [kind, parent, grandparent, ...] - stops on a missing parent or a cycle. */
export function kindChain(kinds, kindId) {
  const byId = new Map(kinds.map((k) => [k.id, k]))
  const chain = []
  const seen = new Set()
  let current = byId.get(kindId)
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    chain.push(current)
    current = byId.get(current.parent_id)
  }
  return chain
}

/** "Location › Cave / Dungeon" */
export const kindPath = (kinds, kindId) =>
  kindChain(kinds, kindId)
    .reverse()
    .map((k) => k.label)
    .join(' › ')

/** The wiki tag a kind adds: its own, else the nearest ancestor's. */
export const kindTag = (kinds, kindId) => kindChain(kinds, kindId).find((k) => k.tag)?.tag ?? null

/** Kinds in tree order with their depth, for indented pickers and lists. */
export function kindTree(kinds) {
  const children = new Map()
  for (const k of kinds) {
    const key = k.parent_id && kinds.some((p) => p.id === k.parent_id) ? k.parent_id : null
    if (!children.has(key)) children.set(key, [])
    children.get(key).push(k)
  }
  const out = []
  const visit = (parentId, depth, seen) => {
    const list = (children.get(parentId) ?? []).sort(
      (a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label)
    )
    for (const k of list) {
      if (seen.has(k.id)) continue
      out.push({ kind: k, depth })
      visit(k.id, depth + 1, new Set([...seen, k.id]))
    }
  }
  visit(null, 0, new Set())
  return out
}

/** Every id at or below `kindId` - a kind can't be moved under one of these. */
export function kindDescendants(kinds, kindId) {
  const out = new Set([kindId])
  let grew = true
  while (grew) {
    grew = false
    for (const k of kinds) {
      if (k.parent_id && out.has(k.parent_id) && !out.has(k.id)) {
        out.add(k.id)
        grew = true
      }
    }
  }
  return out
}

/**
 * The questions a kind asks, grouped by the kind each one comes from (root
 * first, the kind's own last). A question switched off on the kind or any
 * kind between it and the question's source is marked `hidden`; pass
 * `includeHidden` to keep those (the curation screen shows them greyed out).
 *
 * `overrides` are tailored idea lists (sphere_kind_prompt_ideas): for an
 * inherited question, the nearest kind at or below this one that has its own
 * list replaces the question's ideas. `tailoredAt` says which kind that was
 * (null when the question's own ideas are showing).
 */
export function kindPrompts(kinds, prompts, hidden, kindId, { includeHidden = false, overrides = [] } = {}) {
  const chain = kindChain(kinds, kindId)
  const hiddenBy = new Map()
  for (const h of hidden) {
    if (!hiddenBy.has(h.prompt_id)) hiddenBy.set(h.prompt_id, new Set())
    hiddenBy.get(h.prompt_id).add(h.kind_id)
  }
  const overrideFor = new Map(overrides.map((o) => [`${o.kind_id}|${o.prompt_id}`, o]))
  return chain
    .map((source, index) => {
      // Only kinds below the source can switch its questions off or tailor
      // their ideas; `below` runs nearest-first.
      const below = chain.slice(0, index).map((k) => k.id)
      const list = prompts
        .filter((p) => p.kind_id === source.id)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((p) => {
          const tailoredAt = below.find((id) => overrideFor.has(`${id}|${p.id}`)) ?? null
          return {
            ...p,
            ideas: tailoredAt ? overrideFor.get(`${tailoredAt}|${p.id}`).ideas : p.ideas,
            tailoredAt,
            hidden: below.some((id) => hiddenBy.get(p.id)?.has(id)),
          }
        })
        .filter((p) => includeHidden || !p.hidden)
      return { kind: source, inherited: index > 0, prompts: list }
    })
    .reverse()
    .filter((g) => g.prompts.length)
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Labels that already have a `**Label:**` line in the markdown. */
export function answeredLabels(markdown, labels) {
  const text = markdown ?? ''
  return new Set(
    labels.filter((label) => new RegExp(`^\\s*\\*\\*${escapeRegex(label)}:\\*\\*`, 'mi').test(text))
  )
}

export const answerLine = (label, text) => `**${label}:** ${text.trim()}`

/** Append a block to markdown with a blank line between. */
export function appendMarkdown(markdown, block) {
  const base = (markdown ?? '').replace(/\s+$/, '')
  return base ? `${base}\n\n${block}` : block
}

/** A random idea, avoiding `exclude` (e.g. the one already showing) when possible. */
export function pickIdea(ideas, exclude = [], rng = Math.random) {
  const skip = new Set(exclude)
  const fresh = ideas.filter((i) => !skip.has(i))
  const from = fresh.length ? fresh : ideas
  return from.length ? from[Math.floor(rng() * from.length)] : null
}
