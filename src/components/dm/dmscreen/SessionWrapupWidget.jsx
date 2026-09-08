import { useEffect, useRef, useState } from 'react'

// Freeform "remember for next time" scratchpad - follow-ups, loose threads,
// anything from this session worth not losing before the next one. Scoped
// to the widget instance itself (not a character), stored directly in the
// widget's own config (config.text), debounced through onConfigChange the
// same way NodeAnswerForm/BranchForm debounce elsewhere in this app. Meant
// to be reviewed then cleared before the next session, hence the explicit
// Clear action rather than letting notes from different sessions blur
// together.
export default function SessionWrapupWidget({ config, onConfigChange }) {
  const [text, setText] = useState(config?.text ?? '')
  const timerRef = useRef(null)

  useEffect(() => {
    setText(config?.text ?? '')
  }, [config?.text])

  function handleChange(value) {
    setText(value)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      onConfigChange({ text: value })
    }, 600)
  }

  function handleClear() {
    if (!confirm('Clear the wrap-up notes?')) return
    clearTimeout(timerRef.current)
    setText('')
    onConfigChange({ text: '' })
  }

  return (
    <div className="dm-screen-widget-body">
      <textarea
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        rows={6}
        placeholder="Things to remember for next session..."
      />
      <div className="dm-form-actions">
        <button type="button" className="secondary" onClick={handleClear}>
          Clear
        </button>
      </div>
    </div>
  )
}
