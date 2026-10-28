'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, Moon, Sun } from 'lucide-react'

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false)

  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const closeTimerRef = useRef<number | null>(null)

  const pathname = usePathname()
  const THEME_STORAGE_KEY = 'orthodle_theme'

  const IMPACT_VISITED_STORAGE_KEY = 'orthodle_visited_impact_page_v1'

  const showPlayLink = pathname !== '/'

  const dateStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).toUpperCase()

  useEffect(() => {
    const savedTheme =
      (window.localStorage.getItem(THEME_STORAGE_KEY) as 'light' | 'dark' | null) || 'light'
    setTheme(savedTheme)
    document.documentElement.dataset.theme = savedTheme

  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (pathname !== '/impact') return
    window.localStorage.setItem(IMPACT_VISITED_STORAGE_KEY, '1')
  }, [pathname])

  function toggleTheme() {
    const nextTheme = theme === 'dark' ? 'light' : 'dark'
    setTheme(nextTheme)
    document.documentElement.dataset.theme = nextTheme
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme)
  }

  function openMenu() {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }

    setMenuOpen(true)
  }

  function scheduleCloseMenu() {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current)
    }

    closeTimerRef.current = window.setTimeout(() => {
      setMenuOpen(false)
      closeTimerRef.current = null
    }, 180)
  }

  function handleHomeClick() {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent('orthodle:go-home'))
    if (pathname === '/') {
      setMenuOpen(false)
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-[#e5dfd3]/90 bg-[#f7f4ee]/92 backdrop-blur-xl supports-[backdrop-filter]:bg-[#f7f4ee]/82">
      <div className="relative mx-auto flex max-w-5xl items-center justify-between px-4 py-2.5 sm:px-6 sm:py-3">
        <Link
          href="/"
          onClick={handleHomeClick}
          className="text-[#102018]"
        >
          <span className="flex items-center gap-2">
            <span className="orthodle-wordmark-dot text-[1.05rem]">●</span>
            <span className="orthodle-wordmark">Orthodle</span>
          </span>
        </Link>

        <div className="pointer-events-none absolute left-1/2 hidden -translate-x-1/2 text-center text-[10px] uppercase tracking-[0.24em] text-[#7a857c] md:block">
          {dateStr}
        </div>

        <div className="flex items-center gap-2">

          <div
            className="relative -m-2 p-2"
            onMouseEnter={openMenu}
            onMouseLeave={scheduleCloseMenu}
          >
          <button
            type="button"
            aria-expanded={menuOpen}
            aria-label="Open navigation menu"
            onClick={() => setMenuOpen(prev => !prev)}
            className={`orthodle-ui-icon-button flex h-10 w-10 items-center justify-center ${
              theme === 'dark'
                ? 'border-[#33453c] bg-[#18241f] text-[#f4efe6] hover:bg-[#1d2a24]'
                : 'border-[#ded7ca] bg-white text-[#102018] hover:bg-[#fbfaf7]'
            }`}
          >
            <Menu className="h-[18px] w-[18px]" strokeWidth={2.2} />

          </button>

          {menuOpen && (
            <div
              className={`orthodle-ui-panel fixed left-4 right-4 top-[66px] z-50 overflow-hidden sm:absolute sm:left-auto sm:right-0 sm:top-[calc(100%+8px)] sm:min-w-[170px] ${
                theme === 'dark'
                  ? 'border-[#33453c] bg-[#18241f]'
                  : 'border-[#e7e1d6] bg-white'
              }`}
            >
              <div className="p-2">
                <Link
                  href="/groups"
                  onClick={() => setMenuOpen(false)}
                  className={`orthodle-ui-menu-item block ${
                    theme === 'dark'
                      ? 'text-[#f4efe6] hover:bg-[#213129]'
                      : 'text-[#102018] hover:bg-[#fbfaf7]'
                  }`}
                >
                  Groups
                </Link>
                {showPlayLink && (
                  <Link
                    href="/"
                    onClick={() => setMenuOpen(false)}
                    className={`orthodle-ui-menu-item block ${
                      theme === 'dark'
                        ? 'text-[#f4efe6] hover:bg-[#213129]'
                        : 'text-[#102018] hover:bg-[#fbfaf7]'
                    }`}
                  >
                    Play
                  </Link>
                )}
                <Link
                  href="/stats"
                  onClick={() => setMenuOpen(false)}
                  className={`orthodle-ui-menu-item block ${
                    theme === 'dark'
                      ? 'text-[#f4efe6] hover:bg-[#213129]'
                      : 'text-[#102018] hover:bg-[#fbfaf7]'
                  }`}
                >
                  Stats
                </Link>
                <Link
                  href="/archive"
                  onClick={() => setMenuOpen(false)}
                  className={`orthodle-ui-menu-item block ${
                    theme === 'dark'
                      ? 'text-[#f4efe6] hover:bg-[#213129]'
                      : 'text-[#102018] hover:bg-[#fbfaf7]'
                  }`}
                >
                  Archive
                </Link>

                <button
                  type="button"
                  onClick={() => {
                    toggleTheme()
                    setMenuOpen(false)
                  }}
                  className={`orthodle-ui-menu-item flex w-full text-left ${
                    theme === 'dark'
                      ? 'text-[#f4efe6] hover:bg-[#213129]'
                      : 'text-[#102018] hover:bg-[#fbfaf7]'
                  }`}
                >
                  <span>{theme === 'dark' ? 'Light mode' : 'Night mode'}</span>
                  {theme === 'dark' ? (
                    <Sun className="h-[15px] w-[15px]" strokeWidth={2} />
                  ) : (
                    <Moon className="h-[15px] w-[15px]" strokeWidth={2} />
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
        </div>
      </div>
    </header>
  )
}
