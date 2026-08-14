import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { useCategories } from '../../../contexts/CategoryContext'
import { useDraftAutosave } from '../../../hooks/useDraftAutosave'
import { CONTENT_TYPES, contentTypeInfo, wouldCreateCycle } from '../../../lib/sessionPlanner'
import EntryPicker from './EntryPicker'
import NodePicker from './NodePicker'

function emptyNextStep() {
  return { mode: 'new', text: '', contentType: 'question', existingNodeId: null, isObstacle: true }
}

// Fill in a scene's content, and say what happens next - working forward
// from where the party is, each next step becomes a connection (a
// session_plan_edges row) to another scene. That scene is usually a brand
// new one (typed in, created alongside the edge), but a next step can
// instead link to an *existing* scene elsewhere in the plan - the way two
// different obstacles end up leading to the same next scene, since the
// plan is a DAG (see childConnections/wouldCreateCycle in
// sessionPlanner.js), not a strict tree. Every scene shares
// location/characters/purpose regardless of type; the title/body fields on
// top of that double as different things depending on its content_type (a
// plain Question's "answer" vs. an Encounter's "details") - same two
// columns underneath, just relabeled per type with a type-specific
// inspiration hint, see CONTENT_TYPES in sessionPlanner.js. Not every next
// step is an obstacle (something standing between the party and what comes
// after); some are just the plain step forward, no complication attached.
// Always operates on an already-existing node (the anchor root is created
// up front, every other node is born as a next step of some parent, or a
// branch - see BranchForm.jsx) - there's no separate "create a blank node"
// mode here. The next-step inputs always start blank, even when re-editing
// an already-answered node with existing children: they only ever add
// *new* connections, previously-made ones are edited/removed directly from
// the tree (see SessionPlanEditorPage's Unlink action).
export default function NodeAnswerForm({
  planId,
  campaignId,
  node,
  nodes,
  edges,
  isRoot,
  existingChildCount,
  onSaved,
  onCancel,
}) {
  const { categories } = useCategories()

  const [contentType, setContentType] = useState(node.content_type ?? 'question')
  const [questionText, setQuestionText] = useState(node.question)
  const [location, setLocation] = useState(node.location ?? '')
  const [characters, setCharacters] = useState(node.characters ?? '')
  const [purpose, setPurpose] = useState(node.purpose ?? '')
  const [answer, setAnswer] = useState(node.answer ?? '')
  const [nextSteps, setNextSteps] = useState([emptyNextStep()])
  const [pickingForRow, setPickingForRow] = useState(null)
  const [referencedEntry, setReferencedEntry] = useState(null)
  const [showEntryPicker, setShowEntryPicker] = useState(false)
  const [newEntryTitle, setNewEntryTitle] = useState('')
  const [newEntryCategory, setNewEntryCategory] = useState('')
  const [creatingEntry, setCreatingEntry] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const typeInfo = contentTypeInfo(contentType)

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

  function updateStep(i, patch) {
    setNextSteps((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }

  function setNextStepText(i, text) {
    updateStep(i, { text })
  }

  function setNextStepContentType(i, type) {
    updateStep(i, { contentType: type, isObstacle: contentTypeInfo(type).defaultIsObstacle })
  }

  function setNextStepIsObstacle(i, isObstacle) {
    updateStep(i, { isObstacle })
  }

  function setNextStepMode(i, mode) {
    updateStep(i, { mode, text: '', existingNodeId: null })
  }

  function chooseExistingForRow(i, existingNode) {
    updateStep(i, { existingNodeId: existingNode.id })
    setPickingForRow(null)
  }

  function addNextStepRow() {
    setNextSteps((rows) => [...rows, emptyNextStep()])
  }

  function removeNextStepRow(i) {
    setNextSteps((rows) => rows.filter((_, idx) => idx !== i))
    if (pickingForRow === i) setPickingForRow(null)
  }

  // Protects whatever's mid-typing in this node's form. Cleared the moment
  // it actually saves.
  const draftKey = `session-plan-node-draft-${planId}-${node.id}`
  const draftValue = { contentType, questionText, location, characters, purpose, answer, nextSteps }
  const { pendingDraft, clearDraft } = useDraftAutosave(draftKey, draftValue)
  const [draftPromptDismissed, setDraftPromptDismissed] = useState(false)

  function restoreDraft() {
    setContentType(pendingDraft.value.contentType)
    setQuestionText(pendingDraft.value.questionText)
    setLocation(pendingDraft.value.location ?? '')
    setCharacters(pendingDraft.value.characters ?? '')
    setPurpose(pendingDraft.value.purpose ?? '')
    setAnswer(pendingDraft.value.answer)
    setNextSteps(pendingDraft.value.nextSteps ?? [emptyNextStep()])
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
      setError(`${typeInfo.titleLabel} can't be empty.`)
      return
    }

    const activeSteps = nextSteps.filter((s) => (s.mode === 'new' ? s.text.trim() : s.existingNodeId))
    for (const step of activeSteps) {
      if (step.mode === 'existing' && wouldCreateCycle(edges, node.id, step.existingNodeId)) {
        const target = nodes.find((n) => n.id === step.existingNodeId)
        setError(`Linking to "${target?.question ?? 'that scene'}" would create a loop - it already leads back to this scene.`)
        return
      }
    }

    setSaving(true)
    setError(null)

    const updates = {
      answer: answer.trim() || null,
      location: location.trim() || null,
      characters: characters.trim() || null,
      purpose: purpose.trim() || null,
      content_type: contentType,
      referenced_entry_id: referencedEntry?.id ?? null,
    }
    if (!isRoot) updates.question = questionText.trim()

    const { error: updateError } = await supabase.from('session_plan_nodes').update(updates).eq('id', node.id)
    if (updateError) {
      setSaving(false)
      setError(updateError.message)
      return
    }

    const newRows = activeSteps.filter((s) => s.mode === 'new')
    let newNodeIds = []
    if (newRows.length > 0) {
      const { data: inserted, error: insertNodesError } = await supabase
        .from('session_plan_nodes')
        .insert(newRows.map((s) => ({ plan_id: planId, question: s.text.trim(), content_type: s.contentType })))
        .select()
      if (insertNodesError) {
        setSaving(false)
        setError(insertNodesError.message)
        return
      }
      newNodeIds = inserted.map((n) => n.id)
    }

    let newRowCursor = 0
    const edgeRows = activeSteps.map((s, i) => ({
      plan_id: planId,
      from_node_id: node.id,
      to_node_id: s.mode === 'new' ? newNodeIds[newRowCursor++] : s.existingNodeId,
      is_obstacle: s.isObstacle,
      sort_order: existingChildCount + i,
    }))
    if (edgeRows.length > 0) {
      const { error: edgeError } = await supabase.from('session_plan_edges').insert(edgeRows)
      if (edgeError) {
        setSaving(false)
        setError(edgeError.message)
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

      <label>
        Type
        <select value={contentType} onChange={(e) => setContentType(e.target.value)}>
          {CONTENT_TYPES.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
      </label>

      {isRoot ? (
        <p>
          <strong>{node.question}</strong>
        </p>
      ) : (
        <label>
          {typeInfo.titleLabel} (fix wording if needed)
          <input value={questionText} onChange={(e) => setQuestionText(e.target.value)} required autoFocus />
        </label>
      )}

      <div className="dm-form-row">
        <label>
          Location
          <input value={location} onChange={(e) => setLocation(e.target.value)} />
        </label>
        <label>
          Characters
          <input value={characters} onChange={(e) => setCharacters(e.target.value)} />
        </label>
        <label>
          Purpose
          <input value={purpose} onChange={(e) => setPurpose(e.target.value)} />
        </label>
      </div>

      <label>
        {typeInfo.bodyLabel}
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          rows={3}
          placeholder={typeInfo.hint}
        />
      </label>

      <div className="dm-form-row">
        <span>What happens next (each becomes a connection to another scene)</span>
        {nextSteps.map((step, i) => (
          <div key={i} className="node-next-step-row">
            <div className="entry-picker-row">
              <select value={step.mode} onChange={(e) => setNextStepMode(i, e.target.value)}>
                <option value="new">New scene</option>
                <option value="existing">Existing scene</option>
              </select>
              {step.mode === 'new' ? (
                <>
                  <input
                    value={step.text}
                    onChange={(e) => setNextStepText(i, e.target.value)}
                    placeholder="What happens next..."
                  />
                  <select value={step.contentType} onChange={(e) => setNextStepContentType(i, e.target.value)}>
                    {CONTENT_TYPES.map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <button type="button" className="secondary" onClick={() => setPickingForRow(i)}>
                  {step.existingNodeId
                    ? nodes.find((n) => n.id === step.existingNodeId)?.question ?? 'Choose a scene...'
                    : 'Choose a scene...'}
                </button>
              )}
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
            {step.mode === 'existing' && pickingForRow === i && (
              <NodePicker
                nodes={nodes}
                excludeNodeId={node.id}
                onSelect={(picked) => chooseExistingForRow(i, picked)}
                onCancel={() => setPickingForRow(null)}
              />
            )}
          </div>
        ))}
        <p className="dm-list-meta">
          Check "Obstacle" if it's something standing in the way of what comes next. Leave it
          unchecked for a plain step forward with no complication. Pick "Existing scene" to connect
          to a scene that's already elsewhere in this plan, instead of creating a new one.
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
