import { NavLink, Outlet } from 'react-router-dom'

const LINKS = [
  { to: '/dm', label: 'Overview', end: true },
  { to: '/dm/organize', label: 'Folders & Entries' },
  { to: '/dm/worlds', label: 'Worlds' },
  { to: '/dm/categories', label: 'Categories' },
  { to: '/dm/tags', label: 'Tags' },
  { to: '/dm/campaigns', label: 'Campaigns' },
  { to: '/dm/maps', label: 'Maps' },
  { to: '/dm/characters', label: 'Characters' },
  { to: '/dm/skill-trees', label: 'Skill Trees' },
  { to: '/dm/notes', label: 'Player Notes' },
  { to: '/dm/import', label: 'Import' },
]

export default function DMLayout() {
  return (
    <div className="dm-layout">
      <nav className="dm-subnav">
        {LINKS.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className={({ isActive }) => (isActive ? 'active' : '')}
          >
            {link.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  )
}
