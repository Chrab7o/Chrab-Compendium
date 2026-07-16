import { useEffect, useRef, useState } from 'react'
import { MapContainer, ImageOverlay, Marker, Polygon, Polyline, Popup, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { useNavigate } from 'react-router-dom'
import { markerIcon } from '../lib/markerIcon'
import { regionPathOptions } from '../lib/regionStyle'

function ClickCapture({ height, onMapClick }) {
  useMapEvents({
    click(e) {
      onMapClick({ x: e.latlng.lng, y: height - e.latlng.lat })
    },
  })
  return null
}

const vertexIcon = L.divIcon({
  className: 'map-region-vertex-icon',
  html: '<span class="map-region-vertex"></span>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
})

// Pans/zooms to a region's bounds when it becomes the selected one, whether
// that selection came from clicking the shape itself or the side dropdown.
function RegionFocus({ region, height }) {
  const map = useMap()

  useEffect(() => {
    if (!region) return
    const latlngs = region.points.map((p) => [height - p.y, p.x])
    map.flyToBounds(latlngs, { padding: [40, 40], duration: 0.5 })
    // Only re-run when the selected region actually changes, not on every
    // render (map/height are stable for the lifetime of this component).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region?.id])

  return null
}

// Leaflet's CRS.Simple treats the map as a flat plane in pixel units with
// y increasing upward, while image/DB coordinates have y increasing
// downward from the top-left — hence the `height - y` flips below.
export default function MapViewer({
  imageUrl,
  width,
  height,
  markers = [],
  regions = [],
  editable = false,
  regionsEditable = false,
  drawingPoints = [],
  selectedRegionId,
  onMapClick,
  onMarkerClick,
  onMarkerDragEnd,
  onRegionClick,
}) {
  const navigate = useNavigate()
  const bounds = [[0, 0], [height, width]]
  const viewportRef = useRef(null)
  const [boxSize, setBoxSize] = useState(null)

  // Sizes .map-container to the largest box that fits the map's own aspect
  // ratio inside the available viewport (same idea as object-fit: contain,
  // but for a plain div wrapping Leaflet rather than an <img>). Plain CSS
  // (aspect-ratio + max-height) can't do this here because MapContainer's
  // children are percentage-sized, so a flex item with no explicit size has
  // nothing intrinsic to size itself from — hence measuring in JS instead.
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    function recompute() {
      const vpWidth = el.clientWidth
      const vpHeight = el.clientHeight
      if (!vpWidth || !vpHeight) return
      const imageRatio = width / height
      const viewportRatio = vpWidth / vpHeight
      setBoxSize(
        imageRatio > viewportRatio
          ? { width: vpWidth, height: vpWidth / imageRatio }
          : { width: vpHeight * imageRatio, height: vpHeight }
      )
    }
    recompute()
    const observer = new ResizeObserver(recompute)
    observer.observe(el)
    return () => observer.disconnect()
  }, [width, height])

  function handleMarkerClick(marker) {
    if (editable) {
      onMarkerClick?.(marker)
    } else if (marker.entry_id) {
      navigate(`/entry/${marker.entry_id}`)
    }
  }

  function toLatLng(p) {
    return [height - p.y, p.x]
  }

  const selectedRegion = regions.find((r) => r.id === selectedRegionId)

  return (
    <div className="map-viewport" ref={viewportRef}>
      {boxSize && (
      <div className="map-container" style={{ width: boxSize.width, height: boxSize.height }}>
        <MapContainer
          crs={L.CRS.Simple}
          bounds={bounds}
          maxBounds={bounds}
          maxBoundsViscosity={0.8}
          minZoom={-4}
          zoomSnap={0.25}
          zoomDelta={0.5}
          style={{ height: '100%', width: '100%', background: '#3a2a18' }}
        >
          <ImageOverlay url={imageUrl} bounds={bounds} />
          {(editable || regionsEditable) && <ClickCapture height={height} onMapClick={onMapClick} />}

          {regions.map((region) => (
            <Polygon
              key={region.id}
              positions={region.points.map(toLatLng)}
              pathOptions={regionPathOptions(region, { selected: region.id === selectedRegionId })}
              eventHandlers={{ click: () => onRegionClick?.(region) }}
            >
              <Tooltip sticky>{region.name}</Tooltip>
            </Polygon>
          ))}

          {regionsEditable && drawingPoints.length > 0 && (
            <Polyline
              positions={[
                ...drawingPoints.map(toLatLng),
                ...(drawingPoints.length > 2 ? [toLatLng(drawingPoints[0])] : []),
              ]}
              pathOptions={{ color: '#a32d3d', dashArray: '6 6', weight: 2 }}
            />
          )}
          {regionsEditable &&
            drawingPoints.map((p, i) => <Marker key={i} position={toLatLng(p)} icon={vertexIcon} />)}

          {markers.map((marker) => (
            <Marker
              key={marker.id}
              position={toLatLng(marker)}
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

          {selectedRegion && <RegionFocus region={selectedRegion} height={height} />}
        </MapContainer>
      </div>
      )}
    </div>
  )
}
