import { Link } from 'react-router-dom'

const SECTIONS = [
  { to: '/search', title: 'Browse & Bulk Edit', desc: 'Find anything by tag, then retag, hide, or reassign a whole set at once.' },
  { to: '/dm/tags', title: 'Tags & Groups', desc: 'The vocabulary everything is organized by \u2014 groups act as the filter rows in search.' },
  { to: '/dm/campaigns', title: 'Campaigns', desc: 'Add and edit campaigns.' },
  { to: '/dm/maps', title: 'Maps', desc: 'Upload maps and place markers.' },
  { to: '/dm/characters', title: 'Characters', desc: 'Review imported character sheets, assign owners.' },
  { to: '/dm/character-notes', title: 'Character Notes', desc: 'Your own bio, arc plans, and notes for each player character.' },
  { to: '/dm/long-term-planning', title: 'Long-Term Planning', desc: 'Things to remember to do at some point, with no date on them yet.' },
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
