export type FeedbackMessageRow = {
  id: string
  feedback_id: string | null
  recipient_session_id: string
  sender_role: 'admin' | 'player' | string
  case_date: string | null
  level: 'med_student' | 'resident' | 'attending' | null
  answer: string | null
  message_text: string
  is_read: boolean
  read_at: string | null
  created_at: string
}

export function formatFeedbackLevel(level: FeedbackMessageRow['level']) {
  if (level === 'med_student') return 'Med Student'
  if (level === 'resident') return 'Resident'
  if (level === 'attending') return 'Anatomy'
  return 'Unknown'
}
