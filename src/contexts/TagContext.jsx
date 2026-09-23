import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { setTagsCache } from '../lib/tagLabels'

const TagContext = createContext(null)

// Tags and their groups load together — nothing renders a tag without
// knowing which group it belongs to (that's what decides whether it's a
// radio or a checkbox, and which filter row it lands in), so fetching them
// separately would just mean every consumer waiting on both anyway.
export function TagProvider({ children }) {
  const [tags, setTags] = useState([])
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    const [{ data: tagData }, { data: groupData }] = await Promise.all([
      supabase.from('tags').select('*').order('sort_order', { ascending: true }),
      supabase.from('tag_groups').select('*').order('sort_order', { ascending: true }),
    ])
    setTags(tagData ?? [])
    setGroups(groupData ?? [])
    setTagsCache(tagData ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  // The Type group is the old `categories` table — exclusive and required,
  // so it gets a named accessor rather than every consumer re-finding it.
  const typeGroup = useMemo(() => groups.find((g) => g.value === 'type') ?? null, [groups])
  const typeTags = useMemo(
    () => (typeGroup ? tags.filter((t) => t.group_id === typeGroup.id) : []),
    [tags, typeGroup]
  )

  const value = useMemo(
    () => ({ tags, groups, typeGroup, typeTags, loading, reload }),
    [tags, groups, typeGroup, typeTags, loading, reload]
  )

  return <TagContext.Provider value={value}>{children}</TagContext.Provider>
}

export function useTags() {
  return useContext(TagContext)
}
