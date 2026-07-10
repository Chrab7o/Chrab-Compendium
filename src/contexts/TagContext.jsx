import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const TagContext = createContext(null)

export function TagProvider({ children }) {
  const [tags, setTags] = useState([])

  const reload = useCallback(async () => {
    const { data } = await supabase.from('tags').select('*').order('sort_order', { ascending: true })
    setTags(data ?? [])
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  return <TagContext.Provider value={{ tags, reload }}>{children}</TagContext.Provider>
}

export function useTags() {
  return useContext(TagContext)
}
