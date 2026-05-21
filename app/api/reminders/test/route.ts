import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { buildReminderEmail } from '@/lib/reminder-email'

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

const SURGICAL_ANATOMY_LAUNCH_DATE = '2026-05-14'

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

function getPreviewLabel(level: 'med_student' | 'resident' | 'attending', caseDate: string) {
  if (level === 'med_student') return 'Daily Case'
  if (level === 'resident') return 'Resident'
  return caseDate >= SURGICAL_ANATOMY_LAUNCH_DATE ? 'Anatomy Quiz' : 'Attending'
}

async function loadReminderPreviewCases() {
  const supabaseAdmin = getSupabaseAdmin()
  const today = getTodayPacificISO()
  const { data, error } = await supabaseAdmin
    .from('cases')
    .select('level, case_date, category')
    .eq('case_date', today)
    .order('level', { ascending: true })

  if (error || !data) return []

  const order = { med_student: 0, resident: 1, attending: 2 } as const

  return [...data]
    .sort((a, b) => order[a.level as keyof typeof order] - order[b.level as keyof typeof order])
    .map(item => ({
      label: getPreviewLabel(item.level as 'med_student' | 'resident' | 'attending', item.case_date),
      title: item.category?.trim() || 'Case ready',
    }))
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const adminPassword = process.env.ADMIN_PASSWORD || 'Pibbles'
    const email = normalizeEmail(body.email || '')
    const resendApiKey = process.env.RESEND_API_KEY
    const fromEmail = process.env.REMINDER_FROM_EMAIL
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://orthodle.com'

    if (body.password !== adminPassword) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

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
    const previewCases = await loadReminderPreviewCases()
    const content = buildReminderEmail(siteUrl, unsubscribeUrl, previewCases)

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
