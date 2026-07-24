import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useCampaignContext } from '../../contexts/CampaignContext'
import { useWorlds } from '../../hooks/useWorlds'
import MapManager from '../../components/dm/MapManager'
import MapMarkerEditor from '../../components/dm/MapMarkerEditor'
import MapRegionEditor from '../../components/dm/MapRegionEditor'

export default function DMMapsPage() {
  const { campaigns } = useCampaignContext()
  const { worlds, reload: reloadWorlds } = useWorlds()
  const [maps, setMaps] = useState([])
  const [entries, setEntries] = useState([])
  const [folders, setFolders] = useState([])
  const [regionFolderLinks, setRegionFolderLinks] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: mapData }, { data: entryData }, { data: folderData }, { data: linkData }] =
      await Promise.all([
        supabase.from('maps').select('*').order('name', { ascending: true }),
        supabase.from('entries').select('id, title').order('title', { ascending: true }),
        supabase.from('folders').select('*'),
        supabase.from('region_folder_links').select('*'),
      ])
    setMaps(mapData ?? [])
    setEntries(entryData ?? [])
    setFolders(folderData ?? [])
    setRegionFolderLinks(linkData ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (loading) return <p className="status-message">Loading...</p>

  return (
    <section className="page">
      <div className="view-header">
        <h1>Maps</h1>
      </div>
      <MapManager
        maps={maps}
        worlds={worlds}
        onChange={() => {
          load()
          reloadWorlds()
        }}
      />
      <MapMarkerEditor maps={maps} entries={entries} campaigns={campaigns} />
      <MapRegionEditor
        maps={maps}
        folders={folders}
        campaigns={campaigns}
        regionFolderLinks={regionFolderLinks}
        onChange={load}
      />
    </section>
  )
}
