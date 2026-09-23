import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useTags } from '../../contexts/TagContext'
import { tagsByGroup } from '../../lib/tags'

// Folders used to let one edit cover a whole subtree — retag a folder, and
// everything under it followed. Tags have no hierarchy to inherit down, so
// that power comes back here instead: filter the results down to what you
// mean, select them, and apply the change across the set.
export default function BulkEditBar({ entryIds, onDone, onCancel }) {
  const { tags, groups, reload: reloadTags } = useTags()
  const [action, setAction] = useState('add-tag')
  const [tagValue, setTagValue] = useState('')
  const [visibility, setVisibility] = useState('public')
  const [campaignId, setCampaignId] = useState('')
  const [campaigns, setCampaigns] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    supabase
      .from('campaigns')
      .select('*')
      .order('name', { ascending: true })
      .then(({ data }) => setCampaigns(data ?? []))
  }, [])

  const grouped = tagsByGroup(tags, groups)

  async function apply() {
    setBusy(true)
    setError(null)

    let failure = null

    if (action === 'add-tag' || action === 'remove-tag') {
      if (!tagValue) {
        setBusy(false)
        setError('Pick a tag first.')
        return
      }
      // entries.tags is a plain text[], so there's no single UPDATE that adds
      // a value only where it's missing without clobbering concurrent edits.
      // Reading the rows first and writing back each array keeps it honest.
      const { data: rows, error: readError } = await supabase
        .from('entries')
        .select('id, tags')
        .in('id', entryIds)

      if (readError) {
        setBusy(false)
        setError(readError.message)
        return
      }

      const writes = rows.map((row) => {
        const current = new Set(row.tags ?? [])
        if (action === 'add-tag') current.add(tagValue)
        else current.delete(tagValue)
        return supabase.from('entries').update({ tags: [...current] }).eq('id', row.id)
      })
      const results = await Promise.all(writes)
      failure = results.find((r) => r.error)?.error ?? null
    } else if (action === 'visibility') {
      const { error: updateError } = await supabase
        .from('entries')
        .update({ visibility })
        .in('id', entryIds)
      failure = updateError
    } else if (action === 'campaign') {
      const { error: updateError } = await supabase
        .from('entries')
        .update({ campaign_id: campaignId || null })
        .in('id', entryIds)
      failure = updateError
    }

    setBusy(false)
    if (failure) {
      setError(failure.message)
      return
    }
    await reloadTags()
    onDone()
  }

  return (
    <div className="bulk-edit-bar">
      <span className="bulk-edit-count">
        {entryIds.length} selected
      </span>

      <label>
        Action
        <select value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="add-tag">Add tag</option>
          <option value="remove-tag">Remove tag</option>
          <option value="visibility">Set visibility</option>
          <option value="campaign">Set campaign</option>
        </select>
      </label>

      {(action === 'add-tag' || action === 'remove-tag') && (
        <label>
          Tag
          <select value={tagValue} onChange={(e) => setTagValue(e.target.value)}>
            <option value="">Choose a tag...</option>
            {grouped.map(({ group, tags: groupTags }) => (
              <optgroup key={group.id} label={group.label}>
                {groupTags.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      )}

      {action === 'visibility' && (
        <label>
          Visibility
          <select value={visibility} onChange={(e) => setVisibility(e.target.value)}>
            <option value="public">Public</option>
            <option value="dm">DM only</option>
          </select>
        </label>
      )}

      {action === 'campaign' && (
        <label>
          Campaign
          <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
            <option value="">General (no campaign)</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="bulk-edit-actions">
        <button type="button" onClick={apply} disabled={busy}>
          {busy ? 'Applying...' : `Apply to ${entryIds.length}`}
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>

      {error && <p className="status-message error">{error}</p>}
    </div>
  )
}
