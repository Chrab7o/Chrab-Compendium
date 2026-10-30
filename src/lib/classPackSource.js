// The Foundry class pack built from the database and uploaded, given a
// Supabase client. No client of its own, so the same code runs in a DM's
// browser (foundryClassPackPublish.js) and in the Foundry sandbox's push
// script (node, signed in as a DM): both publish the same file.
import { classToFormState, standaloneSubclassToFormState } from './homebrew.js'
import { CLASS_PACK_BUCKET, CLASS_PACK_PATH, buildClassPack, classPackSummary, draftItems } from './foundryClassPack.js'

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

// preview: { links: Map(feature row id -> draft id), specs: Map(draft id -> spec) }
// stands in for mechanics not saved yet, so the pack is what saving them would
// publish (the sandbox's "chrab.mjs preview").
export async function loadClassPackWith(db, preview = null) {
  const linked = (list) => (preview ? list.map((r) => (preview.links.has(r.id) ? { ...r, feature_draft_id: preview.links.get(r.id) } : r)) : list)
  const [classRows, classFeatures, columns, values, subclassRows, subclassFeatures] = await Promise.all([
    rows(db.from('homebrew_classes').select('*').eq('visibility', 'public').order('name')),
    rows(db.from('homebrew_class_features').select('*')).then(linked),
    rows(db.from('homebrew_class_table_columns').select('*')),
    rows(db.from('homebrew_class_table_values').select('*')),
    rows(db.from('homebrew_subclasses').select('*').eq('visibility', 'public').order('name')),
    rows(db.from('homebrew_subclass_features').select('*')).then(linked),
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

  // Only drafts linked from something that's actually in the pack.
  const included = [
    ...classes.flatMap((c) => [...c.features, ...c.subclasses.flatMap((s) => s.features)]),
    ...standaloneSubclasses.flatMap((s) => s.features),
  ]
  const draftIds = [...new Set(included.map((f) => f.feature_draft_id).filter(Boolean))]
  const saved = draftIds.filter((id) => !preview?.specs.has(id))
  const drafts = [
    ...(saved.length ? await rows(db.from('feature_drafts').select('id, kind, spec').in('id', saved)) : []),
    ...draftIds.filter((id) => preview?.specs.has(id)).map((id) => ({ id, kind: 'feat', spec: preview.specs.get(id) })),
  ]

  return buildClassPack({ classes, standaloneSubclasses, items: draftItems(drafts) })
}

export async function publishClassPackWith(db) {
  const pack = await loadClassPackWith(db)
  const body = new Blob([JSON.stringify(pack)], { type: 'application/json' })
  // A short cache: Chrab Sync sees a change within a minute or so.
  const { error } = await db.storage.from(CLASS_PACK_BUCKET).upload(CLASS_PACK_PATH, body, { upsert: true, cacheControl: '60', contentType: 'application/json' })
  if (error) throw new Error(error.message)
  return classPackSummary(pack)
}
