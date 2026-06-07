'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, Moon, Sun } from 'lucide-react'
import { formatFeedbackLevel } from '@/lib/feedback-messages'
import type { MessagingPayload } from '@/lib/messaging'
import { getAccountSession, getSessionId } from '@/lib/utils'

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [messagingPayload, setMessagingPayload] = useState<MessagingPayload | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [notificationsLoading, setNotificationsLoading] = useState(false)
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
  const [openReplyThreadId, setOpenReplyThreadId] = useState<string | null>(null)
  const [sendingReplyThreadId, setSendingReplyThreadId] = useState<string | null>(null)
  const [dismissedThreadIds, setDismissedThreadIds] = useState<string[]>([])
  const [reminderEmail, setReminderEmail] = useState('')
  const [reminderStatus, setReminderStatus] = useState('')
  const [isSavingReminder, setIsSavingReminder] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const closeTimerRef = useRef<number | null>(null)
  const notificationPanelRef = useRef<HTMLDivElement | null>(null)
  const pathname = usePathname()
  const THEME_STORAGE_KEY = 'orthodle_theme'
  const DISMISSED_THREADS_STORAGE_KEY = 'orthodle_dismissed_feedback_threads_v1'
  const showNotifications = true
  const showPlayLink = pathname !== '/'
  const visibleThreads =
    messagingPayload?.threads.filter(thread => !dismissedThreadIds.includes(thread.feedbackId)) || []
  const threadCount = visibleThreads.length || 0
  const hasAnyMessages = threadCount > 0

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

    try {
      const raw = window.localStorage.getItem(DISMISSED_THREADS_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          setDismissedThreadIds(parsed.filter(item => typeof item === 'string'))
        }
      }
    } catch {}
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(
      DISMISSED_THREADS_STORAGE_KEY,
      JSON.stringify(dismissedThreadIds)
    )
  }, [dismissedThreadIds])

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
      messagingPayload?.threads.flatMap(thread =>
        thread.messages.filter(item => item.sender_role === 'admin' && !item.is_read).map(item => item.id)
      ) || []
    if (unreadIds.length === 0) return

    setMessagingPayload(prev =>
      prev
        ? {
            ...prev,
            unreadCount: Math.max(0, prev.unreadCount - unreadIds.length),
            threads: prev.threads.map(thread => ({
              ...thread,
              hasUnreadAdminReply: false,
              messages: thread.messages.map(item =>
                unreadIds.includes(item.id)
                  ? { ...item, is_read: true, read_at: item.read_at || new Date().toISOString() }
                  : item
              ),
            })),
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

  async function sendThreadReply(feedbackId: string, recipientSessionId: string) {
    const draft = (replyDrafts[feedbackId] || '').trim()
    if (!draft) return

    setSendingReplyThreadId(feedbackId)
    const response = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'reply',
        feedbackId,
        recipientSessionId,
        messageText: draft,
      }),
    })
    const data = await response.json().catch(() => ({}))
    setSendingReplyThreadId(null)

    if (!response.ok || !data.message) {
      return
    }

    setReplyDrafts(prev => ({ ...prev, [feedbackId]: '' }))
    setOpenReplyThreadId(null)
    setMessagingPayload(prev =>
      prev
        ? {
            ...prev,
            threads: prev.threads.map(thread =>
              thread.feedbackId === feedbackId
                ? {
                    ...thread,
                    latestMessageAt: data.message.created_at,
                    messages: [...thread.messages, data.message],
                  }
                : thread
            ),
          }
        : prev
    )
  }

  async function subscribeToReminder() {
    const email = reminderEmail.trim()

    if (!email) {
      setReminderStatus('Enter an email to get the reminder.')
      return
    }

    setIsSavingReminder(true)
    setReminderStatus('')

    try {
      const response = await fetch('/api/reminders/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          sourcePath: pathname || '/',
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        setReminderStatus(data.error || 'Could not save your reminder.')
        return
      }

      setReminderStatus(data.message || 'You’re signed up.')
      setReminderEmail('')
    } catch {
      setReminderStatus('Could not save your reminder.')
    } finally {
      setIsSavingReminder(false)
    }
  }

  function dismissThread(feedbackId: string) {
    setDismissedThreadIds(prev => (prev.includes(feedbackId) ? prev : [...prev, feedbackId]))
    setOpenReplyThreadId(current => (current === feedbackId ? null : current))
  }

  return (
    <header className="border-b border-[#e5dfd3] bg-[#f7f4ee]">
      <div className="relative mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
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

        <div className="pointer-events-none absolute left-1/2 hidden -translate-x-1/2 text-center text-[11px] uppercase tracking-[0.25em] text-[#7a857c] md:block">
          {dateStr}
        </div>

        <div className="flex items-center gap-2">
          {showNotifications && notificationsOpen && (
            <div className="relative" ref={notificationPanelRef}>
              <div
                className={`orthodle-ui-panel fixed left-4 right-4 top-[72px] z-50 overflow-hidden sm:absolute sm:left-auto sm:right-0 sm:top-[calc(100%+10px)] sm:w-[320px] sm:max-w-[calc(100vw-32px)] ${
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
                      Feedback inbox
                    </div>
                    <p className={`mt-1 text-xs ${theme === 'dark' ? 'text-[#dbe5dd]' : 'text-[#637268]'}`}>
                      Admin replies to your feedback live here, and you can answer back in the same thread.
                    </p>
                  </div>

                  <div className="max-h-[360px] overflow-y-auto p-2">
                    <div
                      className={`orthodle-ui-panel mb-2 p-3 ${
                        theme === 'dark'
                          ? 'border-[#2a3b34] bg-[#1d2a24]'
                          : 'border-[#e7e1d6] bg-[#fcfbf8]'
                      }`}
                    >
                      <div className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${theme === 'dark' ? 'text-[#9fb4a7]' : 'text-[#637268]'}`}>
                        Email notifications
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="email"
                          value={reminderEmail}
                          onChange={event => setReminderEmail(event.target.value)}
                          placeholder="you@example.com"
                          className={`orthodle-ui-input min-h-[36px] flex-1 px-3 py-2 text-[11px] leading-none outline-none ${
                            theme === 'dark'
                              ? 'border-[#33453c] bg-[#18241f] text-[#f4efe6] placeholder:text-[#8ea194] focus:border-[#1f6448]'
                              : 'border-[#ded7ca] bg-white text-[#102018] focus:border-[#1f6448]'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => void subscribeToReminder()}
                          disabled={isSavingReminder}
                          className="orthodle-primary-button min-h-[34px] shrink-0 rounded-xl border px-3 py-2 text-[10px] font-semibold leading-none disabled:opacity-60"
                        >
                          {isSavingReminder ? 'Saving...' : 'Notify me'}
                        </button>
                      </div>
                      <p className={`mt-1 text-[10px] leading-none ${theme === 'dark' ? 'text-[#8ea194]' : 'text-[#7a857c]'}`}>
                        One daily email after new cases are live.
                      </p>
                      {reminderStatus && (
                        <p className={`mt-2 text-[10px] leading-none ${theme === 'dark' ? 'text-[#b7d3c3]' : 'text-[#1f6448]'}`}>
                          {reminderStatus}
                        </p>
                      )}
                    </div>

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
                        {visibleThreads.slice(0, 8).map(thread => {
                          const latestMessage = thread.messages[thread.messages.length - 1] || null
                          const isReplyOpen = openReplyThreadId === thread.feedbackId
                          const recipientSessionId =
                            latestMessage?.recipient_session_id || getAccountSession()?.accountId || getSessionId()

                          return (
                          <article
                            key={thread.feedbackId}
                            className={`orthodle-ui-panel p-3 ${
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
                                  {formatFeedbackLevel(thread.level)} · {thread.caseDate || 'Recent case'}
                                </div>
                                {thread.answer && (
                                  <div
                                    className={`mt-1 text-sm font-semibold ${
                                      theme === 'dark' ? 'text-[#f4efe6]' : 'text-[#102018]'
                                    }`}
                                  >
                                    {thread.answer}
                                  </div>
                                )}
                                <p className={`mt-2 text-sm leading-6 ${theme === 'dark' ? 'text-[#dbe5dd]' : 'text-[#355542]'}`}>
                                  {thread.feedbackText}
                                </p>
                              </div>
                              <div className="flex items-start gap-2">
                                {thread.hasUnreadAdminReply ? (
                                  <span className="inline-flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#c96b37] px-1 text-[10px] font-bold text-white">
                                    New
                                  </span>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => dismissThread(thread.feedbackId)}
                                  aria-label="Dismiss thread"
                                  className={`orthodle-ui-icon-button inline-flex h-7 w-7 items-center justify-center text-[13px] font-medium leading-none ${
                                    theme === 'dark'
                                      ? 'border-[#33453c] bg-[#18241f] text-[#dbe5dd] hover:bg-[#213129]'
                                      : 'border-[#ded7ca] bg-white text-[#637268] hover:bg-[#fbfaf7] hover:text-[#102018]'
                                  }`}
                                >
                                  <span className="-mt-px">×</span>
                                </button>
                              </div>
                            </div>
                            {thread.messages.length > 0 ? (
                              <div className="mt-3 space-y-2">
                                {thread.messages.map(message => (
                                  <div
                                    key={message.id}
                                    className={`rounded-lg px-3 py-2 text-sm ${
                                      theme === 'dark'
                                        ? message.sender_role === 'admin'
                                          ? 'bg-[#24342d] text-[#f4efe6]'
                                          : 'bg-[#213129] text-[#dbe5dd]'
                                        : message.sender_role === 'admin'
                                          ? 'bg-white text-[#102018] border border-[#ece6db]'
                                          : 'bg-[#f7fbf8] text-[#355542] border border-[#d9eadf]'
                                    }`}
                                  >
                                    <div className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${theme === 'dark' ? 'text-[#9fb4a7]' : 'text-[#637268]'}`}>
                                      {message.sender_role === 'admin' ? 'Orthodle' : 'You'}
                                    </div>
                                    <div className="mt-1">{message.message_text}</div>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                            <div className="mt-3">
                              <button
                                type="button"
                                onClick={() =>
                                  setOpenReplyThreadId(current =>
                                    current === thread.feedbackId ? null : thread.feedbackId
                                  )
                                }
                                className={`orthodle-ui-button min-h-[34px] px-3 py-1.5 text-[11px] font-semibold ${
                                  theme === 'dark'
                                    ? 'border-[#33453c] bg-[#18241f] text-[#f4efe6] hover:bg-[#1d2a24]'
                                    : 'border-[#ded7ca] bg-white text-[#102018] hover:bg-[#fbfaf7]'
                                }`}
                              >
                                {isReplyOpen ? 'Close reply' : 'Reply'}
                              </button>
                              {isReplyOpen ? (
                                <div className="mt-2 space-y-2">
                                  <textarea
                                    value={replyDrafts[thread.feedbackId] || ''}
                                    onChange={event =>
                                      setReplyDrafts(prev => ({
                                        ...prev,
                                        [thread.feedbackId]: event.target.value,
                                      }))
                                    }
                                    rows={3}
                                    placeholder="Reply to this feedback thread..."
                                    className={`orthodle-ui-input w-full px-3 py-2 text-sm outline-none ${
                                      theme === 'dark'
                                        ? 'border-[#33453c] bg-[#18241f] text-[#f4efe6]'
                                        : 'border-[#ded7ca] bg-white text-[#102018]'
                                    }`}
                                  />
                                  <div className="flex justify-end">
                                    <button
                                      type="button"
                                      onClick={() => void sendThreadReply(thread.feedbackId, recipientSessionId)}
                                      disabled={sendingReplyThreadId === thread.feedbackId}
                                      className="orthodle-primary-button rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-70"
                                    >
                                      {sendingReplyThreadId === thread.feedbackId ? 'Sending...' : 'Send reply'}
                                    </button>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </article>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
            </div>
          )}

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
            {showNotifications && unreadCount > 0 && (
              <span className="absolute right-1.5 top-1.5 inline-flex min-h-[17px] min-w-[17px] items-center justify-center rounded-full bg-[#c96b37] px-1 text-[10px] font-bold text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {menuOpen && (
            <div
              className={`orthodle-ui-panel fixed left-4 right-4 top-[72px] z-50 overflow-hidden sm:absolute sm:left-auto sm:right-0 sm:top-[calc(100%+10px)] sm:min-w-[170px] ${
                theme === 'dark'
                  ? 'border-[#33453c] bg-[#18241f]'
                  : 'border-[#e7e1d6] bg-white'
              }`}
            >
              <div className="p-2">
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
                {showNotifications ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      setNotificationsOpen(true)
                    }}
                    className={`orthodle-ui-menu-item flex w-full text-left ${
                      theme === 'dark'
                        ? 'text-[#f4efe6] hover:bg-[#213129]'
                        : 'text-[#102018] hover:bg-[#fbfaf7]'
                    }`}
                  >
                    <span>Notifications</span>
                    {unreadCount > 0 ? (
                      <span className="inline-flex min-h-[17px] min-w-[17px] items-center justify-center rounded-full bg-[#c96b37] px-1 text-[10px] font-bold text-white">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    ) : null}
                  </button>
                ) : null}
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
