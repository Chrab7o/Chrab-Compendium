import { useState } from 'react'
import { AUTOMATION_TEMPLATES, PARAM_OPTIONS, buildFromTemplate, findTemplate, templateDefaults } from '../../../lib/automationTemplates'

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)

function MultiPick({ param, value, onChange }) {
  const options = PARAM_OPTIONS[param.kind] ?? []
  const toggle = (opt) => onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt])
  return (
    <div className="template-param">
      <fieldset className="tag-checklist">
        <legend>{param.label}</legend>
        {options.map((opt) => (
          <label key={opt} className="tag-checklist-item">
            <input type="checkbox" checked={value.includes(opt)} onChange={() => toggle(opt)} />
            {cap(opt)}
          </label>
        ))}
      </fieldset>
      {param.hint && <p className="npc-hint">{param.hint}</p>}
    </div>
  )
}

function SingleParam({ param, value, onChange }) {
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
          <input className={param.kind === 'formula' ? 'npc-code-input' : undefined} value={value} onChange={(e) => onChange(e.target.value)} />
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

  const groups = [
    ['type', 'Automation types'],
    ['example', 'Finished examples'],
  ]

  return (
    <div className="template-picker">
      <label>
        Start from a template
        <select value={key} onChange={(e) => choose(e.target.value)}>
          <option value="">Choose…</option>
          {groups.map(([kind, label]) => (
            <optgroup key={kind} label={label}>
              {AUTOMATION_TEMPLATES.filter((t) => t.kind === kind).map((t) => (
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
          {template.params.map((p) =>
            PARAM_OPTIONS[p.kind] ? (
              <MultiPick key={p.key} param={p} value={values[p.key] ?? []} onChange={(v) => setValues({ ...values, [p.key]: v })} />
            ) : (
              <SingleParam key={p.key} param={p} value={values[p.key] ?? ''} onChange={(v) => setValues({ ...values, [p.key]: v })} />
            ),
          )}
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
