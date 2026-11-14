// Where an Item Forge spec came from, and whether it still follows it.
//
// A spec built from an automation template carries
//   spec.source = { template, settings, fingerprint }
// where fingerprint is specFingerprint() of the spec the template built. While
// the stored spec still has that fingerprint, nobody has edited it by hand, so
// publishing can rebuild it from its settings with today's template code
// (rebuildFromSource in forgeBlocks.js) and a template fix reaches it.
// Once it's edited by hand, the fingerprint no longer matches and the spec is
// used as saved. Nothing that saves drafts has to know about this.
//
// The fingerprint ignores what isn't the mechanics: the words (name,
// description, requirements, feature type, which the class row owns), the
// behavior's level class (set from the class), the lab's push marker and the
// source itself. Random keys are renamed in order, and fields added since the
// spec was saved get today's defaults, so a resave without changes keeps it.
import { emptyActivity, emptyEffect } from './foundryActorBuilder.js'
import { featureSpecFromRow } from './foundryFeatures.js'

const sortKeys = (v) =>
  Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v

// Activities and effects saved before a field existed get today's default.
function filled(v, prop) {
  if (Array.isArray(v))
    return v.map((x) => {
      if (!x || typeof x !== 'object') return x
      if (prop === 'activities' && x.kind) return filled({ ...emptyActivity(x.kind), ...x })
      if (prop === 'effects') return filled({ ...emptyEffect(), ...x })
      return filled(x)
    })
  return v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, filled(x, k)])) : v
}

// The mechanics alone, sorted and filled, keys still as they are.
function mechanicsOnly(stored) {
  // eslint-disable-next-line no-unused-vars
  const { sandboxPush, source, ...rest } = stored ?? {}
  const spec = featureSpecFromRow(rest)
  const item = { ...spec.item, name: '', description: '' }
  if (item.behavior) item.behavior = { ...item.behavior, levelClass: '' }
  return sortKeys(filled({ ...spec, featType: '', requirements: '', item }))
}

// Every `key` string, in the order a walk of the sorted spec meets them.
export function keyOrder(stored) {
  const keys = []
  const walk = (v) => {
    if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') {
      if (typeof v.key === 'string' && v.key && !keys.includes(v.key)) keys.push(v.key)
      Object.values(v).forEach(walk)
    }
  }
  walk(mechanicsOnly(stored))
  return keys
}

// Replaces whole-string key values anywhere in a value (appliedBy, triggerKey…).
export function renameKeys(value, map) {
  let json = JSON.stringify(value)
  for (const [from, to] of map) if (from !== to) json = json.split(JSON.stringify(from)).join(JSON.stringify(to))
  return JSON.parse(json)
}

export function canonicalSpec(stored) {
  return renameKeys(mechanicsOnly(stored), keyOrder(stored).map((k, i) => [k, `k${i}`]))
}

// cyrb53: a quick 53-bit string hash, the same in the browser and in node.
function hash(text) {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0')
}

export const specFingerprint = (stored) => hash(JSON.stringify(canonicalSpec(stored)))

// Whether a stored spec is still exactly what its template (or its blocks,
// forgeBlocks.js) built.
export function followsTemplate(stored) {
  const source = stored?.source
  return (!!source?.template || Array.isArray(source?.blocks)) && !!source.fingerprint && source.fingerprint === specFingerprint(stored)
}

// A Foundry-style id (16 letters and digits) from a seed, the same every time.
const ID_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
export function seededId(seed) {
  let out = ''
  for (let i = 0; out.length < 16; i++) {
    const h = hash(`${seed}:${i}`)
    for (let j = 0; j + 2 <= h.length && out.length < 16; j += 2) out += ID_CHARS[parseInt(h.slice(j, j + 2), 16) % ID_CHARS.length]
  }
  return out
}

// `fresh` (just built) with the stored spec's keys, in order, so the built
// item keeps its Foundry ids. Keys the stored spec doesn't have (a template
// that now builds more) get ids seeded from `seed` (the draft id), so every
// publish gives them the same ones.
export function carryKeys(fresh, stored, seed) {
  const old = keyOrder(stored)
  const map = keyOrder(fresh).map((k, i) => [k, old[i] ?? seededId(`${seed}:${i}`)])
  return renameKeys(fresh, map)
}
