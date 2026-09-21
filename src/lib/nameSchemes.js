// Runtime for the compiled fantasy-name schemes.
//
// A scheme is plain data (see scripts/name-schemes/README.md for how they're
// produced): named syllable pools, plus per-generator branches that say which
// pools get concatenated, how often, and whether a branch only applies to the
// first or last half of a batch.
//
//   { id, parts: { nm1: [...] }, generators: { nameMas: { branches: [...] } } }
//
// Everything here is pure - pass `rng` to get reproducible output.

const GENERATOR_LABELS = {
  nameMas: 'Male',
  nameFem: 'Female',
  nameSur: 'Surname',
  nameChild: 'Child',
  nameNeu: 'Neutral',
  nameClan: 'Clan',
  nameNick: 'Nickname',
}

export const generatorLabel = (key) =>
  GENERATOR_LABELS[key] ?? (key.replace(/^name/, '').replace(/([a-z])([A-Z])/g, '$1 $2') || key)

const pick = (arr, rng) => arr[(rng() * arr.length) | 0]

function pickBranch(branches, row, rng) {
  // Some schemes vary by position in the batch: the site shows one shape for
  // the first five rows and another for the rest.
  const half = row < 5 ? 'first5' : 'last5'
  const usable = branches.filter((b) => !b.rows || b.rows === half)
  const pool = usable.length ? usable : branches
  let roll = rng() * pool.reduce((sum, b) => sum + b.weight, 0)
  for (const b of pool) if ((roll -= b.weight) <= 0) return b
  return pool[pool.length - 1]
}

const capitalize = (s) =>
  s.replace(/(^|[\s'-])(\p{Ll})/gu, (_, lead, ch) => lead + ch.toUpperCase())

/** One name from `scheme`'s `generator`. `row` selects position-dependent branches. */
export function generateOne(scheme, generator, { row = 0, rng = Math.random } = {}) {
  const gen = scheme.generators?.[generator]
  if (!gen?.branches?.length) return ''
  const branch = pickBranch(gen.branches, row, rng)
  const out = branch.seq.map((part) => pick(scheme.parts[part] ?? [''], rng)).join('')
  return capitalize(out.trim())
}

/** `count` distinct names. Falls back to fewer if the scheme can't produce that many. */
export function generateNames(scheme, generator, { count = 10, rng = Math.random } = {}) {
  const out = []
  const seen = new Set()
  for (let attempt = 0; attempt < count * 50 && out.length < count; attempt++) {
    const name = generateOne(scheme, generator, { row: out.length % 10, rng })
    if (!name || seen.has(name)) continue
    seen.add(name)
    out.push(name)
  }
  return out
}

/** Rough count of distinct names a generator can reach - for "X combinations". */
export function schemeSize(scheme, generator) {
  const gen = scheme.generators?.[generator]
  if (!gen) return 0
  return gen.branches.reduce(
    (total, b) => total + b.seq.reduce((n, p) => n * (scheme.parts[p]?.length || 1), 1),
    0,
  )
}

/** Deterministic rng from a string seed, so a name can be linked to and re-shown. */
export function seededRng(seed) {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    h ^= h >>> 16
    return (h >>> 0) / 4294967296
  }
}
