import { supabase } from './supabaseClient'

// Storage adapter handed to the embedded Item Description Maker (public/idm.js)
// so its saved items live in Supabase instead of one browser's localStorage.
// The tool's contract is two methods: list() once at init, and saveAll(items)
// after every save/delete/import, always with the whole collection.

const LEGACY_KEY = 'idm_saved_items'
const LEGACY_LIFTED_KEY = 'idm_saved_items_lifted_to_supabase'

function toRow(record) {
  return { id: record.id, name: record.name || 'Untitled', item: record.item ?? {} }
}

function snapshot(records) {
  return new Map(records.map((r) => [r.id, JSON.stringify(toRow(r))]))
}

function readLegacyItems() {
  try {
    const raw = JSON.parse(localStorage.getItem(LEGACY_KEY))
    return Array.isArray(raw) ? raw.filter((r) => r && r.id) : []
  } catch {
    return []
  }
}

// Items saved on this browser before the tool stored anything server-side get
// uploaded once, keeping their ids so a device that saved the same item twice
// doesn't end up with two copies. The localStorage copy is left in place as a
// local backup; the "lifted" flag is what stops a second upload, so deleting
// an item on another device doesn't see it resurrected on this one.
async function liftLegacyItems(remote) {
  if (localStorage.getItem(LEGACY_LIFTED_KEY)) return remote
  const legacy = readLegacyItems()
  if (legacy.length === 0) {
    localStorage.setItem(LEGACY_LIFTED_KEY, new Date().toISOString())
    return remote
  }
  const remoteIds = new Set(remote.map((r) => r.id))
  const missing = legacy.filter((r) => !remoteIds.has(r.id))
  if (missing.length > 0) {
    const { error } = await supabase.from('item_maker_items').upsert(missing.map(toRow))
    if (error) throw error
  }
  localStorage.setItem(LEGACY_LIFTED_KEY, new Date().toISOString())
  return [...remote, ...missing.map(toRow)]
}

export function createSupabaseItemStorage() {
  // What the server is believed to hold, so each save writes only what
  // actually changed instead of re-uploading every item on every keystroke-
  // free save.
  let known = new Map()

  return {
    async list() {
      const { data, error } = await supabase
        .from('item_maker_items')
        .select('*')
        .order('updated_at', { ascending: false })
      if (error) throw error
      const records = (data ?? []).map(toRow)
      const merged = await liftLegacyItems(records)
      known = snapshot(merged)
      return merged
    },

    async saveAll(items) {
      const next = snapshot(items)
      const changed = items.filter((r) => known.get(r.id) !== JSON.stringify(toRow(r)))
      const removed = [...known.keys()].filter((id) => !next.has(id))
      if (changed.length > 0) {
        const { error } = await supabase.from('item_maker_items').upsert(changed.map(toRow))
        if (error) throw error
      }
      if (removed.length > 0) {
        const { error } = await supabase.from('item_maker_items').delete().in('id', removed)
        if (error) throw error
      }
      known = next
    },
  }
}
