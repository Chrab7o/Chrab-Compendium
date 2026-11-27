import { languageGroups, parsePlaceSource, placeGenerators, placePeoples } from '../../../lib/placeNames'

const MANIFEST = import.meta.glob('../../../data/name-schemes/manifest.json', { eager: true })
const manifest = Object.values(MANIFEST)[0]?.default ?? { races: [] }

// Culture generators grouped the way the Location kinds are ("Settlements",
// "Wilderness", ...), in file order; people names come first, as "People".
const groupLabel = (group) => (group === 'People' ? 'People · by culture' : `Places · ${group}`)
const placeGroups = Object.entries(placeGenerators).reduce((groups, [key, gen]) => {
  const group = groups.find((g) => g.label === gen.group) ?? groups[groups.push({ label: gen.group, items: [] }) - 1]
  group.items.push({ key, label: gen.label })
  return groups
}, [])

/** Is `source` something the panel can draw from? (A deleted pool isn't.) */
export function isKnownSource(source, pools) {
  if (!source) return false
  if (source.startsWith('place:')) return Boolean(parsePlaceSource(source))
  if (source.startsWith('pool:')) return pools.some((p) => p.id === source.slice(5))
  if (source.startsWith('scheme:')) return manifest.races?.some((r) => r.scheme === source.slice(7)) ?? false
  return false
}

/**
 * The <optgroup>s for a generator <select>, valued with source strings:
 * `pool:<id>`, `place:<key>` or `scheme:<id>`. Kinds store the same string as
 * their default generator, optionally with a culture and a people's flair
 * (`place:lake@old`, `place:fullM@northern+dwarven`) - those have their own
 * pickers, see LanguageOptions and PeopleOptions.
 */
export default function GeneratorOptions({ pools }) {
  return (
    <>
      {pools.length > 0 && (
        <optgroup label="Your pools">
          {pools.map((p) => (
            <option key={p.id} value={`pool:${p.id}`}>
              {p.name} ({p.names.length})
            </option>
          ))}
        </optgroup>
      )}
      {placeGroups.map((group) => (
        <optgroup key={group.label} label={groupLabel(group.label)}>
          {group.items.map((item) => (
            <option key={item.key} value={`place:${item.key}`}>
              {item.label}
            </option>
          ))}
        </optgroup>
      ))}
      {manifest.races?.length > 0 && (
        <optgroup label="People · name schemes">
          {manifest.races.map((r) => (
            <option key={r.key} value={`scheme:${r.scheme}`}>
              {r.label}
            </option>
          ))}
        </optgroup>
      )}
    </>
  )
}

/** <optgroup>s for the cultures names are built from: regions, then the old tongues. */
export function LanguageOptions() {
  return languageGroups.map((group) => (
    <optgroup key={group.label} label={group.label}>
      {group.items.map((l) => (
        <option key={l.id} value={l.id} title={l.note}>
          {l.label}
        </option>
      ))}
    </optgroup>
  ))
}

/** <option>s for a people's flair on top of a culture. The empty value (human) is the caller's. */
export function PeopleOptions() {
  return placePeoples.map((p) => (
    <option key={p.id} value={p.id} title={p.note}>
      {p.label}
    </option>
  ))
}
