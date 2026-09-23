import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

// One tap straight into the editor. This used to open a category menu first,
// which meant deciding what an entry *was* before you could start writing it
// — the editor asks for a Type tag at save time instead, by which point you
// actually know.
export default function NewEntryFab() {
  const { isDM } = useAuth()
  const navigate = useNavigate()

  if (!isDM) return null

  return (
    <div className="fab-wrapper">
      <button
        type="button"
        className="fab-button"
        onClick={() => navigate('/dm/entries/new')}
        aria-label="New entry"
      >
        +
      </button>
    </div>
  )
}
