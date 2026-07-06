import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function RequireAuth({ children }) {
  const { session, loading } = useAuth()

  if (loading) return <p className="status-message">Loading...</p>
  if (!session) return <Navigate to="/login" replace />
  return children
}
