'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell, Menu, Moon, Sun } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getSessionId } from '@/lib/utils'
import { formatFeedbackLevel, type FeedbackMessageRow } from '@/lib/feedback-messages'

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notifications, setNotifications] = useState<FeedbackMessageRow[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [notificationsLoading, setNotificationsLoading] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const closeTimerRef = useRef<number | null>(null)
  const notificationPanelRef = useRef<HTMLDivElement | null>(null)
  const pathname = usePathname()
  const today = new Date()
  const THEME_STORAGE_KEY = 'orthodle_theme'
  const showNotifications = pathname === '/'
  const showPlayLink = pathname !== '/'

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

  useEffect(() => {
    if (!showNotifications) {
      setNotificationsOpen(false)
      return
    }

    let cancelled = false

    async function loadNotifications() {
      setNotificationsLoading(true)
      const sessionId = getSessionId()
      const { data, error } = await supabase
        .from('feedback_messages')
        .select(
          'id, feedback_id, recipient_session_id, sender_role, case_date, level, answer, message_text, is_read, read_at, created_at'
        )
        .eq('recipient_session_id', sessionId)
        .order('created_at', { ascending: false })
        .limit(20)

      if (cancelled) return

      if (error) {
        setNotifications([])
        setUnreadCount(0)
        setNotificationsLoading(false)
        return
      }

      const rows = ((data || []) as FeedbackMessageRow[]).filter(
        item => item.sender_role === 'admin'
      )
      setNotifications(rows)
      setUnreadCount(rows.filter(item => !item.is_read).length)
      setNotificationsLoading(false)
    }

    void loadNotifications()

    return () => {
      cancelled = true
    }
  }, [showNotifications])

  useEffect(() => {
    if (!notificationsOpen) return

    const unreadIds = notifications.filter(item => !item.is_read).map(item => item.id)
    if (unreadIds.length === 0) return

    setNotifications(prev =>
      prev.map(item =>
        unreadIds.includes(item.id)
          ? { ...item, is_read: true, read_at: item.read_at || new Date().toISOString() }
          : item
      )
    )
    setUnreadCount(0)

    void supabase
      .from('feedback_messages')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .in('id', unreadIds)
  }, [notifications, notificationsOpen])

  useEffect(() => {
    if (!notificationsOpen) return

    function handlePointerDown(event: MouseEvent) {
      if (!notificationPanelRef.current?.contains(event.target as Node)) {
        setNotificationsOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [notificationsOpen])

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
    <header className="border-b border-[#e5dfd3] bg-[#f7f4ee]">
      <div className="relative mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <Link
          href="/"
          onClick={handleHomeClick}
          className="font-serif text-xl font-semibold text-[#102018]"
        >
          <span className="flex items-center gap-2">
            <span className="text-[#c96b37] text-lg">●</span>
            Orthodle
          </span>
        </Link>

        <div className="pointer-events-none absolute left-1/2 hidden -translate-x-1/2 text-center text-[11px] uppercase tracking-[0.25em] text-[#7a857c] md:block">
          {dateStr}
        </div>

        <div className="flex items-center gap-2">
          {showNotifications && (
            <div className="relative" ref={notificationPanelRef}>
              <button
                type="button"
                aria-expanded={notificationsOpen}
                aria-label="Open messages"
                onClick={() => setNotificationsOpen(prev => !prev)}
                className={`group relative flex h-10 w-10 items-center justify-center rounded-full border transition ${
                  theme === 'dark'
                    ? 'border-[#33453c] bg-[#18241f] text-[#f4efe6] hover:bg-[#1d2a24]'
                    : 'border-[#ded7ca] bg-white text-[#102018] hover:bg-[#fbfaf7]'
                }`}
              >
                <Bell className="h-[18px] w-[18px]" strokeWidth={2} />
                {unreadCount > 0 && (
                  <span className="absolute right-1.5 top-1.5 inline-flex min-h-[17px] min-w-[17px] items-center justify-center rounded-full bg-[#c96b37] px-1 text-[10px] font-bold text-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {notificationsOpen && (
                <div
                  className={`absolute right-0 top-[calc(100%+10px)] z-50 w-[320px] max-w-[calc(100vw-32px)] overflow-hidden rounded-2xl border shadow-[0_18px_40px_rgba(16,32,24,0.08)] ${
                    theme === 'dark'
                      ? 'border-[#33453c] bg-[#18241f]'
                      : 'border-[#e7e1d6] bg-white'
                  }`}
                >
                  <div
                    className={`border-b px-4 py-3 ${
                      theme === 'dark' ? 'border-[#24342d]' : 'border-[#f3eee5]'
                    }`}
                  >
                    <div
                      className={`text-[10px] font-semibold uppercase tracking-[0.22em] ${
                        theme === 'dark' ? 'text-[#9fb4a7]' : 'text-[#7a857c]'
                      }`}
                    >
                      Messages
                    </div>
                    <p
                      className={`mt-1 text-xs ${
                        theme === 'dark' ? 'text-[#dbe5dd]' : 'text-[#637268]'
                      }`}
                    >
                      Replies to your case feedback show up here.
                    </p>
                  </div>

                  <div className="max-h-[360px] overflow-y-auto p-2">
                    {notificationsLoading ? (
                      <div
                        className={`rounded-xl px-3 py-4 text-sm ${
                          theme === 'dark' ? 'text-[#9fb4a7]' : 'text-[#637268]'
                        }`}
                      >
                        Loading messages...
                      </div>
                    ) : notifications.length === 0 ? (
                      <div
                        className={`rounded-xl px-3 py-4 text-sm ${
                          theme === 'dark' ? 'text-[#9fb4a7]' : 'text-[#637268]'
                        }`}
                      >
                        No replies yet.
                      </div>
                    ) : (
                      notifications.map(item => (
                        <article
                          key={item.id}
                          className={`rounded-xl border p-3 ${
                            theme === 'dark'
                              ? 'border-[#2a3b34] bg-[#1d2a24]'
                              : 'border-[#e7e1d6] bg-[#fcfbf8]'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div
                                className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${
                                  theme === 'dark' ? 'text-[#9fb4a7]' : 'text-[#637268]'
                                }`}
                              >
                                {formatFeedbackLevel(item.level)} · {item.case_date || 'Recent case'}
                              </div>
                              {item.answer && (
                                <div
                                  className={`mt-1 text-sm font-semibold ${
                                    theme === 'dark' ? 'text-[#f4efe6]' : 'text-[#102018]'
                                  }`}
                                >
                                  {item.answer}
                                </div>
                              )}
                            </div>
                            {!item.is_read && (
                              <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[#c96b37]" />
                            )}
                          </div>
                          <p
                            className={`mt-2 text-sm leading-6 ${
                              theme === 'dark' ? 'text-[#dbe5dd]' : 'text-[#102018]'
                            }`}
                          >
                            {item.message_text}
                          </p>
                        </article>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

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
              <Sun
                className={`absolute h-[18px] w-[18px] transition-all duration-300 ${
                  theme === 'dark'
                    ? 'translate-y-0 scale-100 opacity-100'
                    : '-translate-y-5 scale-75 opacity-0'
                }`}
                strokeWidth={2}
              />
              <Moon
                className={`absolute h-[18px] w-[18px] transition-all duration-300 ${
                  theme === 'dark'
                    ? 'translate-y-5 scale-75 opacity-0'
                    : 'translate-y-0 scale-100 opacity-100'
                }`}
                strokeWidth={2}
              />
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
            <Menu className="h-[18px] w-[18px]" strokeWidth={2.2} />
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
                {showPlayLink && (
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
                )}
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
