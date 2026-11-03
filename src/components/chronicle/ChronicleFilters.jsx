import { useTags } from '../../contexts/TagContext'
import { tagsByGroup } from '../../lib/tags'

// Region chips (the Region tag group, same chips as search), one toggle per
// branch, and the spacing switch. `filters` is {regionSelections,
// hiddenBranchIds, canonOnly, spacing}; onChange gets the whole next object.
export default function ChronicleFilters({ filters, onChange, branches }) {
  const { tags, groups } = useTags()
  const region = tagsByGroup(tags, groups).find((g) => g.group.value === 'region')
  const picked = filters.regionSelections[region?.group.id] ?? []

  function toggleRegion(value) {
    const next = picked.includes(value) ? picked.filter((v) => v !== value) : [...picked, value]
    onChange({ ...filters, regionSelections: { [region.group.id]: next } })
  }

  function toggleBranch(id) {
    const hidden = new Set(filters.hiddenBranchIds)
    if (hidden.has(id)) hidden.delete(id)
    else hidden.add(id)
    onChange({ ...filters, hiddenBranchIds: hidden })
  }

  return (
    <div className="entry-search-controls chronicle-filters">
      {region && (
        <div className="entry-search-group">
          <span className="entry-search-group-label">{region.group.label}</span>
          <div className="entry-search-chips" role="group" aria-label={`Filter by ${region.group.label}`}>
            {region.tags.map((t) => {
              const active = picked.includes(t.value)
              return (
                <button
                  key={t.value}
                  type="button"
                  className={active ? 'chip chip-tag active' : 'chip chip-tag'}
                  style={t.color ? { '--chip-accent': t.color } : undefined}
                  aria-pressed={active}
                  onClick={() => toggleRegion(t.value)}
                >
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {branches.length > 0 && (
        <div className="entry-search-group">
          <span className="entry-search-group-label">Branches</span>
          <div className="entry-search-chips" role="group" aria-label="Show branches">
            <button
              type="button"
              className={filters.canonOnly ? 'chip active' : 'chip'}
              aria-pressed={filters.canonOnly}
              onClick={() => onChange({ ...filters, canonOnly: !filters.canonOnly })}
            >
              Canon only
            </button>
            {!filters.canonOnly &&
              branches.map((b) => {
                const shown = !filters.hiddenBranchIds.has(b.id)
                return (
                  <button
                    key={b.id}
                    type="button"
                    className={shown ? 'chip chip-tag active' : 'chip chip-tag'}
                    style={b.color ? { '--chip-accent': b.color } : undefined}
                    aria-pressed={shown}
                    onClick={() => toggleBranch(b.id)}
                  >
                    {b.name}
                  </button>
                )
              })}
          </div>
        </div>
      )}

      <div className="entry-search-group">
        <span className="entry-search-group-label">Spacing</span>
        <div className="entry-search-chips" role="group" aria-label="Spacing">
          {[
            ['even', 'Even'],
            ['scale', 'To scale'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={filters.spacing === value ? 'chip active' : 'chip'}
              aria-pressed={filters.spacing === value}
              onClick={() => onChange({ ...filters, spacing: value })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
