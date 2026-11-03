import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  branchProblems,
  compareDates,
  eraSpans,
  eventTags,
  filterEvents,
  formatDate,
  fromEraYear,
  layoutChronicle,
  sortEvents,
  toEraYear,
} from './chronicle.js'

const calendar = {
  eras: [
    { abbr: 'AC', name: 'After the Cataclysm', start_year: 0 },
    { abbr: 'BC', name: 'Before the Cataclysm', start_year: -10000, backward: true },
  ],
  months: [
    { name: 'Thaw', days: 30 },
    { name: 'Frostfall', days: 28 },
  ],
}

let nextId = 0
const ev = (patch = {}) => ({ id: `e${++nextId}`, title: patch.title ?? `Event ${nextId}`, year: 0, branch_id: null, tags: [], ...patch })
const br = (patch = {}) => ({ id: `b${++nextId}`, name: 'Branch', parent_branch_id: null, ...patch })

test('dates: written with the era and month, ordered year then month then day', () => {
  assert.equal(formatDate({ year: 484, month: 2, day: 12 }, calendar), '12 Frostfall, 484 AC')
  assert.equal(formatDate({ year: 484, month: 1 }, calendar), 'Thaw 484 AC')
  assert.equal(formatDate({ year: -50 }, calendar), '50 BC')
  assert.equal(formatDate({ year: 7 }, { eras: [], months: [] }), '7')

  const order = sortEvents([
    ev({ title: 'c', year: 484, month: 2 }),
    ev({ title: 'a', year: -50 }),
    ev({ title: 'b', year: 484 }),
    ev({ title: 'd', year: 484, month: 2, day: 3 }),
  ]).map((e) => e.title)
  assert.deepEqual(order, ['a', 'b', 'c', 'd'])
  assert.ok(compareDates({ year: 1, month: 1 }, { year: 1 }) > 0)
})

test('era years round-trip through the editor', () => {
  assert.deepEqual(toEraYear(-50, calendar), { eraIndex: 0, eraYear: 50 })
  assert.equal(fromEraYear(0, 50, calendar), -50)
  assert.deepEqual(toEraYear(484, calendar), { eraIndex: 1, eraYear: 484 })
  assert.equal(fromEraYear(1, 484, calendar), 484)
})

test('era spans: in order of start year, flagging a count-down era with nothing after it', () => {
  const spans = eraSpans(calendar)
  assert.deepEqual(spans.map((s) => [s.era.abbr, s.start, s.end]), [['BC', -10000, -1], ['AC', 0, null]])
  assert.ok(spans.every((s) => s.problems.length === 0))

  const flipped = eraSpans({
    eras: [
      { abbr: 'AC', start_year: 0 },
      { abbr: 'BC', start_year: 40000, backward: true },
    ],
  })
  assert.deepEqual(flipped.map((s) => s.era.abbr), ['AC', 'BC'])
  assert.equal(flipped[1].problems.length, 1)
})

test('region filter: linked entries lend their tags, and a branch keeps the event it hangs from', () => {
  const fork = ev({ title: 'Fork', year: 10, tags: ['region-north'] })
  const linked = ev({ title: 'Linked', year: 11 })
  const elsewhere = ev({ title: 'Elsewhere', year: 12, tags: ['region-south'] })
  const anchor = ev({ title: 'Anchor', year: 13, tags: ['region-south'] })
  const branch = br({ fork_event_id: anchor.id })
  const entriesByEvent = new Map([[linked.id, [{ tags: ['region-north'] }]]])
  assert.deepEqual(eventTags(linked, entriesByEvent.get(linked.id)), ['region-north'])

  const { placed } = filterEvents([fork, linked, elsewhere, anchor], [branch], {
    regionSelections: { region: ['region-north'] },
    entriesByEvent,
  })
  assert.deepEqual(
    placed.map((p) => [p.event.title, p.muted]),
    [['Fork', false], ['Linked', false], ['Anchor', true]]
  )
})

test('hiding a branch hides its events and its sub-branches', () => {
  const parent = br()
  const child = br({ parent_branch_id: parent.id })
  const events = [ev({ branch_id: parent.id }), ev({ branch_id: child.id }), ev()]
  const { placed, shownBranches } = filterEvents(events, [parent, child], { hiddenBranchIds: new Set([parent.id]) })
  assert.equal(placed.length, 1)
  assert.equal(shownBranches.size, 0)
})

test('campaign: events and branches tied to another campaign drop out', () => {
  const events = [ev({ campaign_id: 'c1' }), ev({ campaign_id: 'c2' }), ev()]
  const { placed } = filterEvents(events, [], { campaignId: 'c1' })
  assert.equal(placed.length, 2)
})

test('branch problems: split and rejoin on the parent line, members between them', () => {
  const a = ev({ year: 10, title: 'A' })
  const b = ev({ year: 11, title: 'B' })
  const d = ev({ year: 20, title: 'D' })
  const late = ev({ year: 30, title: 'Late' })
  const events = [a, b, d, late]
  const ok = br({ fork_event_id: a.id, rejoin_event_id: d.id })
  assert.deepEqual(branchProblems(ok, { events, branches: [ok], memberIds: [b.id] }), [])

  const backwards = br({ fork_event_id: d.id, rejoin_event_id: a.id })
  assert.ok(branchProblems(backwards, { events, branches: [], memberIds: [] }).includes('It rejoins before it splits off.'))

  const tooLate = branchProblems(ok, { events, branches: [ok], memberIds: [b.id, late.id] })
  assert.deepEqual(tooLate, ['Dated after the rejoin: Late.'])

  const parent = br({ id: 'p' })
  const child = br({ id: 'c', parent_branch_id: 'p' })
  const loop = { ...parent, parent_branch_id: 'c', fork_event_id: a.id }
  assert.ok(branchProblems(loop, { events, branches: [loop, child], memberIds: [] })[0].includes('own sub-branches'))
})

test('layout: overlapping branches take separate lanes; a rejoined lane is reused', () => {
  const canon = [10, 20, 30, 40, 50].map((year) => ev({ year, title: `c${year}` }))
  const [c10, c20, c30, c40] = canon
  const first = br({ fork_event_id: c10.id, rejoin_event_id: c20.id })
  const overlap = br({ fork_event_id: c10.id, rejoin_event_id: c30.id })
  const after = br({ fork_event_id: c30.id, rejoin_event_id: c40.id })
  const branches = [first, overlap, after]
  const events = [...canon, ev({ year: 15, branch_id: first.id }), ev({ year: 25, branch_id: overlap.id }), ev({ year: 35, branch_id: after.id })]
  const { placed, shownBranches } = filterEvents(events, branches)
  const layout = layoutChronicle({ placed, branches, shownBranches, calendar })

  assert.equal(layout.lanes[first.id], 1)
  assert.equal(layout.lanes[overlap.id], -1)
  assert.equal(layout.lanes[after.id], 1)

  const node = (id) => layout.nodes.find((n) => n.event.id === id)
  const canonY = node(c10.id).y
  const firstMember = layout.nodes.find((n) => n.event.branch_id === first.id)
  assert.ok(firstMember.y < canonY, 'lane 1 sits above canon')
  assert.ok(node(c20.id).x > firstMember.x, 'the branch event sits between split and rejoin')
  assert.equal(layout.lines.length, 4)
  assert.ok(layout.lines.every((l) => l.path.startsWith('M ')))
})

test('layout: to scale puts x in proportion to the date', () => {
  const events = [ev({ year: 0 }), ev({ year: 10 }), ev({ year: 100 })]
  const { placed, shownBranches } = filterEvents(events, [])
  const { nodes, ticks } = layoutChronicle({ placed, branches: [], shownBranches, calendar, spacing: 'scale' })
  const [a, b, c] = nodes.map((n) => n.x)
  assert.ok(Math.abs((b - a) / (c - a) - 0.1) < 1e-9)
  assert.ok(ticks.length >= 2)
})
