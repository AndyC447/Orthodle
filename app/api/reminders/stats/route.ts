import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
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
        { error: 'Could not load reminder stats.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      activeSubscribers: activeCount || 0,
      totalSubscribers: totalCount || 0,
    })
  } catch {
    return NextResponse.json(
      { error: 'Could not load reminder stats.' },
      { status: 500 }
    )
  }
}
