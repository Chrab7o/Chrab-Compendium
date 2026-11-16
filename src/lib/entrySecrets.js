import { supabase } from './supabaseClient'

// An entry's secret: DM-only text kept beside its public content, in the
// DM-only `entry_secrets` table (supabase/migrations/20261116000000_entry_secrets.sql).
// Players can't read that table at all, so fetching it as a player just
// returns nothing; callers still only ask when the viewer is the DM.

// The secret's markdown, or '' when the entry has none.
export async function loadEntrySecret(entryId) {
  const { data, error } = await supabase
    .from('entry_secrets')
    .select('content')
    .eq('entry_id', entryId)
    .maybeSingle()
  if (error) throw error
  return data?.content ?? ''
}

// Saves the secret; a blank one deletes the row, so "has a secret" stays the
// same as "has a row".
export async function saveEntrySecret(entryId, content) {
  const text = content ?? ''
  if (!text.trim()) {
    const { error } = await supabase.from('entry_secrets').delete().eq('entry_id', entryId)
    if (error) throw error
    return
  }
  const { error } = await supabase
    .from('entry_secrets')
    .upsert({ entry_id: entryId, content: text, updated_at: new Date().toISOString() })
  if (error) throw error
}
