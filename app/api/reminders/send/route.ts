import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { buildReminderEmail } from '@/lib/reminder-email'

type ReminderRow = {
  id: string
  email: string
  unsubscribe_token: string
  active: boolean
  last_sent_on: string | null
  sent_count: number | null
}

function getTodayPacificISO() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())

  const year = parts.find(part => part.type === 'year')?.value
  const month = parts.find(part => part.type === 'month')?.value
  const day = parts.find(part => part.type === 'day')?.value

  return `${year}-${month}-${day}`
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronHeader = request.headers.get('x-vercel-cron')
  const secret = process.env.CRON_SECRET

  if (!cronHeader && (!secret || authHeader !== `Bearer ${secret}`)) {
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
  const today = getTodayPacificISO()

  const { data, error } = await supabaseAdmin
    .from('email_reminders')
    .select('id, email, unsubscribe_token, active, last_sent_on, sent_count')
    .eq('active', true)

  if (error) {
    return NextResponse.json({ error: 'Could not load reminders.' }, { status: 500 })
  }

  const dueReminders = ((data || []) as ReminderRow[]).filter(
    item => item.active && item.last_sent_on !== today
  )

  let sent = 0

  for (const reminder of dueReminders) {
    const unsubscribeUrl = `${siteUrl}/api/reminders/unsubscribe?token=${reminder.unsubscribe_token}`
    const content = buildReminderEmail(siteUrl, unsubscribeUrl)

    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
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
