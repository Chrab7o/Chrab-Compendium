// Leaflet's pathOptions.color is an SVG stroke attribute, not CSS, so it
// can't reference a custom property directly — these hex values mirror
// --accent/--accent-red from index.css and need updating together if the
// palette changes again.
const PUBLIC_COLOR = '#7a1f2b'
const DM_COLOR = '#b83227'

// Outside of editing, a region's shape stays invisible until the visitor
// hovers it (or it's the currently-opened one) — the name tooltip already
// appears on hover, so the highlight only needs to reinforce that, not
// permanently outline every region on the map. `hidden` forces it off
// regardless of the above - used while the map is flying to a new view, so
// the outline doesn't sit there visibly drifting out of alignment with the
// image mid-pan; it fades back in once the move settles (see
// map-region-shape's transition in index.css and RegionFocus in
// MapViewer.jsx).
export function regionPathOptions(region, { selected = false, hovered = false, drawing = false, alwaysVisible = false, hidden = false } = {}) {
  const color = region.visibility === 'dm' ? DM_COLOR : PUBLIC_COLOR
  const visible = !hidden && (alwaysVisible || selected || hovered)
  return {
    color: drawing ? '#a32d3d' : color,
    weight: selected ? 4 : 2,
    opacity: visible ? 1 : 0,
    fillColor: color,
    fillOpacity: visible ? (selected ? 0.35 : 0.15) : 0,
    dashArray: region.visibility === 'dm' ? '6 4' : null,
    className: 'map-region-shape',
  }
}
