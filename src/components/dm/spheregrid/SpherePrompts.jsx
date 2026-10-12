import { useState } from 'react'
import { drawFromPool, parsePoolText, pickIdea } from '../../../lib/sphereGrid'
import KindSelect from './KindSelect'

// The guide above a sphere's text: the curated questions for its kind - one
// block per kind in the chain (Location, then Cave / Dungeon) - with idea
// chips to pick or roll from. Everything offered is something the DM wrote;
// nothing is invented here.
//
// Curation happens in place too, scoped to this sphere's kind (`kindId`):
// a typed answer can be saved as a new idea, ideas can be removed, and a new
// question can be added. Changing the ideas of an inherited question tailors
// them for this kind (and its sub-kinds) without touching the parent's list.
export default function SpherePrompts({
  groups,
  answered,
  kindId,
  kinds,
  kindLabel,
  pools,
  existingNames,
  onAnswer,
  onSpawn,
  onSaveIdeas,
  onAddQuestion,
}) {
  const ownLabel = kindId ? kindLabel(kindId) : null
  const usedLabels = groups.flatMap((g) => g.prompts.map((p) => p.label.toLowerCase()))

  return (
    <div className="sg-prompts">
      {!kindId && (
        <p className="status-message sg-prompts-empty">Pick a kind for this sphere to get questions about it.</p>
      )}
      {kindId && !groups.length && (
        <p className="status-message sg-prompts-empty">No questions for {ownLabel} yet — add the first one below.</p>
      )}
      {groups.map(({ kind, inherited, prompts }) => {
        const done = prompts.filter((p) => answered.has(p.label)).length
        return (
          <details key={kind.id} className="sg-prompt-group" open={done < prompts.length}>
            <summary>
              <span className="sg-prompt-group-name">{kind.label}</span>
              {inherited && <span className="sg-prompt-inherited">inherited</span>}
              <span className={`sg-prompt-count${done === prompts.length ? ' is-complete' : ''}`}>
                {done} of {prompts.length} answered
              </span>
            </summary>
            <ul className="sg-prompt-list">
              {prompts.map((p) => (
                <PromptRow
                  key={p.id}
                  prompt={p}
                  answered={answered.has(p.label)}
                  inherited={inherited}
                  ownLabel={ownLabel}
                  kindLabel={kindLabel}
                  pool={pools.find((pool) => pool.id === p.pool_id) ?? null}
                  existingNames={existingNames}
                  onAnswer={onAnswer}
                  onSpawn={onSpawn}
                  onSaveIdeas={onSaveIdeas}
                />
              ))}
            </ul>
          </details>
        )
      })}
      {kindId && <AddQuestion kinds={kinds} ownLabel={ownLabel} usedLabels={usedLabels} onAdd={onAddQuestion} />}
    </div>
  )
}

function PromptRow({
  prompt,
  answered,
  inherited,
  ownLabel,
  kindLabel,
  pool,
  existingNames,
  onAnswer,
  onSpawn,
  onSaveIdeas,
}) {
  const [open, setOpen] = useState(!answered)
  const [answer, setAnswer] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)

  const spawnKind = prompt.spawn_kind_id ? kindLabel(prompt.spawn_kind_id) : null
  const typed = answer.trim()
  const isNewIdea = typed && !prompt.ideas.some((i) => i.toLowerCase() === typed.toLowerCase())

  function reset() {
    setAnswer('')
    setName('')
    setOpen(false)
    setEditing(false)
  }

  function handleAdd() {
    if (!typed) return
    onAnswer(prompt, typed)
    reset()
  }

  async function handleSpawn() {
    const sphereName = name.trim() || typed
    if (!sphereName) return
    setBusy(true)
    const ok = await onSpawn(prompt, sphereName, typed)
    setBusy(false)
    if (ok) reset()
  }

  function rollName() {
    const [next] = drawFromPool(pool.names, 1, [...existingNames, name])
    if (next) setName(next)
  }

  async function saveIdea() {
    if (!isNewIdea) return
    setBusy(true)
    await onSaveIdeas(prompt, [...prompt.ideas, typed])
    setBusy(false)
  }

  async function removeIdea(idea) {
    setBusy(true)
    await onSaveIdeas(
      prompt,
      prompt.ideas.filter((i) => i !== idea)
    )
    setBusy(false)
  }

  // Where an idea change lands, said plainly so tailoring is never a surprise.
  const scopeNote = inherited
    ? prompt.tailoredAt
      ? `Ideas tailored for ${kindLabel(prompt.tailoredAt)}. Changes here apply to ${ownLabel} and its sub-kinds.`
      : `Changes here tailor this question's ideas for ${ownLabel} and its sub-kinds; other kinds keep theirs.`
    : null

  return (
    <li className={`sg-prompt${answered ? ' is-answered' : ''}`}>
      <div className="sg-prompt-head">
        {answered && <span className="sg-prompt-check" aria-label="Answered">✓</span>}
        <span className="sg-prompt-question">{prompt.question}</span>
        {prompt.tailoredAt && <span className="sg-prompt-tailored">tailored</span>}
        {answered && (
          <button type="button" className="secondary sg-small" onClick={() => setOpen((v) => !v)}>
            {open ? 'Hide' : 'Add another'}
          </button>
        )}
      </div>

      {open && (
        <div className="sg-prompt-body">
          <div className="sg-prompt-ideas">
            {prompt.ideas.map((idea) =>
              editing ? (
                <span key={idea} className="chip sg-idea-editing">
                  {idea}
                  <button
                    type="button"
                    className="tag-picker-remove"
                    onClick={() => removeIdea(idea)}
                    disabled={busy}
                    aria-label={`Remove idea ${idea}`}
                  >
                    ×
                  </button>
                </span>
              ) : (
                <button
                  key={idea}
                  type="button"
                  className={`chip${answer === idea ? ' active' : ''}`}
                  onClick={() => setAnswer(idea)}
                >
                  {idea}
                </button>
              )
            )}
            {!editing && prompt.ideas.length > 0 && (
              <button
                type="button"
                className="secondary sg-small"
                onClick={() => setAnswer(pickIdea(prompt.ideas, [answer]) ?? '')}
                title="Roll one of these ideas"
              >
                🎲 Roll
              </button>
            )}
            <button
              type="button"
              className="secondary sg-small"
              onClick={() => setEditing((v) => !v)}
              aria-pressed={editing}
            >
              {editing ? 'Done' : prompt.ideas.length ? 'Edit ideas' : 'No ideas yet'}
            </button>
          </div>
          {editing && scopeNote && <p className="sg-prompt-scope">{scopeNote}</p>}

          <div className="sg-prompt-row">
            <input
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleAdd()
                }
              }}
              placeholder="Pick an idea or write your own…"
              aria-label={prompt.question}
            />
            <button type="button" onClick={handleAdd} disabled={!typed}>
              Add to text
            </button>
            {isNewIdea && (
              <button
                type="button"
                className="secondary"
                onClick={saveIdea}
                disabled={busy}
                title={inherited ? `Saved as an idea for ${ownLabel}` : 'Saved as an idea for this question'}
              >
                + Save as idea
              </button>
            )}
          </div>
          {spawnKind && (
            <div className="sg-prompt-row sg-prompt-spawn">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={typed ? `Name (or keep "${typed}")` : `Name the new ${spawnKind}`}
                aria-label={`Name for the new ${spawnKind}`}
              />
              {pool && (
                <button type="button" className="secondary sg-small" onClick={rollName} title={`Roll from ${pool.name}`}>
                  🎲 Name
                </button>
              )}
              <button type="button" className="secondary" onClick={handleSpawn} disabled={busy || !(name.trim() || typed)}>
                {busy ? 'Working…' : `Add + make ${spawnKind}`}
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  )
}

const emptyQuestion = { question: '', label: '', text: '', spawn_kind_id: null }

// A new question for this sphere's own kind, written without leaving it.
function AddQuestion({ kinds, ownLabel, usedLabels, onAdd }) {
  const [draft, setDraft] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  if (!draft) {
    return (
      <button type="button" className="chip chip-new sg-add-question" onClick={() => setDraft(emptyQuestion)}>
        + Add a question for {ownLabel}
      </button>
    )
  }

  async function submit(e) {
    e.preventDefault()
    const question = draft.question.trim()
    const label = draft.label.trim()
    if (!question || !label) return
    if (label.includes(':') || label.includes('*')) {
      setError('Keep the short label free of ":" and "*".')
      return
    }
    if (usedLabels.includes(label.toLowerCase())) {
      setError(`"${label}" is already a label here — pick another.`)
      return
    }
    setBusy(true)
    setError(null)
    const err = await onAdd({ question, label, ideas: parsePoolText(draft.text), spawn_kind_id: draft.spawn_kind_id })
    setBusy(false)
    if (err) setError(err)
    else setDraft(null)
  }

  return (
    <form className="sg-add-question-form dm-form" onSubmit={submit}>
      <strong>New question for {ownLabel}</strong>
      <label>
        Question
        <input
          autoFocus
          value={draft.question}
          onChange={(e) => setDraft({ ...draft, question: e.target.value })}
          placeholder="e.g. What lives in the dark?"
        />
      </label>
      <label>
        Short label (written into the entry as Label: answer)
        <input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="e.g. In the dark" />
      </label>
      <label>
        Ideas — one per line (optional)
        <textarea rows={4} value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
      </label>
      <label>
        Answer can become a sphere of kind
        <KindSelect
          kinds={kinds}
          value={draft.spawn_kind_id}
          onChange={(v) => setDraft({ ...draft, spawn_kind_id: v })}
          emptyLabel="— Text only —"
        />
      </label>
      {error && <p className="status-message error">{error}</p>}
      <div className="dm-form-actions">
        <button type="submit" disabled={busy || !draft.question.trim() || !draft.label.trim()}>
          Add question
        </button>
        <button type="button" className="secondary" onClick={() => setDraft(null)}>
          Cancel
        </button>
      </div>
    </form>
  )
}
