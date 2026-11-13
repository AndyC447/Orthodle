import { NextResponse } from 'next/server'
import { isAdminPassword } from '@/lib/admin-auth'
import { buildReminderEmail } from '@/lib/reminder-email'
import { loadDailyReminderCategory } from '@/lib/reminder-case'
import { getPacificDateParts } from '@/lib/reminders'

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const resendApiKey = process.env.RESEND_API_KEY
    const fromEmail = process.env.REMINDER_FROM_EMAIL
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://orthodle.com'

    if (!process.env.ADMIN_PASSWORD || !isAdminPassword(body?.password)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const email = typeof body.email === 'string' ? normalizeEmail(body.email) : ''
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: 'Enter a valid test email address.' }, { status: 400 })
    }

    if (!resendApiKey || !fromEmail) {
      return NextResponse.json(
        { error: 'Missing reminder email configuration.' },
        { status: 500 }
      )
    }

    const unsubscribeUrl = `${siteUrl}/unsubscribe?status=success`
    const category = await loadDailyReminderCategory(getPacificDateParts().isoDate)
    const content = buildReminderEmail(siteUrl, unsubscribeUrl, category)

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [email],
        subject: `[Test] ${content.subject}`,
        html: content.html,
      }),
    })

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Could not send the test reminder email.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: `Test reminder sent to ${email}.`,
    })
  } catch {
    return NextResponse.json(
      { error: 'Could not send the test reminder email.' },
      { status: 500 }
    )
  }
}
