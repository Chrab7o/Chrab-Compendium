import { NavLink, Outlet } from 'react-router-dom'

const LINKS = [
  { to: '/dm', label: 'Overview', end: true },
  { to: '/dm/worlds', label: 'Worlds' },
  { to: '/dm/tags', label: 'Tags & Groups' },
  { to: '/dm/campaigns', label: 'Campaigns' },
  { to: '/dm/maps', label: 'Maps' },
  { to: '/dm/characters', label: 'Characters' },
  { to: '/dm/character-notes', label: 'Character Notes' },
  { to: '/dm/skill-trees', label: 'Skill Trees' },
  { to: '/dm/homebrew', label: 'Homebrew' },
  { to: '/dm/session-planner', label: 'Session Planner' },
  { to: '/dm/long-term-planning', label: 'Long-Term Planning' },
  { to: '/dm/item-maker', label: 'Item Maker' },
  { to: '/dm/name-generator', label: 'Name Generator' },
  { to: '/dm/screen', label: 'DM Screen' },
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
