import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { supabase } from '../lib/supabaseClient'
import { sortByLevel, splitChoiceGroups } from '../lib/homebrew'

export default function HomebrewSubclassDetail() {
  const { slug } = useParams()
  const [subclass, setSubclass] = useState(undefined)
  const [features, setFeatures] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setSubclass(undefined)
    supabase
      .from('homebrew_subclasses')
      .select('*')
      .eq('slug', slug)
      .is('class_id', null)
      .maybeSingle()
      .then(async ({ data: subclassRow, error: fetchError }) => {
        if (cancelled) return
        if (fetchError) {
          setError(fetchError.message)
          setSubclass(null)
          return
        }
        if (!subclassRow) {
          setSubclass(null)
          return
        }
        const { data: featureData } = await supabase
          .from('homebrew_subclass_features')
          .select('*')
          .eq('subclass_id', subclassRow.id)
        if (cancelled) return
        setSubclass(subclassRow)
        setFeatures(featureData ?? [])
      })
    return () => {
      cancelled = true
    }
  }, [slug])

  if (subclass === undefined) return <p className="status-message">Loading...</p>
  if (subclass === null) return <p className="status-message error">{error ?? 'Subclass not found.'}</p>

  const byLevel = new Map()
  for (const f of sortByLevel(features)) {
    if (!byLevel.has(f.level)) byLevel.set(f.level, [])
    byLevel.get(f.level).push(f)
  }
  const levels = [...byLevel.keys()].sort((a, b) => a - b)

  return (
    <section className="page homebrew-class-detail">
      <div className="view-header">
        <h1>{subclass.name}</h1>
        <p className="view-subtitle">For {subclass.parent_class_name}</p>
        {subclass.description && (
          <div className="view-subtitle homebrew-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{subclass.description}</ReactMarkdown>
          </div>
        )}
      </div>

      {levels.length > 0 && (
        <div className="homebrew-features">
          <h2>Features</h2>
          {levels.map((level) => {
            const { ungrouped, groups: choiceGroups } = splitChoiceGroups(byLevel.get(level))
            return (
              <div key={level}>
                <h2 className="homebrew-level-heading">Level {level}</h2>
                {ungrouped.map((f) => (
                  <div key={f.id} className="homebrew-feature">
                    <h3>{f.name}</h3>
                    {f.description && (
                      <div className="homebrew-markdown">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{f.description}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                ))}
                {choiceGroups.map((choiceGroup) => (
                  <div key={choiceGroup.name} className="homebrew-choice-group">
                    <h4 className="homebrew-group-label">
                      {choiceGroup.name} — choose {choiceGroup.features[0]?.choice_count || 1} of the following
                    </h4>
                    {choiceGroup.features.map((f) => (
                      <div key={f.id} className="homebrew-choice-feature">
                        <h5>{f.name}</h5>
                        {f.description && (
                          <div className="homebrew-markdown">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{f.description}</ReactMarkdown>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
