import { useTags } from '../contexts/TagContext'
import { entriesUnderFolderTree, effectiveEntryTags } from '../lib/folders'
import { BrowseIcon } from './Icons'
import EntryCard from './EntryCard'

// Shown when a map region becomes "active" (clicked on the map or picked
// from the region dropdown) — everything filed under its linked folder,
// grouped into sections by the entries' own tags (same tag vocabulary/order
// TagView.jsx already uses), not a hardcoded Locations/People/Session-Notes
// list, so a new DM-added tag shows up here automatically too.
export default function RegionEntryPanel({ region, folders, entries, placements, onClose }) {
  const { tags } = useTags()
  const underFolder = entriesUnderFolderTree(folders, entries, placements, region.folder_id)

  const groups = tags
    .map((tag) => ({
      tag,
      entries: underFolder.filter((e) =>
        effectiveEntryTags(folders, e).some((t) => t.toLowerCase() === tag.value.toLowerCase())
      ),
    }))
    .filter((g) => g.entries.length > 0)
  const taggedIds = new Set(groups.flatMap((g) => g.entries.map((e) => e.id)))
  const untagged = underFolder.filter((e) => !taggedIds.has(e.id))

  return (
    <aside className="region-panel">
      <div className="region-panel-header">
        <h2>{region.name}</h2>
        <button type="button" className="secondary" onClick={onClose}>
          Close
        </button>
      </div>

      {!region.folder_id && (
        <p className="status-message">This region isn't linked to a folder yet.</p>
      )}

      {region.folder_id && underFolder.length === 0 && (
        <div className="browse-empty">
          <BrowseIcon />
          <p className="browse-empty-title">Nothing filed here yet</p>
        </div>
      )}

      {groups.map((g) => (
        <section key={g.tag.id} className="region-panel-group">
          <h3>{g.tag.label}</h3>
          <div className="entry-grid">
            {g.entries.map((e) => (
              <EntryCard key={e.__placementId ? `placement-${e.__placementId}` : e.id} entry={e} folders={folders} />
            ))}
          </div>
        </section>
      ))}

      {untagged.length > 0 && (
        <section className="region-panel-group">
          <h3>Other</h3>
          <div className="entry-grid">
            {untagged.map((e) => (
              <EntryCard key={e.__placementId ? `placement-${e.__placementId}` : e.id} entry={e} folders={folders} />
            ))}
          </div>
        </section>
      )}
    </aside>
  )
}
