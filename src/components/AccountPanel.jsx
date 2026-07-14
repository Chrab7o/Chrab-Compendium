import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { useImpersonation } from '../contexts/ImpersonationContext'

// The Character hub's "Account" tab — was its own page with a quick-link
// grid to Character/Notes/Skills; those are now just the other tabs in the
// same hub, so this is just the password-change form.
export default function AccountPanel() {
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
    <div>
      <p className="view-subtitle">
        {impersonating ? `Viewing as ${impersonating.name}` : `Signed in as ${session.user.email}`}
      </p>

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
    </div>
  )
}
