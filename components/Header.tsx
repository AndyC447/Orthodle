'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const closeTimerRef = useRef<number | null>(null)
  const today = new Date()

  const dateStr = today.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).toUpperCase()

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

        {/* LEFT: Logo */}
        <Link href="/" className="font-serif text-xl font-semibold text-[#102018]">
          <span className="flex items-center gap-2">
            <span className="text-[#c96b37] text-lg">●</span>
            Orthodle
          </span>
        </Link>

        {/* CENTER: Date */}
        <div className="pointer-events-none absolute left-1/2 hidden -translate-x-1/2 text-center text-[11px] uppercase tracking-[0.25em] text-[#7a857c] md:block">
          {dateStr}
        </div>

        <div
          className="relative"
          onMouseEnter={openMenu}
          onMouseLeave={scheduleCloseMenu}
        >
          <button
            type="button"
            aria-expanded={menuOpen}
            aria-label="Open navigation menu"
            onClick={() => setMenuOpen(prev => !prev)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[#ded7ca] bg-white text-[#102018] transition hover:bg-[#fbfaf7]"
          >
            <span className="flex flex-col gap-1">
              <span className="block h-0.5 w-4 rounded-full bg-current" />
              <span className="block h-0.5 w-4 rounded-full bg-current" />
              <span className="block h-0.5 w-4 rounded-full bg-current" />
            </span>
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-[calc(100%+10px)] z-50 min-w-[180px] overflow-hidden rounded-2xl border border-[#ded7ca] bg-white shadow-[0_18px_40px_rgba(16,32,24,0.08)]">
              <div className="border-b border-[#f0ebe1] px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#7a857c]">
                Navigation
              </div>

              <div className="p-2">
                <Link
                  href="/"
                  onClick={() => setMenuOpen(false)}
                  className="block rounded-xl px-3 py-2.5 text-[12px] font-semibold uppercase tracking-[0.16em] text-[#102018] transition hover:bg-[#fbfaf7]"
                >
                  Play
                </Link>
                <Link
                  href="/stats"
                  onClick={() => setMenuOpen(false)}
                  className="block rounded-xl px-3 py-2.5 text-[12px] font-semibold uppercase tracking-[0.16em] text-[#102018] transition hover:bg-[#fbfaf7]"
                >
                  Stats
                </Link>
                <Link
                  href="/admin"
                  onClick={() => setMenuOpen(false)}
                  className="block rounded-xl px-3 py-2.5 text-[12px] font-semibold uppercase tracking-[0.16em] text-[#102018] transition hover:bg-[#fbfaf7]"
                >
                  Admin
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
