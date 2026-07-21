import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useMapMarkers } from '../hooks/useMapMarkers'
import { useMapRegions } from '../hooks/useMapRegions'
import { useCampaignContext } from '../contexts/CampaignContext'
import { getMapImageUrl } from '../lib/mapStorage'
import MapViewer from './MapViewer'
import RegionEntryPanel from './RegionEntryPanel'

// A map plus its regions: hover a region for its name, click it (or pick it
// from the dropdown) to either open a side panel of everything filed under
// its linked folder, or — if it's linked to another map instead — navigate
// there via onNavigateToMap. A region is one or the other, never both.
// Shared by MapDetail and WorldMapPage so this behavior only lives in one
// place.
export default function MapWithRegions({ map, onNavigateToMap }) {
  const { campaignId } = useCampaignContext()
  const { markers: allMarkers } = useMapMarkers(map.id)
  const { regions: allRegions } = useMapRegions(map.id)
  // A map is shared across every campaign/era in its world now — markers
  // and regions are what's actually timeline-specific. General (no
  // campaign_id) ones always show; a campaign-tagged one only shows when
  // that's the active timeline.
  const markers = allMarkers.filter((m) => !m.campaign_id || m.campaign_id === campaignId)
  const regions = allRegions.filter((r) => !r.campaign_id || r.campaign_id === campaignId)
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
  const linkedMapRegions = regions.filter((r) => r.linked_map_id)
  const folderRegions = regions.filter((r) => !r.linked_map_id)

  function activateRegion(region) {
    if (region.linked_map_id) onNavigateToMap?.(region.linked_map_id)
    else setSelectedRegionId(region.id)
  }

  return (
    <div className="map-detail-layout">
      <div className="map-detail-main">
        <p className="view-subtitle">
          Click a marker to jump to its entry, a region to browse it, or a linked region to zoom
          into its map.
        </p>

        {folderRegions.length > 0 && (
          <div className="map-picker">
            <label>
              Jump to a region
              <select
                value={selectedRegionId ?? ''}
                onChange={(e) => setSelectedRegionId(e.target.value || null)}
              >
                <option value="">Choose a region...</option>
                {[...folderRegions]
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

        {linkedMapRegions.length > 0 && (
          <div className="map-region-links">
            {[...linkedMapRegions]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((r) => (
                <button key={r.id} type="button" onClick={() => onNavigateToMap?.(r.linked_map_id)}>
                  Zoom to {r.name} →
                </button>
              ))}
          </div>
        )}

        <MapViewer
          imageUrl={getMapImageUrl(map.image_path)}
          width={map.image_width}
          height={map.image_height}
          markers={markers}
          regions={regions}
          selectedRegionId={selectedRegionId}
          onRegionClick={activateRegion}
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
