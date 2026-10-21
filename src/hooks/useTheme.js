import { useEffect, useState } from 'react'

// Per-browser view preference: 'classic' (the Marginalia parchment look) or
// 'minimal' (flat dark "Simple" view - see the data-theme='minimal' block at
// the end of index.css). index.html applies the saved value with an inline
// script before first paint, so this hook only has to keep it in sync.
const STORAGE_KEY = 'chrab-theme'

function readTheme() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'minimal' ? 'minimal' : 'classic'
  } catch {
    return 'classic'
  }
}

export function useTheme() {
  const [theme, setTheme] = useState(readTheme)

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'minimal') {
      root.dataset.theme = 'minimal'
    } else {
      delete root.dataset.theme
    }
    // HeroUI components key their own dark palette off a `dark` class.
    root.classList.toggle('dark', theme === 'minimal')
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      /* private mode */
    }
  }, [theme])

  const toggleTheme = () => setTheme((t) => (t === 'minimal' ? 'classic' : 'minimal'))

  return { theme, toggleTheme }
}
