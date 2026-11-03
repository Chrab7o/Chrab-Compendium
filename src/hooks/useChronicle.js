import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

// A world's Chronicle: its events, branches, and the entries each event links
// to (entriesByEvent: event id -> entry rows). RLS already drops what the
// visitor may not see, entries included, so a link to a DM-only entry just
// doesn't come back.
export function useChronicle(worldId) {
  const [events, setEvents] = useState([])
  const [branches, setBranches] = useState([])
  const [links, setLinks] = useState([])
  const [entriesByEvent, setEntriesByEvent] = useState(new Map())
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!worldId) {
      setEvents([])
      setBranches([])
      setLinks([])
      setEntriesByEvent(new Map())
      setLoading(false)
      return
    }
    setLoading(true)
    const [{ data: eventRows }, { data: branchRows }] = await Promise.all([
      supabase.from('chronicle_events').select('*').eq('world_id', worldId),
      supabase.from('chronicle_branches').select('*').eq('world_id', worldId).order('sort_order'),
    ])
    const ids = (eventRows ?? []).map((e) => e.id)
    let linkRows = []
    let entries = []
    if (ids.length > 0) {
      const { data } = await supabase.from('chronicle_event_entries').select('*').in('event_id', ids)
      linkRows = data ?? []
      const entryIds = [...new Set(linkRows.map((l) => l.entry_id))]
      if (entryIds.length > 0) {
        const { data: entryRows } = await supabase.from('entries').select('*').in('id', entryIds)
        entries = entryRows ?? []
      }
    }
    const entryById = new Map(entries.map((e) => [e.id, e]))
    const byEvent = new Map()
    for (const link of linkRows) {
      const entry = entryById.get(link.entry_id)
      if (!entry) continue
      byEvent.set(link.event_id, [...(byEvent.get(link.event_id) ?? []), entry])
    }
    setEvents(eventRows ?? [])
    setBranches(branchRows ?? [])
    setLinks(linkRows)
    setEntriesByEvent(byEvent)
    setLoading(false)
  }, [worldId])

  useEffect(() => {
    reload()
  }, [reload])

  return { events, branches, links, entriesByEvent, loading, reload }
}
