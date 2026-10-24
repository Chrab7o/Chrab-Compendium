// A class's Foundry mechanics as a file, for loading into the class editor in
// one go - how a set worked out in the sandbox (foundry-expirmenets'
// build-*-probe scripts) becomes the class's real Feature Forge drafts. The
// editor attaches each entry to its feature row as unsaved mechanics; saving
// the class then creates and links the drafts through the normal path.
//
// { format: 'chrab-class-mechanics', version: 1, className,
//   mechanics: [{ subclass: '' | subclass name, name, level, spec }] }

import { featureSpecFromRow } from './foundryFeatures.js'

export const MECHANICS_FILE_FORMAT = 'chrab-class-mechanics'

const norm = (s) => String(s ?? '').trim().toLowerCase()

export function mechanicsFile(className, entries) {
  return { format: MECHANICS_FILE_FORMAT, version: 1, className, mechanics: entries }
}

// Attaches the file's mechanics to the matching rows (same subclass, name and
// level). Returns the new form plus what matched and what didn't.
export function attachMechanicsFile(form, data) {
  if (data?.format !== MECHANICS_FILE_FORMAT) throw new Error('That isn’t a class mechanics file.')
  const attached = []
  const unmatched = []
  const label = (m) => [m.subclass, `level ${m.level}`, m.name].filter(Boolean).join(' › ')

  const rowsFor = (subclass) => (subclass ? form.subclasses.find((s) => norm(s.name) === norm(subclass))?.features : form.features)
  const patches = new Map() // row object -> spec
  for (const m of data.mechanics ?? []) {
    const row = rowsFor(m.subclass)?.find((r) => norm(r.name) === norm(m.name) && Number(r.level) === Number(m.level))
    if (!row) {
      unmatched.push(label(m))
      continue
    }
    patches.set(row, featureSpecFromRow(m.spec))
    attached.push(label(m))
  }
  const apply = (rows) => rows.map((r) => (patches.has(r) ? { ...r, mechanics: patches.get(r), mechanicsDirty: true, mechanicsMissing: false } : r))
  return {
    form: { ...form, features: apply(form.features), subclasses: form.subclasses.map((s) => ({ ...s, features: apply(s.features) })) },
    attached,
    unmatched,
    classMismatch: data.className && norm(data.className) !== norm(form.name) ? data.className : null,
  }
}
