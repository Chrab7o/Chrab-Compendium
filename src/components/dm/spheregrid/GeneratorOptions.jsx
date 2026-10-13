import placeNames from '../../../data/place-names.json'

const MANIFEST = import.meta.glob('../../../data/name-schemes/manifest.json', { eager: true })
const manifest = Object.values(MANIFEST)[0]?.default ?? { races: [] }

export { placeNames }

// Place generators grouped the way the Location kinds are ("Settlements",
// "Wilderness", ...), in file order.
const placeGroups = Object.entries(placeNames.generators).reduce((groups, [key, gen]) => {
  const group = groups.find((g) => g.label === gen.group) ?? groups[groups.push({ label: gen.group, items: [] }) - 1]
  group.items.push({ key, label: gen.label })
  return groups
}, [])

/** Is `source` something the panel can draw from? (A deleted pool isn't.) */
export function isKnownSource(source, pools) {
  if (!source) return false
  if (source.startsWith('place:')) return Boolean(placeNames.generators[source.slice(6)])
  if (source.startsWith('pool:')) return pools.some((p) => p.id === source.slice(5))
  if (source.startsWith('scheme:')) return manifest.races?.some((r) => r.scheme === source.slice(7)) ?? false
  return false
}

/**
 * The <optgroup>s for a generator <select>, valued with source strings:
 * `pool:<id>`, `place:<key>` or `scheme:<id>`. Kinds store the same string as
 * their default generator.
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
        <optgroup key={group.label} label={`Places · ${group.label}`}>
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
