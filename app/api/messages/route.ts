import { NextResponse } from 'next/server'
import type { FeedbackMessageRow } from '@/lib/feedback-messages'
import type { FeedbackThread, MessagingPayload } from '@/lib/messaging'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

type FeedbackRow = {
  id: string
  case_date: string | null
  level: 'med_student' | 'resident' | 'attending' | null
  answer: string | null
  feedback_text: string
  created_at: string
  session_id: string | null
}

function buildThreads(feedbackRows: FeedbackRow[], messageRows: FeedbackMessageRow[]) {
  const messagesByFeedbackId = new Map<string, FeedbackMessageRow[]>()

  for (const message of messageRows) {
    if (!message.feedback_id) continue
    const current = messagesByFeedbackId.get(message.feedback_id) || []
    current.push(message)
    messagesByFeedbackId.set(message.feedback_id, current)
  }

  return feedbackRows
    .map(row => {
      const threadMessages = (messagesByFeedbackId.get(row.id) || []).sort((a, b) =>
        a.created_at.localeCompare(b.created_at)
      )
      const latestMessageAt =
        threadMessages[threadMessages.length - 1]?.created_at || row.created_at

      return {
        feedbackId: row.id,
        caseDate: row.case_date,
        level: row.level,
        answer: row.answer,
        feedbackText: row.feedback_text,
        createdAt: row.created_at,
        messages: threadMessages,
        latestMessageAt,
        hasUnreadAdminReply: threadMessages.some(item => item.sender_role === 'admin' && !item.is_read),
      } satisfies FeedbackThread
    })
    .sort((a, b) => b.latestMessageAt.localeCompare(a.latestMessageAt))
}

export async function GET(req: Request) {
  try {
    const supabaseAdmin = getSupabaseAdmin()
    const url = new URL(req.url)
    const accountId = url.searchParams.get('accountId')?.trim() || ''
    const sessionId = url.searchParams.get('sessionId')?.trim() || ''
    const targetIds = Array.from(new Set([accountId, sessionId].filter(Boolean)))

    if (targetIds.length === 0) {
      return NextResponse.json({
        threads: [],
        unreadCount: 0,
      } satisfies MessagingPayload)
    }

    const [{ data: feedbackData, error: feedbackError }, { data: messageData, error: messageError }] =
      await Promise.all([
        supabaseAdmin
          .from('case_feedback')
          .select('id, case_date, level, answer, feedback_text, created_at, session_id')
          .in('session_id', targetIds)
          .order('created_at', { ascending: false })
          .limit(50),
        supabaseAdmin
          .from('feedback_messages')
          .select(
            'id, feedback_id, recipient_session_id, sender_role, case_date, level, answer, message_text, is_read, read_at, created_at'
          )
          .in('recipient_session_id', targetIds)
          .order('created_at', { ascending: true })
          .limit(500),
      ])

    if (feedbackError) {
      throw new Error(feedbackError.message || 'Could not load feedback threads.')
    }

    if (messageError) {
      throw new Error(messageError.message || 'Could not load feedback messages.')
    }

    const threads = buildThreads((feedbackData || []) as FeedbackRow[], (messageData || []) as FeedbackMessageRow[])
    const unreadCount = threads.reduce(
      (sum, thread) => sum + thread.messages.filter(item => item.sender_role === 'admin' && !item.is_read).length,
      0
    )

    return NextResponse.json({
      threads,
      unreadCount,
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
    const action = typeof body?.action === 'string' ? body.action : 'reply'

    if (action === 'mark-read') {
      const systemMessageIds = Array.isArray(body?.systemMessageIds)
        ? body.systemMessageIds.filter(
            (item: unknown): item is string =>
              typeof item === 'string' && item.trim().length > 0
          )
        : []

      if (systemMessageIds.length > 0) {
        await supabaseAdmin
          .from('feedback_messages')
          .update({ is_read: true, read_at: new Date().toISOString() })
          .in('id', systemMessageIds)
      }

      return NextResponse.json({ ok: true })
    }

    const feedbackId = typeof body?.feedbackId === 'string' ? body.feedbackId.trim() : ''
    const recipientSessionId =
      typeof body?.recipientSessionId === 'string' ? body.recipientSessionId.trim() : ''
    const messageText = typeof body?.messageText === 'string' ? body.messageText.trim() : ''

    if (!feedbackId || !recipientSessionId) {
      return NextResponse.json({ error: 'Missing feedback thread.' }, { status: 400 })
    }

    if (!messageText) {
      return NextResponse.json({ error: 'Write a reply first.' }, { status: 400 })
    }

    const { data: feedback, error: feedbackError } = await supabaseAdmin
      .from('case_feedback')
      .select('id, case_date, level, answer')
      .eq('id', feedbackId)
      .maybeSingle()

    if (feedbackError || !feedback) {
      return NextResponse.json({ error: 'That feedback thread could not be found.' }, { status: 404 })
    }

    const { data, error } = await supabaseAdmin
      .from('feedback_messages')
      .insert({
        feedback_id: feedbackId,
        recipient_session_id: recipientSessionId,
        sender_role: 'player',
        case_date: feedback.case_date,
        level: feedback.level,
        answer: feedback.answer,
        message_text: messageText,
        is_read: false,
      })
      .select(
        'id, feedback_id, recipient_session_id, sender_role, case_date, level, answer, message_text, is_read, read_at, created_at'
      )
      .single()

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || 'Could not send that reply.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      message: data as FeedbackMessageRow,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Could not send the reply right now.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
