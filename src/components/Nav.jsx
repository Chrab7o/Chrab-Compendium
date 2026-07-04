import { NavLink } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function Nav() {
  const { isDM, signOut } = useAuth()

  return (
    <header className="nav">
      <span className="nav-brand">Chrab Corner</span>
      <nav className="nav-links">
        <NavLink to="/general" className={({ isActive }) => (isActive ? 'active' : '')}>
          General
        </NavLink>
        <NavLink to="/campaign" className={({ isActive }) => (isActive ? 'active' : '')}>
          Campaign
        </NavLink>
        {isDM ? (
          <>
            <NavLink to="/dm" className={({ isActive }) => (isActive ? 'active' : '')}>
              DM Dashboard
            </NavLink>
            <button className="link-button" onClick={signOut}>
              Sign out
            </button>
          </>
        ) : (
          <NavLink to="/dm/login" className={({ isActive }) => (isActive ? 'active' : '')}>
            DM Login
          </NavLink>
        )}
      </nav>
    </header>
  )
}
