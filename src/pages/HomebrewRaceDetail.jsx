import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { supabase } from '../lib/supabaseClient'
import { formatAbilityBonuses, formatRaceSpeed } from '../lib/homebrew'
import NestedFeatureList from '../components/homebrew/NestedFeatureList'

export default function HomebrewRaceDetail() {
  const { slug } = useParams()
  const [race, setRace] = useState(undefined)
  const [traits, setTraits] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setRace(undefined)
    supabase
      .from('homebrew_races')
      .select('*')
      .eq('slug', slug)
      .maybeSingle()
      .then(async ({ data: raceRow, error: fetchError }) => {
        if (cancelled) return
        if (fetchError) {
          setError(fetchError.message)
          setRace(null)
          return
        }
        if (!raceRow) {
          setRace(null)
          return
        }
        const { data: traitData } = await supabase
          .from('homebrew_race_traits')
          .select('*')
          .eq('race_id', raceRow.id)
          .order('sort_order', { ascending: true })
        if (cancelled) return
        setRace(raceRow)
        setTraits(traitData ?? [])
      })
    return () => {
      cancelled = true
    }
  }, [slug])

  if (race === undefined) return <p className="status-message">Loading...</p>
  if (race === null) return <p className="status-message error">{error ?? 'Race not found.'}</p>

  const abilityText = formatAbilityBonuses(race.ability_bonuses, race.ability_bonus_note)

  return (
    <section className="page homebrew-class-detail">
      <div className="view-header">
        <h1>
          {race.name} {race.visibility === 'dm' && <span className="badge badge-dm">DM only</span>}
        </h1>
        {race.description && (
          <div className="view-subtitle homebrew-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{race.description}</ReactMarkdown>
          </div>
        )}
      </div>

      <div className="homebrew-stat-block">
        <div>
          <strong>Creature Type</strong> {race.creature_type}
        </div>
        <div>
          <strong>Size</strong> {race.sizes.join(' or ')}
        </div>
        <div>
          <strong>Speed</strong> {formatRaceSpeed(race)}
        </div>
        {race.darkvision != null && (
          <div>
            <strong>Darkvision</strong> {race.darkvision} ft.
          </div>
        )}
      </div>

      <div className="homebrew-proficiencies">
        {abilityText && (
          <p>
            <strong>Ability Score Increase:</strong> {abilityText}
          </p>
        )}
        {race.languages.length > 0 && (
          <p>
            <strong>Languages:</strong> {race.languages.join(', ')}
          </p>
        )}
      </div>

      {traits.length > 0 && (
        <div className="homebrew-features">
          <h2>Traits</h2>
          <NestedFeatureList features={traits} headingLevel={3} />
        </div>
      )}
    </section>
  )
}
