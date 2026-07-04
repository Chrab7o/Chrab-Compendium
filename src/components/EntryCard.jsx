import { Link } from 'react-router-dom'
import { categoryLabel } from '../lib/categories'

export default function EntryCard({ entry }) {
  return (
    <Link to={`/entry/${entry.id}`} className="entry-card">
      <div className="entry-card-header">
        <h3>{entry.title}</h3>
        {entry.visibility === 'dm' && <span className="badge badge-dm">DM only</span>}
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
