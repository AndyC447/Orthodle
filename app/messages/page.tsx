'use client'

import Link from 'next/link'
import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { Header } from '@/components/Header'
import { PublicFooter } from '@/components/PublicFooter'
import type { ConversationSummary, MessageUser, MessagingPayload } from '@/lib/messaging'
import { getAccountSession, getSessionId, type AccountSession } from '@/lib/utils'

function formatMessageTime(value: string) {
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function MessagesPageContent() {
  const searchParams = useSearchParams()
  const requestedUserId = searchParams.get('user') || ''
  const [accountSession, setAccountSession] = useState<AccountSession | null>(null)
  const [payload, setPayload] = useState<MessagingPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [selectedConversationId, setSelectedConversationId] = useState('')
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<MessageUser[]>([])
  const [searching, setSearching] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  const sessionId = useMemo(() => getSessionId(), [])

  useEffect(() => {
    setAccountSession(getAccountSession())
  }, [])

  useEffect(() => {
    if (!accountSession?.accountId) {
      setPayload(null)
      setLoading(false)
      return
    }

    let cancelled = false

    async function loadInbox(conversationId?: string) {
      setLoading(true)
      const params = new URLSearchParams({
        accountId: accountSession.accountId,
        sessionId,
      })

      if (conversationId) {
        params.set('conversationWith', conversationId)
      }

      const response = await fetch(`/api/messages?${params.toString()}`, {
        cache: 'no-store',
      })
      const data = await response.json().catch(() => ({}))

      if (cancelled) return

      if (!response.ok) {
        setStatus(data.error || 'Could not load messages.')
        setLoading(false)
        return
      }

      const nextPayload = data as MessagingPayload
      setPayload(nextPayload)
      setStatus('')

      const nextSelected =
        conversationId ||
        requestedUserId ||
        selectedConversationId ||
        nextPayload.conversations[0]?.participant.accountId ||
        ''

      if (nextSelected && nextSelected !== selectedConversationId) {
        setSelectedConversationId(nextSelected)
      }

      setLoading(false)
    }

    void loadInbox(selectedConversationId || requestedUserId || '')

    return () => {
      cancelled = true
    }
  }, [accountSession?.accountId, requestedUserId, selectedConversationId, sessionId])

  useEffect(() => {
    if (!accountSession?.accountId || !selectedConversationId) return

    const activeConversation = payload?.activeConversation
    const hasUnread =
      (activeConversation?.messages || []).some(
        item => !item.isOutgoing && !item.readAt
      ) || false

    if (!hasUnread) return

    void fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'mark-read',
        accountId: accountSession.accountId,
        conversationWith: selectedConversationId,
      }),
    })
  }, [accountSession?.accountId, payload?.activeConversation, selectedConversationId])

  useEffect(() => {
    const unreadSystemIds =
      payload?.systemMessages.filter(item => !item.is_read).map(item => item.id) || []
    if (unreadSystemIds.length === 0) return

    void fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'mark-read',
        systemMessageIds: unreadSystemIds,
      }),
    })
  }, [payload?.systemMessages])

  useEffect(() => {
    if (!accountSession?.accountId || search.trim().length < 2) {
      setSearchResults([])
      return
    }

    let cancelled = false
    setSearching(true)

    const timeoutId = window.setTimeout(async () => {
      const params = new URLSearchParams({
        q: search.trim(),
        excludeAccountId: accountSession.accountId,
      })

      const response = await fetch(`/api/messages/users?${params.toString()}`, {
        cache: 'no-store',
      })
      const data = await response.json().catch(() => ({}))

      if (cancelled) return

      if (!response.ok) {
        setSearchResults([])
        setSearching(false)
        return
      }

      setSearchResults((data.users || []) as MessageUser[])
      setSearching(false)
    }, 220)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [accountSession?.accountId, search])

  useEffect(() => {
    if (!accountSession?.accountId || !requestedUserId) return

    if (payload?.conversations.some(item => item.participant.accountId === requestedUserId)) {
      setSelectedConversationId(requestedUserId)
      return
    }

    let cancelled = false

    async function loadRecipient() {
      const response = await fetch(`/api/messages/users?accountId=${encodeURIComponent(requestedUserId)}`, {
        cache: 'no-store',
      })
      const data = await response.json().catch(() => ({}))

      if (cancelled || !response.ok || !data.user) return

      setSelectedConversationId(requestedUserId)
    }

    void loadRecipient()

    return () => {
      cancelled = true
    }
  }, [accountSession?.accountId, payload?.conversations, requestedUserId])

  const selectedConversation =
    payload?.conversations.find(item => item.participant.accountId === selectedConversationId) || null
  const activeParticipant = payload?.activeConversation?.participant || selectedConversation?.participant || null

  async function sendMessage() {
    if (!accountSession?.accountId || !activeParticipant) return

    const trimmedDraft = draft.trim()
    if (!trimmedDraft) {
      setStatus('Write a message first.')
      return
    }

    setSending(true)
    const response = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        senderAccountId: accountSession.accountId,
        recipientAccountId: activeParticipant.accountId,
        messageText: trimmedDraft,
      }),
    })

    const data = await response.json().catch(() => ({}))
    setSending(false)

    if (!response.ok) {
      setStatus(data.error || 'Could not send your message.')
      return
    }

    setDraft('')
    setStatus('')

    const params = new URLSearchParams({
      accountId: accountSession.accountId,
      sessionId,
      conversationWith: activeParticipant.accountId,
    })
    const refresh = await fetch(`/api/messages?${params.toString()}`, { cache: 'no-store' })
    const refreshData = await refresh.json().catch(() => ({}))
    if (refresh.ok) {
      setPayload(refreshData as MessagingPayload)
    }
  }

  function selectConversation(participantId: string) {
    setSelectedConversationId(participantId)
    setStatus('')
  }

  return (
    <main className="min-h-screen bg-[#fbfaf7]">
      <Header />

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#637268]">
              Inbox
            </div>
            <h1 className="mt-2 font-serif text-3xl font-bold text-[#102018]">
              Messages
            </h1>
            <p className="mt-2 text-sm text-[#637268]">
              Message other people with Orthodle accounts and keep feedback replies in one place.
            </p>
          </div>
          {!accountSession && (
            <Link
              href="/groups?tab=profile"
              className="self-start rounded-lg bg-[#1f6448] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#174c37]"
            >
              Create or log into an account
            </Link>
          )}
        </div>

        {status && (
          <p className="mt-4 text-sm text-[#637268]">{status}</p>
        )}

        {!accountSession ? (
          <section className="mt-5 rounded-2xl border border-[#e7e1d6] bg-white p-5 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
            <h2 className="font-serif text-2xl font-bold text-[#102018]">Sign in to message people</h2>
            <p className="mt-2 text-sm leading-6 text-[#637268]">
              Direct messaging is tied to your Orthodle account, so your inbox can follow you across devices.
            </p>
          </section>
        ) : (
          <div className="mt-5 grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="space-y-4">
              <section className="rounded-2xl border border-[#e7e1d6] bg-white p-4 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#637268]">
                  Start a conversation
                </div>
                <input
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="Search by username or display name"
                  className="mt-3 w-full rounded-xl border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018] outline-none transition focus:border-[#1f6448] focus:ring-2 focus:ring-[#d9eadf]"
                />

                <div className="mt-3 space-y-2">
                  {searching ? (
                    <div className="rounded-xl border border-[#e7e1d6] bg-[#fcfbf8] px-3 py-3 text-sm text-[#637268]">
                      Searching...
                    </div>
                  ) : search.trim().length >= 2 && searchResults.length === 0 ? (
                    <div className="rounded-xl border border-[#e7e1d6] bg-[#fcfbf8] px-3 py-3 text-sm text-[#637268]">
                      No people matched that search.
                    </div>
                  ) : (
                    searchResults.map(user => (
                      <button
                        key={user.accountId}
                        type="button"
                        onClick={() => selectConversation(user.accountId)}
                        className="flex w-full items-center justify-between rounded-xl border border-[#e7e1d6] bg-[#fcfbf8] px-3 py-3 text-left transition hover:border-[#cfded4] hover:bg-white"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-[#102018]">{user.displayName}</div>
                          <div className="text-xs text-[#637268]">@{user.username}</div>
                        </div>
                        <div className="text-lg">{user.profileIcon || '💬'}</div>
                      </button>
                    ))
                  )}
                </div>
              </section>

              <section className="rounded-2xl border border-[#e7e1d6] bg-white p-4 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#637268]">
                    Conversations
                  </div>
                  <div className="rounded-full border border-[#ded7ca] bg-[#fbfaf7] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#637268]">
                    {payload?.conversations.length || 0}
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  {loading ? (
                    <div className="rounded-xl border border-[#e7e1d6] bg-[#fcfbf8] px-3 py-3 text-sm text-[#637268]">
                      Loading conversations...
                    </div>
                  ) : payload?.conversations.length ? (
                    payload.conversations.map((conversation: ConversationSummary) => {
                      const selected = conversation.participant.accountId === selectedConversationId
                      return (
                        <button
                          key={conversation.participant.accountId}
                          type="button"
                          onClick={() => selectConversation(conversation.participant.accountId)}
                          className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                            selected
                              ? 'border-[#cfded4] bg-[#f7fbf8]'
                              : 'border-[#e7e1d6] bg-[#fcfbf8] hover:border-[#cfded4] hover:bg-white'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-[#102018]">
                                {conversation.participant.displayName}
                              </div>
                              <div className="text-xs text-[#637268]">
                                @{conversation.participant.username}
                              </div>
                            </div>
                            {conversation.unreadCount > 0 && (
                              <span className="inline-flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#c96b37] px-1 text-[10px] font-bold text-white">
                                {conversation.unreadCount}
                              </span>
                            )}
                          </div>
                          <p className="mt-2 truncate text-sm text-[#355542]">
                            {conversation.lastMessage}
                          </p>
                          <div className="mt-1 text-[11px] text-[#637268]">
                            {formatMessageTime(conversation.lastMessageAt)}
                          </div>
                        </button>
                      )
                    })
                  ) : (
                    <div className="rounded-xl border border-[#e7e1d6] bg-[#fcfbf8] px-3 py-3 text-sm text-[#637268]">
                      No conversations yet.
                    </div>
                  )}
                </div>
              </section>

              <section className="rounded-2xl border border-[#e7e1d6] bg-white p-4 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#637268]">
                  Feedback replies
                </div>
                <div className="mt-3 space-y-2">
                  {payload?.systemMessages.length ? (
                    payload.systemMessages.map(item => (
                      <article
                        key={item.id}
                        className="rounded-xl border border-[#e7e1d6] bg-[#fcfbf8] px-3 py-3"
                      >
                        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#637268]">
                          {item.case_date || 'Recent case'}
                        </div>
                        {item.answer && (
                          <div className="mt-1 text-sm font-semibold text-[#102018]">{item.answer}</div>
                        )}
                        <p className="mt-2 text-sm leading-6 text-[#355542]">{item.message_text}</p>
                      </article>
                    ))
                  ) : (
                    <div className="rounded-xl border border-[#e7e1d6] bg-[#fcfbf8] px-3 py-3 text-sm text-[#637268]">
                      No feedback replies yet.
                    </div>
                  )}
                </div>
              </section>
            </aside>

            <section className="rounded-2xl border border-[#e7e1d6] bg-white p-4 shadow-[0_10px_24px_rgba(16,32,24,0.04)] sm:p-5">
              {activeParticipant ? (
                <>
                  <div className="flex items-center justify-between gap-3 border-b border-[#eee8dc] pb-4">
                    <div className="min-w-0">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#637268]">
                        Conversation
                      </div>
                      <div className="mt-1 text-xl font-semibold text-[#102018]">
                        {activeParticipant.displayName}
                      </div>
                      <div className="text-sm text-[#637268]">@{activeParticipant.username}</div>
                    </div>
                    <div className="text-2xl">{activeParticipant.profileIcon || '💬'}</div>
                  </div>

                  <div className="mt-4 space-y-3">
                    {payload?.activeConversation?.messages.length ? (
                      payload.activeConversation.messages.map(item => (
                        <div
                          key={item.id}
                          className={`flex ${item.isOutgoing ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${
                              item.isOutgoing
                                ? 'bg-[#1f6448] text-white'
                                : 'border border-[#e7e1d6] bg-[#fcfbf8] text-[#102018]'
                            }`}
                          >
                            <p>{item.messageText}</p>
                            <div
                              className={`mt-1 text-[11px] ${
                                item.isOutgoing ? 'text-white/80' : 'text-[#637268]'
                              }`}
                            >
                              {formatMessageTime(item.createdAt)}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-dashed border-[#ded7ca] bg-[#fbfaf7] px-4 py-6 text-sm text-[#637268]">
                        No messages in this conversation yet. Say hello.
                      </div>
                    )}
                  </div>

                  <div className="mt-5 border-t border-[#eee8dc] pt-4">
                    <textarea
                      value={draft}
                      onChange={event => setDraft(event.target.value)}
                      rows={4}
                      placeholder={`Message ${activeParticipant.displayName}...`}
                      className="w-full rounded-2xl border border-[#ded7ca] px-3 py-3 text-sm text-[#102018] outline-none transition focus:border-[#1f6448] focus:ring-2 focus:ring-[#d9eadf]"
                    />
                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        onClick={() => void sendMessage()}
                        disabled={sending}
                        className="rounded-lg bg-[#1f6448] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#174c37] disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {sending ? 'Sending...' : 'Send message'}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-dashed border-[#ded7ca] bg-[#fbfaf7] px-6 text-center text-sm leading-6 text-[#637268]">
                  Search for someone or pick a conversation to start messaging.
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      <PublicFooter />
    </main>
  )
}

export default function MessagesPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#fbfaf7]">
          <Header />
          <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-[#637268] sm:px-6">
            Loading messages...
          </div>
          <PublicFooter />
        </main>
      }
    >
      <MessagesPageContent />
    </Suspense>
  )
}
