import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(true)
  const [roleLoading, setRoleLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function loadRole(userId) {
      if (!userId) {
        setRole(null)
        setRoleLoading(false)
        return
      }
      setRoleLoading(true)
      const { data } = await supabase.from('profiles').select('role').eq('id', userId).single()
      if (!cancelled) {
        setRole(data?.role ?? null)
        setRoleLoading(false)
      }
    }

    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      await loadRole(data.session?.user?.id)
      if (!cancelled) setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession)
      await loadRole(newSession?.user?.id)
    })

    return () => {
      cancelled = true
      listener.subscription.unsubscribe()
    }
  }, [])

  const signIn = (email, password) =>
    supabase.auth.signInWithPassword({ email, password })

  const signOut = () => supabase.auth.signOut()

  return (
    <AuthContext.Provider
      value={{
        session,
        role,
        isDM: role === 'dm',
        isPlayer: role === 'player',
        // True while a session exists but its role hasn't resolved yet —
        // route guards should wait rather than judge on a stale role.
        loading: loading || (!!session && roleLoading),
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
