import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useCampaignContext } from '../../contexts/CampaignContext'
import SkillTreeManager from '../../components/dm/SkillTreeManager'
import SkillTreeNodeEditor from '../../components/dm/SkillTreeNodeEditor'

export default function DMSkillTreesPage() {
  const { campaigns } = useCampaignContext()
  const [trees, setTrees] = useState([])
  const [characters, setCharacters] = useState([])
  const [visibleToRows, setVisibleToRows] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: treeData }, { data: characterData }, { data: visibleToData }] = await Promise.all([
      supabase.from('skill_trees').select('*').order('name', { ascending: true }),
      supabase.from('characters').select('id, name').order('name', { ascending: true }),
      supabase.from('skill_tree_visible_to').select('*'),
    ])
    setTrees(treeData ?? [])
    setCharacters(characterData ?? [])
    setVisibleToRows(visibleToData ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (loading) return <p className="status-message">Loading...</p>

  return (
    <section className="page-wide">
      <div className="view-header">
        <h1>Skill Trees</h1>
        <p className="view-subtitle">
          System-agnostic — nodes just have a name, description, and point cost. Players spend
          points tied to their own character to unlock them, from the top down (a node needs its
          parent unlocked first).
        </p>
      </div>
      <SkillTreeManager
        trees={trees}
        campaigns={campaigns}
        characters={characters}
        visibleToRows={visibleToRows}
        onChange={load}
      />
      <SkillTreeNodeEditor trees={trees} />
    </section>
  )
}
