import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useCampaignContext } from '../contexts/CampaignContext'
import { useImpersonation } from '../contexts/ImpersonationContext'
import { MenuIcon, CloseIcon } from './Icons'
import NavStarfield from './NavStarfield'
import { useTheme } from '../hooks/useTheme'

export default function Nav() {
  const navigate = useNavigate()
  const location = useLocation()
  const { isDM, isPlayer, signOut } = useAuth()
  const { worlds, worldId, setWorldId, campaigns, campaignId, setCampaignId } = useCampaignContext()
  const { impersonating, stopImpersonating } = useImpersonation()
  const worldCampaigns = campaigns.filter((c) => c.world_id === worldId)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { theme, toggleTheme } = useTheme()

  // Nav persists across route changes, so the mobile menu needs an explicit
  // close on navigation rather than unmounting with the old page.
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  // Folds into the hamburger whenever brand, links and controls don't fit on
  // one row, instead of at a fixed width: which links show depends on who's
  // signed in, and a fixed breakpoint broke the first time a link was added.
  // While collapsed the full row can't be measured, so it remembers how wide
  // the row needed to be and unfolds once there's room again.
  const navRef = useRef(null)
  const neededWidth = useRef(0)
  const [collapsed, setCollapsed] = useState(false)
  const contentKey = `${isDM}|${isPlayer}|${worlds.length}|${worldId}|${worldCampaigns.length}|${theme}`

  // What's in the row changed: measure it afresh (before paint, so no flash).
  useLayoutEffect(() => {
    setCollapsed(false)
  }, [contentKey])

  useLayoutEffect(() => {
    const nav = navRef.current
    if (!nav) return
    function check() {
      if (!collapsed) {
        if (nav.scrollWidth > nav.clientWidth + 1) {
          neededWidth.current = nav.scrollWidth
          setCollapsed(true)
        }
      } else if (nav.clientWidth >= neededWidth.current) {
        setCollapsed(false)
      }
    }
    check()
    // The brand and links resize when the web fonts load, not just the window.
    const observer = new ResizeObserver(check)
    observer.observe(nav)
    for (const el of nav.querySelectorAll('.nav-brand, .nav-links, .nav-right')) observer.observe(el)
    return () => observer.disconnect()
  }, [collapsed, contentKey])

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
      <header ref={navRef} className={collapsed ? 'nav is-collapsed' : 'nav'}>
      <NavStarfield />
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
          {/* DM-only until it's been tried on the live site. */}
          {isDM && (
            <NavLink to="/chronicle" className={({ isActive }) => (isActive ? 'active' : '')}>
              Chronicle
            </NavLink>
          )}
          <NavLink to="/locations" className={({ isActive }) => (isActive ? 'active' : '')}>
            Locations
          </NavLink>
          <NavLink to="/people" className={({ isActive }) => (isActive ? 'active' : '')}>
            People
          </NavLink>
          <NavLink to="/homebrew" className={({ isActive }) => (isActive ? 'active' : '')}>
            Homebrew
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
                  aria-label="Active timeline"
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
          <button
            type="button"
            className="secondary nav-theme-toggle"
            aria-pressed={theme === 'minimal'}
            onClick={toggleTheme}
          >
            {theme === 'minimal' ? 'Classic view' : 'Simple view'}
          </button>
          {(isDM || isPlayer) && (
            <button type="button" className="secondary nav-signout" onClick={signOut}>
              Sign out
            </button>
          )}
        </div>
      </div>
    </header>
    </>
  )
}
