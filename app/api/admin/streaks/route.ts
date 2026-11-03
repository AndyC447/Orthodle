import { NextResponse } from 'next/server'
import { isAdminPassword } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { fetchAdminPages } from '@/lib/admin-dashboard'
import { getExcludedStatsSessionIds } from '@/lib/stats-exclusions'
import { analyticsDateISO } from '@/lib/audience-stats'
import { buildStreakLeaderboard, type StreakCase, type StreakGuess, type StreakIdentity } from '@/lib/streak-leaderboard'

let cached: { day: string; at: number; result: ReturnType<typeof buildStreakLeaderboard> & { updatedAt: string } } | null = null
let pending: Promise<NonNullable<typeof cached>> | null = null

async function loadLeaderboard(day: string) {
  const db = getSupabaseAdmin()
  const [guesses, cases, accounts, members, excluded, publication] = await Promise.all([
    fetchAdminPages<StreakGuess>((from, to) => db.from('guesses').select('session_id, case_id, is_correct, created_at').eq('is_correct', true).order('id').range(from, to), 1000),
    fetchAdminPages<StreakCase>((from, to) => db.from('cases').select('id, case_date, level').gte('case_date', '2026-04-27').lte('case_date', day).order('id').range(from, to), 1000),
    fetchAdminPages<StreakIdentity>((from, to) => db.from('user_accounts').select('id, username, display_name').order('id').range(from, to), 1000),
    fetchAdminPages<{ session_id: string; display_name: string | null }>((from, to) => db.from('group_members').select('session_id, display_name').order('created_at', { ascending: false }).order('id').range(from, to), 1000),
    getExcludedStatsSessionIds(),
    db.from('play_mode_settings').select('*').eq('id', 'default').maybeSingle(),
  ])
  if (publication.error) throw new Error('Could not load case publishing settings.')
  return { day, at: Date.now(), result: { ...buildStreakLeaderboard(guesses, cases, accounts, members, new Set(excluded), publication.data, day), updatedAt: new Date().toISOString() } }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const headers = { 'Cache-Control': 'private, no-store' }
  if (!isAdminPassword(body?.password)) return NextResponse.json({ error: 'Admin access required.' }, { status: 401, headers })
  try {
    const day = analyticsDateISO(new Date().toISOString())!
    if (!cached || cached.day !== day || Date.now() - cached.at >= 60_000 || body?.refresh === true) {
      if (!pending) pending = loadLeaderboard(day).finally(() => { pending = null })
      cached = await pending
    }
    return NextResponse.json(cached.result, { headers })
  } catch {
    return NextResponse.json({ error: 'Could not load streaks. Please try again.' }, { status: 500, headers })
  }
}
