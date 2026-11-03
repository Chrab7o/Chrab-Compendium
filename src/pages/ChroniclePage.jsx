import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { useCampaignContext } from '../contexts/CampaignContext'
import { useChronicle } from '../hooks/useChronicle'
import ChronicleBoard from '../components/chronicle/ChronicleBoard'

// The active world's history. ?event=<id> opens one event (the entry page's
// "In the Chronicle" links), switching to its world if need be.
export default function ChroniclePage() {
  const { isDM } = useAuth()
  const { worlds, worldId, world, setWorldId, campaignId } = useCampaignContext()
  const [params, setParams] = useSearchParams()
  const selectedId = params.get('event')
  const { events, branches, entriesByEvent, loading } = useChronicle(worldId)

  useEffect(() => {
    if (!selectedId || events.some((e) => e.id === selectedId)) return
    supabase
      .from('chronicle_events')
      .select('world_id')
      .eq('id', selectedId)
      .maybeSingle()
      .then(({ data }) => {
        if (data && data.world_id !== worldId) setWorldId(data.world_id)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, events, worldId])

  function select(id) {
    setParams(id ? { event: id } : {}, { replace: true })
  }

  return (
    <section className="page chronicle-page">
      <div className="view-header">
        <h1>Chronicle</h1>
        {isDM && (
          <Link to="/dm/chronicle" className="button-link">
            Edit
          </Link>
        )}
      </div>
      <p className="view-subtitle">
        {world ? `The history of ${world.name}.` : 'Pick a world to see its history.'}
      </p>
      {worlds.length > 1 && (
        <div className="map-picker">
          <select value={worldId} onChange={(e) => setWorldId(e.target.value)} aria-label="World">
            <option value="">Pick a world</option>
            {worlds.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {loading && <p className="status-message">Loading...</p>}
      {!loading && worldId && events.length === 0 && (
        <p className="status-message">Nothing has been written into this world's Chronicle yet.</p>
      )}
      {!loading && events.length > 0 && (
        <ChronicleBoard
          events={events}
          branches={branches}
          entriesByEvent={entriesByEvent}
          calendar={world?.calendar}
          campaignId={campaignId}
          selectedId={selectedId}
          onSelect={select}
        />
      )}
    </section>
  )
}
