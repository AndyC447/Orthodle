'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const closeTimerRef = useRef<number | null>(null)
  const today = new Date()
  const THEME_STORAGE_KEY = 'orthodle_theme'

  const dateStr = today.toLocaleDateString('en-US', {
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

  return (
    <header className="border-b border-[#e5dfd3] bg-[#f7f4ee]">
      <div className="relative mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <Link href="/" className="font-serif text-xl font-semibold text-[#102018]">
          <span className="flex items-center gap-2">
            <span className="text-[#c96b37] text-lg">●</span>
            Orthodle
          </span>
        </Link>

        <div className="pointer-events-none absolute left-1/2 hidden -translate-x-1/2 text-center text-[11px] uppercase tracking-[0.25em] text-[#7a857c] md:block">
          {dateStr}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to night mode'}
            onClick={toggleTheme}
            className={`group flex h-10 w-10 items-center justify-center rounded-full border transition ${
              theme === 'dark'
                ? 'border-[#33453c] bg-[#18241f] text-[#f4efe6] hover:bg-[#1d2a24]'
                : 'border-[#ded7ca] bg-white text-[#102018] hover:bg-[#fbfaf7]'
            }`}
          >
            <span className="relative flex h-5 w-5 items-center justify-center overflow-hidden">
              <span
                className={`absolute text-[15px] leading-none transition-all duration-300 ${
                  theme === 'dark'
                    ? 'translate-y-0 scale-100 opacity-100'
                    : '-translate-y-5 scale-75 opacity-0'
                }`}
              >
                ☀
              </span>
              <span
                className={`absolute text-[15px] leading-none transition-all duration-300 ${
                  theme === 'dark'
                    ? 'translate-y-5 scale-75 opacity-0'
                    : 'translate-y-0 scale-100 opacity-100'
                }`}
              >
                ☾
              </span>
            </span>
          </button>

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
            className={`flex h-10 w-10 items-center justify-center rounded-full border transition ${
              theme === 'dark'
                ? 'border-[#33453c] bg-[#18241f] text-[#f4efe6] hover:bg-[#1d2a24]'
                : 'border-[#ded7ca] bg-white text-[#102018] hover:bg-[#fbfaf7]'
            }`}
          >
            <span className="flex flex-col gap-1">
              <span className="block h-0.5 w-4 rounded-full bg-current" />
              <span className="block h-0.5 w-4 rounded-full bg-current" />
              <span className="block h-0.5 w-4 rounded-full bg-current" />
            </span>
          </button>

          {menuOpen && (
            <div
              className={`absolute right-0 top-[calc(100%+10px)] z-50 min-w-[170px] overflow-hidden rounded-2xl border shadow-[0_18px_40px_rgba(16,32,24,0.06)] ${
                theme === 'dark'
                  ? 'border-[#33453c] bg-[#18241f]'
                  : 'border-[#e7e1d6] bg-white'
              }`}
            >
              <div
                className={`border-b px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.22em] ${
                  theme === 'dark'
                    ? 'border-[#24342d] text-[#9fb4a7]'
                    : 'border-[#f3eee5] text-[#7a857c]'
                }`}
              >
                Navigation
              </div>

              <div className="p-2">
                <Link
                  href="/"
                  onClick={() => setMenuOpen(false)}
                  className={`block rounded-xl px-3 py-2.5 text-[12px] font-semibold uppercase tracking-[0.16em] transition ${
                    theme === 'dark'
                      ? 'text-[#f4efe6] hover:bg-[#213129]'
                      : 'text-[#102018] hover:bg-[#fbfaf7]'
                  }`}
                >
                  Play
                </Link>
                <Link
                  href="/stats"
                  onClick={() => setMenuOpen(false)}
                  className={`block rounded-xl px-3 py-2.5 text-[12px] font-semibold uppercase tracking-[0.16em] transition ${
                    theme === 'dark'
                      ? 'text-[#f4efe6] hover:bg-[#213129]'
                      : 'text-[#102018] hover:bg-[#fbfaf7]'
                  }`}
                >
                  Stats
                </Link>
                <Link
                  href="/groups"
                  onClick={() => setMenuOpen(false)}
                  className={`block rounded-xl px-3 py-2.5 text-[12px] font-semibold uppercase tracking-[0.16em] transition ${
                    theme === 'dark'
                      ? 'text-[#f4efe6] hover:bg-[#213129]'
                      : 'text-[#102018] hover:bg-[#fbfaf7]'
                  }`}
                >
                  Groups
                </Link>
                <Link
                  href="/submit"
                  onClick={() => setMenuOpen(false)}
                  className={`block rounded-xl px-3 py-2.5 text-[12px] font-semibold uppercase tracking-[0.16em] transition ${
                    theme === 'dark'
                      ? 'text-[#f4efe6] hover:bg-[#213129]'
                      : 'text-[#102018] hover:bg-[#fbfaf7]'
                  }`}
                >
                  Submit Case
                </Link>
                <Link
                  href="/archive"
                  onClick={() => setMenuOpen(false)}
                  className={`block rounded-xl px-3 py-2.5 text-[12px] font-semibold uppercase tracking-[0.16em] transition ${
                    theme === 'dark'
                      ? 'text-[#f4efe6] hover:bg-[#213129]'
                      : 'text-[#102018] hover:bg-[#fbfaf7]'
                  }`}
                >
                  Archive
                </Link>
              </div>
            </div>
          )}
        </div>
        </div>
      </div>
    </header>
  )
}
