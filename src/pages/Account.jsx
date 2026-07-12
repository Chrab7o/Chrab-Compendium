import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { useImpersonation } from '../contexts/ImpersonationContext'

export default function Account() {
  const { session } = useAuth()
  const { impersonating } = useImpersonation()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError("Passwords don't match.")
      return
    }
    setSaving(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setSaving(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    setPassword('')
    setConfirm('')
    setSuccess(true)
  }

  return (
    <section className="page">
      <div className="view-header">
        <h1>My Account</h1>
        <p className="view-subtitle">
          {impersonating ? `Viewing as ${impersonating.name}` : `Signed in as ${session.user.email}`}
        </p>
      </div>

      <div className="entry-grid">
        <Link to="/character" className="entry-card">
          <h3>Character Sheet</h3>
          <p className="status-message">View and track your character.</p>
        </Link>
        <Link to="/notes" className="entry-card">
          <h3>My Notes</h3>
          <p className="status-message">Private notes only you and your DM can see.</p>
        </Link>
        <Link to="/skills" className="entry-card">
          <h3>Skill Tree</h3>
          <p className="status-message">Spend points and track unlocks.</p>
        </Link>
      </div>

      {impersonating ? (
        <p className="status-message">
          Password changes aren't available while viewing as another player — that would change
          your own DM login, not theirs.
        </p>
      ) : (
        <div className="dm-panel">
          <h2>Change Password</h2>
          <form onSubmit={handleSubmit} className="dm-form">
            <label>
              New password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </label>
            <label>
              Confirm new password
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
              />
            </label>
            {error && <p className="status-message error">{error}</p>}
            {success && <p className="status-message">Password updated.</p>}
            <div className="dm-form-actions">
              <button type="submit" disabled={saving}>
                {saving ? 'Saving...' : 'Update password'}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  )
}
