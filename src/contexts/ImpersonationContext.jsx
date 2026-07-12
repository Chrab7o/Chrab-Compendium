import { createContext, useContext, useState } from 'react'
import { useAuth } from './AuthContext'

// Tab-scoped (sessionStorage, not localStorage) so a DM can't forget they're
// "viewing as" a player days later in a browser they left open — closing the
// tab clears it. This is a pure client-side convenience: every real write
// path (unlock_skill_node's is_dm() bypass, the DM-write RLS policies) checks
// the actual authenticated role/uid regardless of what's stored here, so
// there's no security boundary riding on this state.
const STORAGE_KEY = 'chrab-corner-impersonating'
const ImpersonationContext = createContext(null)

export function ImpersonationProvider({ children }) {
  const { isDM } = useAuth()
  const [impersonating, setImpersonating] = useState(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY)
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })

  function startImpersonating(character) {
    if (!isDM) return
    const target = { characterId: character.id, ownerId: character.owner_id, name: character.name }
    setImpersonating(target)
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(target))
  }

  function stopImpersonating() {
    setImpersonating(null)
    sessionStorage.removeItem(STORAGE_KEY)
  }

  return (
    <ImpersonationContext.Provider value={{ impersonating: isDM ? impersonating : null, startImpersonating, stopImpersonating }}>
      {children}
    </ImpersonationContext.Provider>
  )
}

export function useImpersonation() {
  return useContext(ImpersonationContext)
}
