import { useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { CONTENT_TYPES, contentTypeInfo, wouldCreateCycle } from '../../../lib/sessionPlanner'
import NodePicker from './NodePicker'

// Quick add-a-branch action, separate from NodeAnswerForm's full edit flow.
// For when a real session only got partway through a planned node and the
// players went somewhere the plan didn't account for - rather than reopening
// the parent's whole answer to add a next-step row, this jumps straight to
// "what's the new connection" without touching the parent's existing
// question/answer/entry link at all. Like NodeAnswerForm's next-step rows,
// the branch can point to a brand new scene or link to one that already
// exists elsewhere in the plan (see wouldCreateCycle in sessionPlanner.js).
export default function BranchForm({ planId, parentNodeId, nodes, edges, existingChildCount, onSaved, onCancel }) {
  const [mode, setMode] = useState('new')
  const [text, setText] = useState('')
  const [contentType, setContentType] = useState('question')
  const [existingNodeId, setExistingNodeId] = useState(null)
  const [picking, setPicking] = useState(false)
  const [isObstacle, setIsObstacle] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function changeContentType(type) {
    setContentType(type)
    setIsObstacle(contentTypeInfo(type).defaultIsObstacle)
  }

  function changeMode(newMode) {
    setMode(newMode)
    setText('')
    setExistingNodeId(null)
  }

  async function handleSave(e) {
    e.preventDefault()
    if (mode === 'new' && !text.trim()) {
      setError("This can't be empty.")
      return
    }
    if (mode === 'existing' && !existingNodeId) {
      setError('Choose a scene to link to.')
      return
    }
    if (mode === 'existing' && wouldCreateCycle(edges, parentNodeId, existingNodeId)) {
      const target = nodes.find((n) => n.id === existingNodeId)
      setError(`Linking to "${target?.question ?? 'that scene'}" would create a loop - it already leads back to this scene.`)
      return
    }

    setSaving(true)
    setError(null)

    let toNodeId = existingNodeId
    if (mode === 'new') {
      const { data: created, error: insertNodeError } = await supabase
        .from('session_plan_nodes')
        .insert({ plan_id: planId, question: text.trim(), content_type: contentType })
        .select()
        .single()
      if (insertNodeError) {
        setSaving(false)
        setError(insertNodeError.message)
        return
      }
      toNodeId = created.id
    }

    const { error: edgeError } = await supabase.from('session_plan_edges').insert({
      plan_id: planId,
      from_node_id: parentNodeId,
      to_node_id: toNodeId,
      is_obstacle: isObstacle,
      sort_order: existingChildCount,
    })
    setSaving(false)
    if (edgeError) {
      setError(edgeError.message)
      return
    }
    onSaved()
  }

  return (
    <form onSubmit={handleSave} className="dm-form node-creation-form">
      <label>
        Connect to
        <select value={mode} onChange={(e) => changeMode(e.target.value)}>
          <option value="new">A new scene</option>
          <option value="existing">An existing scene</option>
        </select>
      </label>

      {mode === 'new' ? (
        <>
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
        </>
      ) : (
        <div className="dm-form-row">
          <button type="button" className="secondary" onClick={() => setPicking(true)}>
            {existingNodeId ? nodes.find((n) => n.id === existingNodeId)?.question ?? 'Choose a scene...' : 'Choose a scene...'}
          </button>
          {picking && (
            <NodePicker
              nodes={nodes}
              excludeNodeId={parentNodeId}
              onSelect={(picked) => {
                setExistingNodeId(picked.id)
                setPicking(false)
              }}
              onCancel={() => setPicking(false)}
            />
          )}
        </div>
      )}

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
