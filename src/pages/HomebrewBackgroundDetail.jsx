import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { supabase } from '../lib/supabaseClient'
import { formatBackgroundAbilities } from '../lib/homebrew'
import NestedFeatureList from '../components/homebrew/NestedFeatureList'

export default function HomebrewBackgroundDetail() {
  const { slug } = useParams()
  const [background, setBackground] = useState(undefined)
  const [features, setFeatures] = useState([])
  // The homebrew feat the origin-feat field names, when there is one -
  // the field is free text so it can also name an official feat.
  const [featLink, setFeatLink] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setBackground(undefined)
    setFeatLink(null)
    supabase
      .from('homebrew_backgrounds')
      .select('*')
      .eq('slug', slug)
      .maybeSingle()
      .then(async ({ data: row, error: fetchError }) => {
        if (cancelled) return
        if (fetchError) {
          setError(fetchError.message)
          setBackground(null)
          return
        }
        if (!row) {
          setBackground(null)
          return
        }
        const [{ data: featureData }, { data: featRow }] = await Promise.all([
          supabase
            .from('homebrew_background_features')
            .select('*')
            .eq('background_id', row.id)
            .order('sort_order', { ascending: true }),
          row.feat
            ? supabase.from('homebrew_feats').select('slug').ilike('name', row.feat).maybeSingle()
            : Promise.resolve({ data: null }),
        ])
        if (cancelled) return
        setBackground(row)
        setFeatures(featureData ?? [])
        setFeatLink(featRow?.slug ?? null)
      })
    return () => {
      cancelled = true
    }
  }, [slug])

  if (background === undefined) return <p className="status-message">Loading...</p>
  if (background === null) return <p className="status-message error">{error ?? 'Background not found.'}</p>

  const abilityText = formatBackgroundAbilities(background.ability_options, background.ability_note)
  const listRows = [
    ['Skill Proficiencies', background.skill_proficiencies.join(', ')],
    ['Tool Proficiencies', background.tool_proficiencies.join(', ')],
    ['Languages', background.languages.join(', ')],
    ['Equipment', background.equipment],
  ].filter(([, text]) => text)

  return (
    <section className="page homebrew-class-detail">
      <div className="view-header">
        <h1>
          {background.name} {background.visibility === 'dm' && <span className="badge badge-dm">DM only</span>}
        </h1>
        {background.description && (
          <div className="view-subtitle homebrew-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{background.description}</ReactMarkdown>
          </div>
        )}
      </div>

      <div className="homebrew-proficiencies">
        {abilityText && (
          <p>
            <strong>Ability Scores:</strong> {abilityText}
          </p>
        )}
        {background.feat && (
          <p>
            <strong>Feat:</strong>{' '}
            {featLink ? <Link to={`/homebrew/feats/${featLink}`}>{background.feat}</Link> : background.feat}
          </p>
        )}
        {listRows.map(([label, text]) => (
          <p key={label}>
            <strong>{label}:</strong> {text}
          </p>
        ))}
      </div>

      {features.length > 0 && (
        <div className="homebrew-features">
          <h2>Features</h2>
          <NestedFeatureList features={features} headingLevel={3} />
        </div>
      )}
    </section>
  )
}
