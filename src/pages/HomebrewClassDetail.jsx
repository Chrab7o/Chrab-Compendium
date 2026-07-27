import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { supabase } from '../lib/supabaseClient'
import { ABILITY_LABELS, SPELLCASTING_PROGRESSIONS, sortByLevel, splitChoiceGroups } from '../lib/homebrew'

export default function HomebrewClassDetail() {
  const { slug } = useParams()
  const [cls, setCls] = useState(undefined)
  const [features, setFeatures] = useState([])
  const [tableColumns, setTableColumns] = useState([])
  const [tableValues, setTableValues] = useState([])
  const [subclasses, setSubclasses] = useState([])
  const [subclassFeatures, setSubclassFeatures] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setCls(undefined)
    supabase
      .from('homebrew_classes')
      .select('*')
      .eq('slug', slug)
      .maybeSingle()
      .then(async ({ data: classRow, error: fetchError }) => {
        if (cancelled) return
        if (fetchError) {
          setError(fetchError.message)
          setCls(null)
          return
        }
        if (!classRow) {
          setCls(null)
          return
        }
        const [{ data: featureData }, { data: columnData }, { data: subclassData }] = await Promise.all([
          supabase.from('homebrew_class_features').select('*').eq('class_id', classRow.id),
          supabase.from('homebrew_class_table_columns').select('*').eq('class_id', classRow.id),
          supabase.from('homebrew_subclasses').select('*').eq('class_id', classRow.id),
        ])
        if (cancelled) return
        const columnIds = (columnData ?? []).map((c) => c.id)
        const subclassIds = (subclassData ?? []).map((s) => s.id)
        const [{ data: valueData }, { data: subclassFeatureData }] = await Promise.all([
          columnIds.length > 0
            ? supabase.from('homebrew_class_table_values').select('*').in('column_id', columnIds)
            : Promise.resolve({ data: [] }),
          subclassIds.length > 0
            ? supabase.from('homebrew_subclass_features').select('*').in('subclass_id', subclassIds)
            : Promise.resolve({ data: [] }),
        ])
        if (cancelled) return
        setCls(classRow)
        setFeatures(featureData ?? [])
        setTableColumns((columnData ?? []).sort((a, b) => a.sort_order - b.sort_order))
        setTableValues(valueData ?? [])
        setSubclasses(subclassData ?? [])
        setSubclassFeatures(subclassFeatureData ?? [])
      })
    return () => {
      cancelled = true
    }
  }, [slug])

  if (cls === undefined) return <p className="status-message">Loading...</p>
  if (cls === null) return <p className="status-message error">{error ?? 'Class not found.'}</p>

  const levels = sortByLevel(features).reduce((acc, f) => {
    if (!acc.has(f.level)) acc.set(f.level, [])
    acc.get(f.level).push(f)
    return acc
  }, new Map())

  const valuesByColumn = new Map()
  for (const v of tableValues) {
    if (!valuesByColumn.has(v.column_id)) valuesByColumn.set(v.column_id, {})
    valuesByColumn.get(v.column_id)[v.level] = v.value
  }

  // A level with only a table-column value (e.g. a Sneak Attack die bump)
  // and no named feature still needs its own row - not just levels() keys.
  const allLevels = new Set(levels.keys())
  for (const v of tableValues) allLevels.add(v.level)

  const spellcastingLabel = SPELLCASTING_PROGRESSIONS.find((p) => p.value === cls.spellcasting_progression)?.label

  // Every level that has either a base feature or a subclass feature, in one
  // combined pass — subclass write-ups render inline at the level they
  // actually unlock, not shunted into a separate section at the end.
  const subclassesById = new Map(subclasses.map((s) => [s.id, s]))
  const writeupLevels = new Map()
  function atLevel(level) {
    if (!writeupLevels.has(level)) writeupLevels.set(level, { features: [], bySubclass: new Map() })
    return writeupLevels.get(level)
  }
  for (const f of sortByLevel(features)) atLevel(f.level).features.push(f)
  for (const f of sortByLevel(subclassFeatures)) {
    const bySubclass = atLevel(f.level).bySubclass
    if (!bySubclass.has(f.subclass_id)) bySubclass.set(f.subclass_id, [])
    bySubclass.get(f.subclass_id).push(f)
  }
  const sortedWriteupLevels = [...writeupLevels.keys()].sort((a, b) => a - b)
  const introducedSubclasses = new Set()

  return (
    <section className="page homebrew-class-detail">
      <div className="view-header">
        <h1>{cls.name}</h1>
        {cls.description && (
          <div className="view-subtitle homebrew-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{cls.description}</ReactMarkdown>
          </div>
        )}
      </div>

      <div className="homebrew-stat-block">
        <div>
          <strong>Hit Die</strong> d{cls.hit_die}
        </div>
        {cls.primary_ability && (
          <div>
            <strong>Primary Ability</strong> {cls.primary_ability}
          </div>
        )}
        {cls.saving_throw_proficiencies.length > 0 && (
          <div>
            <strong>Saving Throws</strong>{' '}
            {cls.saving_throw_proficiencies.map((a) => ABILITY_LABELS[a] ?? a).join(', ')}
          </div>
        )}
        {cls.spellcasting_progression !== 'none' && (
          <div>
            <strong>Spellcasting</strong> {spellcastingLabel}
            {cls.spellcasting_ability && ` (${ABILITY_LABELS[cls.spellcasting_ability] ?? cls.spellcasting_ability})`}
          </div>
        )}
      </div>

      <div className="homebrew-proficiencies">
        {cls.armor_proficiencies && (
          <p>
            <strong>Armor:</strong> {cls.armor_proficiencies}
          </p>
        )}
        {cls.weapon_proficiencies && (
          <p>
            <strong>Weapons:</strong> {cls.weapon_proficiencies}
          </p>
        )}
        {cls.tool_proficiencies && (
          <p>
            <strong>Tools:</strong> {cls.tool_proficiencies}
          </p>
        )}
        {cls.skill_choices_count > 0 && (
          <p>
            <strong>Skills:</strong> Choose {cls.skill_choices_count}
            {cls.skill_choices_options.length > 0 ? ` from ${cls.skill_choices_options.join(', ')}` : ' from any skill'}
          </p>
        )}
        {cls.starting_equipment && (
          <p>
            <strong>Starting Equipment:</strong> {cls.starting_equipment}
          </p>
        )}
      </div>

      {(features.length > 0 || tableColumns.length > 0) && (
        <div className="homebrew-level-table-wrap">
          <table className="homebrew-level-table">
            <thead>
              <tr>
                <th>Level</th>
                <th>Features</th>
                {tableColumns.map((col) => (
                  <th key={col.id}>{col.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...allLevels]
                .sort((a, b) => a - b)
                .map((level) => (
                  <tr key={level}>
                    <td>{level}</td>
                    <td>{(levels.get(level) ?? []).map((f) => f.name).join(', ') || '—'}</td>
                    {tableColumns.map((col) => (
                      <td key={col.id}>{valuesByColumn.get(col.id)?.[level] ?? '—'}</td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {sortedWriteupLevels.length > 0 && (
        <div className="homebrew-features">
          <h2>Features</h2>
          {sortedWriteupLevels.map((level) => {
            const group = writeupLevels.get(level)
            const { ungrouped, groups: choiceGroups } = splitChoiceGroups(group.features)
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
                {group.bySubclass.size > 0 && (
                  <div className="homebrew-subclass-level-group">
                    <h4 className="homebrew-group-label">{cls.subclass_label}</h4>
                    {[...group.bySubclass.entries()].map(([subclassId, feats]) => {
                      const subclass = subclassesById.get(subclassId)
                      const showIntro = !introducedSubclasses.has(subclassId)
                      introducedSubclasses.add(subclassId)
                      const { ungrouped: scUngrouped, groups: scChoiceGroups } = splitChoiceGroups(feats)
                      return (
                        <div key={subclassId} className="homebrew-subclass-feature-block">
                          <h4>{subclass?.name}</h4>
                          {showIntro && subclass?.description && (
                            <div className="homebrew-markdown">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{subclass.description}</ReactMarkdown>
                            </div>
                          )}
                          {scUngrouped.map((f) => (
                            <div key={f.id} className="homebrew-feature">
                              <h5>{f.name}</h5>
                              {f.description && (
                                <div className="homebrew-markdown">
                                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{f.description}</ReactMarkdown>
                                </div>
                              )}
                            </div>
                          ))}
                          {scChoiceGroups.map((choiceGroup) => (
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
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
