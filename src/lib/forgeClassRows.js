// Class and subclass feature rows <-> Item Forge drafts: the pure half. The
// class editors (homebrew/ForgeFeaturePicker, FeatureMechanics) and the
// Forge's "Add to a class" (lib/classFeatureLinks.js) do the loading and
// saving.
//
// Saving a class writes each row's name and text onto its linked draft
// (classFeatureSpec), so a row made from a draft starts with the draft's own
// name and text, or the first class save would wipe them.
import { flattenFeatureRows, nestFeatureRows, nestFeatures } from './homebrew.js'

const clean = (s) => String(s ?? '').trim()
const same = (a, b) => clean(a).toLowerCase() === clean(b).toLowerCase()

export function draftText(spec) {
  return { name: clean(spec?.item?.name), description: String(spec?.item?.description ?? '') }
}

// The fields a new row gets from a draft (the editors add level and choice
// settings, which depend on where it goes).
export function rowFromDraft(draftId, spec) {
  return { ...draftText(spec), feature_draft_id: draftId, mechanics: spec, mechanicsDirty: false, mechanicsMissing: false }
}

// A save from the chain builder tab (lib/forgeHandoff.js) onto the class
// editor's form: the row with that forge_key, in the class's features or any
// subclass's, takes the draft's link, mechanics, name and text. Returns the
// new form, or null if no row has that key.
// Options hang off their feature's name, so this goes through the editor's
// nested view: a renamed feature keeps its options, and later features that
// add to it follow the new name.
export function applyForgeSave(form, key, { draftId, spec }) {
  let found = false
  const text = draftText(spec)
  const patch = (r) => {
    found = true
    return { ...r, name: text.name || r.name, description: text.description, feature_draft_id: draftId, mechanics: spec, mechanicsDirty: false, mechanicsMissing: false }
  }
  const apply = (rows) => {
    if (!(rows ?? []).some((r) => r.forge_key === key)) return rows
    let renamed = null
    const nested = nestFeatureRows(rows).map((p) => {
      if (p.forge_key === key) {
        const next = patch(p)
        if (!same(next.name, p.name)) renamed = { from: clean(p.name), to: next.name }
        return next
      }
      return { ...p, children: p.children.map((c) => (c.forge_key === key ? patch(c) : c)) }
    })
    return flattenFeatureRows(renamed ? nested.map((p) => (p.choice_into === renamed.from ? { ...p, choice_into: renamed.to } : p)) : nested)
  }
  const next = { ...form, features: apply(form.features) }
  if (form.subclasses) next.subclasses = form.subclasses.map((s) => ({ ...s, features: apply(s.features) }))
  return found ? next : null
}

// Linking an existing row to a draft: a blank name or text is filled from the
// draft. `conflicts` names what both have and disagree on ('name', 'text');
// `forge` is the patch that takes the draft's side of those.
export function linkTextPatch(row, spec) {
  const draft = draftText(spec)
  const patch = {}
  const forge = {}
  const conflicts = []
  if (!clean(row.name)) patch.name = draft.name
  else if (draft.name && !same(row.name, draft.name)) {
    conflicts.push('name')
    forge.name = draft.name
  }
  if (!clean(row.description)) patch.description = draft.description
  else if (clean(draft.description) && clean(row.description) !== clean(draft.description)) {
    conflicts.push('text')
    forge.description = draft.description
  }
  return { patch, conflicts, forge }
}

// Where a draft can go in a class or subclass's stored (flat) rows: on its own,
// or as an option under one of the top-level features.
export function placementsFor(rows) {
  return nestFeatures(rows)
    .filter((n) => !n.synthetic && clean(n.feature.name))
    .map((n) => ({ name: clean(n.feature.name), level: n.feature.level, options: n.children.length }))
}

// The stored row for a draft placed in `rows` (flat, as the tables hold them).
// under: a top-level feature's name, or '' for a feature of its own at `level`.
// An option copies its group's level and pick settings; under a feature that
// adds to an earlier group ("Dark Arts Continued"), it joins that group.
export function placedRow(rows, { name, description, draftId, level = 1, under = '' }) {
  const sortOrder = rows.reduce((max, r) => Math.max(max, r.sort_order ?? 0), -1) + 1
  const base = { name: clean(name), description: description ?? '', feature_draft_id: draftId, sort_order: sortOrder }
  if (!clean(under)) return { ...base, level: Number(level) || 1, choice_group: '', choice_count: null, choice_swap: false }
  const node = nestFeatures(rows).find((n) => !n.synthetic && same(n.feature.name, under))
  if (!node) throw new Error(`No feature named "${under}"`)
  if (node.into) return { ...base, level: node.feature.level, choice_group: node.into, choice_count: null, choice_swap: false }
  return {
    ...base,
    level: node.feature.level,
    choice_group: clean(node.feature.name),
    choice_count: node.children.length ? node.choiceCount : 1,
    choice_swap: node.choiceSwap,
  }
}
