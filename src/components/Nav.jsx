import { NavLink } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useCampaignContext } from '../contexts/CampaignContext'

export default function Nav() {
  const { isDM, isPlayer, signOut } = useAuth()
  const { campaigns, campaignId, setCampaignId } = useCampaignContext()

  return (
    <header className="nav">
      <span className="nav-brand">Chrab Corner</span>
      <nav className="nav-links">
        <NavLink to="/general" className={({ isActive }) => (isActive ? 'active' : '')}>
          General
        </NavLink>
        <NavLink to="/maps" className={({ isActive }) => (isActive ? 'active' : '')}>
          Maps
        </NavLink>
        {isPlayer && (
          <>
            <NavLink to="/notes" className={({ isActive }) => (isActive ? 'active' : '')}>
              My Notes
            </NavLink>
            <NavLink to="/character" className={({ isActive }) => (isActive ? 'active' : '')}>
              My Character
            </NavLink>
          </>
        )}
        {isDM && (
          <NavLink to="/dm" className={({ isActive }) => (isActive ? 'active' : '')}>
            DM Dashboard
          </NavLink>
        )}
      </nav>
      <div className="nav-right">
        <select
          className="campaign-picker"
          value={campaignId}
          onChange={(e) => setCampaignId(e.target.value)}
          aria-label="Viewing campaign"
        >
          <option value="">All campaigns</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {isDM || isPlayer ? (
          <button className="link-button" onClick={signOut}>
            Sign out
          </button>
        ) : (
          <NavLink to="/login" className={({ isActive }) => (isActive ? 'active' : '')}>
            Login
          </NavLink>
        )}
      </div>
    </header>
  )
}
