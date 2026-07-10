import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useCampaignContext } from '../contexts/CampaignContext'
import { useCategories } from '../contexts/CategoryContext'
import { mergePlacements, effectiveEntryCampaignId } from '../lib/folders'

// The quick-link cards below aren't hardcoded to any fixed set of categories —
// a category shows up here only if it actually has entries scoped to this
// campaign (or general entries with no campaign of their own), the same
// dynamic/computed scoping CategoryBrowser uses. Add a category in the DM
// Dashboard and, once it has content, it appears here automatically.
export default function CampaignHome() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { campaigns, setCampaignId } = useCampaignContext()
  const { categories } = useCategories()
  const [folders, setFolders] = useState([])
  const [entries, setEntries] = useState([])
  const [placements, setPlacements] = useState([])
  const [loading, setLoading] = useState(true)

  const campaign = campaigns.find((c) => c.id === id)

  useEffect(() => {
    setCampaignId(id)
  }, [id, setCampaignId])

  useEffect(() => {
    setLoading(true)
    Promise.all([
      supabase.from('folders').select('*'),
      supabase.from('entries').select('*'),
      supabase.from('entry_placements').select('*'),
    ]).then(([{ data: folderData }, { data: entryData }, { data: placementData }]) => {
      setFolders(folderData ?? [])
      setEntries(entryData ?? [])
      setPlacements(placementData ?? [])
      setLoading(false)
    })
  }, [id])

  if (campaigns.length > 0 && !campaign) return <Navigate to="/" replace />
  if (loading || !campaign) return <p className="page status-message">Loading...</p>

  const scopedEntries = mergePlacements(entries, placements).filter((e) => {
    const eff = effectiveEntryCampaignId(folders, e)
    return !eff || eff === id
  })
  const categoriesWithContent = categories.filter((cat) =>
    scopedEntries.some((e) => e.category === cat.value)
  )

  return (
    <section className="page campaign-home">
      <div className="home-hero">
        <h1>{campaign.name}</h1>
        {campaign.description && <p className="home-tagline">{campaign.description}</p>}
        <div className="home-actions">
          <button type="button" onClick={() => navigate('/')}>
            Browse Everything
          </button>
        </div>
      </div>

      {categoriesWithContent.length > 0 ? (
        <div className="entry-grid">
          {categoriesWithContent.map((cat) => (
            <Link key={cat.value} to="/" state={{ category: cat.value }} className="entry-card">
              <h3>{cat.label}</h3>
            </Link>
          ))}
        </div>
      ) : (
        <p className="status-message">Nothing has been added for this campaign yet.</p>
      )}
    </section>
  )
}
