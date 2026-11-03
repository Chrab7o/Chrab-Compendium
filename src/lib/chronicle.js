// The Chronicle (supabase/migrations/20261105000000_chronicle.sql): a world's
// history as dated events on a line. Canon is every event with no branch_id;
// a branch leaves its parent line at fork_event_id and, if it has a
// rejoin_event_id, comes back there. Everything the page draws is worked out
// here from the rows, so the view only has to paint it.
import { matchesTagQuery } from './tags.js'

// --- Calendar ---------------------------------------------------------------

// worlds.calendar: eras [{abbr, name, start_year, backward}] and months
// [{name, days}]. Years are stored absolute; an era only changes how one is
// written. A forward era counts up from its start ("484 AC"); a backward one
// counts down to the next era's start ("50 BC"), the usual shape of a
// before-the-event era.
export function normalizeCalendar(calendar) {
  const eras = (calendar?.eras ?? [])
    .filter((e) => e && (e.abbr || e.name))
    .map((e) => ({
      abbr: e.abbr ?? '',
      name: e.name ?? '',
      start_year: Number.isFinite(Number(e.start_year)) ? Number(e.start_year) : 0,
      backward: Boolean(e.backward),
    }))
    .sort((a, b) => a.start_year - b.start_year)
  const months = (calendar?.months ?? [])
    .filter((m) => m && m.name)
    .map((m) => ({ name: m.name, days: Math.max(1, Number(m.days) || 30) }))
  return { eras, months }
}

// Each era in the order it happens, with the absolute years it covers (end is
// null for the last, which runs on), plus what's wrong with the setup. The
// calendar editor shows this so the sort by start year is never a surprise.
export function eraSpans(calendar) {
  const { eras } = normalizeCalendar(calendar)
  return eras.map((era, i) => {
    const next = eras[i + 1]
    const end = next ? next.start_year - 1 : null
    const problems = []
    if (next && next.start_year === era.start_year) problems.push(`Starts the same year as ${next.abbr || next.name}.`)
    if (era.backward && !next)
      problems.push('Counts down, but no era comes after it to count down to. Give it an earlier start (negative years come before 0).')
    return { era, start: era.start_year, end, problems }
  })
}

// The era a year falls in: the latest one started by then. A year before
// every era belongs to the first, so it still gets a label.
function eraIndexFor(year, eras) {
  if (eras.length === 0) return -1
  let index = 0
  for (let i = 0; i < eras.length; i++) if (eras[i].start_year <= year) index = i
  return index
}

// Absolute year -> {eraIndex, eraYear}, what the editor shows.
export function toEraYear(year, calendar) {
  const { eras } = normalizeCalendar(calendar)
  const eraIndex = eraIndexFor(year, eras)
  if (eraIndex < 0) return { eraIndex, eraYear: year }
  const era = eras[eraIndex]
  if (era.backward) {
    const end = eras[eraIndex + 1]?.start_year ?? era.start_year
    return { eraIndex, eraYear: end - year }
  }
  return { eraIndex, eraYear: year - era.start_year }
}

// The editor's {eraIndex, eraYear} -> the absolute year that is stored.
export function fromEraYear(eraIndex, eraYear, calendar) {
  const { eras } = normalizeCalendar(calendar)
  const era = eras[eraIndex]
  const n = Number(eraYear) || 0
  if (!era) return n
  if (era.backward) return (eras[eraIndex + 1]?.start_year ?? era.start_year) - n
  return era.start_year + n
}

export function formatYear(year, calendar) {
  const cal = normalizeCalendar(calendar)
  const { eraIndex, eraYear } = toEraYear(year, cal)
  if (eraIndex < 0) return String(year)
  const abbr = cal.eras[eraIndex].abbr || cal.eras[eraIndex].name
  return `${eraYear} ${abbr}`
}

export function monthName(month, calendar) {
  if (!month) return ''
  return normalizeCalendar(calendar).months[month - 1]?.name ?? `Month ${month}`
}

// "12 Frostfall, 484 AC", "Frostfall 484 AC" or "484 AC".
export function formatDate(event, calendar) {
  const year = formatYear(event.year, calendar)
  if (!event.month) return year
  const month = monthName(event.month, calendar)
  return event.day ? `${event.day} ${month}, ${year}` : `${month} ${year}`
}

// Missing month/day sort first in their year: "484 AC" is the start of it.
export function compareDates(a, b) {
  return (
    a.year - b.year ||
    (a.month ?? 0) - (b.month ?? 0) ||
    (a.day ?? 0) - (b.day ?? 0) ||
    (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
    String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')) ||
    String(a.id ?? '').localeCompare(String(b.id ?? ''))
  )
}

export function sortEvents(events) {
  return [...events].sort(compareDates)
}

// A date as a fractional year, for the to-scale layout.
export function dateValue(event, calendar) {
  const { months } = normalizeCalendar(calendar)
  const count = months.length || 12
  const month = (event.month ?? 1) - 1
  const days = months[month]?.days ?? 30
  return event.year + (month + ((event.day ?? 1) - 1) / days) / count
}

// --- Lines and filtering ----------------------------------------------------

// An event's tags for filtering: its own plus every linked entry's, so an
// event linked to an Ashfall location counts as Ashfall without retagging.
export function eventTags(event, linkedEntries = []) {
  const all = new Set(event.tags ?? [])
  for (const entry of linkedEntries) for (const t of entry?.tags ?? []) all.add(t)
  return [...all]
}

// The map's rule: no campaign means every campaign's.
function inCampaign(row, campaignId) {
  return !row.campaign_id || !campaignId || row.campaign_id === campaignId
}

function branchDepth(branch, byId) {
  let depth = 0
  let current = branch
  const seen = new Set()
  while (current?.parent_branch_id && !seen.has(current.id)) {
    seen.add(current.id)
    current = byId.get(current.parent_branch_id)
    depth++
  }
  return depth
}

// Branches that are shown: in the campaign, not switched off, and with every
// branch above them shown too (a hidden line takes its sub-branches with it).
export function shownBranchIds(branches, { campaignId = '', hiddenBranchIds = new Set(), canonOnly = false } = {}) {
  if (canonOnly) return new Set()
  const byId = new Map(branches.map((b) => [b.id, b]))
  const shown = new Set()
  const isShown = (branch, seen = new Set()) => {
    if (!branch || seen.has(branch.id)) return false
    seen.add(branch.id)
    if (hiddenBranchIds.has(branch.id) || !inCampaign(branch, campaignId)) return false
    if (!branch.parent_branch_id) return true
    return isShown(byId.get(branch.parent_branch_id), seen)
  }
  for (const b of branches) if (isShown(b)) shown.add(b.id)
  return shown
}

// What the page places: events on shown lines and in the campaign. The region
// filter doesn't drop an event a shown branch forks or rejoins at - the
// branch needs it to hang from - it marks it muted instead.
export function filterEvents(events, branches, { campaignId = '', regionSelections = {}, entriesByEvent = new Map(), ...lineFilters } = {}) {
  const shown = shownBranchIds(branches, { campaignId, ...lineFilters })
  const anchors = new Set()
  for (const b of branches) {
    if (!shown.has(b.id)) continue
    if (b.fork_event_id) anchors.add(b.fork_event_id)
    if (b.rejoin_event_id) anchors.add(b.rejoin_event_id)
  }
  const filtering = Object.values(regionSelections).some((v) => v?.length)
  const result = []
  for (const event of events) {
    if (event.branch_id && !shown.has(event.branch_id)) continue
    if (!inCampaign(event, campaignId)) continue
    const matches = !filtering || matchesTagQuery(eventTags(event, entriesByEvent.get(event.id)), regionSelections)
    if (matches) result.push({ event, muted: false })
    else if (anchors.has(event.id)) result.push({ event, muted: true })
  }
  return { placed: result, shownBranches: shown }
}

// --- Validation -------------------------------------------------------------

// Problems with a branch as the DM has it set up (saved or still being
// edited). `memberIds` are the events that will be in the branch.
export function branchProblems(branch, { events, branches, memberIds }) {
  const problems = []
  const eventById = new Map(events.map((e) => [e.id, e]))
  const branchById = new Map(branches.map((b) => [b.id, b]))
  const parentLine = branch.parent_branch_id || null

  if (branch.id && branch.parent_branch_id) {
    let current = branchById.get(branch.parent_branch_id)
    const seen = new Set()
    while (current && !seen.has(current.id)) {
      if (current.id === branch.id) {
        problems.push('Its parent line is one of its own sub-branches.')
        break
      }
      seen.add(current.id)
      current = current.parent_branch_id ? branchById.get(current.parent_branch_id) : null
    }
  }

  const fork = branch.fork_event_id ? eventById.get(branch.fork_event_id) : null
  const rejoin = branch.rejoin_event_id ? eventById.get(branch.rejoin_event_id) : null
  if (!fork) problems.push('Pick the event it splits off at.')
  if (fork && (fork.branch_id || null) !== parentLine) problems.push('The split event is not on the parent line.')
  if (rejoin && (rejoin.branch_id || null) !== parentLine) problems.push('The rejoin event is not on the parent line.')
  if (fork && rejoin && compareDates(rejoin, fork) <= 0) problems.push('It rejoins before it splits off.')

  const members = [...(memberIds ?? [])].map((id) => eventById.get(id)).filter(Boolean)
  if (fork && members.some((e) => e.id === fork.id)) problems.push('The split event itself stays on the parent line.')
  if (rejoin && members.some((e) => e.id === rejoin.id)) problems.push('The rejoin event itself stays on the parent line.')
  const early = members.filter((e) => fork && e.id !== fork.id && compareDates(e, fork) < 0)
  const late = members.filter((e) => rejoin && e.id !== rejoin.id && compareDates(e, rejoin) > 0)
  if (early.length) problems.push(`Dated before the split: ${early.map((e) => e.title).join(', ')}.`)
  if (late.length) problems.push(`Dated after the rejoin: ${late.map((e) => e.title).join(', ')}.`)
  return problems
}

// --- Layout -----------------------------------------------------------------

// Sizes along time ("step" between events) and across it (laneGap between
// lines). Vertical runs top to bottom with labels to the right of each node,
// so its lanes sit wider apart and it keeps equal room on both sides: canon
// is then the centre line of the drawing. Horizontal is left to right.
export const LAYOUT = {
  vertical: { step: 84, laneGap: 230, padStart: 50, crossBefore: 210, crossAfter: 210, axis: 90, curve: 50, minScale: 700 },
  horizontal: { step: 170, laneGap: 110, padStart: 90, crossBefore: 60, crossAfter: 90, curve: 60, minScale: 900 },
}

const LANE_SLOTS = Array.from({ length: 40 }, (_, i) => (i % 2 === 0 ? i / 2 + 1 : -(i + 1) / 2))

// Year ticks to scale: the smallest round step that keeps labels apart.
function scaleTicks(min, max, length, spacing) {
  const span = max - min
  if (span <= 0) return [Math.floor(min)]
  const room = Math.max(1, Math.floor(length / spacing))
  const steps = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000]
  const step = steps.find((s) => span / s <= room) ?? steps[steps.length - 1]
  const ticks = []
  for (let y = Math.ceil(min / step) * step; y <= max; y += step) ticks.push(y)
  return ticks
}

// A branch's line in (time, cross) terms: off the parent at `from`, along its
// lane, and back at `to` (Infinity: never back). `pt` maps to x/y.
function branchPath(from, to, parent, lane, curve, pt) {
  const c = Math.max(8, Math.min(curve, (to - from) / 2))
  const P = (t, k) => pt(t, k).join(' ')
  const out = `M ${P(from, parent)} C ${P(from + c / 2, parent)}, ${P(from + c / 2, lane)}, ${P(from + c, lane)}`
  if (to === Infinity) return out
  return `${out} L ${P(to - c, lane)} C ${P(to - c / 2, lane)}, ${P(to - c / 2, parent)}, ${P(to, parent)}`
}

// Where everything goes. `placed` comes from filterEvents. Spacing 'even'
// gives every event its own slot; 'scale' spaces them in proportion to the
// date. Canon is lane 0; branches take lanes either side of it in turn
// (left/right when vertical, above/below when horizontal), and a lane is free
// again once the branch on it has rejoined.
export function layoutChronicle({ placed, branches, shownBranches, calendar, spacing = 'even', orientation = 'vertical' }) {
  const vertical = orientation === 'vertical'
  const L = LAYOUT[vertical ? 'vertical' : 'horizontal']
  const pt = (t, k) => (vertical ? [k, t] : [t, k])
  const sorted = [...placed].sort((a, b) => compareDates(a.event, b.event))
  const n = sorted.length
  const toScale = spacing === 'scale' && n > 1

  // Position along time.
  const tOf = new Map()
  let length
  const values = sorted.map((p) => dateValue(p.event, calendar))
  if (toScale) {
    length = Math.max(L.minScale, n * L.step) + 2 * L.padStart
    const inner = length - 2 * L.padStart
    const [min, max] = [values[0], values[n - 1]]
    sorted.forEach((p, i) => tOf.set(p.event.id, L.padStart + (max > min ? ((values[i] - min) / (max - min)) * inner : inner / 2)))
  } else {
    length = Math.max(1, n) * L.step + 2 * L.padStart - L.step
    sorted.forEach((p, i) => tOf.set(p.event.id, L.padStart + i * L.step))
  }
  const endT = length - L.padStart / 3

  // Branch extents, parents first so a sub-branch can hang off its parent's lane.
  const byId = new Map(branches.map((b) => [b.id, b]))
  const lineBranches = branches
    .filter((b) => shownBranches.has(b.id))
    .map((b) => {
      const own = sorted.filter((p) => p.event.branch_id === b.id).map((p) => tOf.get(p.event.id))
      let start = b.fork_event_id && tOf.has(b.fork_event_id) ? tOf.get(b.fork_event_id) : null
      if (start === null && own.length) start = Math.min(...own) - L.step / 2
      const end = b.rejoin_event_id && tOf.has(b.rejoin_event_id) ? tOf.get(b.rejoin_event_id) : Infinity
      return { branch: b, start, end, depth: branchDepth(b, byId) }
    })
    .filter((l) => l.start !== null)
    .sort((a, b) => a.depth - b.depth || a.start - b.start)

  const occupied = new Map() // lane offset -> [[start, end]]
  const laneOf = new Map([[null, 0]])
  for (const line of lineBranches) {
    const slot = LANE_SLOTS.find((offset) =>
      (occupied.get(offset) ?? []).every(([s, e]) => line.start > e + 10 || line.end < s - 10)
    )
    const offset = slot ?? LANE_SLOTS[LANE_SLOTS.length - 1]
    occupied.set(offset, [...(occupied.get(offset) ?? []), [line.start, line.end]])
    laneOf.set(line.branch.id, offset)
  }

  // Across time: positive lanes come first (left / above), negative after.
  const offsets = [...laneOf.values()]
  let before = Math.max(0, ...offsets)
  let after = Math.max(0, ...offsets.map((o) => -o))
  if (vertical) before = after = Math.max(before, after)
  const base = L.crossBefore + before * L.laneGap
  const crossSize = base + after * L.laneGap + L.crossAfter
  const crossOf = (lineId) => base - (laneOf.get(lineId ?? null) ?? 0) * L.laneGap

  const lines = [{ id: null, path: `M ${pt(L.padStart / 3, base).join(' ')} L ${pt(endT, base).join(' ')}`, color: null }]
  for (const line of lineBranches) {
    const parent = crossOf(line.branch.parent_branch_id || null)
    const lane = crossOf(line.branch.id)
    // A branch that never rejoins runs on to the end of the chronicle.
    const path =
      line.end === Infinity
        ? `${branchPath(line.start, Infinity, parent, lane, L.curve, pt)} L ${pt(endT, lane).join(' ')}`
        : branchPath(line.start, line.end, parent, lane, L.curve, pt)
    lines.push({ id: line.branch.id, path, color: line.branch.color || null, rejoins: line.end !== Infinity })
  }

  const nodes = sorted.map((p) => {
    const [x, y] = pt(tOf.get(p.event.id), crossOf(p.event.branch_id || null))
    return { event: p.event, muted: p.muted, x, y }
  })

  // Year ticks along an axis: under the drawing when horizontal, down its
  // left side when vertical.
  const axisCross = vertical ? L.axis : crossSize - L.crossAfter / 3
  let tickTs
  if (toScale) {
    const [min, max] = [values[0], values[n - 1]]
    const inner = length - 2 * L.padStart
    tickTs = scaleTicks(min, max, inner, vertical ? 60 : 120).map((year) => ({
      year,
      t: L.padStart + (max > min ? ((year - min) / (max - min)) * inner : inner / 2),
    }))
  } else {
    tickTs = []
    let lastYear = null
    for (const p of sorted) {
      if (p.event.year !== lastYear) tickTs.push({ year: p.event.year, t: tOf.get(p.event.id) })
      lastYear = p.event.year
    }
  }
  const ticks = tickTs.map(({ year, t }) => {
    const [x, y] = pt(t, axisCross)
    return { year, x, y }
  })
  const [ax1, ay1] = pt(0, axisCross)
  const [ax2, ay2] = pt(length, axisCross)

  const [width, height] = vertical ? [crossSize, length] : [length, crossSize]
  return {
    orientation: vertical ? 'vertical' : 'horizontal',
    width,
    height,
    axis: { x1: ax1, y1: ay1, x2: ax2, y2: ay2 },
    nodes,
    lines,
    ticks,
    lanes: Object.fromEntries(laneOf),
  }
}
