import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useCategories } from '../../contexts/CategoryContext'

export default function NewEntryFab() {
  const { isDM } = useAuth()
  const { categories } = useCategories()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  if (!isDM) return null

  function pick(category) {
    setOpen(false)
    navigate(`/dm/entries/new?category=${category}`)
  }

  return (
    <div className="fab-wrapper">
      {open && (
        <div className="fab-menu">
          <p className="fab-menu-label">New entry:</p>
          {categories.map((c) => (
            <button key={c.value} type="button" onClick={() => pick(c.value)}>
              {c.label}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        className="fab-button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Add new content"
        aria-expanded={open}
      >
        {open ? '×' : '+'}
      </button>
    </div>
  )
}
