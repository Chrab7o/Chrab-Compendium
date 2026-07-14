import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

// A plain landing page — orientation + where to log in. Actual browsing
// lives in the top nav (Maps/Locations/People/Session Notes/Campaigns), not
// here, so this stays simple rather than re-showing everything the site has.
export default function Home() {
  const navigate = useNavigate()
  const { session, isPlayer } = useAuth()

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
        <strong>Session Notes</strong>, <strong>Search</strong>, and <strong>Campaigns</strong> up top
        to browse everything.
      </p>
    </section>
  )
}
