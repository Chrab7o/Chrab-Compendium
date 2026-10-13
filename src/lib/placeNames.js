// Place-name generators: the shared patterns in src/data/place-names.json
// (one generator per Location kind, plus the English descriptor words) filled
// with one invented language from src/data/place-languages/.
//
// A language supplies the invented half - name syllables (nA, nB), roots with
// meanings (mod), people and gods, a joiner (j) and its own word for each
// place concept (lake, hold, gate...). Every pattern draws from those pools by
// name, so a new language only has to fill them in, and a pattern written once
// works in every language.
//
// Source strings, as stored on kinds and used by the generator panel:
//   place:lake        the Lake generator, in whatever language is picked
//   place:lake@old    the Lake generator, always in the Old Tongue

import shared from '../data/place-names.json'

const LANGUAGE_MODULES = import.meta.glob('../data/place-languages/*.json', { eager: true })

export const placeLanguages = Object.values(LANGUAGE_MODULES)
  .map((mod) => mod.default ?? mod)
  .sort((a, b) => a.label.localeCompare(b.label))

export const placeGenerators = shared.generators

export const languageById = (id) => placeLanguages.find((l) => l.id === id) ?? null

const schemes = new Map()

/** The shared patterns with `languageId`'s pools merged in, ready for generateNamed. */
export function placeScheme(languageId) {
  const language = languageById(languageId)
  if (!language) return null
  if (!schemes.has(language.id)) {
    schemes.set(language.id, {
      id: `places-${language.id}`,
      elide: Boolean(language.elide),
      meanings: shared.meanings,
      parts: { ...shared.parts, ...language.parts },
      generators: shared.generators,
    })
  }
  return schemes.get(language.id)
}

/** 'place:lake@old' -> { generator: 'lake', language: 'old' }; null for other sources. */
export function parsePlaceSource(source) {
  if (!source?.startsWith('place:')) return null
  const [generator, language = null] = source.slice(6).split('@')
  if (!placeGenerators[generator]) return null
  return { generator, language: language && languageById(language) ? language : null }
}

export const placeSource = (generator, language) => `place:${generator}${language ? `@${language}` : ''}`

/** Gloss for an entry: "silver lake, in Sylvan". */
export function meaningLine(meaning, languageId) {
  const label = languageById(languageId)?.label
  return label ? `“${meaning}”, in ${label}` : `“${meaning}”`
}
