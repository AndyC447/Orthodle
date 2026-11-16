import 'server-only'
import { revalidateTag, unstable_cache } from 'next/cache'
import { getSupabaseAdmin } from './supabase-admin'
import { getExcludedStatsSessionIds } from './stats-exclusions'
import { analyticsDateISO } from './audience-stats'
import type { StreakLeader } from './streak-leaderboard'

type Leaderboard = {
  leaders: StreakLeader[]
  trackedPlayers: number
  longestStreak: number
  updatedAt: string
}

type PlayerStreakRow = { current_streak: number; longest: number }

const leaderboardTag = 'streak-leaderboard-aggregate-v1'
const pendingBoards = new Map<string, Promise<Leaderboard>>()
const reportingDay = () => analyticsDateISO(new Date().toISOString())!

const getExclusions = unstable_cache(getExcludedStatsSessionIds, ['streak-exclusions-v1'], {
  revalidate: 300,
})

async function loadLeaderboard(day: string): Promise<Leaderboard> {
  const { data, error } = await getSupabaseAdmin().rpc('orthodle_streak_snapshot', {
    reporting_day: day,
    excluded_ids: await getExclusions(),
  })
  if (error || !data) throw new Error('Could not load streak leaderboard.')
  return { ...data, updatedAt: new Date().toISOString() }
}

const readLeaderboard = unstable_cache(loadLeaderboard, [leaderboardTag], {
  tags: [leaderboardTag],
  revalidate: 300,
})

function sharedLeaderboard(day: string) {
  const pending = pendingBoards.get(day)
  if (pending) return pending
  const snapshot = readLeaderboard(day).finally(() => {
    if (pendingBoards.get(day) === snapshot) pendingBoards.delete(day)
  })
  pendingBoards.set(day, snapshot)
  return snapshot
}

export async function getStreakData(refresh = false) {
  const day = reportingDay()
  if (refresh) {
    revalidateTag(leaderboardTag, { expire: 0 })
    pendingBoards.delete(day)
  }
  return sharedLeaderboard(day)
}

export async function getPlayerStreakData(sessionId: string) {
  const day = reportingDay()
  // Personal badges update immediately; the shared top three only refresh periodically.
  const [player, ranking] = await Promise.all([
    getExclusions().then(excludedIds => getSupabaseAdmin().rpc('orthodle_streak_runs', {
      reporting_day: day,
      excluded_ids: excludedIds,
      player_id: sessionId,
    }).maybeSingle()),
    sharedLeaderboard(day).catch(() => null),
  ])
  if (player.error) throw new Error('Could not load player streak.')
  const streak = player.data as PlayerStreakRow | null
  const index = ranking?.leaders.slice(0, 3).findIndex(leader => leader.sessionId === sessionId) ?? -1
  return {
    current: streak?.current_streak ?? 0,
    longest: streak?.longest ?? 0,
    ...(ranking ? { topRank: index >= 0 ? index + 1 : null } : {}),
  }
}
