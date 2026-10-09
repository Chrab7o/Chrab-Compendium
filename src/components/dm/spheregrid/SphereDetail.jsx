import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import TagGroupPicker from '../../TagGroupPicker'
import RichTextEditor from '../../RichTextEditor'

// How long typing has to pause before the text autosaves.
const SAVE_DELAY = 800

// The editor for the entry behind a sphere, shown full-width above the grid.
// The text uses the same rich markdown editor as the full entry page and
// autosaves after a pause (and on switching spheres); the name saves on blur,
// flags and tags on change. Keyed by entry id in the page, so switching
// spheres remounts it with a fresh draft.
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
  onClose,
}) {
  const [title, setTitle] = useState(entry.title)
  const [showTags, setShowTags] = useState(false)
  const [saveState, setSaveState] = useState('saved')
  const pending = useRef(null)
  const timer = useRef(null)
  const onUpdateRef = useRef(onUpdate)
  onUpdateRef.current = onUpdate

  function flush() {
    clearTimeout(timer.current)
    if (pending.current === null) return
    const content = pending.current
    pending.current = null
    Promise.resolve(onUpdateRef.current({ content })).then(() => setSaveState((s) => (s === 'saving' ? 'saved' : s)))
  }

  // Never lose a pause-less edit: save whatever is pending when this sphere
  // closes or another one opens.
  useEffect(() => () => flush(), [])

  function handleContent(markdown) {
    pending.current = markdown
    setSaveState('saving')
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, SAVE_DELAY)
  }

  function saveTitle() {
    const next = title.trim()
    if (!next) {
      setTitle(entry.title)
      return
    }
    if (next !== entry.title) onUpdate({ title: next })
  }

  const offGrid = linked.filter((l) => !l.onGrid)

  return (
    <div className="sg-detail">
      <div className="sg-detail-head">
        <input
          className="sg-detail-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          aria-label="Name"
        />
        <span className={`sg-save-state is-${saveState}`}>{saveState === 'saving' ? 'Saving…' : 'Saved'}</span>
        <div className="sg-detail-links">
          <Link to={`/entry/${entry.id}`} className="button-link">
            Open entry
          </Link>
          <Link to={`/dm/entries/${entry.id}/edit`} className="button-link sg-secondary-link">
            Full editor
          </Link>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close" title="Close">
            ×
          </button>
        </div>
      </div>

      <div className="sg-detail-body">
        <div className="sg-detail-text">
          <RichTextEditor content={entry.content ?? ''} onChange={handleContent} />
        </div>

        <div className="sg-detail-meta">
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
      </div>
    </div>
  )
}
