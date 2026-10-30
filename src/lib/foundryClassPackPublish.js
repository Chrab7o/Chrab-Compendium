// Builds the Foundry class pack (foundryClassPack.js) from the database and
// uploads it to its fixed public file, which Chrab Sync loads into the world's
// "Chrab Corner Classes" compendium. Runs in a DM's browser: after a class or
// subclass is saved, after a linked Feature Forge draft is saved, and from the
// "Publish now" button on the Homebrew page.
//
// Why the browser and not a server function: the pack is built by the Feature
// Forge item builder and the class form helpers, both plain JS that already
// run here. A DM session can read the DM-only drafts, and storage policy lets
// only DMs write the file. Anything not public (visibility 'dm') is left out,
// because the file is public. The building and uploading is in
// classPackSource.js, shared with the Foundry sandbox's push script.
import { supabase } from './supabaseClient'
import { CLASS_PACK_BUCKET, CLASS_PACK_PATH } from './foundryClassPack'
import { loadClassPackWith, publishClassPackWith } from './classPackSource'

export function classPackUrl() {
  return supabase.storage.from(CLASS_PACK_BUCKET).getPublicUrl(CLASS_PACK_PATH).data.publicUrl
}

export const loadClassPack = () => loadClassPackWith(supabase)

export const publishClassPack = () => publishClassPackWith(supabase)

// What's live right now, read back from the public file (null if nothing has
// been published yet).
export async function fetchPublishedClassPack() {
  const res = await fetch(`${classPackUrl()}?t=${Date.now()}`, { cache: 'no-store' })
  if (!res.ok) return null
  return res.json()
}

// The class and subclass features a Feature Forge draft automates, each with
// the editor it lives in: [{ label, to }]. Non-empty = saving the draft should
// republish the pack.
export async function featureDraftLinks(draftId) {
  const [classLinks, subclassLinks] = await Promise.all([
    supabase.from('homebrew_class_features').select('name, level, class_id, homebrew_classes(name)').eq('feature_draft_id', draftId),
    supabase
      .from('homebrew_subclass_features')
      .select('name, level, subclass_id, homebrew_subclasses(name, class_id, parent_class_name, homebrew_classes(name))')
      .eq('feature_draft_id', draftId),
  ])
  return [
    ...(classLinks.data ?? []).map((r) => ({
      label: [r.homebrew_classes?.name, `level ${r.level}`, r.name].filter(Boolean).join(' › '),
      to: `/dm/homebrew/classes/${r.class_id}/edit`,
    })),
    ...(subclassLinks.data ?? []).map((r) => {
      const s = r.homebrew_subclasses ?? {}
      return {
        label: [s.homebrew_classes?.name ?? s.parent_class_name, s.name, `level ${r.level}`, r.name].filter(Boolean).join(' › '),
        to: s.class_id ? `/dm/homebrew/classes/${s.class_id}/edit` : `/dm/homebrew/subclasses/${r.subclass_id}/edit`,
      }
    }),
  ]
}

// For save paths: republish, and turn a failure into a message instead of a
// thrown error, so a saved class never looks unsaved.
export async function republishQuietly() {
  try {
    await publishClassPack()
    return null
  } catch (err) {
    return `Saved, but the Foundry class pack didn't update: ${err.message}. Use "Publish now" on the Homebrew page.`
  }
}
