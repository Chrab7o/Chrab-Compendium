import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import SkillTreeProgress from '../../components/SkillTreeProgress'

export default function DMCharacterSkillTreePage() {
  const { id } = useParams()
  const [character, setCharacter] = useState(undefined)

  useEffect(() => {
    supabase
      .from('characters')
      .select('id, name')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => setCharacter(data ?? null))
  }, [id])

  if (character === undefined) return <p className="page status-message">Loading...</p>
  if (character === null) return <p className="page status-message error">Couldn't find that character.</p>

  return (
    <section className="page">
      <div className="view-header">
        <h1>{character.name}'s Skill Tree</h1>
        <p className="view-subtitle">
          Read-only — grant points from DM Dashboard → Characters. Note: you're viewing this as
          the DM, so any "restrict to specific players" setting doesn't hide anything from
          you — sign in as the actual player to confirm what they see.
        </p>
      </div>
      <SkillTreeProgress characterId={id} editable={false} />
    </section>
  )
}
