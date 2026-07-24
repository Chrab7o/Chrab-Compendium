import { useEffect, useMemo, useRef, useState } from 'react'
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

// Leaflet caches its container's pixel size at creation and never re-checks
// it on its own — if something outside Leaflet resizes .map-container
// (the campaign filter changing what else renders on the page, a region
// panel opening beside the map, a window resize...), the map keeps drawing
// at the old size/position until told otherwise, which looks exactly like
// "uncentered." boxSize already tracks the real current size (measured via
// ResizeObserver below), so just telling Leaflet to recheck whenever it
// changes is the fix, rather than remounting the whole map.
//
// This and RegionFocus below used to be two independent effects that could
// both fire from the same click: selecting a region opens the side panel,
// which shrinks .map-viewport, which changes boxSize, which fired this
// effect's fitBounds(whole image) at the same moment RegionFocus's
// flyToBounds(that region) was animating in - two different effects
// fighting over the same view, which read as a snap/glitch. focusRef holds
// whatever the CURRENT intended view is (the selected region's bounds, or
// the whole image when nothing's selected) so a resize re-fits to that
// instead of always yanking back to the full image.
function InvalidateOnResize({ width, height, focusRef }) {
  const map = useMap()

  useEffect(() => {
    map.invalidateSize()
    map.fitBounds(focusRef.current, { animate: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, width, height])

  return null
}

// Pans/zooms to a region's bounds when it becomes the selected one, whether
// that selection came from clicking the shape itself or the side dropdown -
// the only thing that should trigger an animated fly; resizes just re-fit
// instantly to whatever focusRef says is current (see above).
function RegionFocus({ region, height, bounds, focusRef }) {
  const map = useMap()

  useEffect(() => {
    focusRef.current = region ? region.points.map((p) => [height - p.y, p.x]) : bounds
    if (!region) return
    map.flyToBounds(focusRef.current, { padding: [40, 40], duration: 0.5 })
    // Only re-run when the selected region actually changes, not on every
    // render (map/height/bounds are stable for the lifetime of this
    // component, and focusRef is a ref so it never needs to be a dep).
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
  // Memoized so InvalidateOnResize's effect only re-fires on a genuine
  // width/height change, not on every render (a new array literal here
  // would otherwise look like a fresh dependency each time).
  const bounds = useMemo(() => [[0, 0], [height, width]], [height, width])
  const viewportRef = useRef(null)
  const [boxSize, setBoxSize] = useState(null)
  const [hoveredRegionId, setHoveredRegionId] = useState(null)
  // What the map should be framing right now - the whole image, or (while a
  // region is selected) that region's bounds instead. A ref, not state,
  // since updating it should never itself trigger a re-render - only the
  // effects in RegionFocus/InvalidateOnResize that read it should react.
  const focusRef = useRef(bounds)

  // Sizes .map-container to the largest box that fits the map's own aspect
  // ratio inside the available viewport (same idea as object-fit: contain,
  // but for a plain div wrapping Leaflet rather than an <img>). Plain CSS
  // (aspect-ratio + max-height) can't do this here because MapContainer's
  // children are percentage-sized, so a flex item with no explicit size has
  // nothing intrinsic to size itself from — hence measuring in JS instead.
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    let rafId = null

    function recompute() {
      rafId = null
      const vpWidth = el.clientWidth
      const vpHeight = el.clientHeight
      if (!vpWidth || !vpHeight) return
      const imageRatio = width / height
      const viewportRatio = vpWidth / vpHeight
      const next =
        imageRatio > viewportRatio
          ? { width: vpWidth, height: vpWidth / imageRatio }
          : { width: vpHeight * imageRatio, height: vpHeight }
      setBoxSize((prev) => {
        // Sub-pixel jitter isn't a real resize - skipping it avoids an
        // extra render (and the invalidateSize/fitBounds that would follow
        // from it) on every tiny wobble while the window is being dragged.
        if (prev && Math.abs(prev.width - next.width) < 1 && Math.abs(prev.height - next.height) < 1) {
          return prev
        }
        return next
      })
    }

    // ResizeObserver can fire multiple times per frame during a live
    // window drag; coalescing to one recompute per frame keeps the map
    // from thrashing through several invalidateSize/fitBounds passes for
    // what's really one continuous resize gesture.
    function scheduleRecompute() {
      if (rafId != null) return
      rafId = requestAnimationFrame(recompute)
    }

    scheduleRecompute()
    const observer = new ResizeObserver(scheduleRecompute)
    observer.observe(el)
    return () => {
      observer.disconnect()
      if (rafId != null) cancelAnimationFrame(rafId)
    }
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
          <InvalidateOnResize width={boxSize.width} height={boxSize.height} focusRef={focusRef} />
          <ImageOverlay url={imageUrl} bounds={bounds} />
          {(editable || regionsEditable) && <ClickCapture height={height} onMapClick={onMapClick} />}

          {regions.map((region) => (
            <Polygon
              key={region.id}
              positions={region.points.map(toLatLng)}
              pathOptions={regionPathOptions(region, {
                selected: region.id === selectedRegionId,
                hovered: region.id === hoveredRegionId,
                alwaysVisible: regionsEditable,
              })}
              eventHandlers={{
                click: () => onRegionClick?.(region),
                mouseover: () => setHoveredRegionId(region.id),
                mouseout: () => setHoveredRegionId(null),
              }}
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

          <RegionFocus region={selectedRegion} height={height} bounds={bounds} focusRef={focusRef} />
        </MapContainer>
      </div>
      )}
    </div>
  )
}
