import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import {
  DEFAULT_REMINDER_MODE,
  DEFAULT_REMINDER_TIME,
  PACIFIC_TIMEZONE,
  normalizeScheduledReminderMinutes,
} from '@/lib/reminders'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  }
  if (!process.env.RESEND_API_KEY || !process.env.REMINDER_FROM_EMAIL || !process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: 'Daily emails aren’t available right now. Please try again later.' },
      { status: 503 }
    )
  }

  const sourcePath =
    typeof body.sourcePath === 'string' && /^\/(?!\/)[\w/-]{0,119}$/.test(body.sourcePath)
      ? body.sourcePath
      : '/'

  try {
    const supabaseAdmin = getSupabaseAdmin()
    const { error: insertError } = await supabaseAdmin
      .from('email_reminders')
      .upsert({
        email,
        active: true,
        timezone: PACIFIC_TIMEZONE,
        source_path: sourcePath,
        reminder_mode: DEFAULT_REMINDER_MODE,
        scheduled_time_minutes: normalizeScheduledReminderMinutes(DEFAULT_REMINDER_TIME),
        unsubscribe_token: crypto.randomUUID(),
      }, { onConflict: 'email', ignoreDuplicates: true })
    if (insertError) throw insertError

    const { error: updateError } = await supabaseAdmin
      .from('email_reminders')
      .update({ active: true, source_path: sourcePath, updated_at: new Date().toISOString() })
      .eq('email', email)
      .eq('active', false)
    if (updateError) throw updateError

    return NextResponse.json({
      success: true,
      message: 'You’re signed up for one daily Orthodle reminder email.',
    })
  } catch {
    return NextResponse.json(
      { error: 'Could not save your reminder right now.' },
      { status: 500 }
    )
  }
}
