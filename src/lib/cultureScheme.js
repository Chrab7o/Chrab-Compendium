// Builds one culture's name scheme from plain data - no bundler features, so
// the lab's worldgen (Node) builds exactly the same schemes as the site does.
//
//   shared   src/data/place-names.json (people patterns, place generators, gods)
//   language one of src/data/place-languages/*.json (a region or an old tongue)
//   people   one of src/data/place-peoples/*.json, or null for humans
//
// See placeNames.js for what the pieces mean.

export function buildCultureScheme(shared, language, people = null) {
  const parts = { ...shared.parts, ...language.parts }
  // The old tongues only have a mixed list of personal names; regions only
  // have gendered ones. Each fills in for the other.
  parts.gM ??= parts.person ?? []
  parts.gF ??= parts.person ?? []
  if (!language.parts.person) parts.person = [...parts.gM, ...parts.gF]

  const generators = { ...shared.generators, ...language.generators }
  for (const [gen, extra] of Object.entries(people?.branches ?? {})) {
    if (generators[gen]) generators[gen] = { ...generators[gen], branches: [...generators[gen].branches, ...extra] }
  }

  return {
    id: `places-${language.id}+${people?.id ?? ''}`,
    elide: Boolean(language.elide),
    lower: language.lower,
    // Reroll names whose pieces meet badly (see nameSchemes.js).
    checks: true,
    meanings: shared.meanings,
    parts,
    generators,
    blend: people ? { mix: people.mix ?? 0.25, parts: people.parts } : null,
  }
}
