import 'server-only'
import { getSupabaseAdmin } from './supabase-admin'
import { fetchAdminPages } from './admin-dashboard'
import { getExcludedStatsSessionIds } from './stats-exclusions'
import { analyticsDateISO } from './audience-stats'
import { buildStreakLeaderboard, type StreakCase, type StreakGuess, type StreakIdentity } from './streak-leaderboard'

let cached: { day: string; at: number; result: ReturnType<typeof buildStreakLeaderboard> & { updatedAt: string } } | null = null
let pending: { version: number; day: string; promise: Promise<NonNullable<typeof cached>> } | null = null
let version = 0

export function invalidateStreakData() {
  version++
  cached = null
}

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
  return { day, at: Date.now(), result: { ...buildStreakLeaderboard(guesses, cases, accounts, members, new Set(excluded), publication.data, day, Infinity), updatedAt: new Date().toISOString() } }
}

export async function getStreakData(refresh = false) {
  const day = analyticsDateISO(new Date().toISOString())!
  if (refresh) invalidateStreakData()
  if (cached?.day === day && Date.now() - cached.at < 60_000) return cached.result
  if (!pending || pending.version !== version || pending.day !== day) {
    const requestVersion = version
    const promise = loadLeaderboard(day).then(result => {
      if (version === requestVersion) cached = result
      return result
    }).finally(() => { if (pending?.promise === promise) pending = null })
    pending = { version: requestVersion, day, promise }
  }
  return (await pending.promise).result
}
