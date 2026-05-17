import type { FeedbackMessageRow } from '@/lib/feedback-messages'

export type MessageUser = {
  accountId: string
  username: string
  displayName: string
  profileIcon: string | null
}

export type DirectMessageRow = {
  id: string
  sender_account_id: string
  recipient_account_id: string
  message_text: string
  read_at: string | null
  created_at: string
}

export type DirectMessageView = {
  id: string
  senderAccountId: string
  recipientAccountId: string
  messageText: string
  readAt: string | null
  createdAt: string
  sender: MessageUser | null
  recipient: MessageUser | null
  isOutgoing: boolean
}

export type ConversationSummary = {
  participant: MessageUser
  lastMessage: string
  lastMessageAt: string
  unreadCount: number
}

export type MessagingPayload = {
  conversations: ConversationSummary[]
  activeConversation: {
    participant: MessageUser | null
    messages: DirectMessageView[]
  } | null
  systemMessages: FeedbackMessageRow[]
  unreadCount: number
}
