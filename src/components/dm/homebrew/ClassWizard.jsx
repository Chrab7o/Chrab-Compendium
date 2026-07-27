import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../../lib/supabaseClient'
import { useCampaignContext } from '../../../contexts/CampaignContext'
import {
  emptyClassForm,
  classToFormState,
  classFormToExportJson,
  classJsonToFormState,
  classFormToFiveToolsJson,
  fiveToolsJsonToClassForm,
  SPELLCASTING_PROGRESSIONS,
} from '../../../lib/homebrew'
import WizardShell from '../WizardShell'
import RepeatableRows from '../RepeatableRows'
import AbilityScorePicker from '../AbilityScorePicker'

const STEPS = [
  { key: 'basics', label: 'Basics' },
  { key: 'proficiencies', label: 'Proficiencies & Equipment' },
  { key: 'features', label: 'Level Features' },
  { key: 'table', label: 'Special Table Columns' },
  { key: 'subclasses', label: 'Subclasses' },
]

function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function emptySubclass(subclassLevels) {
  return {
    id: null,
    name: '',
    description: '',
    features: subclassLevels.map((level, i) => ({
      level,
      name: '',
      description: '',
      sort_order: i,
      choice_group: '',
      choice_count: null,
    })),
  }
}

export default function ClassWizard() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { campaigns } = useCampaignContext()
  const isNew = !id

  const [form, setForm] = useState(emptyClassForm)
  const [originalSubclassIds, setOriginalSubclassIds] = useState([])
  const [currentStep, setCurrentStep] = useState('basics')
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [newSkillOption, setNewSkillOption] = useState('')
  const [newSubclassLevel, setNewSubclassLevel] = useState('')

  useEffect(() => {
    if (isNew) return
    let cancelled = false
    setLoading(true)
    Promise.all([
      supabase.from('homebrew_classes').select('*').eq('id', id).single(),
      supabase.from('homebrew_class_features').select('*').eq('class_id', id),
      supabase.from('homebrew_class_table_columns').select('*').eq('class_id', id),
      supabase.from('homebrew_subclasses').select('*').eq('class_id', id),
    ]).then(async ([{ data: classRow, error: fetchError }, { data: features }, { data: tableColumns }, { data: subclasses }]) => {
      if (cancelled) return
      if (fetchError) {
        setError(fetchError.message)
        setLoading(false)
        return
      }
      const columnIds = (tableColumns ?? []).map((c) => c.id)
      const subclassIds = (subclasses ?? []).map((s) => s.id)
      const [{ data: tableValues }, { data: subclassFeatures }] = await Promise.all([
        columnIds.length > 0
          ? supabase.from('homebrew_class_table_values').select('*').in('column_id', columnIds)
          : Promise.resolve({ data: [] }),
        subclassIds.length > 0
          ? supabase.from('homebrew_subclass_features').select('*').in('subclass_id', subclassIds)
          : Promise.resolve({ data: [] }),
      ])
      if (cancelled) return
      const featuresBySubclassId = new Map()
      for (const f of subclassFeatures ?? []) {
        if (!featuresBySubclassId.has(f.subclass_id)) featuresBySubclassId.set(f.subclass_id, [])
        featuresBySubclassId.get(f.subclass_id).push(f)
      }
      setForm(
        classToFormState(classRow, features ?? [], tableColumns ?? [], tableValues ?? [], subclasses ?? [], featuresBySubclassId)
      )
      setOriginalSubclassIds(subclassIds)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [id, isNew])

  function addSkillOption() {
    const value = newSkillOption.trim()
    if (!value || form.skill_choices_options.includes(value)) return
    setForm({ ...form, skill_choices_options: [...form.skill_choices_options, value] })
    setNewSkillOption('')
  }

  function removeSkillOption(value) {
    setForm({ ...form, skill_choices_options: form.skill_choices_options.filter((s) => s !== value) })
  }

  function addSubclassLevel() {
    const level = Number(newSubclassLevel)
    if (!level || level < 1 || level > 20 || form.subclass_levels.includes(level)) return
    setForm({ ...form, subclass_levels: [...form.subclass_levels, level].sort((a, b) => a - b) })
    setNewSubclassLevel('')
  }

  function removeSubclassLevel(level) {
    setForm({ ...form, subclass_levels: form.subclass_levels.filter((l) => l !== level) })
  }

  function addSubclass() {
    setForm({ ...form, subclasses: [...form.subclasses, emptySubclass(form.subclass_levels)] })
  }

  function updateSubclass(index, patch) {
    setForm({
      ...form,
      subclasses: form.subclasses.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    })
  }

  function removeSubclass(index) {
    setForm({ ...form, subclasses: form.subclasses.filter((_, i) => i !== index) })
  }

  function addTableColumn() {
    setForm({ ...form, tableColumns: [...form.tableColumns, { id: null, name: '', valuesByLevel: {} }] })
  }

  function updateTableColumn(index, patch) {
    setForm({
      ...form,
      tableColumns: form.tableColumns.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    })
  }

  function removeTableColumn(index) {
    setForm({ ...form, tableColumns: form.tableColumns.filter((_, i) => i !== index) })
  }

  async function handleSave() {
    setSaving(true)
    setError(null)

    const payload = {
      name: form.name,
      slug: form.slug || slugify(form.name),
      description: form.description,
      hit_die: Number(form.hit_die),
      primary_ability: form.primary_ability,
      saving_throw_proficiencies: form.saving_throw_proficiencies,
      armor_proficiencies: form.armor_proficiencies,
      weapon_proficiencies: form.weapon_proficiencies,
      tool_proficiencies: form.tool_proficiencies,
      skill_choices_count: Number(form.skill_choices_count) || 0,
      skill_choices_options: form.skill_choices_options,
      starting_equipment: form.starting_equipment,
      spellcasting_ability: form.spellcasting_progression === 'none' ? null : form.spellcasting_ability || null,
      spellcasting_progression: form.spellcasting_progression,
      subclass_label: form.subclass_label,
      subclass_levels: form.subclass_levels,
      campaign_id: form.campaign_id || null,
    }

    let classId = form.id
    if (form.id) {
      const { error: saveError } = await supabase.from('homebrew_classes').update(payload).eq('id', form.id)
      if (saveError) {
        setSaving(false)
        setError(saveError.message)
        return
      }
    } else {
      const { data, error: saveError } = await supabase.from('homebrew_classes').insert(payload).select().single()
      if (saveError) {
        setSaving(false)
        setError(saveError.message)
        return
      }
      classId = data.id
    }

    await supabase.from('homebrew_class_features').delete().eq('class_id', classId)
    if (form.features.length > 0) {
      const { error: featuresError } = await supabase.from('homebrew_class_features').insert(
        form.features.map((f, i) => ({
          class_id: classId,
          level: f.level,
          name: f.name,
          description: f.description,
          sort_order: i,
          choice_group: f.choice_group ?? '',
          choice_count: f.choice_group ? f.choice_count ?? null : null,
        }))
      )
      if (featuresError) {
        setSaving(false)
        setError(featuresError.message)
        return
      }
    }

    // Table columns are wiped and reinserted wholesale (columns cascade-
    // delete their values), same "delete-and-reinsert children" approach
    // SkillTreeNodeEditor uses for prereqs - simplest way to keep column
    // order/renames/removals all correct without diffing.
    await supabase.from('homebrew_class_table_columns').delete().eq('class_id', classId)
    for (let i = 0; i < form.tableColumns.length; i++) {
      const col = form.tableColumns[i]
      const { data: newCol, error: colError } = await supabase
        .from('homebrew_class_table_columns')
        .insert({ class_id: classId, name: col.name, sort_order: i })
        .select()
        .single()
      if (colError) {
        setSaving(false)
        setError(colError.message)
        return
      }
      const valueRows = Object.entries(col.valuesByLevel)
        .filter(([, value]) => value !== '')
        .map(([level, value]) => ({ column_id: newCol.id, level: Number(level), value }))
      if (valueRows.length > 0) {
        const { error: valuesError } = await supabase.from('homebrew_class_table_values').insert(valueRows)
        if (valuesError) {
          setSaving(false)
          setError(valuesError.message)
          return
        }
      }
    }

    const currentSubclassIds = form.subclasses.map((s) => s.id).filter(Boolean)
    const removedSubclassIds = originalSubclassIds.filter((sid) => !currentSubclassIds.includes(sid))
    if (removedSubclassIds.length > 0) {
      await supabase.from('homebrew_subclasses').delete().in('id', removedSubclassIds)
    }

    for (const subclass of form.subclasses) {
      let subclassId = subclass.id
      const subclassPayload = { class_id: classId, name: subclass.name, description: subclass.description }
      if (subclassId) {
        const { error: subclassError } = await supabase
          .from('homebrew_subclasses')
          .update(subclassPayload)
          .eq('id', subclassId)
        if (subclassError) {
          setSaving(false)
          setError(subclassError.message)
          return
        }
      } else {
        const { data: newSubclass, error: subclassError } = await supabase
          .from('homebrew_subclasses')
          .insert(subclassPayload)
          .select()
          .single()
        if (subclassError) {
          setSaving(false)
          setError(subclassError.message)
          return
        }
        subclassId = newSubclass.id
      }

      await supabase.from('homebrew_subclass_features').delete().eq('subclass_id', subclassId)
      const featureRows = subclass.features.filter((f) => f.name.trim() !== '')
      if (featureRows.length > 0) {
        const { error: subFeatureError } = await supabase.from('homebrew_subclass_features').insert(
          featureRows.map((f, i) => ({
            subclass_id: subclassId,
            level: f.level,
            name: f.name,
            description: f.description,
            sort_order: i,
            choice_group: f.choice_group ?? '',
            choice_count: f.choice_group ? f.choice_count ?? null : null,
          }))
        )
        if (subFeatureError) {
          setSaving(false)
          setError(subFeatureError.message)
          return
        }
      }
    }

    setSaving(false)
    navigate('/dm/homebrew')
  }

  function downloadJson(json, filename) {
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleExport() {
    downloadJson(classFormToExportJson(form), `${form.slug || slugify(form.name) || 'class'}.class.json`)
  }

  function handleExportFiveTools() {
    downloadJson(classFormToFiveToolsJson(form), `${form.slug || slugify(form.name) || 'class'}.5etools.json`)
  }

  async function handleImport(e) {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    try {
      const json = JSON.parse(await file.text())
      setForm(classJsonToFormState(json))
      setCurrentStep('basics')
    } catch (err) {
      setError(`Import failed: ${err.message}`)
    }
  }

  async function handleImportFiveTools(e) {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    try {
      const json = JSON.parse(await file.text())
      setForm(fiveToolsJsonToClassForm(json))
      setCurrentStep('basics')
    } catch (err) {
      setError(`Import failed: ${err.message}`)
    }
  }

  if (loading) return <p className="status-message">Loading...</p>

  return (
    <section className="page-wide">
      <div className="view-header">
        <h1>{isNew ? 'New Class' : `Edit ${form.name}`}</h1>
        <div className="dm-form-actions">
          {isNew && (
            <label className="button-link">
              Import JSON
              <input type="file" accept="application/json" onChange={handleImport} style={{ display: 'none' }} />
            </label>
          )}
          {isNew && (
            <label className="button-link">
              Import from 5etools
              <input type="file" accept="application/json" onChange={handleImportFiveTools} style={{ display: 'none' }} />
            </label>
          )}
          {!isNew && (
            <button type="button" className="secondary" onClick={handleExport}>
              Export JSON
            </button>
          )}
          {!isNew && (
            <button type="button" className="secondary" onClick={handleExportFiveTools}>
              Export to 5etools
            </button>
          )}
        </div>
      </div>

      <WizardShell
        steps={STEPS}
        currentStep={currentStep}
        onStepChange={setCurrentStep}
        onSave={handleSave}
        onCancel={() => navigate('/dm/homebrew')}
        saving={saving}
        error={error}
        saveLabel="Save Class"
      >
        {currentStep === 'basics' && (
          <div className="dm-form">
            <label>
              Name
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus />
            </label>
            <label>
              Slug (used in the URL, auto-generated if left blank)
              <input
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                placeholder={slugify(form.name)}
              />
            </label>
            <label>
              Description
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
              />
            </label>
            <div className="dm-form-row">
              <label>
                Hit Die
                <select value={form.hit_die} onChange={(e) => setForm({ ...form, hit_die: Number(e.target.value) })}>
                  {[4, 6, 8, 10, 12].map((d) => (
                    <option key={d} value={d}>
                      d{d}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Primary Ability
                <input
                  value={form.primary_ability}
                  onChange={(e) => setForm({ ...form, primary_ability: e.target.value })}
                  placeholder="e.g. Strength or Dexterity"
                />
              </label>
              <label>
                Campaign
                <select value={form.campaign_id} onChange={(e) => setForm({ ...form, campaign_id: e.target.value })}>
                  <option value="">General (no campaign)</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <AbilityScorePicker
              legend="Saving Throw Proficiencies"
              selected={form.saving_throw_proficiencies}
              onChange={(saving_throw_proficiencies) => setForm({ ...form, saving_throw_proficiencies })}
            />
            <div className="dm-form-row">
              <label>
                Subclass Label
                <input
                  value={form.subclass_label}
                  onChange={(e) => setForm({ ...form, subclass_label: e.target.value })}
                  placeholder="e.g. Martial Archetype, Sacred Oath"
                />
              </label>
            </div>
            <label>
              Subclass Feature Levels
              <div className="chip-list">
                {form.subclass_levels.map((level) => (
                  <span key={level} className="chip">
                    {level}
                    <button type="button" onClick={() => removeSubclassLevel(level)}>
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <span className="chip-add">
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={newSubclassLevel}
                  onChange={(e) => setNewSubclassLevel(e.target.value)}
                  placeholder="Level"
                />
                <button type="button" onClick={addSubclassLevel}>
                  + Add level
                </button>
              </span>
            </label>
          </div>
        )}

        {currentStep === 'proficiencies' && (
          <div className="dm-form">
            <div className="dm-form-row">
              <label>
                Armor Proficiencies
                <input
                  value={form.armor_proficiencies}
                  onChange={(e) => setForm({ ...form, armor_proficiencies: e.target.value })}
                />
              </label>
              <label>
                Weapon Proficiencies
                <input
                  value={form.weapon_proficiencies}
                  onChange={(e) => setForm({ ...form, weapon_proficiencies: e.target.value })}
                />
              </label>
              <label>
                Tool Proficiencies
                <input
                  value={form.tool_proficiencies}
                  onChange={(e) => setForm({ ...form, tool_proficiencies: e.target.value })}
                />
              </label>
            </div>
            <label>
              Skill Choices Count
              <input
                type="number"
                min="0"
                value={form.skill_choices_count}
                onChange={(e) => setForm({ ...form, skill_choices_count: e.target.value })}
              />
            </label>
            <label>
              Skill Choice Options (leave empty to allow choosing freely from any skill)
              <div className="chip-list">
                {form.skill_choices_options.map((skill) => (
                  <span key={skill} className="chip">
                    {skill}
                    <button type="button" onClick={() => removeSkillOption(skill)}>
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <span className="chip-add">
                <input value={newSkillOption} onChange={(e) => setNewSkillOption(e.target.value)} placeholder="Skill name" />
                <button type="button" onClick={addSkillOption}>
                  + Add skill
                </button>
              </span>
            </label>
            <label>
              Starting Equipment
              <textarea
                value={form.starting_equipment}
                onChange={(e) => setForm({ ...form, starting_equipment: e.target.value })}
                rows={3}
              />
            </label>
            <div className="dm-form-row">
              <label>
                Spellcasting
                <select
                  value={form.spellcasting_progression}
                  onChange={(e) => setForm({ ...form, spellcasting_progression: e.target.value })}
                >
                  {SPELLCASTING_PROGRESSIONS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              {form.spellcasting_progression !== 'none' && (
                <label>
                  Spellcasting Ability
                  <select
                    value={form.spellcasting_ability}
                    onChange={(e) => setForm({ ...form, spellcasting_ability: e.target.value })}
                  >
                    <option value="">Choose...</option>
                    {['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'].map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </div>
        )}

        {currentStep === 'features' && (
          <div className="dm-form">
            <p className="status-message">
              Add a row for each level that grants a feature. Not every level needs one. Give a set of features the
              same "Choice group" name (e.g. "Dark Arts") if the player picks some of them rather than getting all of
              them — the detail page boxes those together as options.
            </p>
            <RepeatableRows
              rows={form.features}
              onChange={(features) => setForm({ ...form, features })}
              withLevel
              withChoiceGroup
              addLabel="+ Add Feature"
            />
          </div>
        )}

        {currentStep === 'table' && (
          <div className="dm-form">
            <p className="status-message">
              Optional — only needed for classes with a per-level progression beyond features (Sneak Attack dice, Rages,
              Ki Points, etc). Most classes can skip this step.
            </p>
            {form.tableColumns.map((col, i) => (
              <div key={i} className="class-table-column">
                <div className="dm-form-row">
                  <label>
                    Column Name
                    <input value={col.name} onChange={(e) => updateTableColumn(i, { name: e.target.value })} />
                  </label>
                  <button type="button" className="danger" onClick={() => removeTableColumn(i)}>
                    Remove Column
                  </button>
                </div>
                <div className="class-table-grid">
                  {Array.from({ length: 20 }, (_, idx) => idx + 1).map((level) => (
                    <label key={level} className="class-table-cell">
                      {level}
                      <input
                        value={col.valuesByLevel[level] ?? ''}
                        onChange={(e) =>
                          updateTableColumn(i, { valuesByLevel: { ...col.valuesByLevel, [level]: e.target.value } })
                        }
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <button type="button" onClick={addTableColumn}>
              + Add Column
            </button>
          </div>
        )}

        {currentStep === 'subclasses' && (
          <div className="dm-form">
            {form.subclasses.map((subclass, i) => (
              <div key={i} className="class-subclass-block">
                <div className="dm-form-row">
                  <label>
                    {form.subclass_label} Name
                    <input value={subclass.name} onChange={(e) => updateSubclass(i, { name: e.target.value })} />
                  </label>
                  <button type="button" className="danger" onClick={() => removeSubclass(i)}>
                    Remove {form.subclass_label}
                  </button>
                </div>
                <label>
                  Description
                  <textarea
                    value={subclass.description}
                    onChange={(e) => updateSubclass(i, { description: e.target.value })}
                    rows={2}
                  />
                </label>
                <RepeatableRows
                  rows={subclass.features}
                  onChange={(features) => updateSubclass(i, { features })}
                  withLevel
                  allowedLevels={form.subclass_levels}
                  withChoiceGroup
                  addLabel="+ Add Feature"
                />
              </div>
            ))}
            <button type="button" onClick={addSubclass}>
              + Add {form.subclass_label}
            </button>
          </div>
        )}
      </WizardShell>
    </section>
  )
}
