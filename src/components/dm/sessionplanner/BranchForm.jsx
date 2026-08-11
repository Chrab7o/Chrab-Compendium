import { useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { CONTENT_TYPES, contentTypeInfo } from '../../../lib/sessionPlanner'

// Quick add-a-branch action, separate from NodeAnswerForm's full edit flow.
// For when a real session only got partway through a planned node and the
// players went somewhere the plan didn't account for - rather than reopening
// the parent's whole answer to add a lead-in row, this jumps straight to
// "what's the new node" without touching the parent's existing
// question/answer/entry link at all.
export default function BranchForm({ planId, parentNodeId, existingChildCount, onSaved, onCancel }) {
  const [text, setText] = useState('')
  const [contentType, setContentType] = useState('question')
  const [isObstacle, setIsObstacle] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function changeContentType(type) {
    setContentType(type)
    setIsObstacle(contentTypeInfo(type).defaultIsObstacle)
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!text.trim()) {
      setError("This can't be empty.")
      return
    }
    setSaving(true)
    setError(null)
    const { error: insertError } = await supabase.from('session_plan_nodes').insert({
      plan_id: planId,
      parent_node_id: parentNodeId,
      question: text.trim(),
      content_type: contentType,
      is_obstacle: isObstacle,
      sort_order: existingChildCount,
    })
    setSaving(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    onSaved()
  }

  return (
    <form onSubmit={handleSave} className="dm-form node-creation-form">
      <label>
        Type
        <select value={contentType} onChange={(e) => changeContentType(e.target.value)}>
          {CONTENT_TYPES.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        New branch
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What happened on this unplanned path..."
          required
          autoFocus
        />
      </label>
      <label className="node-next-step-obstacle-toggle">
        <input type="checkbox" checked={isObstacle} onChange={(e) => setIsObstacle(e.target.checked)} />
        Obstacle
      </label>

      {error && <p className="status-message error">{error}</p>}
      <div className="dm-form-actions">
        <button type="submit" disabled={saving}>
          {saving ? 'Saving...' : 'Add branch'}
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
