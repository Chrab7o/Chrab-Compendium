import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useCampaignContext } from '../contexts/CampaignContext'
import { useImpersonation } from '../contexts/ImpersonationContext'
import { MenuIcon, CloseIcon } from './Icons'

export default function Nav() {
  const navigate = useNavigate()
  const location = useLocation()
  const { isDM, isPlayer, signOut } = useAuth()
  const { worlds, worldId, setWorldId, campaigns, campaignId, setCampaignId } = useCampaignContext()
  const { impersonating, stopImpersonating } = useImpersonation()
  const worldCampaigns = campaigns.filter((c) => c.world_id === worldId)
  const [mobileOpen, setMobileOpen] = useState(false)

  // Nav persists across route changes, so the mobile menu needs an explicit
  // close on navigation rather than unmounting with the old page.
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  function exitImpersonation() {
    stopImpersonating()
    navigate('/dm/characters')
  }

  return (
    <>
      {impersonating && (
        <div className="impersonation-banner">
          Viewing as <strong>{impersonating.name}</strong>
          <button type="button" className="link-button" onClick={exitImpersonation}>
            Exit
          </button>
        </div>
      )}
      <header className="nav">
      <Link to="/" className="nav-brand">
        Chrab's TTRPG Compendium
      </Link>
      <button
        type="button"
        className="nav-hamburger"
        aria-expanded={mobileOpen}
        aria-controls="nav-mobile-menu"
        onClick={() => setMobileOpen((o) => !o)}
      >
        {mobileOpen ? <CloseIcon width={22} height={22} /> : <MenuIcon width={22} height={22} />}
        <span className="sr-only">Menu</span>
      </button>
      <div id="nav-mobile-menu" className={`nav-mobile-menu${mobileOpen ? ' open' : ''}`}>
        <nav className="nav-links">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
            Worlds
          </NavLink>
          <NavLink to="/maps" className={({ isActive }) => (isActive ? 'active' : '')}>
            Maps
          </NavLink>
          <NavLink to="/locations" className={({ isActive }) => (isActive ? 'active' : '')}>
            Locations
          </NavLink>
          <NavLink to="/people" className={({ isActive }) => (isActive ? 'active' : '')}>
            People
          </NavLink>
          <NavLink to="/search" className={({ isActive }) => (isActive ? 'active' : '')}>
            Search
          </NavLink>
          {!isDM && (
            <NavLink to="/character" className={({ isActive }) => (isActive ? 'active' : '')}>
              My Character
            </NavLink>
          )}
          {isDM && (
            <NavLink to="/dm" className={({ isActive }) => (isActive ? 'active' : '')}>
              DM Dashboard
            </NavLink>
          )}
        </nav>
        <div className="nav-right">
          {worlds.length > 0 && (
            <div className="session-toggle">
              <select
                value={worldId}
                onChange={(e) => setWorldId(e.target.value)}
                aria-label="Active world"
              >
                <option value="">No world</option>
                {worlds.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
              {worldId && worldCampaigns.length > 0 && (
                <select
                  value={campaignId}
                  onChange={(e) => setCampaignId(e.target.value)}
                  aria-label="Active campaign"
                >
                  <option value="">All campaigns</option>
                  {worldCampaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
          {(isDM || isPlayer) && (
            <button className="link-button" onClick={signOut}>
              Sign out
            </button>
          )}
        </div>
      </div>
    </header>
    </>
  )
}
