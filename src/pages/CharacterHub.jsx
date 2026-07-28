import { useState } from 'react'
import { useMyCharacter } from '../hooks/useMyCharacter'
import { useCampaignContext } from '../contexts/CampaignContext'
import CharacterSheet from './CharacterSheet'
import SkillTreeProgress from '../components/SkillTreeProgress'
import NotesPanel from '../components/NotesPanel'
import AccountPanel from '../components/AccountPanel'
import TagView from './TagView'

const TABS = [
  { key: 'sheet', label: 'Character Sheet' },
  { key: 'skills', label: 'Feature Tree' },
  { key: 'notes', label: 'My Notes' },
  { key: 'session-notes', label: 'Session Notes' },
  { key: 'account', label: 'Account' },
]

// The consolidated player hub at /character — character sheet, skill tree,
// private notes, the DM's public session-note entries, and account
// settings, as in-page tabs instead of four separate routes each re-mounting
// their own PlayerLayout sub-nav. (/character/:id, used by the DM to view
// an arbitrary character directly, is a separate route/page — unaffected.)
export default function CharacterHub() {
  const { characterId } = useMyCharacter()
  const { campaignId } = useCampaignContext()
  const [tab, setTab] = useState('sheet')

  if (characterId === undefined) return <p className="page status-message">Loading...</p>

  if (characterId === null) {
    return (
      <section className="page">
        <div className="view-header">
          <h1>Character</h1>
        </div>
        <p className="status-message">
          {campaignId
            ? "No character found for the selected campaign. Ask your DM to import or assign one."
            : 'Select a campaign to continue, using the picker at the top of the page.'}
        </p>
      </section>
    )
  }

  // Every other tab stays in the same narrow reading column as the rest of
  // the site; the Feature Tree is the one exception - its diagram is
  // genuinely wide content (like the DM's own map/skill-tree tools), so
  // capping it to that column just leaves it small with dead space below.
  const isSkillsTab = tab === 'skills'

  return (
    <section className={isSkillsTab ? 'page-wide character-hub character-hub-skills' : 'page character-hub'}>
      <nav className="character-hub-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={t.key === tab ? 'active' : ''}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="character-hub-panel">
        {tab === 'sheet' && <CharacterSheet characterId={characterId} />}
        {tab === 'skills' && <SkillTreeProgress characterId={characterId} editable />}
        {tab === 'notes' && <NotesPanel />}
        {tab === 'session-notes' && <TagView tag="session-note" title="Session Notes" embedded />}
        {tab === 'account' && <AccountPanel />}
      </div>
    </section>
  )
}
