import { NavLink } from 'react-router-dom'

export default function PlayerLayout({ children }) {
  return (
    <div>
      <nav className="dm-subnav">
        <NavLink to="/character" className={({ isActive }) => (isActive ? 'active' : '')}>
          Character Sheet
        </NavLink>
        <NavLink to="/notes" className={({ isActive }) => (isActive ? 'active' : '')}>
          My Notes
        </NavLink>
        <NavLink to="/account" className={({ isActive }) => (isActive ? 'active' : '')}>
          Account
        </NavLink>
      </nav>
      {children}
    </div>
  )
}
