import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import SessionPlanDiagram from '../sessionplanner/SessionPlanDiagram'

// Read-only embed of a session plan's flow chart. SessionPlanDiagram's
// onNodeClick/selectedNodeId are both fully optional (every interactive
// affordance in it is gated on onNodeClick being present), so omitting them
// gives a genuinely inert render with no changes needed to that component.
export default function SessionFlowWidget({ config, onConfigChange }) {
  const sessionPlanId = config?.sessionPlanId ?? null
  const [plans, setPlans] = useState([])
  const [selected, setSelected] = useState('')
  const [plan, setPlan] = useState(null)
  const [nodes, setNodes] = useState([])
  const [edges, setEdges] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

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
        <SessionPlanDiagram nodes={nodes} edges={edges} />
      </div>
    </div>
  )
}
