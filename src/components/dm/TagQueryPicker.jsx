import { useTags } from '../../contexts/TagContext'
import { tagsByGroup, ungroupedTags } from '../../lib/tags'

// Picks the set of tags an entry must carry *all* of — used for map region
// targeting, where a region used to point at exactly one folder and can now
// scope to a combination ("Locations" + "Ashfall") that no folder held.
// Deliberately not TagGroupPicker: this is a flat AND with no exclusive-group
// behaviour, since narrowing by two tags from the same group is the point.
export default function TagQueryPicker({ value, onChange, label = 'Must have all of' }) {
  const { tags, groups } = useTags()
  const selected = new Set(value ?? [])
  const grouped = tagsByGroup(tags, groups)
  const loose = ungroupedTags(tags)

  function toggle(tagValue) {
    const next = new Set(selected)
    if (next.has(tagValue)) next.delete(tagValue)
    else next.add(tagValue)
    onChange([...next])
  }

  function renderRow(group, groupTags) {
    return (
      <div key={group?.id ?? 'ungrouped'} className="tag-group">
        <div className="tag-group-header">
          <span className="tag-group-label">{group?.label ?? 'Other'}</span>
        </div>
        <div className="tag-group-chips">
          {groupTags.map((t) => (
            <button
              key={t.value}
              type="button"
              className={selected.has(t.value) ? 'chip chip-tag active' : 'chip chip-tag'}
              style={t.color ? { '--chip-accent': t.color } : undefined}
              aria-pressed={selected.has(t.value)}
              onClick={() => toggle(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="tag-query-picker">
      <p className="map-edit-hint">
        {label} — an entry shows here only if it carries every tag you pick.
      </p>
      {grouped.map(({ group, tags: groupTags }) => renderRow(group, groupTags))}
      {loose.length > 0 && renderRow(null, loose)}
      {selected.size === 0 && <p className="status-message">No tags picked yet.</p>}
    </div>
  )
}
