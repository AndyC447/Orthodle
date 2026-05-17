import { NextResponse } from 'next/server'
import type { FeedbackMessageRow } from '@/lib/feedback-messages'
import type {
  ConversationSummary,
  DirectMessageRow,
  DirectMessageView,
  MessageUser,
  MessagingPayload,
} from '@/lib/messaging'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

type AccountRow = {
  id: string
  username: string
  display_name: string | null
  profile_icon: string | null
}

function toMessageUser(account: AccountRow | null | undefined) {
  if (!account?.id || !account.username) return null

  return {
    accountId: account.id,
    username: account.username,
    displayName: account.display_name || account.username,
    profileIcon: account.profile_icon || null,
  } satisfies MessageUser
}

async function fetchUsersByIds(ids: string[]) {
  if (ids.length === 0) return new Map<string, MessageUser>()

  const supabaseAdmin = getSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('user_accounts')
    .select('id, username, display_name, profile_icon')
    .in('id', ids)

  if (error) {
    throw new Error(error.message || 'Could not load message participants.')
  }

  return new Map(
    ((data || []) as AccountRow[])
      .map(row => toMessageUser(row))
      .filter((row): row is MessageUser => Boolean(row))
      .map(user => [user.accountId, user] as const)
  )
}

function buildConversationSummaries(accountId: string, rows: DirectMessageRow[], usersById: Map<string, MessageUser>) {
  const conversations = new Map<string, ConversationSummary>()

  for (const row of rows) {
    const counterpartId =
      row.sender_account_id === accountId ? row.recipient_account_id : row.sender_account_id
    const participant = usersById.get(counterpartId)

    if (!participant) continue

    const unreadIncrement =
      row.recipient_account_id === accountId && !row.read_at ? 1 : 0
    const existing = conversations.get(counterpartId)

    if (!existing) {
      conversations.set(counterpartId, {
        participant,
        lastMessage: row.message_text,
        lastMessageAt: row.created_at,
        unreadCount: unreadIncrement,
      })
      continue
    }

    const isNewer = row.created_at > existing.lastMessageAt
    conversations.set(counterpartId, {
      participant,
      lastMessage: isNewer ? row.message_text : existing.lastMessage,
      lastMessageAt: isNewer ? row.created_at : existing.lastMessageAt,
      unreadCount: existing.unreadCount + unreadIncrement,
    })
  }

  return Array.from(conversations.values()).sort((a, b) =>
    b.lastMessageAt.localeCompare(a.lastMessageAt)
  )
}

function buildConversationMessages(
  accountId: string,
  conversationWith: string,
  rows: DirectMessageRow[],
  usersById: Map<string, MessageUser>
) {
  return rows
    .filter(
      row =>
        (row.sender_account_id === accountId && row.recipient_account_id === conversationWith) ||
        (row.sender_account_id === conversationWith && row.recipient_account_id === accountId)
    )
    .map(row => ({
      id: row.id,
      senderAccountId: row.sender_account_id,
      recipientAccountId: row.recipient_account_id,
      messageText: row.message_text,
      readAt: row.read_at,
      createdAt: row.created_at,
      sender: usersById.get(row.sender_account_id) || null,
      recipient: usersById.get(row.recipient_account_id) || null,
      isOutgoing: row.sender_account_id === accountId,
    }) satisfies DirectMessageView)
}

export async function GET(req: Request) {
  try {
    const supabaseAdmin = getSupabaseAdmin()
    const url = new URL(req.url)
    const accountId = url.searchParams.get('accountId')?.trim() || ''
    const sessionId = url.searchParams.get('sessionId')?.trim() || ''
    const conversationWith = url.searchParams.get('conversationWith')?.trim() || ''

    let directRows: DirectMessageRow[] = []
    let usersById = new Map<string, MessageUser>()

    if (accountId) {
      const { data, error } = await supabaseAdmin
        .from('direct_messages')
        .select('id, sender_account_id, recipient_account_id, message_text, read_at, created_at')
        .or(`sender_account_id.eq.${accountId},recipient_account_id.eq.${accountId}`)
        .order('created_at', { ascending: true })
        .limit(500)

      if (error) {
        throw new Error(error.message || 'Could not load direct messages.')
      }

      directRows = (data || []) as DirectMessageRow[]
      const relatedIds = Array.from(
        new Set(
          [accountId, conversationWith, ...directRows.map(row => row.sender_account_id), ...directRows.map(row => row.recipient_account_id)]
            .filter(Boolean)
        )
      )
      usersById = await fetchUsersByIds(relatedIds)
    }

    const targetIds = Array.from(new Set([accountId, sessionId].filter(Boolean)))
    let systemMessages: FeedbackMessageRow[] = []

    if (targetIds.length > 0) {
      const { data, error } = await supabaseAdmin
        .from('feedback_messages')
        .select(
          'id, feedback_id, recipient_session_id, sender_role, case_date, level, answer, message_text, is_read, read_at, created_at'
        )
        .in('recipient_session_id', targetIds)
        .order('created_at', { ascending: false })
        .limit(20)

      if (error) {
        throw new Error(error.message || 'Could not load feedback replies.')
      }

      systemMessages = ((data || []) as FeedbackMessageRow[]).filter(
        item => item.sender_role === 'admin'
      )
    }

    const conversations = accountId
      ? buildConversationSummaries(accountId, directRows, usersById)
      : []
    const activeConversation =
      accountId && conversationWith
        ? {
            participant: usersById.get(conversationWith) || null,
            messages: buildConversationMessages(accountId, conversationWith, directRows, usersById),
          }
        : null

    const unreadDirectCount = conversations.reduce((sum, item) => sum + item.unreadCount, 0)
    const unreadSystemCount = systemMessages.filter(item => !item.is_read).length

    return NextResponse.json({
      conversations,
      activeConversation,
      systemMessages,
      unreadCount: unreadDirectCount + unreadSystemCount,
    } satisfies MessagingPayload)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Could not load the inbox right now.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const supabaseAdmin = getSupabaseAdmin()
    const body = await req.json()
    const action = typeof body?.action === 'string' ? body.action : 'send'

    if (action === 'mark-read') {
      const accountId = typeof body?.accountId === 'string' ? body.accountId.trim() : ''
      const conversationWith =
        typeof body?.conversationWith === 'string' ? body.conversationWith.trim() : ''
      const systemMessageIds = Array.isArray(body?.systemMessageIds)
        ? body.systemMessageIds.filter(
            (item: unknown): item is string =>
              typeof item === 'string' && item.trim().length > 0
          )
        : []
      const nowIso = new Date().toISOString()

      if (accountId && conversationWith) {
        await supabaseAdmin
          .from('direct_messages')
          .update({ read_at: nowIso })
          .eq('recipient_account_id', accountId)
          .eq('sender_account_id', conversationWith)
          .is('read_at', null)
      }

      if (systemMessageIds.length > 0) {
        await supabaseAdmin
          .from('feedback_messages')
          .update({ is_read: true, read_at: nowIso })
          .in('id', systemMessageIds)
      }

      return NextResponse.json({ ok: true })
    }

    const senderAccountId =
      typeof body?.senderAccountId === 'string' ? body.senderAccountId.trim() : ''
    const recipientAccountId =
      typeof body?.recipientAccountId === 'string' ? body.recipientAccountId.trim() : ''
    const messageText = typeof body?.messageText === 'string' ? body.messageText.trim() : ''

    if (!senderAccountId || !recipientAccountId) {
      return NextResponse.json({ error: 'Pick both people in the conversation.' }, { status: 400 })
    }

    if (senderAccountId === recipientAccountId) {
      return NextResponse.json({ error: 'Send messages to another account.' }, { status: 400 })
    }

    if (!messageText) {
      return NextResponse.json({ error: 'Write a message first.' }, { status: 400 })
    }

    const usersById = await fetchUsersByIds([senderAccountId, recipientAccountId])
    if (!usersById.has(senderAccountId) || !usersById.has(recipientAccountId)) {
      return NextResponse.json({ error: 'That account could not be found.' }, { status: 404 })
    }

    const { data, error } = await supabaseAdmin
      .from('direct_messages')
      .insert({
        sender_account_id: senderAccountId,
        recipient_account_id: recipientAccountId,
        message_text: messageText,
      })
      .select('id, sender_account_id, recipient_account_id, message_text, read_at, created_at')
      .single()

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || 'Could not send the message.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      message: {
        id: data.id,
        senderAccountId: data.sender_account_id,
        recipientAccountId: data.recipient_account_id,
        messageText: data.message_text,
        readAt: data.read_at,
        createdAt: data.created_at,
        sender: usersById.get(senderAccountId) || null,
        recipient: usersById.get(recipientAccountId) || null,
        isOutgoing: true,
      } satisfies DirectMessageView,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Could not send the message right now.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
