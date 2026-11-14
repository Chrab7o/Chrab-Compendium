import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../../lib/supabaseClient'
import { useCampaignContext } from '../../../contexts/CampaignContext'
import { useDraftAutosave } from '../../../hooks/useDraftAutosave'
import {
  emptyClassForm,
  classToFormState,
  classFormToExportJson,
  classJsonToFormState,
  classFormToFiveToolsJson,
  fiveToolsJsonToClassForm,
  SPELLCASTING_PROGRESSIONS,
  ARMOR_PROFICIENCY_OPTIONS,
  WEAPON_PROFICIENCY_OPTIONS,
  TOOL_PROFICIENCY_OPTIONS,
  SKILLS,
  ABILITY_SCORES,
  ABILITY_LABELS,
  parseProficiencyText,
  joinProficiencyList,
} from '../../../lib/homebrew'
import WizardShell from '../WizardShell'
import VisibilitySelect from './VisibilitySelect'
import { useAutomationOptions } from './useAutomationOptions'
import LevelsBoard from './LevelsBoard'
import { attachMechanics, loadDraftSpecs, saveRowMechanics } from './mechanics'
import { attachMechanicsFile } from '../../../lib/classMechanicsFile'
import { republishQuietly } from '../../../lib/foundryClassPackPublish'
import AbilityScorePicker from '../AbilityScorePicker'
import OptionPicker from '../OptionPicker'
import BaseClassBreakpoints from './BaseClassBreakpoints'

const STEPS = [
  { key: 'basics', label: 'Basics' },
  { key: 'proficiencies', label: 'Proficiencies & Equipment' },
  { key: 'levels', label: 'Levels & Features' },
]
// Drafts autosaved before the Levels step was one step.
const stepKey = (key) => (['features', 'table', 'subclasses'].includes(key) ? 'levels' : key)

const SKILL_OPTIONS = SKILLS.map((s) => s.name)

const PRIMARY_ABILITY_OPTIONS = ABILITY_SCORES.map((a) => ABILITY_LABELS[a])

function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

// Features are added level by level in the Levels step.
function emptySubclass() {
  return { id: null, name: '', description: '', visibility: 'dm', features: [] }
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
  const [notice, setNotice] = useState(null)
  const [newSubclassLevel, setNewSubclassLevel] = useState('')
  const automationOptions = useAutomationOptions()
  // The subclass shown beside the class in the Levels step (its index), or null.
  const [activeSubclass, setActiveSubclass] = useState(null)

  // Autosaves to localStorage as the DM works through the wizard, so
  // closing the tab, a crash, or navigating away mid-edit doesn't lose
  // everything typed since the last explicit "Save Class" click. Keyed per
  // class (or "-new" for one that doesn't have an id yet) so drafts for
  // different classes never overwrite each other. Skipped while the
  // existing-class fetch is still loading, so the still-empty initial form
  // never gets written over a real draft before there's been a chance to
  // offer it back.
  const draftKey = isNew ? 'chrab-corner-class-draft-new' : `chrab-corner-class-draft-${id}`
  const { pendingDraft, clearDraft } = useDraftAutosave(draftKey, { form, currentStep }, { skip: loading })
  const [draftPromptDismissed, setDraftPromptDismissed] = useState(false)

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
      const loaded = classToFormState(classRow, features ?? [], tableColumns ?? [], tableValues ?? [], subclasses ?? [], featuresBySubclassId)
      // Each linked feature's mechanics, for editing in its row.
      let specs = new Map()
      try {
        specs = await loadDraftSpecs([...loaded.features, ...loaded.subclasses.flatMap((s) => s.features)].map((f) => f.feature_draft_id))
      } catch (err) {
        setError(`Couldn't load feature mechanics: ${err.message}`)
      }
      if (cancelled) return
      setForm({
        ...loaded,
        features: attachMechanics(loaded.features, specs),
        subclasses: loaded.subclasses.map((s) => ({ ...s, features: attachMechanics(s.features, specs) })),
      })
      setOriginalSubclassIds(subclassIds)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [id, isNew])

  // originalSubclassIds is left alone here (not restored from the draft) -
  // it's bookkeeping about what actually exists in the database right now,
  // freshly fetched above, not part of the DM's in-progress edits.
  function restoreDraft() {
    setForm(pendingDraft.value.form)
    setCurrentStep(stepKey(pendingDraft.value.currentStep))
    setDraftPromptDismissed(true)
  }

  function discardDraft() {
    clearDraft()
    setDraftPromptDismissed(true)
  }

  // The proficiency columns are single strings in the database, so each
  // picker parses the string on the way in and re-joins on the way out.
  // Keeping the storage shape untouched means the detail page, the JSON
  // export, and the 5etools export all keep working unchanged.
  const armorList = parseProficiencyText(form.armor_proficiencies)
  const weaponList = parseProficiencyText(form.weapon_proficiencies)
  const toolList = parseProficiencyText(form.tool_proficiencies)
  const primaryAbilityList = parseProficiencyText(form.primary_ability)

  const skillCount = Number(form.skill_choices_count) || 0
  const skillChoiceHint =
    skillCount === 0
      ? 'Set a count above first — with none to choose, these options are never offered.'
      : form.skill_choices_options.length === 0
        ? 'Empty means players may choose freely from any skill.'
        : form.skill_choices_options.length < skillCount
          ? `Only ${form.skill_choices_options.length} option${form.skill_choices_options.length === 1 ? '' : 's'} listed but ${skillCount} to choose — add more or lower the count.`
          : `Players pick ${skillCount} of these ${form.skill_choices_options.length}.`

  function setProficiencyList(field, list, separator = ', ') {
    setForm({ ...form, [field]: joinProficiencyList(list, separator) })
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
    setForm((f) => ({ ...f, subclasses: [...f.subclasses, emptySubclass()] }))
    setActiveSubclass(form.subclasses.length)
  }

  function updateSubclass(index, patch) {
    setForm((f) => ({ ...f, subclasses: f.subclasses.map((s, i) => (i === index ? { ...s, ...patch } : s)) }))
  }

  function removeSubclass(index) {
    const s = form.subclasses[index]
    const named = s.features.filter((x) => x.name.trim()).length
    const what = `${s.name.trim() || `this ${form.subclass_label}`}${named ? ` and its ${named} feature${named === 1 ? '' : 's'}` : ''}`
    if (!confirm(`Remove ${what}? Nothing is deleted until you save the class.`)) return
    setForm((f) => ({ ...f, subclasses: f.subclasses.filter((_, i) => i !== index) }))
    setActiveSubclass(null)
  }

  const subclass = activeSubclass != null ? form.subclasses[activeSubclass] : null
  const lanes = [
    { key: 'class', label: form.name.trim() || 'Class', rows: form.features, setRows: (features) => setForm((f) => ({ ...f, features })), levels: null },
    ...(subclass
      ? [
          {
            key: `subclass:${activeSubclass}`,
            label: subclass.name.trim() || `Unnamed ${form.subclass_label}`,
            rows: subclass.features,
            setRows: (features) => updateSubclass(activeSubclass, { features }),
            levels: form.subclass_levels,
          },
        ]
      : []),
  ]

  async function handleSave() {
    // Caught here rather than let the insert fail on a not-null constraint,
    // so the DM lands back on the step that needs fixing instead of reading
    // a Postgres error.
    if (!form.name.trim()) {
      setCurrentStep('basics')
      setError('Give the class a name before saving.')
      return
    }
    const unnamedSubclass = form.subclasses.findIndex((s) => !s.name.trim())
    if (unnamedSubclass !== -1) {
      setCurrentStep('levels')
      setActiveSubclass(unnamedSubclass)
      setError(`${form.subclass_label} ${unnamedSubclass + 1} needs a name before saving.`)
      return
    }

    setSaving(true)
    setError(null)

    // Mechanics first: each one becomes (or updates) its Feature Forge draft,
    // and the rows then carry the draft ids. Kept in the form right away, so a
    // later failure and a retry don't create the drafts twice.
    let saved
    try {
      const mechanicsCtx = { className: form.name.trim(), campaignId: form.campaign_id }
      saved = {
        ...form,
        features: await saveRowMechanics(form.features, mechanicsCtx),
        subclasses: [],
      }
      for (const subclass of form.subclasses) {
        saved.subclasses.push({ ...subclass, features: await saveRowMechanics(subclass.features, { ...mechanicsCtx, subclassName: subclass.name.trim() }) })
      }
    } catch (err) {
      setSaving(false)
      setError(`Saving feature mechanics failed: ${err.message}`)
      return
    }
    setForm(saved)
    const { features: savedFeatures, subclasses: savedSubclasses } = saved

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
      visibility: form.visibility,
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
    // Blank rows (a feature or sub-feature added and then left empty) are
    // dropped rather than saved as a nameless heading - same rule the
    // subclass feature save below already applies.
    const namedFeatures = savedFeatures.filter((f) => f.name.trim() !== '')
    if (namedFeatures.length > 0) {
      const { error: featuresError } = await supabase.from('homebrew_class_features').insert(
        namedFeatures.map((f, i) => ({
          class_id: classId,
          level: f.level,
          name: f.name,
          description: f.description,
          sort_order: i,
          choice_group: f.choice_group ?? '',
          choice_count: f.choice_group ? f.choice_count ?? null : null,
          choice_swap: f.choice_group ? !!f.choice_swap : false,
          feature_draft_id: f.feature_draft_id || null,
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

    for (const subclass of savedSubclasses) {
      let subclassId = subclass.id
      const subclassPayload = {
        class_id: classId,
        name: subclass.name,
        description: subclass.description,
        visibility: subclass.visibility ?? 'dm',
      }
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
            choice_swap: f.choice_group ? !!f.choice_swap : false,
            feature_draft_id: f.feature_draft_id || null,
          }))
        )
        if (subFeatureError) {
          setSaving(false)
          setError(subFeatureError.message)
          return
        }
      }
    }

    clearDraft()
    // The Foundry class pack always reflects what's saved (a newly hidden class
    // drops out of it too).
    const notice = await republishQuietly()
    setSaving(false)
    navigate('/dm/homebrew', notice ? { state: { notice } } : undefined)
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

  // A class mechanics file (lib/classMechanicsFile.js): fills each matching
  // feature's Foundry mechanics, unsaved, for review before Save Class.
  async function handleLoadMechanics(e) {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    setNotice(null)
    try {
      const result = attachMechanicsFile(form, JSON.parse(await file.text()))
      if (result.classMismatch && !confirm(`This file is for "${result.classMismatch}", not "${form.name}". Load it anyway?`)) return
      setForm(result.form)
      setNotice(
        `Loaded mechanics for ${result.attached.length} feature${result.attached.length === 1 ? '' : 's'} (marked unsaved - review them, then Save Class).` +
          (result.unmatched.length ? ` No matching feature for: ${result.unmatched.join('; ')}.` : ''),
      )
    } catch (err) {
      setError(`Loading mechanics failed: ${err.message}`)
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
          {!isNew && (
            <label className="button-link">
              Load mechanics
              <input type="file" accept="application/json" onChange={handleLoadMechanics} style={{ display: 'none' }} />
            </label>
          )}
        </div>
      </div>
      {notice && <p className="status-message">{notice}</p>}

      {pendingDraft && !draftPromptDismissed && (
        <div className="draft-banner">
          <span>Unsaved draft found from {new Date(pendingDraft.savedAt).toLocaleString()}.</span>
          <div className="dm-form-actions">
            <button type="button" onClick={restoreDraft}>
              Restore
            </button>
            <button type="button" className="secondary" onClick={discardDraft}>
              Discard
            </button>
          </div>
        </div>
      )}

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
                rows={5}
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
              <VisibilitySelect value={form.visibility} onChange={(visibility) => setForm({ ...form, visibility })} />
            </div>
            <OptionPicker
              label="Primary Ability"
              hint="The ability this class keys off — add two if either works."
              options={PRIMARY_ABILITY_OPTIONS}
              selected={primaryAbilityList}
              onChange={(list) => setProficiencyList('primary_ability', list, ' or ')}
              addPlaceholder="Add ability…"
              allowCustom={false}
            />
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
                <select value={newSubclassLevel} onChange={(e) => setNewSubclassLevel(e.target.value)}>
                  <option value="">Level…</option>
                  {Array.from({ length: 20 }, (_, i) => i + 1)
                    .filter((level) => !form.subclass_levels.includes(level))
                    .map((level) => (
                      <option key={level} value={level}>
                        Level {level}
                      </option>
                    ))}
                </select>
                <button type="button" className="secondary" onClick={addSubclassLevel} disabled={!newSubclassLevel}>
                  + Add level
                </button>
              </span>
            </label>
            <BaseClassBreakpoints form={form} setForm={setForm} subclassLabel={form.subclass_label} />
          </div>
        )}

        {currentStep === 'proficiencies' && (
          <div className="dm-form">
            <OptionPicker
              label="Armor Proficiencies"
              options={ARMOR_PROFICIENCY_OPTIONS}
              selected={armorList}
              onChange={(list) => setProficiencyList('armor_proficiencies', list)}
              addPlaceholder="Add armor…"
              customPlaceholder="Custom armor…"
            />
            <OptionPicker
              label="Weapon Proficiencies"
              hint="Pick a whole category (Simple, Martial) or list individual weapons."
              options={WEAPON_PROFICIENCY_OPTIONS}
              selected={weaponList}
              onChange={(list) => setProficiencyList('weapon_proficiencies', list)}
              addPlaceholder="Add weapon…"
              customPlaceholder="Custom weapon…"
            />
            <OptionPicker
              label="Tool Proficiencies"
              options={TOOL_PROFICIENCY_OPTIONS}
              selected={toolList}
              onChange={(list) => setProficiencyList('tool_proficiencies', list)}
              addPlaceholder="Add tool…"
              customPlaceholder="Custom tool…"
            />
            <div className="dm-form-row">
              <label>
                Skill Choices Count
                <select
                  value={form.skill_choices_count}
                  onChange={(e) => setForm({ ...form, skill_choices_count: Number(e.target.value) })}
                >
                  {Array.from({ length: Math.max(7, skillCount + 1) }, (_, n) => n).map((n) => (
                    <option key={n} value={n}>
                      {n === 0 ? 'None' : `Choose ${n}`}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <OptionPicker
              label="Skill Choice Options"
              hint={skillChoiceHint}
              options={SKILL_OPTIONS}
              selected={form.skill_choices_options}
              onChange={(skill_choices_options) => setForm({ ...form, skill_choices_options })}
              addPlaceholder="Add skill…"
              customPlaceholder="Custom skill…"
            />
            <label>
              Starting Equipment
              <textarea
                value={form.starting_equipment}
                onChange={(e) => setForm({ ...form, starting_equipment: e.target.value })}
                rows={5}
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
                    {ABILITY_SCORES.map((a) => (
                      <option key={a} value={a}>
                        {ABILITY_LABELS[a]}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </div>
        )}

        {currentStep === 'levels' && (
          <LevelsBoard
            lanes={lanes}
            columns={form.tableColumns}
            onColumnsChange={(tableColumns) => setForm((f) => ({ ...f, tableColumns }))}
            linkable={automationOptions.options}
            onRefreshLinks={automationOptions.reload}
            campaignId={form.campaign_id || null}
            above={
              <div className="levels-subclasses">
                <div className="levels-tabs" role="tablist" aria-label={`${form.subclass_label}s`}>
                  <span className="levels-tabs-label">{form.subclass_label}s:</span>
                  {form.subclasses.map((s, i) => (
                    <button
                      type="button"
                      role="tab"
                      key={s.id ?? `new:${i}`}
                      aria-selected={activeSubclass === i}
                      className={`levels-tab${activeSubclass === i ? ' is-active' : ''}`}
                      onClick={() => setActiveSubclass(activeSubclass === i ? null : i)}
                    >
                      {s.name.trim() || `Unnamed ${form.subclass_label}`}
                    </button>
                  ))}
                  <button type="button" className="secondary npc-small-button" onClick={addSubclass}>
                    + {form.subclass_label}
                  </button>
                </div>
                {subclass && (
                  <div className="levels-subclass">
                    <div className="dm-form-row">
                      <label>
                        {form.subclass_label} name
                        <input value={subclass.name} onChange={(e) => updateSubclass(activeSubclass, { name: e.target.value })} autoFocus={!subclass.name} />
                      </label>
                      <VisibilitySelect value={subclass.visibility ?? 'dm'} onChange={(visibility) => updateSubclass(activeSubclass, { visibility })} />
                      <button type="button" className="danger" onClick={() => removeSubclass(activeSubclass)}>
                        Remove
                      </button>
                    </div>
                    <details>
                      <summary>Description</summary>
                      <textarea
                        value={subclass.description}
                        onChange={(e) => updateSubclass(activeSubclass, { description: e.target.value })}
                        rows={4}
                        aria-label={`${form.subclass_label} description`}
                      />
                    </details>
                    {form.subclass_levels.length === 0 && (
                      <p className="sub-features-hint">Set the {form.subclass_label} feature levels in Basics to add its features.</p>
                    )}
                  </div>
                )}
              </div>
            }
          />
        )}
      </WizardShell>
    </section>
  )
}
