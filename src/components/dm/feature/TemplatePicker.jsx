import { useState } from 'react'
import { AUTOMATION_TEMPLATES, PARAM_OPTIONS, TEMPLATE_GROUPS, buildFromTemplate, findTemplate, templateDefaults } from '../../../lib/automationTemplates'

function MultiPick({ param, value, onChange }) {
  const options = PARAM_OPTIONS[param.kind] ?? []
  const toggle = (v) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
  return (
    <div className="template-param template-param-wide">
      <fieldset className="tag-checklist">
        <legend>{param.label}</legend>
        {options.map(([v, label]) => (
          <label key={v} className="tag-checklist-item">
            <input type="checkbox" checked={value.includes(v)} onChange={() => toggle(v)} />
            {label}
          </label>
        ))}
      </fieldset>
      {param.hint && <p className="npc-hint">{param.hint}</p>}
    </div>
  )
}

function SingleParam({ param, value, onChange }) {
  if (param.kind === 'checkbox') {
    return (
      <div className="template-param">
        <label className="tag-checklist-item">
          <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
          {param.label}
        </label>
        {param.hint && <p className="npc-hint">{param.hint}</p>}
      </div>
    )
  }
  return (
    <div className="template-param">
      <label>
        {param.label}
        {param.kind === 'select' ? (
          <select value={value} onChange={(e) => onChange(e.target.value)}>
            {(param.options ?? []).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        ) : (
          <input
            type={param.kind === 'number' ? 'number' : 'text'}
            min={param.kind === 'number' ? 0 : undefined}
            className={param.kind === 'formula' ? 'npc-code-input' : undefined}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
      </label>
      {param.hint && <p className="npc-hint">{param.hint}</p>}
    </div>
  )
}

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

  const set = (k) => (v) => setValues({ ...values, [k]: v })

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
          <div className="template-params">
            {template.params.map((p) =>
              PARAM_OPTIONS[p.kind] ? (
                <MultiPick key={p.key} param={p} value={values[p.key] ?? []} onChange={set(p.key)} />
              ) : (
                <SingleParam key={p.key} param={p} value={values[p.key] ?? ''} onChange={set(p.key)} />
              ),
            )}
          </div>
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
