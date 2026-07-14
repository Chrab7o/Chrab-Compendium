import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function RequireDM({ children }) {
  const { session, isDM, loading } = useAuth()

  if (loading) return <p className="status-message">Loading...</p>
  if (!session) return <Navigate to="/login" replace />
  if (!isDM) return <Navigate to="/character" replace />
  return children
}
