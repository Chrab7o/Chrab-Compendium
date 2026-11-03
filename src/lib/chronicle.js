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

export const LAYOUT = {
  step: 170,
  laneGap: 110,
  padX: 90,
  padTop: 60,
  padBottom: 90,
  curve: 60,
  minScaleWidth: 900,
}

const LANE_SLOTS = Array.from({ length: 40 }, (_, i) => (i % 2 === 0 ? i / 2 + 1 : -(i + 1) / 2))

// Year ticks to scale: the smallest round step that keeps labels ~120px apart.
function scaleTicks(min, max, width) {
  const span = max - min
  if (span <= 0) return [Math.floor(min)]
  const room = Math.max(1, Math.floor(width / 120))
  const steps = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000]
  const step = steps.find((s) => span / s <= room) ?? steps[steps.length - 1]
  const ticks = []
  for (let y = Math.ceil(min / step) * step; y <= max; y += step) ticks.push(y)
  return ticks
}

function branchPath(fx, rx, parentY, laneY, curve) {
  const c = Math.max(8, Math.min(curve, (rx - fx) / 2))
  const out = `M ${fx} ${parentY} C ${fx + c / 2} ${parentY}, ${fx + c / 2} ${laneY}, ${fx + c} ${laneY}`
  if (rx === Infinity) return out
  return `${out} L ${rx - c} ${laneY} C ${rx - c / 2} ${laneY}, ${rx - c / 2} ${parentY}, ${rx} ${parentY}`
}

// Where everything goes. `placed` comes from filterEvents. Spacing 'even'
// gives every event its own column; 'scale' puts x in proportion to the date.
// Canon is lane 0; branches take lanes above and below it in turn, and a lane
// is free again once the branch on it has rejoined.
export function layoutChronicle({ placed, branches, shownBranches, calendar, spacing = 'even' }) {
  const L = LAYOUT
  const sorted = [...placed].sort((a, b) => compareDates(a.event, b.event))
  const n = sorted.length

  const xOf = new Map()
  let width
  if (spacing === 'scale' && n > 1) {
    const values = sorted.map((p) => dateValue(p.event, calendar))
    const min = values[0]
    const max = values[n - 1]
    width = Math.max(L.minScaleWidth, n * L.step) + 2 * L.padX
    const inner = width - 2 * L.padX
    sorted.forEach((p, i) => xOf.set(p.event.id, L.padX + (max > min ? ((values[i] - min) / (max - min)) * inner : inner / 2)))
  } else {
    width = Math.max(1, n) * L.step + 2 * L.padX - L.step
    sorted.forEach((p, i) => xOf.set(p.event.id, L.padX + i * L.step))
  }
  const endX = width - L.padX / 3

  // Branch extents, parents first so a sub-branch can hang off its parent's lane.
  const byId = new Map(branches.map((b) => [b.id, b]))
  const lineBranches = branches
    .filter((b) => shownBranches.has(b.id))
    .map((b) => {
      const own = sorted.filter((p) => p.event.branch_id === b.id).map((p) => xOf.get(p.event.id))
      let start = b.fork_event_id && xOf.has(b.fork_event_id) ? xOf.get(b.fork_event_id) : null
      if (start === null && own.length) start = Math.min(...own) - L.step / 2
      const end = b.rejoin_event_id && xOf.has(b.rejoin_event_id) ? xOf.get(b.rejoin_event_id) : Infinity
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

  const offsets = [...laneOf.values()]
  const maxUp = Math.max(0, ...offsets)
  const maxDown = Math.max(0, ...offsets.map((o) => -o))
  const baseY = L.padTop + maxUp * L.laneGap
  const yOfLane = (offset) => baseY - offset * L.laneGap
  const yOfLine = (lineId) => yOfLane(laneOf.get(lineId ?? null) ?? 0)
  const height = baseY + maxDown * L.laneGap + L.padBottom

  const lines = [{ id: null, path: `M ${L.padX / 3} ${baseY} L ${endX} ${baseY}`, color: null }]
  for (const line of lineBranches) {
    if (!laneOf.has(line.branch.id)) continue
    const parentY = yOfLine(line.branch.parent_branch_id || null)
    const laneY = yOfLine(line.branch.id)
    // A branch that never rejoins runs on to the end of the chronicle.
    const path =
      line.end === Infinity
        ? `${branchPath(line.start, Infinity, parentY, laneY, L.curve)} L ${endX} ${laneY}`
        : branchPath(line.start, line.end, parentY, laneY, L.curve)
    lines.push({ id: line.branch.id, path, color: line.branch.color || null, rejoins: line.end !== Infinity })
  }

  const nodes = sorted.map((p) => ({
    event: p.event,
    muted: p.muted,
    x: xOf.get(p.event.id),
    y: yOfLine(p.event.branch_id || null),
  }))

  let ticks
  if (spacing === 'scale' && n > 1) {
    const min = dateValue(sorted[0].event, calendar)
    const max = dateValue(sorted[n - 1].event, calendar)
    const inner = width - 2 * L.padX
    ticks = scaleTicks(min, max, inner).map((year) => ({
      year,
      x: L.padX + (max > min ? ((year - min) / (max - min)) * inner : inner / 2),
    }))
  } else {
    ticks = []
    let lastYear = null
    for (const node of nodes) {
      if (node.event.year !== lastYear) ticks.push({ year: node.event.year, x: node.x })
      lastYear = node.event.year
    }
  }

  return { width, height, axisY: height - L.padBottom / 3, nodes, lines, ticks, lanes: Object.fromEntries(laneOf) }
}
