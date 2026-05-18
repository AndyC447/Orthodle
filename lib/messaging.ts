import type { FeedbackMessageRow } from '@/lib/feedback-messages'

export type FeedbackThread = {
  feedbackId: string
  caseDate: string | null
  level: 'med_student' | 'resident' | 'attending' | null
  answer: string | null
  feedbackText: string
  createdAt: string
  messages: FeedbackMessageRow[]
  latestMessageAt: string
  hasUnreadAdminReply: boolean
}

export type MessagingPayload = {
  threads: FeedbackThread[]
  unreadCount: number
}
