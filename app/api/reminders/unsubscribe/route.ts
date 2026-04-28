import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')?.trim()

  if (!token) {
    return NextResponse.redirect(new URL('/unsubscribe?status=missing', request.url))
  }

  const supabaseAdmin = getSupabaseAdmin()
  const { error } = await supabaseAdmin
    .from('email_reminders')
    .update({
      active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('unsubscribe_token', token)

  if (error) {
    return NextResponse.redirect(new URL('/unsubscribe?status=error', request.url))
  }

  return NextResponse.redirect(new URL('/unsubscribe?status=success', request.url))
}
