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

export const generatorLabel = (key, scheme) =>
  scheme?.generators?.[key]?.label ??
  GENERATOR_LABELS[key] ??
  (key.replace(/^name/, '').replace(/([a-z])([A-Z])/g, '$1 $2') || key)

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

// Joining words stay lowercase inside a name ("Temple of the Silent Flame",
// "Ashford-on-the-Wold"), but not as its first word; so does a possessive 's.
const SMALL_WORDS = new Set(['of', 'the', 'and', 'on', 'upon', 'in', 'under', 'by', 'at', 'to', 'a', 'an'])

// A scheme can add its own (`scheme.lower`), such as the ibn and al- of
// Padian names or the van der of Lowland ones.
const capitalize = (s, lower) =>
  s.replace(/(^|[\s'-])(\p{Ll}[\p{L}]*)/gu, (match, lead, word, offset) =>
    (lead === "'" ? word === 's' : offset > 0 && (SMALL_WORDS.has(word) || lower?.includes(word)))
      ? match
      : lead + word[0].toUpperCase() + word.slice(1),
  )

// A `lit:` entry in a branch is fixed text ("lit: of the "), not a pool name.
// A pool item is a plain string, or `{ t, m }` when the word carries its own
// meaning; `scheme.meanings[pool]` gives one meaning to every word in a pool.
//
// `scheme.blend` is a second set of pools mixed into the first - a people's
// flair on a region's names. Where both have a pool, the blend's is used
// `blend.mix` of the time; a pool only the blend has is always used.
function resolvePart(scheme, part, rng) {
  if (part.startsWith('lit:')) return { text: part.slice(4) }
  const own = scheme.parts[part]
  const alt = scheme.blend?.parts?.[part]
  const pool = alt && (!own || rng() < scheme.blend.mix) ? alt : own ?? ['']
  const item = pick(pool, rng)
  if (typeof item === 'string') return { text: item, meaning: scheme.meanings?.[part] }
  return { text: item.t, meaning: item.m }
}

// A `gen:` entry splices in another generator's output ("gen:surM" puts a
// family name after a given name), so a pattern is written once and reused.
function buildParts(scheme, generator, row, rng, depth = 0) {
  const gen = scheme.generators?.[generator]
  if (!gen?.branches?.length || depth > 4) return []
  const branch = pickBranch(gen.branches, row, rng)
  return branch.seq.flatMap((part) =>
    part.startsWith('gen:') ? buildParts(scheme, part.slice(4), row, rng, depth + 1) : [resolvePart(scheme, part, rng)],
  )
}

// ---------------------------------------------------------------------------
// Checks. With `scheme.checks` on, a name whose pieces meet badly is rolled
// again. Only the seams are judged: every pool word was written by hand, so a
// cluster inside one (Nieuw, Skjal) is deliberate, but the same cluster
// appearing where two pieces meet usually isn't.

const VOWEL_RUN = /[aeiouyáéíóúýàâäæåëïöøüû]{3,}/
const CONSONANT_RUN = /[bcdfghjklmnpqrstvwxzðþ]{4,}/
const TRIPLE = /(\p{L})\1\1/u
const ECHO = /(\p{L}{2,})\1/u
const APOSTROPHE = /['’]/
// Th, ght, kn and the like are one sound, so are a stop and the l or r it
// leans on (Mist-glow, Dusk-crown), a doubled letter is one sound held, and a
// linking s between consonants (Sigurd-s-dóttir) barely registers - none of
// them should count toward a consonant pile-up.
const CONSONANT = 'bcdfghjklmnpqrstvwxzðþ'
const sounds = (s) =>
  s
    .replace(/ght|ch|sh|th|gh|kh|ph|ck|ng|zh|dh|rh|qu|wh|wr|kn|[bcdfgkpt][lr]/g, 'x')
    .replace(new RegExp(`([${CONSONANT}])s(?=[${CONSONANT}])`, 'g'), '$1')
    .replace(/(.)\1/g, '$1')
// Anywhere in a name, or (short ones, to spare Brightwater) only at the start of a word.
const BLOCKED = /fuck|shit|cunt|nigg|whore|slut|\b(fag|twat|cock|piss|rape|hello|anus)/u

/** What's wrong where `left` (the name so far) meets `right` (the next piece), or null. */
function seamProblem(left, right) {
  const a = left.split(/[\s-]/).pop()
  const b = right.split(/[\s-]/)[0]
  if (!a || !b) return null // a space or hyphen at the seam: separate words
  // An apostrophe name stays as it is (Ghur’akh, not Ghur’akhsson), though it
  // can still take a possessive (Oth'Mar's).
  if (APOSTROPHE.test(a) && !APOSTROPHE.test(a.slice(-1)) && !APOSTROPHE.test(b[0]) && b.length > 1)
    return 'suffix on an apostrophe name'
  const [x, y] = [a.toLowerCase(), b.toLowerCase()]
  // Something the join made, not something either piece already had.
  const made = (re, f = (s) => s) => re.test(f(x + y)) && !re.test(f(x)) && !re.test(f(y))
  if (made(TRIPLE)) return 'tripled letter'
  if (made(VOWEL_RUN)) return 'vowel pile-up'
  if (made(CONSONANT_RUN, sounds)) return 'consonant pile-up'
  if (made(ECHO)) return 'echoed syllable'
  return null
}

/** Problems with the finished name as a whole, or null. */
function wholeProblem(name, lower) {
  const flat = name.toLowerCase()
  if (BLOCKED.test(flat)) return 'reads as a rude word'
  const words = flat
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}'’-]/gu, ''))
    .filter((w) => w.length >= 3 && !SMALL_WORDS.has(w) && !lower?.includes(w))
  if (words.some((w) => w.replace(/[^\p{L}]/gu, '').length > 16)) return 'too long'
  // Ivar Ivarsson, Amir ibn Amir, Port Portus.
  for (let i = 0; i < words.length; i++)
    for (let j = i + 1; j < words.length; j++) if (words[j].startsWith(words[i])) return 'word repeated'
  return null
}

/** Joins the parts, merging doubled vowels when the scheme elides; notes the first problem found. */
function joinParts(scheme, parts) {
  let out = ''
  let problem = null
  for (let i = 0; i < parts.length; i++) {
    let { text } = parts[i]
    // Merge a vowel doubled where two parts meet (Ilya + athar -> Ilyathar).
    const doubled = scheme.elide && /[aeiouy]$/i.test(out) && out.slice(-1).toLowerCase() === text[0]?.toLowerCase()
    if (doubled) text = text.slice(1)
    if (scheme.checks && !problem && out) {
      problem = seamProblem(out, text)
      // A hyphen joiner needs a real word on both sides (Sorkh-Abad, not Ka-Kand).
      if (!problem && text === '-') {
        const before = out.split(/\s/).pop()
        const after = parts[i + 1]?.text ?? ''
        if (before.length < 3 || after.length < 3) problem = 'stub around a hyphen'
      }
    }
    out += text
  }
  return { text: out, problem }
}

const MAX_TRIES = 20

/**
 * One name from `scheme`'s `generator`, plus what it means when its parts
 * carry meanings ("silver lake" for Vael + mir), else ''. `row` selects
 * position-dependent branches. A scheme with `checks` rolls again (up to
 * MAX_TRIES) when the result fails them, then gives up and keeps the last.
 */
export function generateNamed(scheme, generator, { row = 0, rng = Math.random } = {}) {
  let result = { name: '', meaning: '' }
  for (let attempt = 0; attempt < (scheme.checks ? MAX_TRIES : 1); attempt++) {
    const parts = buildParts(scheme, generator, row, rng)
    if (!parts.length) return result
    const joined = joinParts(scheme, parts)
    const name = capitalize(joined.text.trim(), scheme.lower)
    // A lone meaning ("city" on an invented name) says nothing worth keeping.
    const meanings = parts.map((p) => p.meaning).filter(Boolean)
    result = { name, meaning: meanings.length > 1 ? meanings.join(' ') : '' }
    if (!scheme.checks || !(joined.problem ?? wholeProblem(name, scheme.lower))) return result
  }
  return result
}

/** Why `name`-as-built fails the checks, or null - for tests and tuning. */
export function nameProblem(scheme, parts) {
  const joined = joinParts({ ...scheme, checks: true }, parts.map((text) => ({ text })))
  return joined.problem ?? wholeProblem(capitalize(joined.text.trim(), scheme.lower), scheme.lower)
}

export const generateOne = (scheme, generator, options) => generateNamed(scheme, generator, options).name

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
export function schemeSize(scheme, generator, depth = 0) {
  const gen = scheme.generators?.[generator]
  if (!gen || depth > 4) return 0
  const poolSize = (p) =>
    p.startsWith('lit:') ? 1
      : p.startsWith('gen:') ? schemeSize(scheme, p.slice(4), depth + 1) || 1
        : (scheme.parts[p]?.length ?? 0) + (scheme.blend?.parts?.[p]?.length ?? 0) || 1
  return gen.branches.reduce((total, b) => total + b.seq.reduce((n, p) => n * poolSize(p), 1), 0)
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
