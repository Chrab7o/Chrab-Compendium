import { useState } from 'react'
import { AUTOMATION_TEMPLATES, TEMPLATE_GROUPS, buildFromTemplate, findTemplate, templateDefaults } from '../../../lib/automationTemplates'
import ParamFields from './ParamFields'

// Pick an automation template, fill in its settings, and create the feature's
// mechanics from it (lib/automationTemplates.js). onCreate(spec).
// fixedKey: start on one template (the Feature Forge's ?template= link).
export default function TemplatePicker({ onCreate, fixedKey = '', createLabel = 'Create' }) {
  const [key, setKey] = useState(fixedKey)
  const template = findTemplate(key)
  const [values, setValues] = useState(() => templateDefaults(template))
  const [error, setError] = useState(null)

  function choose(next) {
    setKey(next)
    setValues(templateDefaults(findTemplate(next)))
    setError(null)
  }

  function create() {
    const { spec, error: problem } = buildFromTemplate(template, values)
    if (problem) return setError(problem)
    onCreate(spec)
  }

  return (
    <div className="template-picker">
      <label>
        Start from a template
        <select value={key} onChange={(e) => choose(e.target.value)}>
          <option value="">Choose…</option>
          {TEMPLATE_GROUPS.map((group) => (
            <optgroup key={group} label={group}>
              {AUTOMATION_TEMPLATES.filter((t) => t.group === group).map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      {template && (
        <>
          <p className="npc-hint">{template.help}</p>
          <ParamFields params={template.params} values={values} onChange={setValues} />
          {error && <p className="status-message error">{error}</p>}
          <div className="dm-form-actions">
            <button type="button" onClick={create}>
              {createLabel}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
