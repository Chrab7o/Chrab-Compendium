// Leaflet's pathOptions.color is an SVG stroke attribute, not CSS, so it
// can't reference a custom property directly — these hex values mirror
// --accent/--accent-red from index.css and need updating together if the
// palette changes again.
const PUBLIC_COLOR = '#7a1f2b'
const DM_COLOR = '#b83227'

export function regionPathOptions(region, { selected = false, drawing = false } = {}) {
  const color = region.visibility === 'dm' ? DM_COLOR : PUBLIC_COLOR
  return {
    color: drawing ? '#a32d3d' : color,
    weight: selected ? 4 : 2,
    fillColor: color,
    fillOpacity: selected ? 0.35 : 0.15,
    dashArray: region.visibility === 'dm' ? '6 4' : null,
  }
}
