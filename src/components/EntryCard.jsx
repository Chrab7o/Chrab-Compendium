import { Link } from 'react-router-dom'
import { categoryLabel } from '../lib/categories'

export default function EntryCard({ entry }) {
  const isDm = entry.visibility === 'dm'
  const isSession = !isDm && entry.tags?.some((tag) => tag.toLowerCase() === 'session-note')
  const cardClass = `entry-card${isDm ? ' entry-card-dm' : ''}${isSession ? ' entry-card-session' : ''}`

  return (
    <Link to={`/entry/${entry.id}`} className={cardClass}>
      <div className="entry-card-header">
        <h3>{entry.title}</h3>
        {isDm && <span className="badge badge-dm">DM only</span>}
      </div>
      <span className="entry-card-category">{categoryLabel(entry.category)}</span>
      {entry.tags?.length > 0 && (
        <div className="entry-card-tags">
          {entry.tags.map((tag) => (
            <span key={tag} className="tag">
              {tag}
            </span>
          ))}
        </div>
      )}
    </Link>
  )
}
