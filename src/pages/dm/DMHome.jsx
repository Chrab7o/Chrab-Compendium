import { Link } from 'react-router-dom'

const SECTIONS = [
  { to: '/dm/organize', title: 'Folders & Entries', desc: 'Browse and organize your whole category tree, add entries in place.' },
  { to: '/dm/categories', title: 'Categories', desc: 'Add, rename, reorder, or consolidate the top-level tabs.' },
  { to: '/dm/campaigns', title: 'Campaigns', desc: 'Add and edit campaigns.' },
  { to: '/dm/maps', title: 'Maps', desc: 'Upload maps and place markers.' },
  { to: '/dm/characters', title: 'Characters', desc: 'Review imported character sheets, assign owners.' },
  { to: '/dm/notes', title: 'Player Notes', desc: "Read-only view of everyone's private notes." },
  { to: '/dm/import', title: 'Import', desc: 'Bring in Foundry characters and Obsidian vaults.' },
]

export default function DMHome() {
  return (
    <section className="page dm-dashboard">
      <h1>DM Dashboard</h1>
      <p className="view-subtitle">
        Everything here is only visible to you. Public visitors only ever see entries marked
        "Public".
      </p>
      <div className="entry-grid">
        {SECTIONS.map((s) => (
          <Link key={s.to} to={s.to} className="entry-card">
            <h3>{s.title}</h3>
            <p className="status-message">{s.desc}</p>
          </Link>
        ))}
      </div>
    </section>
  )
}
