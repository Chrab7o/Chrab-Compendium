import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { formatDate } from '../../lib/chronicle'
import EntryCard from '../EntryCard'

// The selected event: its date, which line it's on, what happened, and the
// entries it links to.
export default function ChronicleEventPanel({ event, calendar, branches, entries, onClose }) {
  const branch = event.branch_id ? branches.find((b) => b.id === event.branch_id) : null
  const forks = branches.filter((b) => b.fork_event_id === event.id)
  const rejoins = branches.filter((b) => b.rejoin_event_id === event.id)

  return (
    <aside className="region-panel chronicle-panel" aria-label={event.title}>
      <div className="region-panel-header">
        <div>
          <p className="chronicle-panel-date">{formatDate(event, calendar)}</p>
          <h2>{event.title}</h2>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className="chronicle-panel-badges">
        <span
          className={branch ? 'badge chronicle-line-badge' : 'badge'}
          style={branch?.color ? { '--chronicle-branch': branch.color } : undefined}
        >
          {branch ? branch.name : 'Canon'}
        </span>
        {event.visibility === 'dm' && <span className="badge badge-dm">DM only</span>}
      </div>
      {forks.length > 0 && <p className="status-message">Splits off: {forks.map((b) => b.name).join(', ')}</p>}
      {rejoins.length > 0 && <p className="status-message">Rejoined by: {rejoins.map((b) => b.name).join(', ')}</p>}
      {event.summary && (
        <div className="entry-content">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{event.summary}</ReactMarkdown>
        </div>
      )}
      {entries.length > 0 && (
        <div className="region-panel-group">
          <h3>Linked entries</h3>
          <div className="entry-grid">
            {entries.map((entry) => (
              <EntryCard key={entry.id} entry={entry} />
            ))}
          </div>
        </div>
      )}
    </aside>
  )
}
