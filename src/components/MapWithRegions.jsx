import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useMapMarkers } from '../hooks/useMapMarkers'
import { useMapRegions } from '../hooks/useMapRegions'
import { getMapImageUrl } from '../lib/mapStorage'
import MapViewer from './MapViewer'
import RegionEntryPanel from './RegionEntryPanel'

// A map plus its regions: hover a region for its name, click it (or pick it
// from the dropdown) to open a side panel of everything filed under its
// linked folder. Shared by MapDetail and WorldMapPage so the region-panel
// behavior only lives in one place.
export default function MapWithRegions({ map }) {
  const { markers } = useMapMarkers(map.id)
  const { regions } = useMapRegions(map.id)
  const [selectedRegionId, setSelectedRegionId] = useState(null)
  const [folders, setFolders] = useState([])
  const [entries, setEntries] = useState([])
  const [placements, setPlacements] = useState([])

  useEffect(() => {
    Promise.all([
      supabase.from('folders').select('*'),
      supabase.from('entries').select('*'),
      supabase.from('entry_placements').select('*'),
    ]).then(([{ data: folderData }, { data: entryData }, { data: placementData }]) => {
      setFolders(folderData ?? [])
      setEntries(entryData ?? [])
      setPlacements(placementData ?? [])
    })
  }, [])

  const selectedRegion = regions.find((r) => r.id === selectedRegionId) ?? null

  return (
    <div className="map-detail-layout">
      <div className="map-detail-main">
        <p className="view-subtitle">Click a marker to jump to its entry, or a region to browse it.</p>

        {regions.length > 0 && (
          <div className="map-picker">
            <label>
              Jump to a region
              <select
                value={selectedRegionId ?? ''}
                onChange={(e) => setSelectedRegionId(e.target.value || null)}
              >
                <option value="">Choose a region...</option>
                {[...regions]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
        )}

        <MapViewer
          imageUrl={getMapImageUrl(map.image_path)}
          width={map.image_width}
          height={map.image_height}
          markers={markers}
          regions={regions}
          selectedRegionId={selectedRegionId}
          onRegionClick={(region) => setSelectedRegionId(region.id)}
        />
      </div>

      {selectedRegion && (
        <RegionEntryPanel
          region={selectedRegion}
          folders={folders}
          entries={entries}
          placements={placements}
          onClose={() => setSelectedRegionId(null)}
        />
      )}
    </div>
  )
}
