import { forwardRef, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../../lib/supabaseClient'
import { contentTypeInfo, isAnswered } from '../../../lib/sessionPlanner'
import SessionPlanDiagram from '../sessionplanner/SessionPlanDiagram'

// Read-only embed of a session plan's flow chart - click a scene on the
// timeline to see what was actually filled in (question/answer, location/
// characters/purpose, linked entry) below it, not just the rough outline.
// SessionPlanDiagram's onNodeClick/selectedNodeId are both fully optional
// (every interactive affordance in it is gated on onNodeClick being
// present), so wiring them up here is the only change needed to that
// shared component. No edit/branch/delete actions here on purpose - this is
// a glance-at-it-mid-session reference view, not the editor; use the full
// Session Planner page for that.
// Picking a plan writes immediately (no debounce), so there's nothing for
// the page-level Save button to flush here - wrapped in forwardRef anyway,
// purely so DMScreenPage can attach a ref uniformly to every widget type
// without React warning about refs on a plain function component.
const SessionFlowWidget = forwardRef(function SessionFlowWidget({ config, onConfigChange }, _ref) {
  const sessionPlanId = config?.sessionPlanId ?? null
  const [plans, setPlans] = useState([])
  const [selected, setSelected] = useState('')
  const [plan, setPlan] = useState(null)
  const [nodes, setNodes] = useState([])
  const [edges, setEdges] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [selectedNodeId, setSelectedNodeId] = useState(null)

  useEffect(() => {
    if (sessionPlanId) return
    supabase
      .from('session_plans')
      .select('id, name')
      .order('updated_at', { ascending: false })
      .then(({ data }) => setPlans(data ?? []))
  }, [sessionPlanId])

  useEffect(() => {
    if (!sessionPlanId) return
    let cancelled = false
    setLoading(true)
    Promise.all([
      supabase.from('session_plans').select('*').eq('id', sessionPlanId).maybeSingle(),
      supabase.from('session_plan_nodes').select('*').eq('plan_id', sessionPlanId),
      supabase.from('session_plan_edges').select('*').eq('plan_id', sessionPlanId),
    ]).then(([{ data: planData, error: planError }, { data: nodeData }, { data: edgeData }]) => {
      if (cancelled) return
      if (planError || !planData) {
        // The plan this widget pointed at was deleted since it was
        // configured - self-heal back to the picker rather than rendering
        // a broken diagram.
        setError('That session plan no longer exists.')
        onConfigChange({ sessionPlanId: null })
        setLoading(false)
        return
      }
      setPlan(planData)
      setNodes(nodeData ?? [])
      setEdges(edgeData ?? [])
      setSelectedNodeId(null)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [sessionPlanId, onConfigChange])

  function handleUsePlan() {
    if (!selected) return
    onConfigChange({ sessionPlanId: selected })
  }

  function handleNodeClick(node) {
    setSelectedNodeId((current) => (current === node.id ? null : node.id))
  }

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null

  if (!sessionPlanId) {
    return (
      <div className="dm-screen-widget-body">
        {error && <p className="status-message error">{error}</p>}
        {plans.length === 0 ? (
          <p className="status-message">No session plans yet.</p>
        ) : (
          <div className="dm-form-row">
            <select value={selected} onChange={(e) => setSelected(e.target.value)}>
              <option value="">Choose a session plan...</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button type="button" disabled={!selected} onClick={handleUsePlan}>
              Use this plan
            </button>
          </div>
        )}
      </div>
    )
  }

  if (loading) return <p className="status-message">Loading...</p>

  return (
    <div className="dm-screen-widget-body">
      <div className="dm-screen-flow-header">
        <strong>{plan?.name}</strong>
        <button type="button" className="link-button" onClick={() => onConfigChange({ sessionPlanId: null })}>
          Change plan
        </button>
      </div>
      <div className="dm-screen-flow-wrap">
        <SessionPlanDiagram
          nodes={nodes}
          edges={edges}
          selectedNodeId={selectedNodeId}
          onNodeClick={handleNodeClick}
        />
      </div>
      {selectedNode && (
        <div className="dm-screen-flow-detail">
          <div className="dm-screen-widget-header">
            <strong>{selectedNode.question}</strong>
            <button type="button" className="icon-button" title="Close" aria-label="Close" onClick={() => setSelectedNodeId(null)}>
              ✕
            </button>
          </div>
          <p className="dm-list-meta">{contentTypeInfo(selectedNode.content_type).label}</p>
          {(selectedNode.location || selectedNode.characters || selectedNode.purpose) && (
            <p className="dm-list-meta">
              {[
                selectedNode.location && `Location: ${selectedNode.location}`,
                selectedNode.characters && `Characters: ${selectedNode.characters}`,
                selectedNode.purpose && `Purpose: ${selectedNode.purpose}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
          {isAnswered(selectedNode) ? (
            <p>{selectedNode.answer}</p>
          ) : (
            <p className="status-message">{contentTypeInfo(selectedNode.content_type).emptyBodyLabel}</p>
          )}
          {selectedNode.referenced_entry_id && (
            <p>
              <Link to={`/entry/${selectedNode.referenced_entry_id}`}>View linked entry →</Link>
            </p>
          )}
        </div>
      )}
    </div>
  )
})

export default SessionFlowWidget
