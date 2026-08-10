import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useCampaignContext } from '../../contexts/CampaignContext'
import { ANCHOR_QUESTIONS } from '../../lib/sessionPlanner'

const STATUS_LABELS = { planning: 'Planning', ready: 'Ready to run', done: 'Done' }

export default function DMSessionPlannerPage() {
  const navigate = useNavigate()
  const { campaigns } = useCampaignContext()
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [name, setName] = useState('')
  const [campaignId, setCampaignId] = useState('')
  const [sessionDate, setSessionDate] = useState('')
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('session_plans').select('*').order('updated_at', { ascending: false })
    setPlans(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleCreate(e) {
    e.preventDefault()
    if (!name.trim()) return
    setCreating(true)
    const { data: planData, error: insertError } = await supabase
      .from('session_plans')
      .insert({ name: name.trim(), campaign_id: campaignId || null, session_date: sessionDate || null })
      .select()
      .single()
    if (insertError) {
      setCreating(false)
      setError(insertError.message)
      return
    }
    const { error: nodesError } = await supabase.from('session_plan_nodes').insert(
      ANCHOR_QUESTIONS.map((question, i) => ({
        plan_id: planData.id,
        parent_node_id: null,
        question,
        sort_order: i,
      }))
    )
    setCreating(false)
    if (nodesError) {
      // Don't leave a plan with missing anchors and no UI left to add them - roll back.
      await supabase.from('session_plans').delete().eq('id', planData.id)
      setError(nodesError.message)
      return
    }
    navigate(`/dm/session-planner/${planData.id}`)
  }

  async function handleDelete(id) {
    if (!confirm('Delete this session plan? This removes every beat in it.')) return
    const { error: deleteError } = await supabase.from('session_plans').delete().eq('id', id)
    if (deleteError) setError(deleteError.message)
    else load()
  }

  if (loading) return <p className="status-message">Loading...</p>

  return (
    <section className="page-wide">
      <div className="view-header">
        <h1>Session Planner</h1>
        <p className="view-subtitle">
          Every plan starts with three fixed questions. Answer one, list the obstacles in the
          way, and each obstacle becomes the next question.
        </p>
      </div>

      <div className="dm-panel">
        <h2>New Plan</h2>
        <form onSubmit={handleCreate} className="dm-form dm-form-row">
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Session 12" required />
          </label>
          <label>
            Campaign
            <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
              <option value="">General (no campaign)</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Session date (optional)
            <input type="date" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} />
          </label>
          <button type="submit" disabled={creating}>
            + Start planning
          </button>
        </form>
      </div>

      {error && <p className="status-message error">{error}</p>}

      <ul className="dm-list">
        {plans.map((p) => (
          <li key={p.id}>
            <Link to={`/dm/session-planner/${p.id}`}>{p.name}</Link>
            <span className="dm-list-meta">{campaigns.find((c) => c.id === p.campaign_id)?.name ?? 'General'}</span>
            <span className="dm-list-meta">{STATUS_LABELS[p.status] ?? p.status}</span>
            <span className="dm-list-meta">Updated {new Date(p.updated_at).toLocaleDateString()}</span>
            <div className="dm-list-actions">
              <button type="button" className="danger" onClick={() => handleDelete(p.id)}>
                Delete
              </button>
            </div>
          </li>
        ))}
        {plans.length === 0 && <li className="status-message">No session plans yet.</li>}
      </ul>
    </section>
  )
}
