import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { supabase } from '../lib/supabaseClient'
import { formatAbilityBonuses } from '../lib/homebrew'
import NestedFeatureList from '../components/homebrew/NestedFeatureList'

export default function HomebrewFeatDetail() {
  const { slug } = useParams()
  const [feat, setFeat] = useState(undefined)
  const [benefits, setBenefits] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setFeat(undefined)
    supabase
      .from('homebrew_feats')
      .select('*')
      .eq('slug', slug)
      .maybeSingle()
      .then(async ({ data: featRow, error: fetchError }) => {
        if (cancelled) return
        if (fetchError) {
          setError(fetchError.message)
          setFeat(null)
          return
        }
        if (!featRow) {
          setFeat(null)
          return
        }
        const { data: benefitData } = await supabase
          .from('homebrew_feat_benefits')
          .select('*')
          .eq('feat_id', featRow.id)
          .order('sort_order', { ascending: true })
        if (cancelled) return
        setFeat(featRow)
        setBenefits(benefitData ?? [])
      })
    return () => {
      cancelled = true
    }
  }, [slug])

  if (feat === undefined) return <p className="status-message">Loading...</p>
  if (feat === null) return <p className="status-message error">{error ?? 'Feat not found.'}</p>

  const abilityText = formatAbilityBonuses(feat.ability_bonuses, feat.ability_bonus_note)

  return (
    <section className="page homebrew-class-detail">
      <div className="view-header">
        <h1>
          {feat.name} {feat.visibility === 'dm' && <span className="badge badge-dm">DM only</span>}
        </h1>
        {feat.category && <p className="view-subtitle">{feat.category} Feat</p>}
      </div>

      {(feat.prerequisite || feat.repeatable) && (
        <div className="homebrew-stat-block">
          {feat.prerequisite && (
            <div>
              <strong>Prerequisite</strong> {feat.prerequisite}
            </div>
          )}
          {feat.repeatable && (
            <div>
              <strong>Repeatable</strong> Yes
            </div>
          )}
        </div>
      )}

      {feat.description && (
        <div className="homebrew-markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{feat.description}</ReactMarkdown>
        </div>
      )}

      {abilityText && (
        <div className="homebrew-proficiencies">
          <p>
            <strong>Ability Score Increase:</strong> {abilityText}
          </p>
        </div>
      )}

      {benefits.length > 0 && (
        <div className="homebrew-features">
          <NestedFeatureList features={benefits} headingLevel={3} />
        </div>
      )}
    </section>
  )
}
