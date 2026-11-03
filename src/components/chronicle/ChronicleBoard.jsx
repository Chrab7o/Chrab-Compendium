import { useMemo, useState } from 'react'
import { filterEvents, layoutChronicle } from '../../lib/chronicle'
import ChronicleEventPanel from './ChronicleEventPanel'
import ChronicleFilters from './ChronicleFilters'
import ChronicleView from './ChronicleView'

const emptyFilters = { regionSelections: {}, hiddenBranchIds: new Set(), canonOnly: false, spacing: 'even' }

// Filters, the line itself and the selected event's panel - the whole
// Chronicle for one world. The public page and the DM page's preview both
// render this; the DM page opens its editor instead of the panel.
export default function ChronicleBoard({
  events,
  branches,
  entriesByEvent,
  calendar,
  campaignId,
  selectedId,
  onSelect,
  showPanel = true,
}) {
  const [filters, setFilters] = useState(emptyFilters)

  const layout = useMemo(() => {
    const { placed, shownBranches } = filterEvents(events, branches, { ...filters, campaignId, entriesByEvent })
    return layoutChronicle({ placed, branches, shownBranches, calendar, spacing: filters.spacing })
  }, [events, branches, entriesByEvent, calendar, campaignId, filters])

  const selected = selectedId ? events.find((e) => e.id === selectedId) : null

  return (
    <div className="chronicle-board">
      <ChronicleFilters filters={filters} onChange={setFilters} branches={branches} />
      <ChronicleView
        layout={layout}
        calendar={calendar}
        branches={branches}
        selectedId={selectedId}
        onSelect={(id) => onSelect(id === selectedId ? null : id)}
      />
      {showPanel && selected && (
        <ChronicleEventPanel
          event={selected}
          calendar={calendar}
          branches={branches}
          entries={entriesByEvent.get(selected.id) ?? []}
          onClose={() => onSelect(null)}
        />
      )}
    </div>
  )
}
