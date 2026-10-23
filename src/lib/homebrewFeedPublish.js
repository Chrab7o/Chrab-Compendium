// Builds the Plutonium feed (homebrewFeed.js) from the database and uploads it
// to its fixed public URL. Runs in a DM's browser: after a class or subclass
// is saved, after a linked Feature Forge draft is saved, and from the "Publish
// now" button on the Homebrew page.
//
// Why the browser and not a server function: the feed is the site's own 5etools
// exporter plus the Feature Forge item builder, both plain JS that already run
// here. A DM session can read the DM-only drafts, and storage policy lets only
// DMs write the file. Anything not public (visibility 'dm') is left out,
// because the URL is public.
import { supabase } from './supabaseClient'
import { classToFormState, standaloneSubclassToFormState } from './homebrew'
import { buildFeatureItem, featureSpecFromRow } from './foundryFeatures'
import { FEED_BUCKET, FEED_PATH, buildHomebrewFeed, feedSummary } from './homebrewFeed'

export function homebrewFeedUrl() {
  return supabase.storage.from(FEED_BUCKET).getPublicUrl(FEED_PATH).data.publicUrl
}

async function rows(query) {
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data ?? []
}

const groupBy = (list, key) => {
  const map = new Map()
  for (const row of list) {
    if (!map.has(row[key])) map.set(row[key], [])
    map.get(row[key]).push(row)
  }
  return map
}

export async function loadHomebrewFeed() {
  const [classRows, classFeatures, columns, values, subclassRows, subclassFeatures] = await Promise.all([
    rows(supabase.from('homebrew_classes').select('*').eq('visibility', 'public').order('name')),
    rows(supabase.from('homebrew_class_features').select('*')),
    rows(supabase.from('homebrew_class_table_columns').select('*')),
    rows(supabase.from('homebrew_class_table_values').select('*')),
    rows(supabase.from('homebrew_subclasses').select('*').eq('visibility', 'public').order('name')),
    rows(supabase.from('homebrew_subclass_features').select('*')),
  ])

  const featuresByClass = groupBy(classFeatures, 'class_id')
  const columnsByClass = groupBy(columns, 'class_id')
  const subclassesByClass = groupBy(subclassRows, 'class_id')
  const featuresBySubclass = groupBy(subclassFeatures, 'subclass_id')

  const classes = classRows.map((c) => {
    const cols = columnsByClass.get(c.id) ?? []
    const colIds = new Set(cols.map((col) => col.id))
    return classToFormState(
      c,
      featuresByClass.get(c.id) ?? [],
      cols,
      values.filter((v) => colIds.has(v.column_id)),
      subclassesByClass.get(c.id) ?? [],
      featuresBySubclass,
    )
  })
  const standaloneSubclasses = subclassRows
    .filter((s) => !s.class_id)
    .map((s) => standaloneSubclassToFormState(s, featuresBySubclass.get(s.id) ?? []))

  // Only drafts linked from something that's actually in the feed.
  const included = [
    ...classes.flatMap((c) => [...c.features, ...c.subclasses.flatMap((s) => s.features)]),
    ...standaloneSubclasses.flatMap((s) => s.features),
  ]
  const draftIds = [...new Set(included.map((f) => f.feature_draft_id).filter(Boolean))]
  const drafts = draftIds.length ? await rows(supabase.from('feature_drafts').select('id, kind, spec').in('id', draftIds)) : []
  const items = new Map()
  for (const d of drafts) {
    if (d.kind !== 'feat') continue
    items.set(d.id, buildFeatureItem(featureSpecFromRow(d.spec), { draftId: d.id }))
  }

  return buildHomebrewFeed({ classes, standaloneSubclasses, items })
}

export async function publishHomebrewFeed() {
  const feed = await loadHomebrewFeed()
  const body = new Blob([JSON.stringify(feed)], { type: 'application/json' })
  // A short cache: Plutonium sees a change within a minute or so.
  const { error } = await supabase.storage.from(FEED_BUCKET).upload(FEED_PATH, body, { upsert: true, cacheControl: '60', contentType: 'application/json' })
  if (error) throw new Error(error.message)
  return { url: homebrewFeedUrl(), ...feedSummary(feed) }
}

// What's live right now, read back from the public URL (null if nothing has
// been published yet).
export async function fetchPublishedFeed() {
  const res = await fetch(`${homebrewFeedUrl()}?t=${Date.now()}`, { cache: 'no-store' })
  if (!res.ok) return null
  return res.json()
}

// The class and subclass features a Feature Forge draft automates, each with
// the editor it lives in: [{ label, to }]. Non-empty = saving the draft should
// republish the feed.
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
    await publishHomebrewFeed()
    return null
  } catch (err) {
    return `Saved, but the Plutonium feed didn't update: ${err.message}. Use "Publish now" on the Homebrew page.`
  }
}
