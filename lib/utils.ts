export function todayISO() {
  const now = new Date()
  const timezoneOffsetMs = now.getTimezoneOffset() * 60 * 1000

  return new Date(now.getTime() - timezoneOffsetMs).toISOString().slice(0, 10)
}

export function normalizeAnswer(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
}

export function getSessionId() {
  if (typeof window === 'undefined') return ''
  const key = 'orthodle_session_id'
  let id = localStorage.getItem(key)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(key, id)
  }
  return id
}

export type StatsLevel = 'med_student' | 'resident' | 'attending'

export type StoredGameResult = {
  key: string
  caseDate: string
  level: StatsLevel
  won: boolean
  guessesUsed: number
  answer: string
  category: string
  completedAt: string
}

export type StatsSummary = {
  gamesPlayed: number
  wins: number
  losses: number
  winRate: number
  currentStreak: number
  longestStreak: number
  averageGuessesInWins: number | null
  guessDistribution: Record<number, number>
  today: {
    date: string
    played: number
    wins: number
    losses: number
    levelsSolved: number
    averageGuesses: number | null
    levels: Array<{
      level: StatsLevel
      won: boolean
      guessesUsed: number
      answer: string
      category: string
    }>
  }
  recentDays: Array<{
    date: string
    played: number
    wins: number
    losses: number
    averageGuesses: number | null
    levels: Array<{
      level: StatsLevel
      won: boolean
      guessesUsed: number
      answer: string
      category: string
    }>
  }>
}

const STATS_STORAGE_KEY = 'orthodle_stats_v1'

function getStoredResults() {
  if (typeof window === 'undefined') return [] as StoredGameResult[]

  try {
    const raw = window.localStorage.getItem(STATS_STORAGE_KEY)
    if (!raw) return [] as StoredGameResult[]

    const parsed = JSON.parse(raw) as { results?: StoredGameResult[] }
    return Array.isArray(parsed.results) ? parsed.results : ([] as StoredGameResult[])
  } catch {
    return [] as StoredGameResult[]
  }
}

function setStoredResults(results: StoredGameResult[]) {
  if (typeof window === 'undefined') return

  window.localStorage.setItem(
    STATS_STORAGE_KEY,
    JSON.stringify({
      results: [...results].sort((a, b) => {
        if (a.caseDate !== b.caseDate) return b.caseDate.localeCompare(a.caseDate)
        if (a.completedAt !== b.completedAt) return b.completedAt.localeCompare(a.completedAt)
        return a.level.localeCompare(b.level)
      }),
    })
  )
}

export function clearStatsSummary() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(STATS_STORAGE_KEY)
}

export function getStatsLevelLabel(level: StatsLevel) {
  if (level === 'med_student') return 'Med Student'
  if (level === 'resident') return 'Resident'
  return 'Attending'
}

export function recordGameResult(result: Omit<StoredGameResult, 'key' | 'completedAt'>) {
  const results = getStoredResults()
  const key = `${result.caseDate}:${result.level}`
  const existing = results.find(entry => entry.key === key)

  const nextEntry: StoredGameResult = {
    ...result,
    key,
    completedAt: new Date().toISOString(),
  }

  if (!existing) {
    setStoredResults([...results, nextEntry])
    return
  }

  const shouldReplace =
    (nextEntry.won && !existing.won) ||
    (nextEntry.won === existing.won && nextEntry.guessesUsed <= existing.guessesUsed)

  if (!shouldReplace) return

  setStoredResults(results.map(entry => (entry.key === key ? nextEntry : entry)))
}

export function getStatsSummary(): StatsSummary {
  const results = getStoredResults()
  const wins = results.filter(result => result.won)
  const guessDistribution: Record<number, number> = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
    6: 0,
  }

  for (const result of wins) {
    if (guessDistribution[result.guessesUsed] !== undefined) {
      guessDistribution[result.guessesUsed] += 1
    }
  }

  const byDay = new Map<
    string,
    {
      date: string
      played: number
      wins: number
      losses: number
      averageGuesses: number | null
      levels: Array<{
        level: StatsLevel
        won: boolean
        guessesUsed: number
        answer: string
        category: string
      }>
    }
  >()

  for (const result of results) {
    const existing = byDay.get(result.caseDate)

    if (existing) {
      existing.played += 1
      existing.wins += result.won ? 1 : 0
      existing.losses += result.won ? 0 : 1
      existing.levels.push({
        level: result.level,
        won: result.won,
        guessesUsed: result.guessesUsed,
        answer: result.answer,
        category: result.category,
      })
      continue
    }

    byDay.set(result.caseDate, {
      date: result.caseDate,
      played: 1,
      wins: result.won ? 1 : 0,
      losses: result.won ? 0 : 1,
      averageGuesses: null,
      levels: [
        {
          level: result.level,
          won: result.won,
          guessesUsed: result.guessesUsed,
          answer: result.answer,
          category: result.category,
        },
      ],
    })
  }

  const recentDays = Array.from(byDay.values())
    .map(day => {
      const totalGuesses = day.levels.reduce((sum, level) => sum + level.guessesUsed, 0)

      return {
        ...day,
        averageGuesses: day.played > 0 ? totalGuesses / day.played : null,
        levels: [...day.levels].sort((a, b) => a.level.localeCompare(b.level)),
      }
    })
    .sort((a, b) => b.date.localeCompare(a.date))

  const winningDays = Array.from(new Set(wins.map(result => result.caseDate))).sort((a, b) =>
    b.localeCompare(a)
  )

  let longestStreak = 0
  let runningStreak = 0

  for (let i = 0; i < winningDays.length; i += 1) {
    if (i === 0) {
      runningStreak = 1
      longestStreak = 1
      continue
    }

    const newer = new Date(`${winningDays[i - 1]}T00:00:00`)
    const older = new Date(`${winningDays[i]}T00:00:00`)
    const diffDays = Math.round((newer.getTime() - older.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays === 1) {
      runningStreak += 1
      longestStreak = Math.max(longestStreak, runningStreak)
    } else {
      runningStreak = 1
    }
  }

  let currentStreak = 0

  if (winningDays[0] === todayISO()) {
    currentStreak = 1

    for (let i = 1; i < winningDays.length; i += 1) {
      const newer = new Date(`${winningDays[i - 1]}T00:00:00`)
      const older = new Date(`${winningDays[i]}T00:00:00`)
      const diffDays = Math.round((newer.getTime() - older.getTime()) / (1000 * 60 * 60 * 24))

      if (diffDays === 1) {
        currentStreak += 1
      } else {
        break
      }
    }
  }

  const today =
    recentDays.find(day => day.date === todayISO()) || {
      date: todayISO(),
      played: 0,
      wins: 0,
      losses: 0,
      averageGuesses: null,
      levels: [],
    }

  return {
    gamesPlayed: results.length,
    wins: wins.length,
    losses: results.length - wins.length,
    winRate: results.length > 0 ? (wins.length / results.length) * 100 : 0,
    currentStreak,
    longestStreak,
    averageGuessesInWins:
      wins.length > 0
        ? wins.reduce((sum, result) => sum + result.guessesUsed, 0) / wins.length
        : null,
    guessDistribution,
    today: {
      ...today,
      levelsSolved: today.wins,
    },
    recentDays: recentDays.slice(0, 10),
  }
}
