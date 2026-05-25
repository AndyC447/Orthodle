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

export const HIDDEN_DIAGNOSIS_STORAGE_KEY = 'orthodle_hidden_diagnosis_answers_v1'

export function readHiddenDiagnosisAnswers() {
  if (typeof window === 'undefined') return new Set<string>()

  try {
    const raw = window.localStorage.getItem(HIDDEN_DIAGNOSIS_STORAGE_KEY)
    if (!raw) return new Set<string>()
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set<string>()
    return new Set(
      parsed
        .map(item => (typeof item === 'string' ? normalizeAnswer(item) : ''))
        .filter(Boolean)
    )
  } catch {
    return new Set<string>()
  }
}

export function writeHiddenDiagnosisAnswers(values: Iterable<string>) {
  if (typeof window === 'undefined') return

  const normalized = Array.from(
    new Set(Array.from(values).map(value => normalizeAnswer(value)).filter(Boolean))
  ).sort()

  window.localStorage.setItem(HIDDEN_DIAGNOSIS_STORAGE_KEY, JSON.stringify(normalized))
}

export const ORTHO_DIAGNOSIS_BANK = [
  'Achilles tendon rupture',
  'Achilles tendinopathy',
  'Acromioclavicular joint separation',
  'Adhesive capsulitis',
  'Ankle sprain',
  'Anterior cruciate ligament tear',
  'Avascular necrosis of the femoral head',
  'Bankart lesion',
  'Biceps tendon rupture',
  'Biceps tendinopathy',
  'Boxer fracture',
  'Calcaneus fracture',
  'Carpal tunnel syndrome',
  'Cervical radiculopathy',
  'Clavicle fracture',
  'Cubital tunnel syndrome',
  'De Quervain tenosynovitis',
  'Developmental dysplasia of the hip',
  'Distal biceps tendon rupture',
  'Distal radius fracture',
  'Dupuytren contracture',
  'Femoroacetabular impingement',
  'Frozen shoulder',
  'Ganglion cyst',
  'Gluteus medius tear',
  'Hamate fracture',
  'Hamstring strain',
  'Hip labral tear',
  'Iliotibial band syndrome',
  'Jersey finger',
  'Lateral epicondylitis',
  'Lisfranc injury',
  'Little league elbow',
  'Little league shoulder',
  'Lumbar disc herniation',
  'Lumbar spinal stenosis',
  'Mallet finger',
  'Medial collateral ligament sprain',
  'Medial epicondylitis',
  'Meniscus tear',
  'Morton neuroma',
  'Olecranon bursitis',
  'Osgood Schlatter disease',
  'Patellar dislocation',
  'Patellar tendinopathy',
  'Peroneal tendon tear',
  'Plantar fasciitis',
  'Posterior cruciate ligament tear',
  'Proximal humerus fracture',
  'Quadriceps tendon rupture',
  'Radial head fracture',
  'Rotator cuff tear',
  'Scaphoid fracture',
  'Scheuermann kyphosis',
  'Septic arthritis',
  'Shoulder impingement syndrome',
  'Shoulder instability',
  'Slipped capital femoral epiphysis',
  'Stress fracture',
  'Subacromial bursitis',
  'Supracondylar humerus fracture',
  'Tarsal tunnel syndrome',
  'Tennis elbow',
  'TFCC tear',
  'Thumb ulnar collateral ligament tear',
  'Tibia shaft fracture',
  'Tibial plateau fracture',
  'Trigger finger',
  'Trochanteric bursitis',
  'Ulnar collateral ligament injury',
  'Vertebral compression fracture',
] as const

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
  const anonymousKey = 'orthodle_anonymous_session_id'
  const accountKey = 'orthodle_account_session_v1'
  const readCookieValue = () => {
    const match = document.cookie
      .split('; ')
      .find(cookie => cookie.startsWith(`${key}=`))

    return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : ''
  }
  const writeCookieValue = (value: string) => {
    const secure = window.location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${key}=${encodeURIComponent(
      value
    )}; Max-Age=63072000; Path=/; SameSite=Lax${secure}`
  }

  const readStoredAccount = () => {
    try {
      const raw = window.localStorage.getItem(accountKey)
      if (!raw) return null as AccountSession | null
      const parsed = JSON.parse(raw) as Partial<AccountSession>
      if (!parsed?.accountId || !parsed?.username) return null
      return {
        accountId: parsed.accountId,
        username: parsed.username,
        displayName: typeof parsed.displayName === 'string' ? parsed.displayName : parsed.username,
        profileIcon: typeof parsed.profileIcon === 'string' ? parsed.profileIcon : null,
        loggedInAt: typeof parsed.loggedInAt === 'string' ? parsed.loggedInAt : new Date().toISOString(),
      } satisfies AccountSession
    } catch {
      return null
    }
  }

  const storedAccount = readStoredAccount()
  if (storedAccount?.accountId) {
    writeCookieValue(storedAccount.accountId)
    try {
      window.localStorage.setItem(key, storedAccount.accountId)
    } catch {
      // keep the cookie in sync when storage is restricted
    }
    return storedAccount.accountId
  }

  let id = ''

  try {
    id = localStorage.getItem(anonymousKey) || localStorage.getItem(key) || ''
  } catch {
    id = ''
  }

  if (!id) {
    id = readCookieValue()
  }

  if (!id) {
    const cryptoObject =
      typeof window !== 'undefined' && 'crypto' in window ? window.crypto : undefined
    if (cryptoObject && typeof cryptoObject.randomUUID === 'function') {
      id = cryptoObject.randomUUID()
    } else {
      id = `orthodle_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
    }
  }

  try {
    localStorage.setItem(anonymousKey, id)
    localStorage.setItem(key, id)
  } catch {
    // The cookie keeps the anonymous account recoverable if storage is restricted.
  }
  writeCookieValue(id)

  return id
}

export type AccountSession = {
  accountId: string
  username: string
  displayName: string
  profileIcon: string | null
  loggedInAt: string
}

const ACCOUNT_SESSION_STORAGE_KEY = 'orthodle_account_session_v1'

export function getAnonymousSessionId() {
  if (typeof window === 'undefined') return ''
  const currentAccount = getAccountSession()
  if (currentAccount?.accountId) {
    const anonymousId =
      window.localStorage.getItem('orthodle_anonymous_session_id') ||
      window.localStorage.getItem('orthodle_session_id') ||
      ''
    return anonymousId
  }

  return getSessionId()
}

export function getAccountSession() {
  if (typeof window === 'undefined') return null as AccountSession | null

  try {
    const raw = window.localStorage.getItem(ACCOUNT_SESSION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<AccountSession>
    if (!parsed?.accountId || !parsed?.username) return null
    return {
      accountId: parsed.accountId,
      username: parsed.username,
      displayName: typeof parsed.displayName === 'string' ? parsed.displayName : parsed.username,
      profileIcon: typeof parsed.profileIcon === 'string' ? parsed.profileIcon : null,
      loggedInAt: typeof parsed.loggedInAt === 'string' ? parsed.loggedInAt : new Date().toISOString(),
    }
  } catch {
    return null
  }
}

export function setAccountSession(session: AccountSession) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(ACCOUNT_SESSION_STORAGE_KEY, JSON.stringify(session))
  try {
    window.localStorage.setItem('orthodle_session_id', session.accountId)
  } catch {
    // noop
  }
}

export function clearAccountSession() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(ACCOUNT_SESSION_STORAGE_KEY)
  const anonymousId = window.localStorage.getItem('orthodle_anonymous_session_id') || ''
  if (anonymousId) {
    window.localStorage.setItem('orthodle_session_id', anonymousId)
  } else {
    window.localStorage.removeItem('orthodle_session_id')
  }
}

const TRACKING_DISABLED_KEY = 'orthodle_tracking_disabled'

export function isTrackingDisabledForThisBrowser() {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(TRACKING_DISABLED_KEY) === 'true'
}

export function setTrackingDisabledForThisBrowser(disabled = true) {
  if (typeof window === 'undefined') return
  if (disabled) {
    window.localStorage.setItem(TRACKING_DISABLED_KEY, 'true')
  } else {
    window.localStorage.removeItem(TRACKING_DISABLED_KEY)
  }
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
  levelStreaks: Record<
    StatsLevel,
    {
      current: number
      longest: number
    }
  >
  averageGuessesInWins: number | null
  guessDistribution: Record<number, number>
  anatomy: {
    played: number
    wins: number
    losses: number
    winRate: number
    firstTryWins: number
  }
  today: {
    date: string
    played: number
    wins: number
    losses: number
    levelsSolved: number
    averageGuesses: number | null
    standardCaseAverageGuesses: number | null
    anatomyPlayed: number
    anatomyWins: number
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
    standardCaseAverageGuesses: number | null
    anatomyPlayed: number
    anatomyWins: number
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
const SURGICAL_ANATOMY_LAUNCH_DATE = '2026-05-14'

let storedResultsCache: StoredGameResult[] | null = null
let storedRoundProgressCache: StoredRoundProgress[] | null = null

function getStoredResults() {
  if (typeof window === 'undefined') return [] as StoredGameResult[]
  if (storedResultsCache) return storedResultsCache

  try {
    const raw = window.localStorage.getItem(STATS_STORAGE_KEY)
    if (!raw) {
      storedResultsCache = []
      return storedResultsCache
    }

    const parsed = JSON.parse(raw) as { results?: StoredGameResult[] }
    storedResultsCache = Array.isArray(parsed.results) ? parsed.results : ([] as StoredGameResult[])
    return storedResultsCache
  } catch {
    storedResultsCache = []
    return storedResultsCache
  }
}

function setStoredResults(results: StoredGameResult[]) {
  if (typeof window === 'undefined') return

  const nextResults = [...results].sort((a, b) => {
    if (a.caseDate !== b.caseDate) return b.caseDate.localeCompare(a.caseDate)
    if (a.completedAt !== b.completedAt) return b.completedAt.localeCompare(a.completedAt)
    return a.level.localeCompare(b.level)
  })

  storedResultsCache = nextResults

  window.localStorage.setItem(
    STATS_STORAGE_KEY,
    JSON.stringify({
      results: nextResults,
    })
  )
}

function getStoredRoundProgress() {
  if (typeof window === 'undefined') return [] as StoredRoundProgress[]
  if (storedRoundProgressCache) return storedRoundProgressCache

  try {
    const raw = window.localStorage.getItem(ROUND_PROGRESS_STORAGE_KEY)
    if (!raw) {
      storedRoundProgressCache = []
      return storedRoundProgressCache
    }

    const parsed = JSON.parse(raw) as { rounds?: StoredRoundProgress[] }
    storedRoundProgressCache = Array.isArray(parsed.rounds) ? parsed.rounds : ([] as StoredRoundProgress[])
    return storedRoundProgressCache
  } catch {
    storedRoundProgressCache = []
    return storedRoundProgressCache
  }
}

function setStoredRoundProgress(rounds: StoredRoundProgress[]) {
  if (typeof window === 'undefined') return

  const nextRounds = [...rounds].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 60)
  storedRoundProgressCache = nextRounds

  window.localStorage.setItem(
    ROUND_PROGRESS_STORAGE_KEY,
    JSON.stringify({
      rounds: nextRounds,
    })
  )
}

export function clearStatsSummary() {
  if (typeof window === 'undefined') return
  storedResultsCache = null
  storedRoundProgressCache = null
  window.localStorage.removeItem(STATS_STORAGE_KEY)
  window.localStorage.removeItem(ROUND_PROGRESS_STORAGE_KEY)
}

export function getStatsLevelLabel(level: StatsLevel) {
  const titles = readCachedLevelTitles()
  if (level === 'med_student') return titles.med_student
  if (level === 'resident') return titles.resident
  return titles.attending
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

export function getLatestUnfinishedRoundProgress() {
  return (
    getStoredRoundProgress().find(
      entry => !entry.gameWon && !entry.gameOver && entry.guesses.length > 0
    ) || null
  )
}

export function getCompletedCaseKeys(isArchive?: boolean) {
  const results = getStoredResults()

  return new Set(
    results
      .filter(result => (typeof isArchive === 'boolean' ? result.isArchive === isArchive : true))
      .map(result => result.key)
  )
}

export function getStatsSummary(): StatsSummary {
  const results = getStoredResults()
  const dailyResults = results.filter(result => !result.isArchive)
  const anatomyResults = dailyResults.filter(
    result => result.level === 'attending' && result.caseDate >= SURGICAL_ANATOMY_LAUNCH_DATE
  )
  const standardCaseResults = dailyResults.filter(
    result => !(result.level === 'attending' && result.caseDate >= SURGICAL_ANATOMY_LAUNCH_DATE)
  )
  const archiveResults = results.filter(result => result.isArchive)
  const wins = dailyResults.filter(result => result.won)
  const standardCaseWins = standardCaseResults.filter(result => result.won)
  const anatomyWins = anatomyResults.filter(result => result.won)
  const guessDistribution: Record<number, number> = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
    6: 0,
  }

  for (const result of standardCaseWins) {
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
      standardCaseAverageGuesses: number | null
      anatomyPlayed: number
      anatomyWins: number
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
      standardCaseAverageGuesses: null,
      anatomyPlayed: 0,
      anatomyWins: 0,
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
      const anatomyLevels = day.levels.filter(
        level => level.level === 'attending' && day.date >= SURGICAL_ANATOMY_LAUNCH_DATE
      )
      const standardCaseLevels = day.levels.filter(
        level => !(level.level === 'attending' && day.date >= SURGICAL_ANATOMY_LAUNCH_DATE)
      )
      const standardCaseTotalGuesses = standardCaseLevels.reduce(
        (sum, level) => sum + level.guessesUsed,
        0
      )

      return {
        ...day,
        averageGuesses: day.played > 0 ? totalGuesses / day.played : null,
        standardCaseAverageGuesses:
          standardCaseLevels.length > 0
            ? standardCaseTotalGuesses / standardCaseLevels.length
            : null,
        anatomyPlayed: anatomyLevels.length,
        anatomyWins: anatomyLevels.filter(level => level.won).length,
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

  const levelStreaks = {
    med_student: { current: 0, longest: 0 },
    resident: { current: 0, longest: 0 },
    attending: { current: 0, longest: 0 },
  } satisfies Record<
    StatsLevel,
    {
      current: number
      longest: number
    }
  >

  for (const level of ['med_student', 'resident', 'attending'] as const) {
    const levelWinningDays = Array.from(
      new Set(wins.filter(result => result.level === level).map(result => result.caseDate))
    ).sort((a, b) => b.localeCompare(a))

    let levelLongest = 0
    let runningLevelStreak = 0

    for (let i = 0; i < levelWinningDays.length; i += 1) {
      if (i === 0) {
        runningLevelStreak = 1
        levelLongest = 1
        continue
      }

      const newer = new Date(`${levelWinningDays[i - 1]}T00:00:00`)
      const older = new Date(`${levelWinningDays[i]}T00:00:00`)
      const diffDays = Math.round((newer.getTime() - older.getTime()) / (1000 * 60 * 60 * 24))

      if (diffDays === 1) {
        runningLevelStreak += 1
        levelLongest = Math.max(levelLongest, runningLevelStreak)
      } else {
        runningLevelStreak = 1
      }
    }

    let levelCurrent = 0

    if (levelWinningDays[0] === todayISO()) {
      levelCurrent = 1

      for (let i = 1; i < levelWinningDays.length; i += 1) {
        const newer = new Date(`${levelWinningDays[i - 1]}T00:00:00`)
        const older = new Date(`${levelWinningDays[i]}T00:00:00`)
        const diffDays = Math.round((newer.getTime() - older.getTime()) / (1000 * 60 * 60 * 24))

        if (diffDays === 1) {
          levelCurrent += 1
        } else {
          break
        }
      }
    }

    levelStreaks[level] = {
      current: levelCurrent,
      longest: levelLongest,
    }
  }

  const today =
    recentDays.find(day => day.date === todayISO()) || {
      date: todayISO(),
      played: 0,
      wins: 0,
      losses: 0,
      averageGuesses: null,
      standardCaseAverageGuesses: null,
      anatomyPlayed: 0,
      anatomyWins: 0,
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
    levelStreaks,
    averageGuessesInWins:
      standardCaseWins.length > 0
        ? standardCaseWins.reduce((sum, result) => sum + result.guessesUsed, 0) / standardCaseWins.length
        : null,
    guessDistribution,
    anatomy: {
      played: anatomyResults.length,
      wins: anatomyWins.length,
      losses: anatomyResults.length - anatomyWins.length,
      winRate: anatomyResults.length > 0 ? (anatomyWins.length / anatomyResults.length) * 100 : 0,
      firstTryWins: anatomyWins.length,
    },
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
import { readCachedLevelTitles } from '@/lib/level-display'
