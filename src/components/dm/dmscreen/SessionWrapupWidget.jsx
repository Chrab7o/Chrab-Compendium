import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'

// Freeform "remember for next time" scratchpad - follow-ups, loose threads,
// anything from this session worth not losing before the next one. Scoped
// to the widget instance itself (not a character), stored directly in the
// widget's own config (config.text), debounced through onConfigChange the
// same way NodeAnswerForm/BranchForm debounce elsewhere in this app. Meant
// to be reviewed then cleared before the next session, hence the explicit
// Clear action rather than letting notes from different sessions blur
// together.
//
// Exposes flush() via ref so DMScreenPage's single page-level Save button
// can commit every widget's pending debounced edits at once, rather than
// each widget having its own Save action.
const SessionWrapupWidget = forwardRef(function SessionWrapupWidget({ config, onConfigChange }, ref) {
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

  useImperativeHandle(ref, () => ({
    async flush() {
      if (pendingRef.current === null) return
      clearTimeout(timerRef.current)
      const value = pendingRef.current
      pendingRef.current = null
      await onConfigChangeRef.current({ text: value })
    },
  }))

  // Flush any still-pending debounced write on unmount - without this,
  // typing then quickly reloading/navigating away (switching screens, say)
  // loses the edit, since the 600ms timer never gets the chance to fire.
  // The page-level Save button (flush() above) is the main safety net;
  // this covers leaving without using it.
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
})

export default SessionWrapupWidget
