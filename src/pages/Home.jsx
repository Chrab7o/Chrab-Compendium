import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useCampaignContext } from '../contexts/CampaignContext'

export default function Home() {
  const navigate = useNavigate()
  const { session, isDM, isPlayer } = useAuth()
  const { campaigns, setCampaignId } = useCampaignContext()

  function browseCampaign(id) {
    setCampaignId(id)
    navigate('/general')
  }

  return (
    <section className="page home-page">
      <div className="home-hero">
        <h1>Chrab Corner</h1>
        <p className="home-tagline">
          World lore, characters, maps, and secrets — everything for the table, in one place.
        </p>
        <div className="home-actions">
          <button type="button" onClick={() => navigate('/general')}>
            Browse World Lore
          </button>
          <button type="button" className="secondary" onClick={() => navigate('/maps')}>
            View Maps
          </button>
          {!session && (
            <button type="button" className="secondary" onClick={() => navigate('/login')}>
              Login
            </button>
          )}
          {isDM && (
            <button type="button" className="secondary" onClick={() => navigate('/dm')}>
              DM Dashboard
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
        <>
          <h2>Campaigns</h2>
          <div className="entry-grid">
            {campaigns.map((c) => (
              <button
                key={c.id}
                type="button"
                className="entry-card home-campaign-card"
                onClick={() => browseCampaign(c.id)}
              >
                <h3>{c.name}</h3>
                {c.description && <p className="status-message">{c.description}</p>}
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
