import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function RequireDM({ children }) {
  const { isDM, loading } = useAuth()

  if (loading) return <p className="status-message">Loading...</p>
  if (!isDM) return <Navigate to="/dm/login" replace />
  return children
}
