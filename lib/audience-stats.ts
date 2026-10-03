// Use one reporting day on the server and in any client-side calculations.
export const ANALYTICS_TIME_ZONE = 'America/Los_Angeles'
const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: ANALYTICS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
})

export function analyticsDateISO(timestamp: string) {
  const date = new Date(timestamp)
  if (!Number.isFinite(date.getTime())) return null
  const parts = dayFormatter.formatToParts(date)
  const value = (type: string) => parts.find(part => part.type === type)?.value
  return `${value('year')}-${value('month')}-${value('day')}`
}

export function calculateAudienceStats(
  rows: ReadonlyArray<{ session_id: string | null; created_at: string }>,
  excludedSessionIds: ReadonlySet<string> = new Set()
) {
  const uniqueUsers = new Set<string>()
  const sessionsByDate = new Map<string, Set<string>>()
  for (const row of rows) {
    if (!row.session_id || excludedSessionIds.has(row.session_id)) continue
    const day = analyticsDateISO(row.created_at)
    if (!day) continue
    uniqueUsers.add(row.session_id)
    const sessions = sessionsByDate.get(day) || new Set<string>()
    sessions.add(row.session_id)
    sessionsByDate.set(day, sessions)
  }
  return {
    uniqueUsers: uniqueUsers.size,
    // A returning browser contributes again on a different day, never twice in one day.
    combinedDailyUsers: [...sessionsByDate.values()].reduce((sum, sessions) => sum + sessions.size, 0),
  }
}

export type ArchiveGuess = {
  session_id: string | null
  case_id: string | null
  created_at: string
  cases?: { case_date: string | null } | { case_date: string | null }[] | null
}

export function isArchiveGuess(guess: ArchiveGuess) {
  const caseDate = Array.isArray(guess.cases) ? guess.cases[0]?.case_date : guess.cases?.case_date
  const playedDate = analyticsDateISO(guess.created_at)
  return Boolean(caseDate && playedDate && caseDate < playedDate)
}

export function countArchivePlays(guesses: ReadonlyArray<ArchiveGuess>) {
  return new Set(guesses.filter(guess => guess.session_id && guess.case_id && isArchiveGuess(guess))
    .map(guess => JSON.stringify([guess.session_id, guess.case_id]))).size
}
