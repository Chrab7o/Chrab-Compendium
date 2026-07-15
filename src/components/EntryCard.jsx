import { Link } from 'react-router-dom'
import { categoryLabel } from '../lib/categories'
import { effectiveEntryVisibility, effectiveEntryTags } from '../lib/folders'

// `folders` is optional so existing call sites don't break, but pass it
// whenever available — without it this can only see the entry's own raw
// visibility/tags, not what it inherits from a DM-only or tagged ancestor
// folder (see effectiveEntryVisibility/effectiveEntryTags).
export default function EntryCard({ entry, folders = [] }) {
  const isDm = effectiveEntryVisibility(folders, entry) === 'dm'
  const tags = effectiveEntryTags(folders, entry)
  const isSession = !isDm && tags.some((tag) => tag.toLowerCase() === 'session-note')
  const cardClass = `entry-card${isDm ? ' entry-card-dm' : ''}${isSession ? ' entry-card-session' : ''}`

  return (
    <Link to={`/entry/${entry.id}`} className={cardClass}>
      <div className="entry-card-header">
        <h3>{entry.title}</h3>
        {isDm && <span className="badge badge-dm">DM only</span>}
        {isSession && <span className="badge badge-session">Session note</span>}
      </div>
      <span className="entry-card-category">{categoryLabel(entry.category)}</span>
      {tags.length > 0 && (
        <div className="entry-card-tags">
          {tags.map((tag) => (
            <span key={tag} className="tag">
              {tag}
            </span>
          ))}
        </div>
      )}
    </Link>
  )
}
