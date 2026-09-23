import { useTags } from '../contexts/TagContext'
import { matchesAllTags, tagLabel as lookupLabel } from '../lib/tags'
import { tagsByGroup } from '../lib/tags'
import { BrowseIcon } from './Icons'
import EntryCard from './EntryCard'

// Shown when a map region becomes "active" (clicked on the map or picked
// from the region dropdown) — everything matching its tag query, grouped
// into sections by the entries' own Type tags, so a new DM-added type shows
// up here automatically.
// A region used to point at one folder; it now points at a set of tags an
// entry must carry all of, which means a region can scope to a combination
// ("Locations" + "Ashfall") that no single folder ever held.
export default function RegionEntryPanel({ region, tagQuery, entries, onClose }) {
  const { tags, groups } = useTags()
  const matched = entries.filter((e) => matchesAllTags(e.tags, tagQuery))

  // Section by Type, since that's the group that says what a thing is. The
  // region's own query tags are dropped as section headers — every entry
  // here matches them by definition, so they'd all be one useless group.
  const typeGroup = groups.find((g) => g.value === 'type')
  const typeTags = typeGroup ? tagsByGroup(tags, [typeGroup])[0]?.tags ?? [] : []
  const queryTags = new Set((tagQuery ?? []).map((t) => t.toLowerCase()))

  const sections = typeTags
    .filter((t) => !queryTags.has(t.value.toLowerCase()))
    .map((tag) => ({
      tag,
      entries: matched.filter((e) =>
        (e.tags ?? []).some((t) => t.toLowerCase() === tag.value.toLowerCase())
      ),
    }))
    .filter((s) => s.entries.length > 0)

  const sectionedIds = new Set(sections.flatMap((s) => s.entries.map((e) => e.id)))
  const other = matched.filter((e) => !sectionedIds.has(e.id))

  return (
    <aside className="region-panel">
      <div className="region-panel-header">
        <h2>{region.name}</h2>
        <button type="button" className="secondary" onClick={onClose}>
          Close
        </button>
      </div>

      {(!tagQuery || tagQuery.length === 0) && (
        <p className="status-message">This region isn't linked to any tags yet.</p>
      )}

      {tagQuery?.length > 0 && (
        <p className="region-panel-query">
          {tagQuery.map((t) => (
            <span key={t} className="tag">
              {lookupLabel(tags, t)}
            </span>
          ))}
        </p>
      )}

      {tagQuery?.length > 0 && matched.length === 0 && (
        <div className="browse-empty">
          <BrowseIcon />
          <p className="browse-empty-title">Nothing tagged this way yet</p>
        </div>
      )}

      {sections.map((s) => (
        <section key={s.tag.id} className="region-panel-group">
          <h3>{s.tag.label}</h3>
          <div className="entry-grid">
            {s.entries.map((e) => (
              <EntryCard key={e.id} entry={e} />
            ))}
          </div>
        </section>
      ))}

      {other.length > 0 && (
        <section className="region-panel-group">
          <h3>Other</h3>
          <div className="entry-grid">
            {other.map((e) => (
              <EntryCard key={e.id} entry={e} />
            ))}
          </div>
        </section>
      )}
    </aside>
  )
}
