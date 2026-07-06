import L from 'leaflet'

// Plain CSS teardrop pins instead of Leaflet's default image-based icon,
// which needs asset-path workarounds under Vite.
export function markerIcon(visibility) {
  const modifier = visibility === 'dm' ? ' map-pin-dm' : ''
  return L.divIcon({
    className: 'map-marker-icon',
    html: `<span class="map-pin${modifier}"></span>`,
    iconSize: [30, 40],
    iconAnchor: [15, 38],
    popupAnchor: [0, -34],
  })
}
