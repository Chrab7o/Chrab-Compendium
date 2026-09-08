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
  const pendingRef = useRef(null)
  const onConfigChangeRef = useRef(onConfigChange)

  useEffect(() => {
    onConfigChangeRef.current = onConfigChange
  })

  useEffect(() => {
    setText(config?.text ?? '')
  }, [config?.text])

  // Commit early on blur and flush any still-pending debounced write on
  // unmount - without this, typing then quickly reloading/navigating away
  // (the natural way to check "did that save?") loses the edit, since the
  // 600ms timer never gets the chance to fire.
  useEffect(() => {
    return () => {
      if (pendingRef.current === null) return
      clearTimeout(timerRef.current)
      onConfigChangeRef.current({ text: pendingRef.current })
    }
  }, [])

  function handleChange(value) {
    setText(value)
    pendingRef.current = value
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      pendingRef.current = null
      onConfigChange({ text: value })
    }, 600)
  }

  function handleBlur() {
    if (pendingRef.current === null) return
    clearTimeout(timerRef.current)
    const value = pendingRef.current
    pendingRef.current = null
    onConfigChange({ text: value })
  }

  function handleClear() {
    if (!confirm('Clear the wrap-up notes?')) return
    clearTimeout(timerRef.current)
    pendingRef.current = null
    setText('')
    onConfigChange({ text: '' })
  }

  return (
    <div className="dm-screen-widget-body">
      <textarea
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
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
