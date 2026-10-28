// Item Forge drafts <-> homebrew class and subclass features: the loading and
// saving half of forgeClassRows.js. Used by the class editors' "+ Add from the
// Item Forge" picker and the Forge's "Add to a class".
import { supabase } from './supabaseClient'
import { classFeatureSpec } from './foundryFeatures'
import { republishQuietly } from './foundryClassPackPublish'
import { placedRow } from './forgeClassRows'

async function rows(query) {
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data ?? []
}

// Feature drafts a class feature can link to, newest first.
export function loadFeatureDrafts() {
  return rows(supabase.from('feature_drafts').select('id, name, updated_at').eq('kind', 'feat').order('updated_at', { ascending: false }))
}

// draft id -> where it's used, as labels ("Pictomancer › level 1 › Bleeding Scar").
export async function draftUsage() {
  const [classRows, subclassRows] = await Promise.all([
    rows(supabase.from('homebrew_class_features').select('feature_draft_id, name, level, homebrew_classes(name)').not('feature_draft_id', 'is', null)),
    rows(
      supabase
        .from('homebrew_subclass_features')
        .select('feature_draft_id, name, level, homebrew_subclasses(name, parent_class_name, homebrew_classes(name))')
        .not('feature_draft_id', 'is', null)
    ),
  ])
  const usage = new Map()
  const add = (id, label) => usage.set(id, [...(usage.get(id) ?? []), label])
  for (const r of classRows) add(r.feature_draft_id, [r.homebrew_classes?.name, `level ${r.level}`, r.name].filter(Boolean).join(' › '))
  for (const r of subclassRows) {
    const s = r.homebrew_subclasses ?? {}
    add(r.feature_draft_id, [s.homebrew_classes?.name ?? s.parent_class_name, s.name, `level ${r.level}`, r.name].filter(Boolean).join(' › '))
  }
  return usage
}

// Every class and subclass a feature can be added to:
// [{ table: 'class' | 'subclass', id, label, className, subclassName, editPath }]
export async function loadFeatureTargets() {
  const [classes, subclasses] = await Promise.all([
    rows(supabase.from('homebrew_classes').select('id, name').order('name')),
    rows(supabase.from('homebrew_subclasses').select('id, name, class_id, parent_class_name').order('name')),
  ])
  const classNames = new Map(classes.map((c) => [c.id, c.name]))
  return [
    ...classes.map((c) => ({ table: 'class', id: c.id, label: c.name, className: c.name, subclassName: '', editPath: `/dm/homebrew/classes/${c.id}/edit` })),
    ...subclasses.map((s) => {
      const className = classNames.get(s.class_id) ?? s.parent_class_name ?? ''
      return {
        table: 'subclass',
        id: s.id,
        label: `${className ? `${className} › ` : ''}${s.name}`,
        className,
        subclassName: s.name,
        editPath: s.class_id ? `/dm/homebrew/classes/${s.class_id}/edit` : `/dm/homebrew/subclasses/${s.id}/edit`,
      }
    }),
  ].sort((a, b) => a.label.localeCompare(b.label))
}

const featureTable = (target) =>
  target.table === 'class'
    ? { table: 'homebrew_class_features', key: 'class_id' }
    : { table: 'homebrew_subclass_features', key: 'subclass_id' }

// A class or subclass's stored feature rows (flat).
export function loadTargetRows(target) {
  const { table, key } = featureTable(target)
  return rows(supabase.from(table).select('*').eq(key, target.id).order('sort_order'))
}

// Adds a saved draft to a class or subclass: the row (with the draft's name
// and text), then the draft gets the class's requirements, as saving the class
// would. Returns a notice if the Foundry class pack didn't republish.
// place: { level, under } (see placedRow).
export async function addDraftToTarget(target, { id, spec }, place) {
  const existing = await loadTargetRows(target)
  const row = placedRow(existing, { name: spec.item.name, description: spec.item.description, draftId: id, ...place })
  const { table, key } = featureTable(target)
  const inserted = await supabase.from(table).insert({ ...row, [key]: target.id })
  if (inserted.error) throw new Error(inserted.error.message)
  const next = classFeatureSpec(spec, { className: target.className, subclassName: target.subclassName, level: row.level, name: row.name, description: row.description })
  const saved = await supabase.from('feature_drafts').update({ name: row.name, spec: next }).eq('id', id)
  if (saved.error) throw new Error(saved.error.message)
  return { spec: next, notice: await republishQuietly() }
}
