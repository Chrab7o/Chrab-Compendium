import { supabase } from './supabaseClient'

export function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export function downloadJson(json, filename) {
  const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// Save path shared by the single-page homebrew editors whose shape is "one
// parent row + a flat list of trait-shaped child rows" (feats, backgrounds):
// upsert the parent, then replace its children wholesale, same as the race
// editor does. Returns { id } on success or { error } with a message.
export async function saveParentWithChildren({ table, childTable, foreignKey, id, payload, children }) {
  let parentId = id
  if (id) {
    const { error } = await supabase.from(table).update(payload).eq('id', id)
    if (error) return { error: error.message }
  } else {
    const { data, error } = await supabase.from(table).insert(payload).select().single()
    if (error) return { error: error.message }
    parentId = data.id
  }

  const { error: deleteError } = await supabase.from(childTable).delete().eq(foreignKey, parentId)
  if (deleteError) return { id: parentId, error: deleteError.message }

  const rows = children.filter((c) => c.name.trim() !== '')
  if (rows.length > 0) {
    const { error } = await supabase.from(childTable).insert(
      rows.map((c, i) => ({
        [foreignKey]: parentId,
        name: c.name,
        description: c.description,
        sort_order: i,
        choice_group: c.choice_group ?? '',
        choice_count: c.choice_group ? c.choice_count ?? null : null,
      }))
    )
    if (error) return { id: parentId, error: error.message }
  }
  return { id: parentId }
}
