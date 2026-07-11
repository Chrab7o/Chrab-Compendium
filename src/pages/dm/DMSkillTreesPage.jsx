import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useCampaignContext } from '../../contexts/CampaignContext'
import SkillTreeManager from '../../components/dm/SkillTreeManager'
import SkillTreeNodeEditor from '../../components/dm/SkillTreeNodeEditor'

export default function DMSkillTreesPage() {
  const { campaigns } = useCampaignContext()
  const [trees, setTrees] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('skill_trees').select('*').order('name', { ascending: true })
    setTrees(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (loading) return <p className="status-message">Loading...</p>

  return (
    <section className="page">
      <div className="view-header">
        <h1>Skill Trees</h1>
        <p className="view-subtitle">
          System-agnostic — nodes just have a name, description, and point cost. Players spend
          points tied to their own character to unlock them, from the top down (a node needs its
          parent unlocked first).
        </p>
      </div>
      <SkillTreeManager trees={trees} campaigns={campaigns} onChange={load} />
      <SkillTreeNodeEditor trees={trees} />
    </section>
  )
}
