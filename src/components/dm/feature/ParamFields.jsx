import { PARAM_OPTIONS } from '../../../lib/automationTemplates'

// One setting of an automation template or a building block
// (automationTemplates.js, forgeBlocks.js), by its kind: text, number,
// formula, select, checkbox, a list to tick (conditions, damage types…), or
// "block" (another block of the same feature: `blocks` = [[id, label]]).

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

function SingleParam({ param, value, onChange, blocks = [] }) {
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
  const options = param.kind === 'block' ? [['', 'The first roll'], ...blocks] : param.options
  return (
    <div className="template-param">
      <label>
        {param.label}
        {options ? (
          <select value={value} onChange={(e) => onChange(e.target.value)}>
            {options.map(([v, label]) => (
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

export function ParamField({ param, value, onChange, blocks }) {
  return PARAM_OPTIONS[param.kind] ? (
    <MultiPick param={param} value={Array.isArray(value) ? value : []} onChange={onChange} />
  ) : (
    <SingleParam param={param} value={value ?? ''} onChange={onChange} blocks={blocks} />
  )
}

// A form of settings: params [{ key, … }], values { key: value }, onChange(values).
export default function ParamFields({ params, values, onChange, blocks }) {
  return (
    <div className="template-params">
      {params.map((p) => (
        <ParamField key={p.key} param={p} value={values[p.key]} onChange={(v) => onChange({ ...values, [p.key]: v })} blocks={blocks} />
      ))}
    </div>
  )
}
