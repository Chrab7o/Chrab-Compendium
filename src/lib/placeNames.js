// Culture-based name generators: the shared patterns in src/data/place-names.json
// (people names, one generator per Location kind, the English descriptor words
// and Alva's gods) filled from one culture in src/data/place-languages/, and
// optionally flavored by a people in src/data/place-peoples/.
//
// A culture is either a region (kind: "region" - Padian, Northern, Lowland,
// Heartland, Imperial: real-world-styled naming) or an old tongue (Dwarven,
// Old Tongue, Sun-tongue, Sylvan: invented). It supplies the sounds (nA, nB),
// roots with meanings (mod), given names (gM, gF), a joiner (j) and its own
// word for each place concept (lake, hold, gate...). It can also override a
// shared generator - regions do, for family names (ibn Rashid, Ivarsson,
// van der Meer).
//
// A people adds a light flair on top: `mix` of the time a pool it shares with
// the culture is drawn from the people's version instead, and its `branches`
// add patterns to a generator (dwarven clan names, dragonborn clutches).
// Humans are the culture as it stands, so they have no file.
//
// Source strings, as stored on kinds and used by the generator panel:
//   place:lake                    the Lake generator, in whatever culture is picked
//   place:lake@old                always in the Old Tongue
//   place:fullM@northern+dwarven  always Northern, with a dwarven flair
//   place:mine@+dwarven           any culture, always with a dwarven flair
// "place:" predates people names; it covers every generator here.

import shared from '../data/place-names.json'
import { buildCultureScheme } from './cultureScheme.js'

const LANGUAGE_MODULES = import.meta.glob('../data/place-languages/*.json', { eager: true })
const PEOPLE_MODULES = import.meta.glob('../data/place-peoples/*.json', { eager: true })

const loaded = (modules) =>
  Object.values(modules)
    .map((mod) => mod.default ?? mod)
    .sort((a, b) => a.label.localeCompare(b.label))

export const placeLanguages = loaded(LANGUAGE_MODULES).map((l) => ({ ...l, kind: l.kind ?? 'tongue' }))
export const placePeoples = loaded(PEOPLE_MODULES)

export const placeGenerators = shared.generators

export const languageById = (id) => placeLanguages.find((l) => l.id === id) ?? null
export const peopleById = (id) => placePeoples.find((p) => p.id === id) ?? null

/** Regions first, then the old tongues - for grouped pickers. */
export const languageGroups = [
  { label: 'Regions', items: placeLanguages.filter((l) => l.kind === 'region') },
  { label: 'Old tongues', items: placeLanguages.filter((l) => l.kind !== 'region') },
].filter((g) => g.items.length)

const schemes = new Map()

/** The shared patterns with `languageId`'s pools (and `peopleId`'s flair) merged in, ready for generateNamed. */
export function placeScheme(languageId, peopleId = null) {
  const language = languageById(languageId)
  if (!language) return null
  const people = peopleById(peopleId)
  const key = `${language.id}+${people?.id ?? ''}`
  if (!schemes.has(key)) schemes.set(key, buildCultureScheme(shared, language, people))
  return schemes.get(key)
}

/** 'place:lake@old+elven' -> { generator: 'lake', language: 'old', people: 'elven' }; null for other sources. */
export function parsePlaceSource(source) {
  if (!source?.startsWith('place:')) return null
  const [generator, pin = ''] = source.slice(6).split('@')
  if (!placeGenerators[generator]) return null
  const [language, people] = pin.split('+')
  return {
    generator,
    language: language && languageById(language) ? language : null,
    people: people && peopleById(people) ? people : null,
  }
}

export function placeSource(generator, language, people) {
  const pin = language || people ? `@${language ?? ''}${people ? `+${people}` : ''}` : ''
  return `place:${generator}${pin}`
}

/** "Padian", or "Padian, elven" with a flair. */
export function cultureLabel(languageId, peopleId) {
  const label = languageById(languageId)?.label
  const people = peopleById(peopleId)?.label
  return label && people ? `${label}, ${people.toLowerCase()}` : label ?? ''
}

/** Gloss for an entry: "silver lake, in Sylvan". */
export function meaningLine(meaning, languageId, peopleId) {
  const label = cultureLabel(languageId, peopleId)
  return label ? `“${meaning}”, in ${label}` : `“${meaning}”`
}
