'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false)
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const sync = () =>
      setIsDark(
        document.documentElement.dataset.theme
          ? document.documentElement.dataset.theme === 'dark'
          : media.matches,
      )
    sync()
    const onStorage = (event: StorageEvent) => {
      if (event.key !== 'hezb_theme') return
      if (event.newValue === 'light' || event.newValue === 'dark') {
        document.documentElement.dataset.theme = event.newValue
      } else {
        delete document.documentElement.dataset.theme
      }
      sync()
    }
    media.addEventListener('change', sync)
    window.addEventListener('storage', onStorage)
    return () => {
      media.removeEventListener('change', sync)
      window.removeEventListener('storage', onStorage)
    }
  }, [])
  function toggle() {
    const theme = isDark ? 'light' : 'dark'
    document.documentElement.dataset.theme = theme
    setIsDark(theme === 'dark')
    try {
      localStorage.setItem('hezb_theme', theme)
    } catch {
      /* Theme still works when browser storage is unavailable. */
    }
  }
  return (
    <button
      className="ib"
      type="button"
      aria-label={
        isDark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'
      }
      title={isDark ? 'Giao diện sáng' : 'Giao diện tối'}
      onClick={toggle}
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  )
}
