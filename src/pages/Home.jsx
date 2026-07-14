import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { categoryLabel } from '../lib/categories'
import EntrySearch from '../components/EntrySearch'

// A plain landing page — orientation + where to log in. Actual browsing
// lives in the top nav (Maps/Locations/People/Session Notes/Campaigns), not
// here, so this stays simple rather than re-showing everything the site has.
// The one exception: a campaign's quick-link card (CampaignHome) can send a
// category here via router state — that's a deliberate "show me this" click,
// not landing cold, so it's fine to surface pre-filtered results for it.
export default function Home() {
  const navigate = useNavigate()
  const location = useLocation()
  const { session, isPlayer } = useAuth()
  const category = location.state?.category ?? null

  return (
    <section className="page-wide home-page">
      <div className="home-hero">
        <h1>Chrab Corner</h1>
        <p className="home-tagline">
          World lore, characters, maps, and secrets — everything for the table, in one place.
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

      <p className="home-guidance">
        Use <strong>Maps</strong>, <strong>Locations</strong>, <strong>People</strong>,{' '}
        <strong>Session Notes</strong>, and <strong>Campaigns</strong> up top to browse everything.
      </p>

      {category && (
        <div className="home-section">
          <div className="home-section-header">
            <h2>{categoryLabel(category)}</h2>
          </div>
          <EntrySearch initialCategory={category} />
        </div>
      )}
    </section>
  )
}
