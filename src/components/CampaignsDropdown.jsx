import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCampaignContext } from '../contexts/CampaignContext'

export default function CampaignsDropdown() {
  const { campaigns } = useCampaignContext()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  if (campaigns.length === 0) return null

  return (
    <div className="nav-dropdown" ref={ref}>
      <button
        type="button"
        className="nav-dropdown-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        Campaigns ▾
      </button>
      {open && (
        <div className="nav-dropdown-menu">
          {campaigns.map((c) => (
            <Link key={c.id} to={`/campaign/${c.id}`} onClick={() => setOpen(false)}>
              {c.name}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
