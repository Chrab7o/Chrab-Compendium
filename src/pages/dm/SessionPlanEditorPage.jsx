import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { childConnections, isAnswered, contentTypeInfo } from '../../lib/sessionPlanner'
import SessionPlanDiagram from '../../components/dm/sessionplanner/SessionPlanDiagram'
import NodeAnswerForm from '../../components/dm/sessionplanner/NodeAnswerForm'
import BranchForm from '../../components/dm/sessionplanner/BranchForm'
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
  const [edges, setEdges] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  // null = viewing; 'edit' = full answer form; 'branch' = quick add-a-branch form.
  const [formMode, setFormMode] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: planData, error: planError }, { data: nodeData }, { data: edgeData }] = await Promise.all([
      supabase.from('session_plans').select('*').eq('id', id).single(),
      supabase.from('session_plan_nodes').select('*').eq('plan_id', id),
      supabase.from('session_plan_edges').select('*').eq('plan_id', id),
    ])
    if (planError) {
      setError(planError.message)
      setLoading(false)
      return
    }
    setPlan(planData)
    setNodes(nodeData ?? [])
    setEdges(edgeData ?? [])
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
    if (!confirm('Delete this entire session plan? This removes every scene in it.')) return
    const { error: deleteError } = await supabase.from('session_plans').delete().eq('id', id)
    if (deleteError) setError(deleteError.message)
    else navigate('/dm/session-planner')
  }

  async function handleDeleteNode(node) {
    const connectionCount = childConnections(nodes, edges, node.id).length
    const warning =
      connectionCount > 0
        ? `Delete "${node.question}"? This removes its ${connectionCount} outgoing connection${connectionCount === 1 ? '' : 's'} too - scenes on the other end stay, unless this was their only path in, in which case they're left disconnected rather than deleted.`
        : `Delete "${node.question}"?`
    if (!confirm(warning)) return
    const { error: deleteError } = await supabase.from('session_plan_nodes').delete().eq('id', node.id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    setSelectedNodeId(null)
    load()
  }

  async function handleUnlink(edge) {
    if (!confirm('Remove this connection? The scene itself stays, just disconnected from here.')) return
    const { error: deleteError } = await supabase.from('session_plan_edges').delete().eq('id', edge.id)
    if (deleteError) setError(deleteError.message)
    else load()
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
  const isRootSelected = selectedNode ? selectedNode.id === plan.root_node_id : false
  const childrenOfSelected = selectedNode ? childConnections(nodes, edges, selectedNode.id) : []

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
        <SessionPlanDiagram nodes={nodes} edges={edges} selectedNodeId={selectedNodeId} onNodeClick={handleNodeClick} />

        {formMode === 'edit' && selectedNode && (
          <NodeAnswerForm
            planId={id}
            campaignId={plan.campaign_id}
            node={selectedNode}
            nodes={nodes}
            edges={edges}
            isRoot={isRootSelected}
            existingChildCount={childrenOfSelected.length}
            onSaved={afterSave}
            onCancel={closeForm}
          />
        )}

        {formMode === 'branch' && selectedNode && (
          <BranchForm
            planId={id}
            parentNodeId={selectedNode.id}
            nodes={nodes}
            edges={edges}
            existingChildCount={childrenOfSelected.length}
            onSaved={afterSave}
            onCancel={closeForm}
          />
        )}

        {selectedNode && !formMode && (
          <aside className="region-panel">
            <div className="region-panel-header">
              <h2>{selectedNode.question}</h2>
              <button type="button" className="secondary" onClick={() => setSelectedNodeId(null)}>
                Close
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
            {childrenOfSelected.length > 0 && (
              <div>
                <p className="dm-list-meta">What happens next:</p>
                <ul className="dm-list">
                  {childrenOfSelected.map(({ edge, node: child }) => (
                    <li key={edge.id}>
                      <button type="button" className="link-button" onClick={() => setSelectedNodeId(child.id)}>
                        {child.question}
                      </button>
                      <span className="dm-list-meta">
                        {contentTypeInfo(child.content_type).label} · {edge.is_obstacle ? 'Obstacle' : 'Then'}
                      </span>
                      <button type="button" className="link-button" onClick={() => handleUnlink(edge)}>
                        Unlink
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="dm-form-actions">
              <button type="button" onClick={() => setFormMode('edit')}>
                Edit
              </button>
              <button type="button" className="secondary" onClick={() => setFormMode('branch')}>
                + Branch
              </button>
              {!isRootSelected && (
                <button type="button" className="danger" onClick={() => handleDeleteNode(selectedNode)}>
                  Delete
                </button>
              )}
            </div>
          </aside>
        )}

        <SessionNotesPanel campaignId={plan.campaign_id} />
      </div>
    </section>
  )
}
