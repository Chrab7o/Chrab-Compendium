// Supabase side of the item library (itemLibrary.js): Item Forge drafts
// (feature_drafts) loaded for the NPCs that link them.
import { supabase } from './supabaseClient'
import { featureName, featureSpecFromRow } from './foundryFeatures'

const COLUMNS = 'id, name, kind, campaign_id, spec, spec_updated_at'

const toRow = (d) => ({ ...d, spec: featureSpecFromRow(d.spec) })

// Map of draft id -> row (spec merged over today's defaults).
export async function loadLibraryRows(ids) {
  const unique = [...new Set(ids.filter(Boolean))]
  if (!unique.length) return new Map()
  const { data, error } = await supabase.from('feature_drafts').select(COLUMNS).in('id', unique)
  if (error) throw new Error(error.message)
  return new Map((data ?? []).map((d) => [d.id, toRow(d)]))
}

// Everything an NPC can link: features, not spells (NPC spells stay in its
// spellcasting panel for now).
export async function listLibrary() {
  const { data, error } = await supabase.from('feature_drafts').select(COLUMNS).eq('kind', 'feat').order('name')
  if (error) throw new Error(error.message)
  return (data ?? []).map(toRow)
}

// NPC drafts whose items link this library item: [{ id, name }].
export async function npcsUsingDraft(draftId) {
  const { data, error } = await supabase.from('npc_drafts').select('id, name').contains('spec', { items: [{ draftId }] })
  if (error) throw new Error(error.message)
  return data ?? []
}

// Saves a library item (a new one when id is null) and returns its row.
export async function saveLibraryItem(id, spec, { campaignId = null } = {}) {
  const name = featureName(spec) || 'Untitled item'
  const result = id
    ? await supabase.from('feature_drafts').update({ name, kind: spec.kind, spec }).eq('id', id).select(COLUMNS).single()
    : await supabase.from('feature_drafts').insert({ name, kind: spec.kind, campaign_id: campaignId || null, spec }).select(COLUMNS).single()
  if (result.error) throw new Error(result.error.message)
  return toRow(result.data)
}
