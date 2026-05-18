'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell, Menu, Moon, Sun } from 'lucide-react'
import { formatFeedbackLevel } from '@/lib/feedback-messages'
import type { MessagingPayload } from '@/lib/messaging'
import { getAccountSession, getSessionId } from '@/lib/utils'

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [messagingPayload, setMessagingPayload] = useState<MessagingPayload | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [notificationsLoading, setNotificationsLoading] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const closeTimerRef = useRef<number | null>(null)
  const notificationPanelRef = useRef<HTMLDivElement | null>(null)
  const pathname = usePathname()
  const THEME_STORAGE_KEY = 'orthodle_theme'
  const showNotifications = true
  const showPlayLink = pathname !== '/'
  const previewConversationCount = messagingPayload?.conversations.length || 0
  const previewSystemCount = messagingPayload?.systemMessages.length || 0
  const hasAnyMessages = previewConversationCount > 0 || previewSystemCount > 0

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
    let cancelled = false

    async function loadNotifications() {
      setNotificationsLoading(true)
      const sessionId = getSessionId()
      const accountId = getAccountSession()?.accountId || ''
      const params = new URLSearchParams({ sessionId })
      if (accountId) {
        params.set('accountId', accountId)
      }

      const response = await fetch(`/api/messages?${params.toString()}`, {
        cache: 'no-store',
      })
      const data = await response.json().catch(() => ({}))

      if (cancelled) return

      if (!response.ok) {
        setMessagingPayload(null)
        setUnreadCount(0)
        setNotificationsLoading(false)
        return
      }

      const payload = data as MessagingPayload
      setMessagingPayload(payload)
      setUnreadCount(payload.unreadCount || 0)
      setNotificationsLoading(false)
    }

    void loadNotifications()

    return () => {
      cancelled = true
    }
  }, [pathname, showNotifications])

  useEffect(() => {
    if (!notificationsOpen) return

    const unreadIds =
      messagingPayload?.systemMessages.filter(item => !item.is_read).map(item => item.id) || []
    if (unreadIds.length === 0) return

    setMessagingPayload(prev =>
      prev
        ? {
            ...prev,
            unreadCount: Math.max(0, prev.unreadCount - unreadIds.length),
            systemMessages: prev.systemMessages.map(item =>
              unreadIds.includes(item.id)
                ? { ...item, is_read: true, read_at: item.read_at || new Date().toISOString() }
                : item
            ),
          }
        : prev
    )
    setUnreadCount(prev => Math.max(0, prev - unreadIds.length))

    void fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'mark-read',
        systemMessageIds: unreadIds,
      }),
    })
  }, [messagingPayload, notificationsOpen])

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
      <div className="relative mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
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
                  className={`fixed left-4 right-4 top-[72px] z-50 overflow-hidden rounded-2xl border shadow-[0_18px_40px_rgba(16,32,24,0.08)] sm:absolute sm:left-auto sm:right-0 sm:top-[calc(100%+10px)] sm:w-[320px] sm:max-w-[calc(100vw-32px)] ${
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
                    <p className={`mt-1 text-xs ${theme === 'dark' ? 'text-[#dbe5dd]' : 'text-[#637268]'}`}>
                      People messages and feedback replies live here.
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
                    ) : !hasAnyMessages ? (
                      <div
                        className={`rounded-xl px-3 py-4 text-sm ${
                          theme === 'dark' ? 'text-[#9fb4a7]' : 'text-[#637268]'
                        }`}
                      >
                        No messages yet.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {(messagingPayload?.conversations || []).slice(0, 4).map(item => (
                          <Link
                            key={item.participant.accountId}
                            href={`/messages?user=${encodeURIComponent(item.participant.accountId)}`}
                            onClick={() => setNotificationsOpen(false)}
                            className={`block rounded-xl border p-3 ${
                              theme === 'dark'
                                ? 'border-[#2a3b34] bg-[#1d2a24]'
                                : 'border-[#e7e1d6] bg-[#fcfbf8]'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className={`text-sm font-semibold ${theme === 'dark' ? 'text-[#f4efe6]' : 'text-[#102018]'}`}>
                                  {item.participant.displayName}
                                </div>
                                <div className={`text-[10px] ${theme === 'dark' ? 'text-[#9fb4a7]' : 'text-[#637268]'}`}>
                                  @{item.participant.username}
                                </div>
                              </div>
                              {item.unreadCount > 0 && (
                                <span className="inline-flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#c96b37] px-1 text-[10px] font-bold text-white">
                                  {item.unreadCount}
                                </span>
                              )}
                            </div>
                            <p className={`mt-2 truncate text-sm ${theme === 'dark' ? 'text-[#dbe5dd]' : 'text-[#355542]'}`}>
                              {item.lastMessage}
                            </p>
                          </Link>
                        ))}

                        {(messagingPayload?.systemMessages || []).slice(0, 3).map(item => (
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
                            </div>
                            <p className={`mt-2 text-sm leading-6 ${theme === 'dark' ? 'text-[#dbe5dd]' : 'text-[#102018]'}`}>
                              {item.message_text}
                            </p>
                          </article>
                        ))}

                        <Link
                          href="/messages"
                          onClick={() => setNotificationsOpen(false)}
                          className={`block rounded-xl border px-3 py-2.5 text-center text-sm font-semibold transition ${
                            theme === 'dark'
                              ? 'border-[#33453c] bg-[#18241f] text-[#f4efe6] hover:bg-[#1d2a24]'
                              : 'border-[#ded7ca] bg-white text-[#102018] hover:bg-[#fbfaf7]'
                          }`}
                        >
                          Open full inbox
                        </Link>
                      </div>
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
              className={`fixed left-4 right-4 top-[72px] z-50 overflow-hidden rounded-2xl border shadow-[0_18px_40px_rgba(16,32,24,0.06)] sm:absolute sm:left-auto sm:right-0 sm:top-[calc(100%+10px)] sm:min-w-[170px] ${
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
                  href="/messages"
                  onClick={() => setMenuOpen(false)}
                  className={`block rounded-xl px-3 py-2.5 text-[12px] font-semibold uppercase tracking-[0.16em] transition ${
                    theme === 'dark'
                      ? 'text-[#f4efe6] hover:bg-[#213129]'
                      : 'text-[#102018] hover:bg-[#fbfaf7]'
                  }`}
                >
                  Messages
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
