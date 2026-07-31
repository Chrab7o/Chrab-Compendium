import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { childNodes, descendantCount, nodeTypeInfo } from '../../lib/sessionPlanner'
import SessionPlanDiagram from '../../components/dm/sessionplanner/SessionPlanDiagram'
import NodeCreationForm from '../../components/dm/sessionplanner/NodeCreationForm'
import SessionNotesPanel from '../../components/dm/sessionplanner/SessionNotesPanel'

const STATUS_OPTIONS = [
  { value: 'planning', label: 'Planning' },
  { value: 'ready', label: 'Ready to run' },
  { value: 'done', label: 'Done' },
]

export default function SessionPlanEditorPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [plan, setPlan] = useState(null)
  const [nodes, setNodes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  // null = no form open; 'create' = adding a new beat under formParentId;
  // 'edit' = editing the currently-selected node in place.
  const [formMode, setFormMode] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: planData, error: planError }, { data: nodeData }] = await Promise.all([
      supabase.from('session_plans').select('*').eq('id', id).single(),
      supabase.from('session_plan_nodes').select('*').eq('plan_id', id),
    ])
    if (planError) {
      setError(planError.message)
      setLoading(false)
      return
    }
    setPlan(planData)
    setNodes(nodeData ?? [])
    setLoading(false)
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  async function handleStatusChange(status) {
    const { error: updateError } = await supabase.from('session_plans').update({ status }).eq('id', id)
    if (updateError) setError(updateError.message)
    else load()
  }

  async function handleDeletePlan() {
    if (!confirm('Delete this entire session plan? This removes every beat in it.')) return
    const { error: deleteError } = await supabase.from('session_plans').delete().eq('id', id)
    if (deleteError) setError(deleteError.message)
    else navigate('/dm/session-planner')
  }

  async function handleDeleteNode(node) {
    const descendants = descendantCount(node.id, nodes)
    const warning =
      descendants > 0
        ? `Delete "${node.title}"? This also deletes ${descendants} beat${descendants === 1 ? '' : 's'} under it.`
        : `Delete "${node.title}"?`
    if (!confirm(warning)) return
    const { error: deleteError } = await supabase.from('session_plan_nodes').delete().eq('id', node.id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    setSelectedNodeId(null)
    load()
  }

  function handleNodeClick(node) {
    setSelectedNodeId((current) => (current === node.id ? null : node.id))
    setFormMode(null)
  }

  function closeForm() {
    setFormMode(null)
  }

  function afterSave() {
    setFormMode(null)
    load()
  }

  if (loading) return <p className="status-message">Loading...</p>
  if (!plan) return <p className="status-message error">{error ?? 'Plan not found.'}</p>

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null
  const childrenOfSelected = selectedNode ? childNodes(nodes, selectedNode.id) : []
  const nextLabel = childrenOfSelected.length > 0 ? '+ Add another branch' : '+ What happens next?'
  const rootNodes = childNodes(nodes, null)

  return (
    <section className="page-wide">
      <div className="view-header">
        <h1>{plan.name}</h1>
        <div className="dm-form-actions">
          <select value={plan.status} onChange={(e) => handleStatusChange(e.target.value)}>
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <button type="button" className="danger" onClick={handleDeletePlan}>
            Delete Plan
          </button>
        </div>
      </div>

      {error && <p className="status-message error">{error}</p>}

      <div className="session-plan-layout">
        <SessionPlanDiagram nodes={nodes} selectedNodeId={selectedNodeId} onNodeClick={handleNodeClick} />

        {rootNodes.length === 0 && !formMode && (
          <div className="dm-form-actions">
            <button type="button" onClick={() => setFormMode('create')}>
              + What happens first?
            </button>
          </div>
        )}

        {formMode === 'create' && (
          <NodeCreationForm
            planId={id}
            campaignId={plan.campaign_id}
            parentNodeId={selectedNode?.id ?? null}
            requireBranchLabel={childrenOfSelected.length > 0}
            nextSortOrder={selectedNode ? childrenOfSelected.length : rootNodes.length}
            onSaved={afterSave}
            onCancel={closeForm}
          />
        )}

        {formMode === 'edit' && selectedNode && (
          <NodeCreationForm
            planId={id}
            campaignId={plan.campaign_id}
            existingNode={selectedNode}
            onSaved={afterSave}
            onCancel={closeForm}
          />
        )}

        {selectedNode && !formMode && (
          <aside className="region-panel">
            <div className="region-panel-header">
              <h2>{selectedNode.title}</h2>
              <button type="button" className="secondary" onClick={() => setSelectedNodeId(null)}>
                Close
              </button>
            </div>
            <p className="dm-list-meta">{nodeTypeInfo(selectedNode.node_type).label}</p>
            {selectedNode.branch_label && (
              <p className="dm-list-meta">Branch: {selectedNode.branch_label}</p>
            )}
            {nodeTypeInfo(selectedNode.node_type).questions.map((q) =>
              selectedNode.answers?.[q.key] ? (
                <p key={q.key}>
                  <strong>{q.prompt}</strong>
                  <br />
                  {selectedNode.answers[q.key]}
                </p>
              ) : null
            )}
            {selectedNode.referenced_entry_id && (
              <p>
                <Link to={`/entry/${selectedNode.referenced_entry_id}`}>View linked entry →</Link>
              </p>
            )}
            <div className="dm-form-actions">
              <button type="button" onClick={() => setFormMode('create')}>
                {nextLabel}
              </button>
              <button type="button" className="secondary" onClick={() => setFormMode('edit')}>
                Edit
              </button>
              <button type="button" className="danger" onClick={() => handleDeleteNode(selectedNode)}>
                Delete
              </button>
            </div>
          </aside>
        )}

        <SessionNotesPanel campaignId={plan.campaign_id} />
      </div>
    </section>
  )
}
