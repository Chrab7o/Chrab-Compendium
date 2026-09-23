import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useCampaignContext } from '../contexts/CampaignContext'
import { entryInCampaignScope, scopedCampaignIds } from '../lib/tags'
import EntryCard from '../components/EntryCard'

// Shared by the Locations/People/Session Notes nav pages — each is just this
// same tag-filtered, session-scoped list with a different tag/title. A thin
// preset over what EntrySearch does generally: an entry shows up here purely
// because it carries the matching tag.
// `embedded` skips the standalone-route .page wrapper (background/width
// cap/padding) — CharacterHub's Session Notes tab already sits inside its
// own .page, and nesting two would double up the card look.
export default function TagView({ tag, title, embedded }) {
  const { campaigns, campaign, campaignId, world, worldId } = useCampaignContext()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    supabase
      .from('entries')
      .select('*')
      .then(({ data }) => {
        setEntries(data ?? [])
        setLoading(false)
      })
  }, [])

  const allowedCampaignIds = scopedCampaignIds(campaigns, worldId, campaignId)
  const scoped = entries
    .filter((e) => (e.tags ?? []).some((t) => t.toLowerCase() === tag.toLowerCase()))
    .filter((e) => entryInCampaignScope(e, allowedCampaignIds))
    .sort((a, b) => a.title.localeCompare(b.title))

  const scopeName = campaign?.name ?? world?.name

  return (
    <section className={embedded ? undefined : 'page'}>
      <div className="view-header">
        <h1>{scopeName ? `${scopeName} ${title}` : title}</h1>
      </div>

      {loading && <p className="status-message">Loading...</p>}
      {!loading && scoped.length === 0 && (
        <p className="status-message">Nothing tagged "{tag}" yet.</p>
      )}

      <div className="entry-grid">
        {scoped.map((entry) => (
          <EntryCard key={entry.id} entry={entry} />
        ))}
      </div>
    </section>
  )
}
