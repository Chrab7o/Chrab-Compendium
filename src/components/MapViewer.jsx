import { MapContainer, ImageOverlay, Marker, Popup, Tooltip, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { useNavigate } from 'react-router-dom'
import { markerIcon } from '../lib/markerIcon'

function ClickCapture({ height, onMapClick }) {
  useMapEvents({
    click(e) {
      onMapClick({ x: e.latlng.lng, y: height - e.latlng.lat })
    },
  })
  return null
}

// Leaflet's CRS.Simple treats the map as a flat plane in pixel units with
// y increasing upward, while image/DB coordinates have y increasing
// downward from the top-left — hence the `height - y` flips below.
export default function MapViewer({
  imageUrl,
  width,
  height,
  markers,
  editable = false,
  onMapClick,
  onMarkerClick,
  onMarkerDragEnd,
}) {
  const navigate = useNavigate()
  const bounds = [[0, 0], [height, width]]

  function handleMarkerClick(marker) {
    if (editable) {
      onMarkerClick?.(marker)
    } else if (marker.entry_id) {
      navigate(`/entry/${marker.entry_id}`)
    }
  }

  return (
    <div className="map-container">
      <MapContainer
        crs={L.CRS.Simple}
        bounds={bounds}
        maxBounds={bounds}
        maxBoundsViscosity={0.8}
        minZoom={-4}
        style={{ height: '100%', width: '100%', background: '#0c0b10' }}
      >
        <ImageOverlay url={imageUrl} bounds={bounds} />
        {editable && <ClickCapture height={height} onMapClick={onMapClick} />}
        {markers.map((marker) => (
          <Marker
            key={marker.id}
            position={[height - marker.y, marker.x]}
            icon={markerIcon(marker.visibility)}
            draggable={editable}
            eventHandlers={{
              click: () => handleMarkerClick(marker),
              dragend: (e) => {
                const { lat, lng } = e.target.getLatLng()
                onMarkerDragEnd?.(marker, { x: lng, y: height - lat })
              },
            }}
          >
            {!editable && !marker.entry_id && <Popup>{marker.label}</Popup>}
            <Tooltip direction="top" offset={[0, -34]}>
              {marker.label}
            </Tooltip>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}
