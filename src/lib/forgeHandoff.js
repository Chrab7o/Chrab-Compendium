// The class editors open features in the chain builder in another tab, and
// the chain builder tells them when it saves. One BroadcastChannel, keyed by
// the row's `forge_key` (a client-only id the class editor gives the row):
//   class page -> openInChain(): localStorage gets the row's starting text and
//     the class's name, then the chain tab opens at ?for=<key>
//   chain tab  -> announceSave(): { type: 'saved', key, draftId, spec }
//   class page -> listenForSaves() fills the row in and answers
//     { type: 'ack', key, label }, so the chain tab knows it landed (no answer:
//     the class page was closed or reloaded)
// The class page holds the row until the class is saved, as with any edit there.

const CHANNEL = 'chrab-forge'
const STORE = 'chrab-forge-handoff:'

const channel = () => (typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL))

export function newHandoffKey() {
  return `fk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

// start: { name, description, label } for a feature with no draft yet; the
// label ("Pictomancer") is shown in the chain tab either way.
export function openInChain({ key, draftId = null, start }) {
  try {
    localStorage.setItem(STORE + key, JSON.stringify(start))
  } catch {
    // private window: the chain tab starts blank
  }
  // The site uses a HashRouter (GitHub Pages has no fallback for deep paths),
  // so the route goes after the #.
  const route = `/dm/item-forge/${draftId ? `${draftId}/chain` : 'chain/new'}?for=${encodeURIComponent(key)}`
  const url = `${window.location.pathname}#${route}`
  // Named per row, so opening the same feature again goes back to its tab.
  window.open(url, `chrab-chain-${key}`)
}

export function readHandoff(key) {
  try {
    return JSON.parse(localStorage.getItem(STORE + key) ?? 'null')
  } catch {
    return null
  }
}

// Class page. onSaved({ key, draftId, spec }) returns the class's label if it
// has that row (it's answered), or null. Returns the unsubscribe.
export function listenForSaves(onSaved) {
  const ch = channel()
  if (!ch) return () => {}
  ch.onmessage = (e) => {
    const msg = e.data
    if (msg?.type !== 'saved') return
    const label = onSaved(msg)
    if (label) ch.postMessage({ type: 'ack', key: msg.key, label })
  }
  return () => ch.close()
}

// Chain tab. Resolves the class's label, or null if no class page answered.
export function announceSave({ key, draftId, spec }, wait = 1200) {
  const ch = channel()
  if (!ch) return Promise.resolve(null)
  return new Promise((resolve) => {
    const done = (label) => {
      clearTimeout(timer)
      ch.close()
      resolve(label)
    }
    const timer = setTimeout(() => done(null), wait)
    ch.onmessage = (e) => e.data?.type === 'ack' && e.data.key === key && done(e.data.label)
    ch.postMessage({ type: 'saved', key, draftId, spec })
  })
}
