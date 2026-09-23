import { useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'

// Matches every real row's id, since Supabase requires delete() to have a
// filter — this is the standard workaround for "delete all rows".
const MATCH_ALL = '00000000-0000-0000-0000-000000000000'

export default function ResetEntriesPanel() {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  async function handleReset() {
    setError(null)
    setResult(null)

    const { count: entryCount } = await supabase
      .from('entries')
      .select('*', { count: 'exact', head: true })

    const confirmed = confirm(
      `Delete ALL ${entryCount ?? 0} entries, across every tag and campaign? Tags themselves, ` +
        `maps, characters, campaigns, and player notes are not affected. This cannot be undone.`
    )
    if (!confirmed) return

    setBusy(true)
    const { error: entryError } = await supabase.from('entries').delete().neq('id', MATCH_ALL)
    setBusy(false)

    if (entryError) {
      setError(entryError.message)
      return
    }
    setResult(`Deleted ${entryCount ?? 0} entries.`)
  }

  return (
    <div className="dm-panel danger-zone">
      <h2>Start Fresh</h2>
      <p className="view-subtitle">
        Permanently deletes every entry (all tags, all campaigns) so you can re-import with a
        clean slate. Your tag vocabulary, maps, characters, campaigns, and player notes are
        untouched.
      </p>
      <button type="button" className="danger" onClick={handleReset} disabled={busy}>
        {busy ? 'Deleting...' : 'Delete all entries'}
      </button>
      {result && <p className="status-message">{result}</p>}
      {error && <p className="status-message error">{error}</p>}
    </div>
  )
}
