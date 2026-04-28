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

function levenshteinDistance(a: string, b: string) {
  const rows = a.length + 1
  const cols = b.length + 1
  const matrix = Array.from({ length: rows }, () => Array<number>(cols).fill(0))

  for (let i = 0; i < rows; i += 1) matrix[i][0] = i
  for (let j = 0; j < cols; j += 1) matrix[0][j] = j

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      )
    }
  }

  return matrix[a.length][b.length]
}

function buildInitialism(value: string) {
  return value
    .split(' ')
    .filter(Boolean)
    .map(word => word[0])
    .join('')
}

export function isAcceptedGuess(guess: string, acceptedAnswers: string[]) {
  const normalizedGuess = normalizeAnswer(guess)
  if (!normalizedGuess) return false

  const normalizedAccepted = acceptedAnswers.map(normalizeAnswer).filter(Boolean)

  if (normalizedAccepted.includes(normalizedGuess)) {
    return true
  }

  for (const accepted of normalizedAccepted) {
    if (buildInitialism(accepted) === normalizedGuess) {
      return true
    }

    if (
      accepted.length >= 8 &&
      normalizedGuess.length >= 8 &&
      levenshteinDistance(normalizedGuess, accepted) <= 1
    ) {
      return true
    }
  }

  return false
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
  isArchive: boolean
  won: boolean
  guessesUsed: number
  answer: string
  category: string
  completedAt: string
}

export type StoredRoundProgress = {
  key: string
  caseId: string
  caseDate: string
  level: StatsLevel
  isArchive: boolean
  guesses: Array<{
    text: string
    correct: boolean
  }>
  gameWon: boolean
  gameOver: boolean
  message: string
  updatedAt: string
}

export type StatsSummary = {
  gamesPlayed: number
  archiveGamesPlayed: number
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
  byLevel: Array<{
    level: StatsLevel
    played: number
    wins: number
    winRate: number
    averageGuesses: number | null
  }>
  byCategory: Array<{
    category: string
    played: number
    wins: number
    winRate: number
    averageGuesses: number | null
  }>
}

const STATS_STORAGE_KEY = 'orthodle_stats_v1'
const ROUND_PROGRESS_STORAGE_KEY = 'orthodle_round_progress_v1'

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

function getStoredRoundProgress() {
  if (typeof window === 'undefined') return [] as StoredRoundProgress[]

  try {
    const raw = window.localStorage.getItem(ROUND_PROGRESS_STORAGE_KEY)
    if (!raw) return [] as StoredRoundProgress[]

    const parsed = JSON.parse(raw) as { rounds?: StoredRoundProgress[] }
    return Array.isArray(parsed.rounds) ? parsed.rounds : ([] as StoredRoundProgress[])
  } catch {
    return [] as StoredRoundProgress[]
  }
}

function setStoredRoundProgress(rounds: StoredRoundProgress[]) {
  if (typeof window === 'undefined') return

  window.localStorage.setItem(
    ROUND_PROGRESS_STORAGE_KEY,
    JSON.stringify({
      rounds: [...rounds].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 60),
    })
  )
}

export function clearStatsSummary() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(STATS_STORAGE_KEY)
  window.localStorage.removeItem(ROUND_PROGRESS_STORAGE_KEY)
}

export function getStatsLevelLabel(level: StatsLevel) {
  if (level === 'med_student') return 'Med Student'
  if (level === 'resident') return 'Resident'
  return 'Attending'
}

export function recordGameResult(result: Omit<StoredGameResult, 'key' | 'completedAt'>) {
  const results = getStoredResults()
  const key = `${result.caseDate}:${result.level}:${result.isArchive ? 'archive' : 'daily'}`
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

export function saveRoundProgress(progress: Omit<StoredRoundProgress, 'key' | 'updatedAt'>) {
  const rounds = getStoredRoundProgress()
  const key = `${progress.caseDate}:${progress.level}:${progress.isArchive ? 'archive' : 'daily'}`

  const nextEntry: StoredRoundProgress = {
    ...progress,
    key,
    updatedAt: new Date().toISOString(),
  }

  const existing = rounds.find(entry => entry.key === key)

  if (!existing) {
    setStoredRoundProgress([...rounds, nextEntry])
    return
  }

  setStoredRoundProgress(rounds.map(entry => (entry.key === key ? nextEntry : entry)))
}

export function getRoundProgress(
  caseDate: string,
  level: StatsLevel,
  isArchive: boolean
) {
  const key = `${caseDate}:${level}:${isArchive ? 'archive' : 'daily'}`
  return getStoredRoundProgress().find(entry => entry.key === key) || null
}

export function getStatsSummary(): StatsSummary {
  const results = getStoredResults()
  const dailyResults = results.filter(result => !result.isArchive)
  const archiveResults = results.filter(result => result.isArchive)
  const wins = dailyResults.filter(result => result.won)
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
  const byLevel = new Map<
    StatsLevel,
    {
      level: StatsLevel
      played: number
      wins: number
      totalGuesses: number
    }
  >()
  const byCategory = new Map<
    string,
    {
      category: string
      played: number
      wins: number
      totalGuesses: number
    }
  >()

  for (const result of dailyResults) {
    const existing = byDay.get(result.caseDate)
    const levelEntry = byLevel.get(result.level)
    const categoryKey = result.category || 'Uncategorized'
    const categoryEntry = byCategory.get(categoryKey)

    if (levelEntry) {
      levelEntry.played += 1
      levelEntry.wins += result.won ? 1 : 0
      levelEntry.totalGuesses += result.guessesUsed
    } else {
      byLevel.set(result.level, {
        level: result.level,
        played: 1,
        wins: result.won ? 1 : 0,
        totalGuesses: result.guessesUsed,
      })
    }

    if (categoryEntry) {
      categoryEntry.played += 1
      categoryEntry.wins += result.won ? 1 : 0
      categoryEntry.totalGuesses += result.guessesUsed
    } else {
      byCategory.set(categoryKey, {
        category: categoryKey,
        played: 1,
        wins: result.won ? 1 : 0,
        totalGuesses: result.guessesUsed,
      })
    }

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

  const levelOrder: StatsLevel[] = ['med_student', 'resident', 'attending']

  return {
    gamesPlayed: dailyResults.length,
    archiveGamesPlayed: archiveResults.length,
    wins: wins.length,
    losses: dailyResults.length - wins.length,
    winRate: dailyResults.length > 0 ? (wins.length / dailyResults.length) * 100 : 0,
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
    byLevel: levelOrder.map(level => {
      const item = byLevel.get(level)

      return {
        level,
        played: item?.played || 0,
        wins: item?.wins || 0,
        winRate: item && item.played > 0 ? (item.wins / item.played) * 100 : 0,
        averageGuesses:
          item && item.played > 0 ? item.totalGuesses / item.played : null,
      }
    }),
    byCategory: Array.from(byCategory.values())
      .map(item => ({
        category: item.category,
        played: item.played,
        wins: item.wins,
        winRate: item.played > 0 ? (item.wins / item.played) * 100 : 0,
        averageGuesses: item.played > 0 ? item.totalGuesses / item.played : null,
      }))
      .sort((a, b) => {
        if (b.played !== a.played) return b.played - a.played
        return a.category.localeCompare(b.category)
      })
      .slice(0, 6),
  }
}
