import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { useCategories } from '../../../contexts/CategoryContext'
import { useDraftAutosave } from '../../../hooks/useDraftAutosave'
import { NODE_TYPES, nodeTypeInfo } from '../../../lib/sessionPlanner'
import EntryPicker from './EntryPicker'

function emptyAnswers(nodeType) {
  return Object.fromEntries(nodeTypeInfo(nodeType).questions.map((q) => [q.key, '']))
}

// The guided, one-node-at-a-time interview - title, a beat type (locked once
// created), that type's specific questions as separate labeled fields
// (narrower prompts instead of one blank textarea is the actual "stay
// focused" mechanism the DM asked for), then an optional link to an
// existing wiki entry or a freshly-created placeholder one. Used for both
// creating a new beat and editing an existing one in place - existingNode
// present means edit mode.
export default function NodeCreationForm({
  planId,
  campaignId,
  parentNodeId,
  requireBranchLabel,
  existingNode,
  nextSortOrder,
  onSaved,
  onCancel,
}) {
  const { categories } = useCategories()
  const isEdit = Boolean(existingNode)

  const [title, setTitle] = useState(existingNode?.title ?? '')
  const [nodeType, setNodeType] = useState(existingNode?.node_type ?? NODE_TYPES[0].key)
  const [answers, setAnswers] = useState(existingNode?.answers ?? emptyAnswers(NODE_TYPES[0].key))
  const [branchLabel, setBranchLabel] = useState(existingNode?.branch_label ?? '')
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
    if (!existingNode?.referenced_entry_id) return
    supabase
      .from('entries')
      .select('id, title')
      .eq('id', existingNode.referenced_entry_id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setReferencedEntry(data)
      })
  }, [existingNode?.referenced_entry_id])

  function changeNodeType(key) {
    setNodeType(key)
    setAnswers(emptyAnswers(key))
  }

  function setAnswer(key, value) {
    setAnswers((a) => ({ ...a, [key]: value }))
  }

  // Protects whatever's mid-typing in this one beat's form - scoped per
  // node (existing or "about to be created under this parent") so a
  // crash/accidental navigation doesn't lose a half-answered set of
  // guided questions. Cleared the moment this node actually saves.
  const draftKey = `session-plan-node-draft-${planId}-${existingNode?.id ?? parentNodeId ?? 'root'}`
  const draftValue = { title, nodeType, answers, branchLabel }
  const { pendingDraft, clearDraft } = useDraftAutosave(draftKey, draftValue)
  const [draftPromptDismissed, setDraftPromptDismissed] = useState(false)

  function restoreDraft() {
    setTitle(pendingDraft.value.title)
    setNodeType(pendingDraft.value.nodeType)
    setAnswers(pendingDraft.value.answers)
    setBranchLabel(pendingDraft.value.branchLabel)
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
    if (requireBranchLabel && !branchLabel.trim()) {
      setError('This beat needs a branch label (e.g. "if they negotiate") since it has a sibling.')
      return
    }
    setSaving(true)
    setError(null)

    if (isEdit) {
      const { error: updateError } = await supabase
        .from('session_plan_nodes')
        .update({ title, branch_label: branchLabel, answers, referenced_entry_id: referencedEntry?.id ?? null })
        .eq('id', existingNode.id)
      setSaving(false)
      if (updateError) {
        setError(updateError.message)
        return
      }
    } else {
      const { error: insertError } = await supabase.from('session_plan_nodes').insert({
        plan_id: planId,
        parent_node_id: parentNodeId,
        branch_label: branchLabel,
        node_type: nodeType,
        title,
        answers,
        referenced_entry_id: referencedEntry?.id ?? null,
        sort_order: nextSortOrder,
      })
      setSaving(false)
      if (insertError) {
        setError(insertError.message)
        return
      }
    }
    clearDraft()
    onSaved()
  }

  const questions = nodeTypeInfo(nodeType).questions

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
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
      </label>

      {!isEdit && (
        <label>
          Beat type
          <select value={nodeType} onChange={(e) => changeNodeType(e.target.value)}>
            {NODE_TYPES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {questions.map((q) => (
        <label key={q.key}>
          {q.prompt}
          <textarea value={answers[q.key] ?? ''} onChange={(e) => setAnswer(q.key, e.target.value)} rows={3} />
        </label>
      ))}

      {requireBranchLabel && (
        <label>
          Branch label (the condition that leads here, e.g. "if they negotiate")
          <input value={branchLabel} onChange={(e) => setBranchLabel(e.target.value)} required />
        </label>
      )}

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
          {saving ? 'Saving...' : isEdit ? 'Save changes' : 'Save beat'}
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
