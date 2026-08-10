import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { useCategories } from '../../../contexts/CategoryContext'
import { useDraftAutosave } from '../../../hooks/useDraftAutosave'
import EntryPicker from './EntryPicker'

// Answer a question, and say what leads to it - working backward from the
// end, each lead-in step becomes a brand new child question node, verbatim.
// Not every lead-in is an obstacle (something standing between the party
// and this point); some are just the plain step before it, no complication
// attached. Each row is flagged as one or the other, purely for the
// diagram/detail-panel's rendering (dashed vs solid edge) - the underlying
// question/answer mechanics are identical either way. Always operates on an
// already-existing node (the anchor root is created up front, every other
// node is born as a lead-in step of some parent, or a branch - see
// BranchForm.jsx) - there's no separate "create a blank node" mode here.
// The lead-in inputs always start blank, even when re-editing an already-
// answered node with existing children: they only ever add *new* children,
// previously-spawned ones are edited by selecting them directly in the tree.
export default function NodeAnswerForm({ planId, campaignId, node, existingChildCount, onSaved, onCancel }) {
  const { categories } = useCategories()
  const isRoot = node.parent_node_id === null

  const [questionText, setQuestionText] = useState(node.question)
  const [answer, setAnswer] = useState(node.answer ?? '')
  const [nextSteps, setNextSteps] = useState([{ text: '', isObstacle: true }])
  const [referencedEntry, setReferencedEntry] = useState(null)
  const [showEntryPicker, setShowEntryPicker] = useState(false)
  const [newEntryTitle, setNewEntryTitle] = useState('')
  const [newEntryCategory, setNewEntryCategory] = useState('')
  const [creatingEntry, setCreatingEntry] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Look up the already-linked entry's title when editing a node that has
  // one - the form only ever stores referenced_entry_id, not its title.
  useEffect(() => {
    if (!node.referenced_entry_id) return
    supabase
      .from('entries')
      .select('id, title')
      .eq('id', node.referenced_entry_id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setReferencedEntry(data)
      })
  }, [node.referenced_entry_id])

  function setNextStepText(i, text) {
    setNextSteps((rows) => rows.map((r, idx) => (idx === i ? { ...r, text } : r)))
  }

  function setNextStepIsObstacle(i, isObstacle) {
    setNextSteps((rows) => rows.map((r, idx) => (idx === i ? { ...r, isObstacle } : r)))
  }

  function addNextStepRow() {
    setNextSteps((rows) => [...rows, { text: '', isObstacle: true }])
  }

  function removeNextStepRow(i) {
    setNextSteps((rows) => rows.filter((_, idx) => idx !== i))
  }

  // Protects whatever's mid-typing in this question's form. Cleared the
  // moment it actually saves.
  const draftKey = `session-plan-node-draft-${planId}-${node.id}`
  const draftValue = { questionText, answer, nextSteps }
  const { pendingDraft, clearDraft } = useDraftAutosave(draftKey, draftValue)
  const [draftPromptDismissed, setDraftPromptDismissed] = useState(false)

  function restoreDraft() {
    setQuestionText(pendingDraft.value.questionText)
    setAnswer(pendingDraft.value.answer)
    setNextSteps(pendingDraft.value.nextSteps)
    setDraftPromptDismissed(true)
  }

  function discardDraft() {
    clearDraft()
    setDraftPromptDismissed(true)
  }

  async function handleCreateEntry() {
    if (!newEntryTitle.trim() || !newEntryCategory) return
    setCreatingEntry(true)
    const { data, error: insertError } = await supabase
      .from('entries')
      .insert({
        title: newEntryTitle.trim(),
        content: '',
        category: newEntryCategory,
        visibility: 'public',
        campaign_id: campaignId || null,
      })
      .select()
      .single()
    setCreatingEntry(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    setReferencedEntry(data)
    setNewEntryTitle('')
    setNewEntryCategory('')
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!isRoot && !questionText.trim()) {
      setError("Question can't be empty.")
      return
    }
    setSaving(true)
    setError(null)

    const updates = { answer: answer.trim() || null, referenced_entry_id: referencedEntry?.id ?? null }
    if (!isRoot) updates.question = questionText.trim()

    const { error: updateError } = await supabase.from('session_plan_nodes').update(updates).eq('id', node.id)
    if (updateError) {
      setSaving(false)
      setError(updateError.message)
      return
    }

    const newSteps = nextSteps.map((s) => ({ ...s, text: s.text.trim() })).filter((s) => s.text)
    if (newSteps.length > 0) {
      const { error: insertError } = await supabase.from('session_plan_nodes').insert(
        newSteps.map((s, i) => ({
          plan_id: planId,
          parent_node_id: node.id,
          question: s.text,
          is_obstacle: s.isObstacle,
          sort_order: existingChildCount + i,
        }))
      )
      if (insertError) {
        setSaving(false)
        setError(insertError.message)
        return
      }
    }

    setSaving(false)
    clearDraft()
    onSaved()
  }

  return (
    <form onSubmit={handleSave} className="dm-form node-creation-form">
      {pendingDraft && !draftPromptDismissed && (
        <div className="draft-banner">
          <span>Unsaved draft found from {new Date(pendingDraft.savedAt).toLocaleString()}.</span>
          <div className="dm-form-actions">
            <button type="button" onClick={restoreDraft}>
              Restore
            </button>
            <button type="button" className="secondary" onClick={discardDraft}>
              Discard
            </button>
          </div>
        </div>
      )}

      {isRoot ? (
        <p>
          <strong>{node.question}</strong>
        </p>
      ) : (
        <label>
          Question (fix wording if needed)
          <input value={questionText} onChange={(e) => setQuestionText(e.target.value)} required autoFocus />
        </label>
      )}

      <label>
        Answer
        <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={3} />
      </label>

      <div className="dm-form-row">
        <span>What leads to this (each becomes the next question back)</span>
        {nextSteps.map((step, i) => (
          <div key={i} className="entry-picker-row">
            <input
              value={step.text}
              onChange={(e) => setNextStepText(i, e.target.value)}
              placeholder="What happens right before this..."
            />
            <label className="node-next-step-obstacle-toggle">
              <input
                type="checkbox"
                checked={step.isObstacle}
                onChange={(e) => setNextStepIsObstacle(i, e.target.checked)}
              />
              Obstacle
            </label>
            {nextSteps.length > 1 && (
              <button type="button" className="secondary" onClick={() => removeNextStepRow(i)}>
                Remove
              </button>
            )}
          </div>
        ))}
        <p className="dm-list-meta">
          Check "Obstacle" if it's something standing between the party and this outcome. Leave it
          unchecked for a plain step that leads here with no complication.
        </p>
        <div className="dm-form-actions">
          <button type="button" className="secondary" onClick={addNextStepRow}>
            + Add another
          </button>
        </div>
      </div>

      <div className="node-entry-link">
        <p className="dm-list-meta">
          {referencedEntry ? (
            <>
              Linked to <strong>{referencedEntry.title}</strong>{' '}
              <button type="button" className="link-button" onClick={() => setReferencedEntry(null)}>
                Unlink
              </button>
            </>
          ) : (
            'Not linked to a wiki entry.'
          )}
        </p>
        {!referencedEntry && (
          <div className="dm-form-actions">
            <button type="button" className="secondary" onClick={() => setShowEntryPicker((v) => !v)}>
              {showEntryPicker ? 'Cancel search' : 'Link an existing entry'}
            </button>
          </div>
        )}
        {showEntryPicker && (
          <EntryPicker
            campaignId={campaignId}
            onSelect={(entry) => {
              setReferencedEntry(entry)
              setShowEntryPicker(false)
            }}
            onCancel={() => setShowEntryPicker(false)}
          />
        )}
        {!referencedEntry && !showEntryPicker && (
          <div className="dm-form-row">
            <label>
              Or create a new entry for this
              <input
                value={newEntryTitle}
                onChange={(e) => setNewEntryTitle(e.target.value)}
                placeholder="Entry title"
              />
            </label>
            <label>
              Category
              <select value={newEntryCategory} onChange={(e) => setNewEntryCategory(e.target.value)}>
                <option value="">Choose...</option>
                {categories.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={!newEntryTitle.trim() || !newEntryCategory || creatingEntry}
              onClick={handleCreateEntry}
            >
              Create entry
            </button>
          </div>
        )}
      </div>

      {error && <p className="status-message error">{error}</p>}
      <div className="dm-form-actions">
        <button type="submit" disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
