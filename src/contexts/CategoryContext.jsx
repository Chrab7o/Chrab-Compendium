import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { setCategoriesCache } from '../lib/categories'

const CategoryContext = createContext(null)

export function CategoryProvider({ children }) {
  const [categories, setCategories] = useState([])

  const reload = useCallback(async () => {
    const { data } = await supabase
      .from('categories')
      .select('*')
      .order('sort_order', { ascending: true })
    setCategories(data ?? [])
    setCategoriesCache(data ?? [])
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  return (
    <CategoryContext.Provider value={{ categories, reload }}>{children}</CategoryContext.Provider>
  )
}

export function useCategories() {
  return useContext(CategoryContext)
}
