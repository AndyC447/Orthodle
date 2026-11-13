import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { buildReminderEmail } from '@/lib/reminder-email'
import { loadDailyReminderCategory } from '@/lib/reminder-case'
import {
  getDatePartsForTimezone,
  getPacificDateParts,
  isReminderDueToday,
  normalizeReminderMode,
  normalizeReminderTimezone,
  type ReminderMode,
} from '@/lib/reminders'

type ReminderRow = {
  id: string
  email: string
  unsubscribe_token: string
  active: boolean
  last_sent_on: string | null
  sent_count: number | null
  reminder_mode: ReminderMode | null
  scheduled_time_minutes: number | null
  timezone: string | null
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const secret = process.env.CRON_SECRET

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const resendApiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.REMINDER_FROM_EMAIL
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://orthodle.com'

  if (!resendApiKey || !fromEmail) {
    return NextResponse.json(
      { error: 'Missing reminder email configuration.' },
      { status: 500 }
    )
  }

  const supabaseAdmin = getSupabaseAdmin()
  const { isoDate: today, minutesIntoDay } = getPacificDateParts()

  const { data, error } = await supabaseAdmin
    .from('email_reminders')
    .select(
      'id, email, unsubscribe_token, active, last_sent_on, sent_count, reminder_mode, scheduled_time_minutes, timezone'
    )
    .eq('active', true)

  if (error) {
    return NextResponse.json({ error: 'Could not load reminders.' }, { status: 500 })
  }

  const dueReminders = ((data || []) as ReminderRow[]).filter(
    item => {
      if (!item.active || item.last_sent_on === today) return false
      const reminderMode = normalizeReminderMode(item.reminder_mode)
      if (reminderMode === 'instant') {
        return isReminderDueToday(reminderMode, item.scheduled_time_minutes, minutesIntoDay)
      }
      const timezone = normalizeReminderTimezone(item.timezone)
      const localMinutes = getDatePartsForTimezone(timezone).minutesIntoDay
      return isReminderDueToday(reminderMode, item.scheduled_time_minutes, localMinutes)
    }
  )

  let sent = 0
  const category = dueReminders.length ? await loadDailyReminderCategory(today) : null

  for (const reminder of dueReminders) {
    const unsubscribeUrl = `${siteUrl}/api/reminders/unsubscribe?token=${reminder.unsubscribe_token}`
    const content = buildReminderEmail(siteUrl, unsubscribeUrl, category)

    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `daily-reminder/${today}/${reminder.id}`,
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [reminder.email],
        subject: content.subject,
        html: content.html,
      }),
    })

    if (!emailResponse.ok) continue

    const { error: updateError } = await supabaseAdmin
      .from('email_reminders')
      .update({
        last_sent_at: new Date().toISOString(),
        last_sent_on: today,
        sent_count: (reminder.sent_count || 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', reminder.id)

    if (!updateError) {
      sent += 1
    }
  }

  return NextResponse.json({
    success: true,
    sent,
    due: dueReminders.length,
  })
}
