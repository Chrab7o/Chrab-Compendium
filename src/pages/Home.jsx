import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useCampaignContext } from '../contexts/CampaignContext'
import CategoryBrowser from '../components/CategoryBrowser'

export default function Home() {
  const navigate = useNavigate()
  const { session, isPlayer } = useAuth()
  const { campaigns, campaignId, campaign, setCampaignId } = useCampaignContext()

  const welcome = (
    <div className="home-empty-state">
      <div className="home-hero">
        <h1>Chrab Corner</h1>
        <p className="home-tagline">
          {campaign
            ? `Browsing ${campaign.name} lore.`
            : 'World lore, characters, maps, and secrets — everything for the table, in one place.'}
        </p>
        <div className="home-actions">
          <button type="button" onClick={() => navigate('/maps')}>
            View Maps
          </button>
          {!session && (
            <button type="button" className="secondary" onClick={() => navigate('/login')}>
              Login
            </button>
          )}
          {isPlayer && (
            <button type="button" className="secondary" onClick={() => navigate('/character')}>
              My Character
            </button>
          )}
        </div>
      </div>

      {campaigns.length > 0 && (
        <div className="home-campaign-picker">
          <button
            type="button"
            className={campaignId ? 'chip' : 'chip active'}
            onClick={() => setCampaignId('')}
          >
            All campaigns
          </button>
          {campaigns.map((c) => (
            <button
              key={c.id}
              type="button"
              className={campaignId === c.id ? 'chip active' : 'chip'}
              onClick={() => setCampaignId(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      <p className="home-hint">&larr; Pick a category from the sidebar to start browsing.</p>
    </div>
  )

  return <CategoryBrowser editable={false} emptyState={welcome} />
}
