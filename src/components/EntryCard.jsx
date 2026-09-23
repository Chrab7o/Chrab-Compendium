import { Link } from 'react-router-dom'
import { tagLabel } from '../lib/tagLabels'
import { useTags } from '../contexts/TagContext'
import { typeTagValue } from '../lib/tags'

// Visibility and tags are the entry's own now — nothing is inherited from a
// folder chain, so this no longer needs the whole folder list passed in to
// work out what it's looking at.
// `selectable` turns on the DM bulk-select checkbox; without it the card is
// a plain link, exactly as before.
export default function EntryCard({ entry, selectable = false, selected = false, onToggleSelect }) {
  const { tags: allTags, groups } = useTags()
  const isDm = entry.visibility === 'dm'
  const tags = entry.tags ?? []
  const isSession = !isDm && tags.some((tag) => tag.toLowerCase() === 'session-note')
  const type = typeTagValue(allTags, groups, tags)
  const cardClass = [
    'entry-card',
    isDm && 'entry-card-dm',
    isSession && 'entry-card-session',
    selected && 'entry-card-selected',
  ]
    .filter(Boolean)
    .join(' ')

  // The checkbox sits outside the <Link> — nesting an interactive control
  // inside an anchor means every click on it also navigates.
  return (
    <div className="entry-card-shell">
      {selectable && (
        <label className="entry-card-select">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            aria-label={`Select ${entry.title}`}
          />
        </label>
      )}
      <Link to={`/entry/${entry.id}`} className={cardClass}>
        <div className="entry-card-header">
          <h3>{entry.title}</h3>
          {isDm && <span className="badge badge-dm">DM only</span>}
          {isSession && <span className="badge badge-session">Session note</span>}
        </div>
        {type && <span className="entry-card-category">{tagLabel(type)}</span>}
        {tags.length > 0 && (
          <div className="entry-card-tags">
            {tags
              .filter((tag) => tag !== type)
              .map((tag) => (
                <span key={tag} className="tag">
                  {tagLabel(tag)}
                </span>
              ))}
          </div>
        )}
      </Link>
    </div>
  )
}
