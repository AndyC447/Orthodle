import { analyticsDateISO } from './audience-stats'
import { isPublicArchiveCase, type ArchivePublicationSettings } from './archive-publication'

export type StreakGuess = { session_id: string | null; case_id: string | null; is_correct: boolean | null; created_at: string }
export type StreakCase = { id: string; case_date: string; level: string }
export type StreakIdentity = { id: string; display_name: string | null; username: string | null }
export type StreakLeader = {
  sessionId: string
  name: string
  username: string | null
  anonymous: boolean
  longest: number
  current: number
  bestStart: string
  bestEnd: string
  lastSolved: string
}

const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86_400_000

export function buildStreakLeaderboard(
  guesses: StreakGuess[], cases: StreakCase[], accounts: StreakIdentity[],
  memberNames: Array<{ session_id: string; display_name: string | null }>,
  excluded: ReadonlySet<string>, settings: ArchivePublicationSettings | null, today: string, limit = 10
) {
  const published = new Map(cases.filter(item => item.case_date >= '2026-04-27' && item.case_date <= today && isPublicArchiveCase(item, settings, true)).map(item => [item.id, item]))
  const players = new Map<string, Set<string>>()
  for (const guess of guesses) {
    const id = guess.session_id?.trim()
    if (!id || excluded.has(id) || guess.is_correct !== true) continue
    const item = guess.case_id ? published.get(guess.case_id) : null
    if (!item || analyticsDateISO(guess.created_at) !== item.case_date) continue
    const days = players.get(id) || new Set<string>()
    days.add(item.case_date)
    players.set(id, days)
  }
  const identities = new Map(accounts.map(account => [account.id, account]))
  const names = new Map<string, string>()
  for (const member of memberNames) {
    if (!names.has(member.session_id) && member.display_name?.trim()) names.set(member.session_id, member.display_name.trim())
  }
  const rankings: StreakLeader[] = []
  for (const [sessionId, wonDates] of players) {
    const dates = [...wonDates].sort()
    let run = 0, longest = 0, start = dates[0], bestStart = dates[0], bestEnd = dates[0]
    dates.forEach((date, index) => {
      if (index > 0 && dayNumber(date) - dayNumber(dates[index - 1]) === 1) run++
      else { run = 1; start = date }
      if (run >= longest) { longest = run; bestStart = start; bestEnd = date }
    })
    const lastSolved = dates[dates.length - 1]
    const age = dayNumber(today) - dayNumber(lastSolved)
    const account = identities.get(sessionId)
    const username = account?.username?.trim() || null
    const displayName = account?.display_name?.trim() || username || names.get(sessionId)
    rankings.push({
      sessionId, name: displayName || `Anonymous · ${sessionId.slice(-8)}`,
      username, anonymous: !displayName, longest,
      current: age >= 0 && age <= 1 ? run : 0,
      bestStart, bestEnd, lastSolved,
    })
  }
  rankings.sort((a, b) => b.longest - a.longest || b.current - a.current || b.lastSolved.localeCompare(a.lastSolved) || a.sessionId.localeCompare(b.sessionId))
  return { leaders: rankings.slice(0, limit), trackedPlayers: rankings.length, longestStreak: rankings[0]?.longest || 0 }
}
