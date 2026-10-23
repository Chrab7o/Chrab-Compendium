// Automation templates: TYPES of mechanic (defenses, a resource pool, bonus
// damage on hit...) that a feature starts from, each with its own settings,
// rather than copies of finished features. Built up class by class, starting
// with the Dark Knight (the list and its sources: docs/automation-templates.md).
//
// A template: { key, kind: 'type' | 'example', label, help, params, build }.
//   params  the settings the picker asks for: { key, label, kind, hint?, default? }
//           kinds: 'conditions' | 'damageTypes' (multi-select lists),
//           'text', 'formula', 'select' (with options: [[value, label]])
//   build(values) -> a Feature Forge spec (foundryFeatures.js shape); it may
//           throw an Error whose message tells the DM what's missing.
// Finished features worth copying stay available as kind 'example'.

import { CONDITIONS, DAMAGE_TYPES, emptyChange, emptyEffect, identifierFor } from './foundryActorBuilder.js'
import { FEATURE_TEMPLATES, emptyFeatureSpec } from './foundryFeatures.js'

export const PARAM_OPTIONS = { conditions: CONDITIONS, damageTypes: DAMAGE_TYPES }

const list = (v) => (Array.isArray(v) ? v.filter(Boolean) : [])

function change(id, value) {
  return { ...emptyChange(id), value }
}

// A passive feature: one always-on effect, no rolls.
function passiveSpec(changes) {
  const spec = emptyFeatureSpec('feat')
  spec.item = { ...spec.item, section: 'trait', activities: [], effects: [{ ...emptyEffect(), passive: true, changes }] }
  return spec
}

const defenses = {
  key: 'defenses',
  kind: 'type',
  label: 'Defenses: resistances, immunities, condition saves',
  help: 'Always on. Advantage on saves against chosen conditions (Tainted Soul: frightened), immunity to conditions, and resistance, immunity or vulnerability to damage types. Each choice becomes one change on the feature’s effect, so you can adjust them afterwards.',
  params: [
    { key: 'saveAdvantage', label: 'Advantage on saves against', kind: 'conditions', hint: 'Works on saves midi-qol rolls for something that applies the condition (a spell, a monster’s Frightful Presence, a repeat save).' },
    { key: 'conditionImmune', label: 'Immune to conditions', kind: 'conditions' },
    { key: 'resist', label: 'Resistance to', kind: 'damageTypes' },
    { key: 'immune', label: 'Immunity to', kind: 'damageTypes' },
    { key: 'vulnerable', label: 'Vulnerability to', kind: 'damageTypes' },
  ],
  build(values) {
    const changes = [
      ...list(values.saveAdvantage).map((c) => change('advSaveVs', c)),
      ...list(values.conditionImmune).map((c) => change('condImmune', c)),
      ...list(values.resist).map((t) => change('resist', t)),
      ...list(values.immune).map((t) => change('immune', t)),
      ...list(values.vulnerable).map((t) => change('vulnerable', t)),
    ]
    if (!changes.length) throw new Error('Pick at least one condition or damage type.')
    return passiveSpec(changes)
  },
}

// A pool of points other features spend - the Dark Knight's Darkness, the
// Pictomancer's Ink, Ki. The pool is the feature's own uses; spenders name it
// by identifier ("+ Spend a resource" -> "A class resource"), which dnd5e
// re-links to the pool on whichever character has it.
const resourcePool = {
  key: 'resourcePool',
  kind: 'type',
  label: 'Resource pool: points other features spend',
  help: 'A feature holding a pool of points, like Darkness. Other features spend from it with “+ Spend a resource” → “A class resource” and this identifier; tick “Can spend more” for “consume additional Darkness to add another die”.',
  params: [
    { key: 'identifier', label: 'Identifier', kind: 'text', default: 'darkness', hint: 'What spenders name. Lowercase words, e.g. darkness or ink.' },
    {
      key: 'max',
      label: 'Pool size',
      kind: 'formula',
      default: '@scale.the-dark-knight.darkness-points',
      hint: 'A number, or a class table column: @scale.<class identifier>.<column>, e.g. the Dark Knight’s Darkness Points.',
    },
    { key: 'recovery', label: 'Refills on', kind: 'select', default: 'lr', options: [['lr', 'Long rest'], ['sr', 'Short rest'], ['day', 'Each day']] },
  ],
  build(values) {
    const identifier = identifierFor(values.identifier)
    const max = String(values.max ?? '').trim()
    if (!identifier) throw new Error('Give the pool an identifier, e.g. darkness.')
    if (!max) throw new Error('Set the pool size.')
    const spec = emptyFeatureSpec('feat')
    spec.item = { ...spec.item, section: 'trait', activities: [], effects: [], usesMax: max, usesRecovery: values.recovery || 'lr', identifier }
    return spec
  },
}

export const AUTOMATION_TEMPLATES = [
  defenses,
  resourcePool,
  ...FEATURE_TEMPLATES.map((t) => ({ ...t, kind: 'example', params: [], build: () => t.build() })),
]

export function findTemplate(key) {
  return AUTOMATION_TEMPLATES.find((t) => t.key === key) ?? null
}

export function templateDefaults(template) {
  return Object.fromEntries((template?.params ?? []).map((p) => [p.key, p.default ?? (PARAM_OPTIONS[p.kind] ? [] : '')]))
}

// { spec } or { error } - for the picker, which shows the error instead of creating.
export function buildFromTemplate(template, values) {
  try {
    return { spec: template.build(values ?? templateDefaults(template)) }
  } catch (err) {
    return { error: err.message }
  }
}
