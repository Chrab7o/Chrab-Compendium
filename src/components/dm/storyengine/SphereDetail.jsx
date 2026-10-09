import { useState } from 'react'
import { resolveTag } from '../../../lib/storyEngine'

// Text fields save on blur, flags save on click. The component is keyed by
// sphere id in the page, so switching spheres resets the local draft.
export default function SphereDetail({ sphere, tags, tagsByValue, linked, onUpdate, onUnlink, onFocus, onDelete }) {
  const [name, setName] = useState(sphere.name)
  const [body, setBody] = useState(sphere.body ?? '')
  const [tagInput, setTagInput] = useState(sphere.tag ? tagsByValue.get(sphere.tag)?.label ?? sphere.tag : '')
  const [tagError, setTagError] = useState(null)

  function saveName() {
    const next = name.trim()
    if (!next) {
      setName(sphere.name)
      return
    }
    if (next !== sphere.name) onUpdate({ name: next })
  }

  function saveBody() {
    if (body !== (sphere.body ?? '')) onUpdate({ body })
  }

  function saveTag() {
    const { value, error } = resolveTag(tagInput, tags)
    if (error) {
      setTagError(error)
      return
    }
    setTagError(null)
    if (value) setTagInput(tagsByValue.get(value).label)
    if (value !== sphere.tag) onUpdate({ tag: value })
  }

  return (
    <div className="se-detail">
      <div className="dm-form">
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} onBlur={saveName} />
        </label>
        <label>
          Tag
          <input
            list="se-tag-options"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onBlur={saveTag}
            placeholder="Untagged"
          />
        </label>
        {tagError && <p className="status-message error">{tagError}</p>}
        <label>
          Text
          <textarea
            rows={8}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onBlur={saveBody}
            placeholder="What this is, and what its links mean."
          />
        </label>
        <div className="se-flags">
          <label className="se-flag">
            <input type="checkbox" checked={sphere.is_stub} onChange={(e) => onUpdate({ is_stub: e.target.checked })} />
            Stub — still needs content
          </label>
          <label className="se-flag">
            <input type="checkbox" checked={sphere.gm_only} onChange={(e) => onUpdate({ gm_only: e.target.checked })} />
            GM-only
          </label>
        </div>
      </div>

      <h3 className="se-subhead">Linked to ({linked.length})</h3>
      {linked.length ? (
        <ul className="dm-list se-links">
          {linked.map(({ link, other }) => {
            const tag = other.tag ? tagsByValue.get(other.tag) : null
            return (
              <li key={link.id}>
                <span className="se-swatch" style={tag?.color ? { background: tag.color } : undefined} />
                <button type="button" className="se-link-name" onClick={() => onFocus(other.id)}>
                  {other.name}
                </button>
                {tag && <span className="dm-list-meta">{tag.label}</span>}
                <div className="dm-list-actions">
                  <button type="button" className="icon-button" onClick={() => onUnlink(link.id)} aria-label={`Unlink ${other.name}`} title="Unlink">
                    ×
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="status-message">No links yet. Drag another sphere onto this one to link them.</p>
      )}

      <div className="dm-form-actions se-detail-actions">
        <button type="button" className="danger" onClick={onDelete}>
          Delete sphere
        </button>
      </div>
    </div>
  )
}
