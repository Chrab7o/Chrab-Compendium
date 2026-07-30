import { useEffect, useRef, useState } from 'react'

// Debounced localStorage autosave for a long-running form (e.g. the
// multi-step homebrew Class Wizard) - crashing, closing the tab, or
// navigating away mid-edit shouldn't lose everything typed since the last
// explicit Save. `key` must be unique per distinct thing being edited (e.g.
// include the record's id, or a fixed "-new" suffix for a not-yet-created
// one) so drafts for different records never bleed into each other.
//
// Returns `pendingDraft` - undefined until the initial localStorage check
// completes, then either the stored { value, savedAt } or null if there
// wasn't one - so the caller can show a "restore your unsaved draft?"
// prompt instead of silently overwriting whatever's currently on screen.
// Nothing is written to storage until that initial check has happened,
// otherwise the very first render (before a real draft has had a chance to
// be offered back) would immediately clobber it with the blank/loading
// initial state.
export function useDraftAutosave(key, value, { skip = false, delay = 600 } = {}) {
  const [pendingDraft, setPendingDraft] = useState(undefined)
  const checkedKeyRef = useRef(null)

  useEffect(() => {
    if (checkedKeyRef.current === key) return
    checkedKeyRef.current = key
    try {
      const raw = localStorage.getItem(key)
      setPendingDraft(raw ? JSON.parse(raw) : null)
    } catch {
      setPendingDraft(null)
    }
  }, [key])

  useEffect(() => {
    if (skip || pendingDraft === undefined) return
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify({ value, savedAt: Date.now() }))
      } catch {
        // Storage full/unavailable/private-browsing - autosave is a
        // best-effort convenience, not something worth surfacing an error
        // over.
      }
    }, delay)
    return () => clearTimeout(timer)
  }, [key, value, skip, pendingDraft, delay])

  function clearDraft() {
    try {
      localStorage.removeItem(key)
    } catch {
      // ignore
    }
    setPendingDraft(null)
  }

  return { pendingDraft, clearDraft }
}
