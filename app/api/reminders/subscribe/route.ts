import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import {
  DEFAULT_REMINDER_MODE,
  formatReminderMinutes,
  normalizeReminderMode,
  normalizeScheduledReminderMinutes,
} from '@/lib/reminders'

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const email = normalizeEmail(body.email || '')
    const reminderMode = normalizeReminderMode(body.reminderMode)
    const reminderMinutes = normalizeScheduledReminderMinutes(body.reminderTime)

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: 'Enter a valid email address.' },
        { status: 400 }
      )
    }

    const supabaseAdmin = getSupabaseAdmin()
    const { data: existing } = await supabaseAdmin
      .from('email_reminders')
      .select('id, unsubscribe_token')
      .eq('email', email)
      .maybeSingle()

    if (existing?.id) {
      const { error: updateError } = await supabaseAdmin
        .from('email_reminders')
        .update({
          active: true,
          timezone: body.timezone || null,
          source_path: body.sourcePath || '/',
          reminder_mode: reminderMode,
          scheduled_time_minutes: reminderMinutes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)

      if (updateError) {
        return NextResponse.json(
          { error: 'Could not save your reminder right now.' },
          { status: 500 }
        )
      }
    } else {
      const { error: insertError } = await supabaseAdmin.from('email_reminders').insert({
        email,
        active: true,
        timezone: body.timezone || null,
        source_path: body.sourcePath || '/',
        reminder_mode: reminderMode,
        scheduled_time_minutes: reminderMinutes,
        unsubscribe_token: crypto.randomUUID(),
        updated_at: new Date().toISOString(),
      })

      if (insertError) {
        return NextResponse.json(
          { error: 'Could not save your reminder right now.' },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({
      success: true,
      message:
        reminderMode === DEFAULT_REMINDER_MODE
          ? 'You’re signed up for an email as soon as the new cases go live.'
          : `You’re signed up for a daily reminder at ${formatReminderMinutes(reminderMinutes)} Pacific.`,
    })
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('Missing Supabase admin environment variables')) {
        return NextResponse.json(
          { error: 'Reminder setup is incomplete. Add SUPABASE_SERVICE_ROLE_KEY to your environment variables.' },
          { status: 500 }
        )
      }
    }

    return NextResponse.json(
      { error: 'Could not save your reminder right now.' },
      { status: 500 }
    )
  }
}
