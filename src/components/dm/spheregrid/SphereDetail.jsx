import { useState } from 'react'
import { Link } from 'react-router-dom'
import TagGroupPicker from '../../TagGroupPicker'

// Quick editing of the entry behind a sphere. Text fields save on blur,
// flags and tags save on change; the full editor is one click away for
// anything more. Keyed by entry id in the page, so switching spheres resets
// the local draft.
export default function SphereDetail({
  sphere,
  entry,
  linked,
  onUpdate,
  onUnlink,
  onFocus,
  onPlace,
  onRemove,
  onDeleteEntry,
}) {
  const [title, setTitle] = useState(entry.title)
  const [content, setContent] = useState(entry.content ?? '')
  const [showTags, setShowTags] = useState(false)

  function saveTitle() {
    const next = title.trim()
    if (!next) {
      setTitle(entry.title)
      return
    }
    if (next !== entry.title) onUpdate({ title: next })
  }

  function saveContent() {
    if (content !== (entry.content ?? '')) onUpdate({ content })
  }

  const offGrid = linked.filter((l) => !l.onGrid)

  return (
    <div className="sg-detail">
      <div className="sg-detail-links">
        <Link to={`/entry/${entry.id}`} className="button-link">
          Open entry
        </Link>
        <Link to={`/dm/entries/${entry.id}/edit`} className="button-link sg-secondary-link">
          Full editor
        </Link>
      </div>

      <div className="dm-form">
        <label>
          Name
          <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle} />
        </label>

        <div className="sg-tags">
          <div className="sg-tags-head">
            <span>Tags</span>
            <button type="button" className="secondary sg-small" onClick={() => setShowTags((v) => !v)}>
              {showTags ? 'Done' : 'Edit tags'}
            </button>
          </div>
          {showTags ? (
            <TagGroupPicker value={entry.tags ?? []} onChange={(tags) => onUpdate({ tags })} />
          ) : sphere.tagLabels.length ? (
            <div className="sg-tag-chips">
              {sphere.tagLabels.map((label) => (
                <span key={label} className="badge badge-tag">
                  {label}
                </span>
              ))}
            </div>
          ) : (
            <p className="status-message">Untagged.</p>
          )}
        </div>

        <label>
          Text (markdown)
          <textarea
            rows={8}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onBlur={saveContent}
            placeholder="What this is, and what its links mean."
          />
        </label>
        <div className="sg-flags">
          <label className="sg-flag">
            <input type="checkbox" checked={entry.is_stub} onChange={(e) => onUpdate({ is_stub: e.target.checked })} />
            Stub — still needs content
          </label>
          <label className="sg-flag">
            <input
              type="checkbox"
              checked={entry.visibility === 'dm'}
              onChange={(e) => onUpdate({ visibility: e.target.checked ? 'dm' : 'public' })}
            />
            GM-only
          </label>
        </div>
      </div>

      <div className="sg-subhead-row">
        <h3 className="sg-subhead">Linked to ({linked.length})</h3>
        {offGrid.length > 0 && (
          <button type="button" className="secondary sg-small" onClick={() => onPlace(offGrid.map((l) => l.other.id))}>
            Place {offGrid.length} on grid
          </button>
        )}
      </div>
      {linked.length ? (
        <ul className="dm-list sg-links">
          {linked.map(({ link, other, color, onGrid }) => (
            <li key={link.id} className={onGrid ? '' : 'is-off-grid'}>
              <span className="sg-swatch" style={color ? { background: color } : undefined} />
              {onGrid ? (
                <button type="button" className="sg-link-name" onClick={() => onFocus(other.id)}>
                  {other.title}
                </button>
              ) : (
                <span className="sg-link-name is-off-grid">{other.title}</span>
              )}
              <div className="dm-list-actions">
                {!onGrid && (
                  <button type="button" className="secondary sg-small" onClick={() => onPlace([other.id])}>
                    Place
                  </button>
                )}
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => onUnlink(link.id)}
                  aria-label={`Unlink ${other.title}`}
                  title="Unlink"
                >
                  ×
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="status-message">No links yet. Drag another sphere onto this one to link them.</p>
      )}

      <div className="dm-form-actions sg-detail-actions">
        <button type="button" className="secondary" onClick={onRemove}>
          Remove from grid
        </button>
        <button type="button" className="danger" onClick={onDeleteEntry}>
          Delete entry
        </button>
      </div>
    </div>
  )
}
