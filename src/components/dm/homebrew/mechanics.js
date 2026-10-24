// Feature rows <-> their Feature Forge drafts, for the class and subclass
// editors. A row carries:
//   feature_draft_id  the linked draft (saved on the row)
//   mechanics         that draft's spec, loaded for editing (not a column)
//   mechanicsDirty    edited here since loading, so the class editor's copy wins
//   mechanicsMissing  linked, but the draft couldn't be loaded
// The draft is a normal Feature Forge draft: it shows in the Feature Forge,
// can be sent to Foundry on its own, and rides in the Foundry class pack.
import { supabase } from '../../../lib/supabaseClient'
import { classFeatureSpec, classFeatureTextChanged, featureSpecFromRow } from '../../../lib/foundryFeatures'

export async function loadDraftSpecs(ids) {
  const unique = [...new Set(ids.filter(Boolean))]
  if (!unique.length) return new Map()
  const { data, error } = await supabase.from('feature_drafts').select('id, spec').in('id', unique)
  if (error) throw new Error(error.message)
  return new Map((data ?? []).map((d) => [d.id, featureSpecFromRow(d.spec)]))
}

export function attachMechanics(rows, specs) {
  return rows.map((r) => {
    if (!r.feature_draft_id) return r
    const spec = specs.get(r.feature_draft_id)
    return spec ? { ...r, mechanics: spec, mechanicsDirty: false, mechanicsMissing: false } : { ...r, mechanicsMissing: true }
  })
}

// Saves every row's mechanics as its draft and returns the rows with their
// draft ids. ctx: { className, subclassName, campaignId }.
//   - new mechanics: a new draft
//   - edited here: the whole spec from here
//   - only the row's name/text/level changed: patch those onto the draft as
//     it is NOW, so edits made in the Feature Forge meanwhile aren't lost
export async function saveRowMechanics(rows, { className, subclassName = '', campaignId = null }) {
  const out = []
  for (const row of rows) {
    if (!row.mechanics || !row.name?.trim()) {
      out.push(row)
      continue
    }
    const ctx = { className, subclassName, level: row.level, name: row.name, description: row.description }
    let spec = classFeatureSpec(row.mechanics, ctx)
    let id = row.feature_draft_id
    if (!id) {
      const { data, error } = await supabase
        .from('feature_drafts')
        .insert({ name: ctx.name.trim(), kind: 'feat', campaign_id: campaignId || null, spec })
        .select('id')
        .single()
      if (error) throw new Error(`${row.name}: ${error.message}`)
      id = data.id
    } else if (row.mechanicsDirty) {
      const { error } = await supabase.from('feature_drafts').update({ name: ctx.name.trim(), spec }).eq('id', id)
      if (error) throw new Error(`${row.name}: ${error.message}`)
    } else if (classFeatureTextChanged(row.mechanics, ctx)) {
      const { data, error } = await supabase.from('feature_drafts').select('spec').eq('id', id).single()
      if (error) throw new Error(`${row.name}: ${error.message}`)
      spec = classFeatureSpec(data.spec, ctx)
      const saved = await supabase.from('feature_drafts').update({ name: ctx.name.trim(), spec }).eq('id', id)
      if (saved.error) throw new Error(`${row.name}: ${saved.error.message}`)
    }
    out.push({ ...row, feature_draft_id: id, mechanics: spec, mechanicsDirty: false })
  }
  return out
}
