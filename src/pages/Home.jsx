import { Link } from 'react-router-dom'
import { useWorlds } from '../hooks/useWorlds'
import { getWorldHeroImageUrl } from '../lib/worldStorage'

// The landing page — orientation, then picking which world to explore.
// Login/Character are already one click away in the nav, so they don't
// need duplicate buttons here; actual category/tag browsing lives in the
// top nav (Maps/Locations/People/Search). Campaign scoping is world-first
// now — no site-wide picker; pick a world, then a campaign from its page.
export default function Home() {
  const { worlds, loading: worldsLoading } = useWorlds()

  return (
    <section className="page-wide home-page">
      <div className="view-header">
        <h1>Chrab's TTRPG Compendium</h1>
        <p className="view-subtitle">
          Everything you could ever need! All in one place!
        </p>
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
        Use the navigation bar above to explore the worlds, campaigns, and categories of content available in this compendium. You can also use the search function to find specific items or topics of interest.
      </p>
    </section>
  )
}
