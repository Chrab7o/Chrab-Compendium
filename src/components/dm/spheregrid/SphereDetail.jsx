import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import TagGroupPicker from '../../TagGroupPicker'
import RichTextEditor from '../../RichTextEditor'
import SpherePrompts from './SpherePrompts'
import KindSelect from './KindSelect'
import { answerLine, answeredLabels, appendMarkdown, kindPrompts, kindTag } from '../../../lib/sphereGrid'

// How long typing has to pause before the text autosaves.
const SAVE_DELAY = 800

// The editor for the entry behind a sphere, shown full-width above the grid.
// The text uses the same rich markdown editor as the full entry page and
// autosaves after a pause (and on switching spheres); the name saves on blur,
// flags and tags on change. Keyed by entry id in the page, so switching
// spheres remounts it with a fresh draft.
//
// Above the text sit the guided questions for the sphere's kind (its own and
// every inherited one not switched off); answering one appends a
// `**Label:** answer` line to the text.
export default function SphereDetail({
  entry,
  linked,
  kinds,
  prompts,
  hidden,
  overrides,
  pools,
  existingNames,
  onSpawn,
  onSaveIdeas,
  onAddQuestion,
  onUpdate,
  onUnlink,
  onFocus,
  onPlace,
  onRemove,
  onDeleteEntry,
  onClose,
}) {
  const [title, setTitle] = useState(entry.title)
  const [saveState, setSaveState] = useState('saved')
  const pending = useRef(null)
  const timer = useRef(null)
  // The latest markdown, typed or appended - the editor itself only reads
  // its content on mount, so appending remounts it via editorKey.
  const contentRef = useRef(entry.content ?? '')
  const [liveContent, setLiveContent] = useState(entry.content ?? '')
  const [editorKey, setEditorKey] = useState(0)
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
    contentRef.current = markdown
    setLiveContent(markdown)
    pending.current = markdown
    setSaveState('saving')
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, SAVE_DELAY)
  }

  function appendContent(block) {
    clearTimeout(timer.current)
    pending.current = null
    const next = appendMarkdown(contentRef.current, block)
    contentRef.current = next
    setLiveContent(next)
    setEditorKey((k) => k + 1)
    setSaveState('saving')
    Promise.resolve(onUpdateRef.current({ content: next })).then(() => setSaveState('saved'))
  }

  const promptGroups = useMemo(
    () => kindPrompts(kinds, prompts, hidden, entry.sphere_kind_id, { overrides }),
    [kinds, prompts, hidden, overrides, entry.sphere_kind_id]
  )
  const kindLabel = (id) => kinds.find((k) => k.id === id)?.label ?? null

  // Picking a kind also adds its wiki tag, so the entry still turns up in
  // tag search. Changing kind never removes tags - they may be wanted.
  function changeKind(kindId) {
    const changes = { sphere_kind_id: kindId }
    const tag = kindId ? kindTag(kinds, kindId) : null
    if (tag && !(entry.tags ?? []).includes(tag)) changes.tags = [...(entry.tags ?? []), tag]
    onUpdate(changes)
  }
  const answered = useMemo(
    () => answeredLabels(liveContent, promptGroups.flatMap((g) => g.prompts.map((p) => p.label))),
    [liveContent, promptGroups]
  )

  function handleAnswer(prompt, text) {
    appendContent(answerLine(prompt.label, text))
  }

  // Make the answer its own linked sphere, then record it in this one's text.
  async function handleSpawn(prompt, name, idea) {
    const ok = await onSpawn(name, prompt.spawn_kind_id)
    if (ok) appendContent(answerLine(prompt.label, idea && idea !== name ? `${name} — ${idea}` : name))
    return ok
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
          <SpherePrompts
            groups={promptGroups}
            answered={answered}
            kindId={entry.sphere_kind_id}
            kinds={kinds}
            kindLabel={kindLabel}
            pools={pools}
            existingNames={existingNames}
            onAnswer={handleAnswer}
            onSpawn={handleSpawn}
            onSaveIdeas={(prompt, ideas) => onSaveIdeas(prompt, ideas, entry.sphere_kind_id)}
            onAddQuestion={(row) => onAddQuestion(entry.sphere_kind_id, row)}
          />
          <RichTextEditor key={editorKey} content={contentRef.current} onChange={handleContent} />
        </div>

        <div className="sg-detail-meta">
          <label className="sg-kind">
            Kind
            <KindSelect kinds={kinds} value={entry.sphere_kind_id} onChange={changeKind} />
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

          <div className="sg-tags">
            <span>Tags</span>
            <TagGroupPicker showRequired={false} value={entry.tags ?? []} onChange={(tags) => onUpdate({ tags })} />
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
