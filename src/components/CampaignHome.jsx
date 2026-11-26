import { Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useAuth } from '../contexts/AuthContext'

// A campaign's home page on the world page: the home-page entry in full, folded
// into a <details> so a long one can be tucked away to get at the map.
export default function CampaignHome({ entry }) {
  const { isDM } = useAuth()
  return (
    <details className="campaign-home" open>
      <summary>
        <span className="campaign-home-title">{entry.title}</span>
        {entry.visibility === 'dm' && <span className="badge badge-dm">DM only</span>}
      </summary>
      <div className="entry-content">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.content}</ReactMarkdown>
      </div>
      <p className="campaign-home-links">
        <Link to={`/entry/${entry.id}`}>Open as an entry</Link>
        {isDM && <Link to={`/dm/entries/${entry.id}/edit`}>Edit</Link>}
      </p>
    </details>
  )
}

// With no campaign picked: one card per campaign that has a home page.
// Clicking one picks that campaign, which then shows its home page in full.
export function CampaignHomeCards({ campaigns, homes, onPick }) {
  return (
    <div className="campaign-home-cards">
      {campaigns.map((c) => {
        const entry = homes.get(c.id)
        return (
          <button key={c.id} type="button" className="campaign-home-card" onClick={() => onPick(c.id)}>
            <h3>{c.name}</h3>
            <p>{excerpt(entry.content)}</p>
          </button>
        )
      })}
    </div>
  )
}

// The first paragraph of plain text: headings, images, tables and markdown
// marks dropped, cut at about 220 characters.
function excerpt(markdown, max = 220) {
  const paragraph =
    (markdown ?? '')
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .find((p) => p && !/^(#|!\[|\||>|---|```)/.test(p)) ?? ''
  const text = paragraph
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > max ? `${text.slice(0, max).replace(/\s+\S*$/, '')}…` : text
}
