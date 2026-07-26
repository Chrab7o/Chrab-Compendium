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
    // Tracks whose session we last actually processed, so a token-refresh
    // event for the SAME user (see below) can be told apart from a real
    // sign-in/sign-out/account-switch without needing `session` itself as
    // an effect dependency.
    let lastUserId

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
      lastUserId = data.session?.user?.id ?? null
      setSession(data.session)
      await loadRole(data.session?.user?.id)
      if (!cancelled) setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      const newUserId = newSession?.user?.id ?? null
      // The Supabase client re-validates the session (and fires this
      // listener) whenever the browser tab regains focus, even when
      // nothing about who's signed in changed - it's just refreshing the
      // token. Passing that through unconditionally as a brand-new
      // `session` object made every consumer that depends on `session`
      // (e.g. useMyCharacter) treat it as a real change and re-fetch,
      // which is what caused pages like the Character Hub to flash back
      // to "Loading..." every time you switched back to the tab. Only
      // treat this as an actual auth change - and only then touch
      // session/role state - when the signed-in user genuinely changed.
      if (newUserId === lastUserId) return
      lastUserId = newUserId
      setSession(newSession)
      await loadRole(newUserId)
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
