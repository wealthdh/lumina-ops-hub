/**
 * useTheme — Dark / Light mode toggle
 * Persists to localStorage, applies to <html> element
 */
import { useState, useEffect, useCallback } from 'react'

type Theme = 'dark' | 'light'

const STORAGE_KEY = 'lumina-theme'

function getInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null
    if (stored === 'light' || stored === 'dark') return stored
    // System preference
    if (window.matchMedia('(prefers-color-scheme: light)').matches) return 'light'
  } catch { /* localStorage not available */ }
  return 'dark'
}

function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'light') {
    root.classList.add('light-mode')
    root.classList.remove('dark-mode')
  } else {
    root.classList.add('dark-mode')
    root.classList.remove('light-mode')
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    const t = getInitialTheme()
    applyTheme(t)
    return t
  })

  useEffect(() => {
    applyTheme(theme)
    try { localStorage.setItem(STORAGE_KEY, theme) } catch { /* ignore */ }
  }, [theme])

  const toggle = useCallback(() => {
    setThemeState(t => t === 'dark' ? 'light' : 'dark')
  }, [])

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
  }, [])

  return { theme, toggle, setTheme, isDark: theme === 'dark' }
}
