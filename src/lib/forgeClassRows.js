// Class and subclass feature rows <-> Item Forge drafts: the pure half. The
// class editors (homebrew/ForgeFeaturePicker, FeatureMechanics) and the
// Forge's "Add to a class" (lib/classFeatureLinks.js) do the loading and
// saving.
//
// Saving a class writes each row's name and text onto its linked draft
// (classFeatureSpec), so a row made from a draft starts with the draft's own
// name and text, or the first class save would wipe them.
import { nestFeatures } from './homebrew.js'

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
