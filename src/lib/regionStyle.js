// Leaflet's pathOptions.color is an SVG stroke attribute, not CSS, so it
// can't reference a custom property directly — these hex values mirror
// --accent/--accent-red from index.css and need updating together if the
// palette changes again.
const PUBLIC_COLOR = '#7a1f2b'
const DM_COLOR = '#b83227'

// Outside of editing, a region's shape stays invisible until the visitor
// hovers it (or it's the currently-opened one) — the name tooltip already
// appears on hover, so the highlight only needs to reinforce that, not
// permanently outline every region on the map.
export function regionPathOptions(region, { selected = false, hovered = false, drawing = false, alwaysVisible = false } = {}) {
  const color = region.visibility === 'dm' ? DM_COLOR : PUBLIC_COLOR
  const visible = alwaysVisible || selected || hovered
  return {
    color: drawing ? '#a32d3d' : color,
    weight: selected ? 4 : 2,
    opacity: visible ? 1 : 0,
    fillColor: color,
    fillOpacity: visible ? (selected ? 0.35 : 0.15) : 0,
    dashArray: region.visibility === 'dm' ? '6 4' : null,
  }
}
