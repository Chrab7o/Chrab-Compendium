import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useWorlds } from '../hooks/useWorlds'
import { getWorldHeroImageUrl } from '../lib/worldStorage'

// The landing page — orientation + where to log in, plus picking which
// world to explore. Actual category/tag browsing lives in the top nav
// (Maps/Locations/People/Session Notes/Search); campaign scoping is the
// site-wide filter in the nav corner, not a separate destination.
export default function Home() {
  const navigate = useNavigate()
  const { session, isPlayer } = useAuth()
  const { worlds, loading: worldsLoading } = useWorlds()

  return (
    <section className="page-wide home-page">
      <div className="home-hero">
        <h1>Chrab's TTRPG Compendium</h1>
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
              Character
            </button>
          )}
        </div>
      </div>

      {!worldsLoading && worlds.length > 0 && (
        <div className="home-section">
          <div className="home-section-header">
            <h2>Choose a world</h2>
          </div>
          <div className="world-card-grid">
            {worlds.map((world) => (
              <Link
                key={world.id}
                to={`/world/${world.slug}`}
                className="world-card"
                style={
                  world.hero_image_path
                    ? { backgroundImage: `url(${getWorldHeroImageUrl(world.hero_image_path)})` }
                    : undefined
                }
              >
                <div className="world-card-overlay">
                  <h3>{world.name}</h3>
                  {world.description && <p>{world.description}</p>}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <p className="home-guidance">
        Use <strong>Maps</strong>, <strong>Locations</strong>, <strong>People</strong>,{' '}
        <strong>Session Notes</strong>, and <strong>Search</strong> up top to browse everything —
        filter by campaign with the picker in the corner.
      </p>
    </section>
  )
}
