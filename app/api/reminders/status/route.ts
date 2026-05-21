import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
  const resendApiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.REMINDER_FROM_EMAIL
  const cronSecret = process.env.CRON_SECRET
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL

  const missingConfig: string[] = []
  if (!resendApiKey) missingConfig.push('RESEND_API_KEY')
  if (!fromEmail) missingConfig.push('REMINDER_FROM_EMAIL')
  if (!cronSecret) missingConfig.push('CRON_SECRET')
  if (!siteUrl) missingConfig.push('NEXT_PUBLIC_SITE_URL')

  try {
    const supabaseAdmin = getSupabaseAdmin()
    const [{ count: activeCount, error: activeError }, { count: totalCount, error: totalError }] =
      await Promise.all([
        supabaseAdmin
          .from('email_reminders')
          .select('*', { count: 'exact', head: true })
          .eq('active', true),
        supabaseAdmin
          .from('email_reminders')
          .select('*', { count: 'exact', head: true }),
      ])

    if (activeError || totalError) {
      return NextResponse.json(
        { error: 'Could not load reminder status.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      activeSubscribers: activeCount || 0,
      totalSubscribers: totalCount || 0,
      isConfigured: missingConfig.length === 0,
      missingConfig,
      fromEmail: fromEmail || null,
      siteUrl: siteUrl || 'https://orthodle.com',
      cronSecretPresent: Boolean(cronSecret),
    })
  } catch (error) {
    if (error instanceof Error && error.message.includes('Missing Supabase admin environment variables')) {
      return NextResponse.json(
        {
          error: 'Reminder setup is incomplete. Add SUPABASE_SERVICE_ROLE_KEY to your environment variables.',
          isConfigured: false,
          missingConfig,
        },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { error: 'Could not load reminder status.' },
      { status: 500 }
    )
  }
}
