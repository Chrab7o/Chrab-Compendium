import { Fragment, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { supabase } from '../lib/supabaseClient'
import { backgroundFeatOptions, formatBackgroundAbilities } from '../lib/homebrew'
import NestedFeatureList from '../components/homebrew/NestedFeatureList'

// The homebrew feat the origin-feat text names: by its full name, else
// without a trailing variant, so "Magic Initiate (Wizard)" finds the
// "Magic Initiate" feat the 5etools picker added.
async function findFeat(name) {
  if (!name) return { data: null }
  const byName = (n) => supabase.from('homebrew_feats').select('slug').ilike('name', n).maybeSingle()
  const exact = await byName(name)
  const base = name.replace(/\s*\([^)]*\)\s*$/, '')
  return exact.data || base === name ? exact : byName(base)
}

export default function HomebrewBackgroundDetail() {
  const { slug } = useParams()
  const [background, setBackground] = useState(undefined)
  const [features, setFeatures] = useState([])
  // The homebrew feat each origin-feat option names, when there is one
  // (slug or null) - the field is free text so it can name an official feat.
  const [featLinks, setFeatLinks] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setBackground(undefined)
    setFeatLinks([])
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
        const [{ data: featureData }, ...featRows] = await Promise.all([
          supabase
            .from('homebrew_background_features')
            .select('*')
            .eq('background_id', row.id)
            .order('sort_order', { ascending: true }),
          ...backgroundFeatOptions(row.feat).map(findFeat),
        ])
        if (cancelled) return
        setBackground(row)
        setFeatures(featureData ?? [])
        setFeatLinks(featRows.map((r) => r.data?.slug ?? null))
      })
    return () => {
      cancelled = true
    }
  }, [slug])

  if (background === undefined) return <p className="status-message">Loading...</p>
  if (background === null) return <p className="status-message error">{error ?? 'Background not found.'}</p>

  const abilityText = formatBackgroundAbilities(background.ability_options, background.ability_note)
  const featOptions = backgroundFeatOptions(background.feat)
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
        {featOptions.length > 0 && (
          <p>
            <strong>{featOptions.length > 1 ? 'Feat (choose one):' : 'Feat:'}</strong>{' '}
            {featOptions.map((option, i) => (
              <Fragment key={option}>
                {i > 0 && ' or '}
                {featLinks[i] ? <Link to={`/homebrew/feats/${featLinks[i]}`}>{option}</Link> : option}
              </Fragment>
            ))}
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
