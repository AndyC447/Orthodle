const DEFAULT_GROUP_SCORING_SETTINGS = {
  solvePoints: 10,
  firstTryPoints: 3,
  streakPoints: 2,
  efficiencyBaseline: 7,
  efficiencyPointsPerGuess: 1,
  teamworkBonusPerMember: 3,
  teamworkBonusMax: 18,
}

function normalizeGroupScoringSettings(value) {
  const source = value || {}
  const read = (key, fallback) =>
    typeof source[key] === 'number' && Number.isFinite(source[key]) ? source[key] : fallback

  return {
    solvePoints: read('solvePoints', DEFAULT_GROUP_SCORING_SETTINGS.solvePoints),
    firstTryPoints: read('firstTryPoints', DEFAULT_GROUP_SCORING_SETTINGS.firstTryPoints),
    streakPoints: read('streakPoints', DEFAULT_GROUP_SCORING_SETTINGS.streakPoints),
    efficiencyBaseline: read(
      'efficiencyBaseline',
      DEFAULT_GROUP_SCORING_SETTINGS.efficiencyBaseline
    ),
    efficiencyPointsPerGuess: read(
      'efficiencyPointsPerGuess',
      DEFAULT_GROUP_SCORING_SETTINGS.efficiencyPointsPerGuess
    ),
    teamworkBonusPerMember: read(
      'teamworkBonusPerMember',
      DEFAULT_GROUP_SCORING_SETTINGS.teamworkBonusPerMember
    ),
    teamworkBonusMax: read('teamworkBonusMax', DEFAULT_GROUP_SCORING_SETTINGS.teamworkBonusMax),
  }
}

/**
 * @typedef {{ id: string, name: string, icon: string | null, join_code?: string, creator_session_id?: string, created_at?: string }} GroupRow
 * @typedef {{ id: string, group_id: string, session_id: string, display_name: string, icon: string | null, created_at: string }} GroupMemberRow
 * @typedef {{ session_id: string, case_id: string | null, is_correct: boolean | null, created_at: string }} GuessRow
 * @typedef {{ id: string, case_date: string, level: 'med_student' | 'resident' | 'attending', answer: string, category: string | null }} CaseRow
 */

export function calculateMemberScore(solves, firstTrySolves, longestStreak, avgGuesses, settings) {
  const config = normalizeGroupScoringSettings(settings)
  const efficiencyBonus =
    avgGuesses !== null
      ? Math.max(0, config.efficiencyBaseline - avgGuesses) * config.efficiencyPointsPerGuess
      : 0
  return Math.round(
    solves * config.solvePoints +
      firstTrySolves * config.firstTryPoints +
      longestStreak * config.streakPoints +
      efficiencyBonus
  )
}

export function calculateGroupTeamworkBonus(activeMemberCount, settings) {
  const config = normalizeGroupScoringSettings(settings)
  if (activeMemberCount <= 1) return 0
  return Math.min(
    config.teamworkBonusMax,
    (activeMemberCount - 1) * config.teamworkBonusPerMember
  )
}

export function getLocalDateFromTimestamp(value) {
  if (!value) return ''
  const date = new Date(value)
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function computeLongestRun(sortedDates) {
  if (sortedDates.length === 0) return 0

  let longest = 1
  let current = 1

  for (let index = 1; index < sortedDates.length; index += 1) {
    const previous = new Date(`${sortedDates[index - 1]}T12:00:00`)
    const currentDate = new Date(`${sortedDates[index]}T12:00:00`)
    const diffDays = Math.round((currentDate.getTime() - previous.getTime()) / 86400000)

    if (diffDays === 1) {
      current += 1
      longest = Math.max(longest, current)
    } else if (diffDays > 1) {
      current = 1
    }
  }

  return longest
}

export function getCurrentRun(sortedDates) {
  if (sortedDates.length === 0) return 0

  let current = 1
  for (let index = sortedDates.length - 1; index > 0; index -= 1) {
    const currentDate = new Date(`${sortedDates[index]}T12:00:00`)
    const previousDate = new Date(`${sortedDates[index - 1]}T12:00:00`)
    const diffDays = Math.round(
      (currentDate.getTime() - previousDate.getTime()) / (1000 * 60 * 60 * 24)
    )

    if (diffDays === 1) current += 1
    else break
  }

  return current
}

export function getLocalIsoDate(isoLike) {
  const date = isoLike ? new Date(isoLike) : new Date()
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getScoredAttemptRows(rows) {
  const orderedRows = [...rows].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )
  const firstCorrectIndex = orderedRows.findIndex(row => row.is_correct)

  return {
    orderedRows,
    firstCorrectIndex,
    scoredRows: firstCorrectIndex === -1 ? orderedRows : orderedRows.slice(0, firstCorrectIndex + 1),
  }
}

/**
 * @param {GroupMemberRow} member
 * @param {GuessRow[]} guessRows
 * @param {Record<string, CaseRow>} caseLookup
 */
export function buildMemberStats(member, guessRows, caseLookup, settings) {
  const memberGuesses = guessRows.filter(row => row.session_id === member.session_id && row.case_id)
  const guessesByCase = new Map()

  for (const guess of memberGuesses) {
    if (!guess.case_id) continue
    if (!guessesByCase.has(guess.case_id)) {
      guessesByCase.set(guess.case_id, [])
    }
    guessesByCase.get(guess.case_id).push(guess)
  }

  let solves = 0
  let firstTrySolves = 0
  let totalGuessesToSolve = 0
  let totalGuesses = 0
  let correctGuesses = 0
  let attendingSolves = 0
  let hasClutchSolve = false
  let nightShiftSolves = 0
  /** @type {string[]} */
  const solvedDates = []
  /** @type {Record<string, number>} */
  const categorySolves = {}

  for (const [caseId, rows] of guessesByCase.entries()) {
    const caseInfo = caseLookup[caseId]
    const { orderedRows, firstCorrectIndex, scoredRows } = getScoredAttemptRows(rows)
    totalGuesses += scoredRows.length
    correctGuesses += firstCorrectIndex === -1 ? 0 : 1
    if (firstCorrectIndex === -1) continue
    solves += 1
    totalGuessesToSolve += firstCorrectIndex + 1
    if (firstCorrectIndex === 0) {
      firstTrySolves += 1
    }
    if (firstCorrectIndex + 1 <= 4) {
      hasClutchSolve = true
    }
    if (caseInfo?.level === 'attending') {
      attendingSolves += 1
    }
    if (caseInfo?.category) {
      categorySolves[caseInfo.category] = (categorySolves[caseInfo.category] || 0) + 1
    }
    const correctGuess = orderedRows[firstCorrectIndex]
    if (correctGuess?.created_at) {
      const solvedHour = new Date(correctGuess.created_at).getHours()
      if (solvedHour >= 0 && solvedHour < 6) {
        nightShiftSolves += 1
      }
    }
    const solvedDate = caseInfo?.case_date || getLocalDateFromTimestamp(correctGuess?.created_at)
    if (solvedDate) {
      solvedDates.push(solvedDate)
    }
  }

  const uniqueSortedDates = Array.from(new Set(solvedDates)).sort()
  const avgGuesses = solves > 0 ? totalGuessesToSolve / solves : null
  const longestStreak = computeLongestRun(uniqueSortedDates)
  const currentStreak = getCurrentRun(uniqueSortedDates)
  const score = calculateMemberScore(solves, firstTrySolves, longestStreak, avgGuesses, settings)

  return {
    member,
    score,
    solves,
    avgGuesses,
    longestStreak,
    currentStreak,
    firstTrySolves,
    totalGuesses,
    correctGuesses,
    attendingSolves,
    categorySolves,
    hasClutchSolve,
    nightShiftSolves,
    solvedDates: uniqueSortedDates,
  }
}

/**
 * @param {GroupRow[]} groups
 * @param {GroupMemberRow[]} members
 * @param {GuessRow[]} guessRows
 * @param {Record<string, CaseRow>} caseLookup
 */
export function buildGroupAggregatesFromRows(groups, members, guessRows, caseLookup, settings) {
  const config = normalizeGroupScoringSettings(settings)
  return groups
    .map(group => {
      const groupMembers = members.filter(member => member.group_id === group.id)
      const memberStats = groupMembers.map(member =>
        buildMemberStats(member, guessRows, caseLookup, config)
      )

      const totalCorrectGuesses = memberStats.reduce((sum, entry) => sum + entry.correctGuesses, 0)
      const totalGuessCount = memberStats.reduce((sum, entry) => sum + entry.totalGuesses, 0)
      const avgAccuracy =
        totalGuessCount > 0 ? (totalCorrectGuesses / totalGuessCount) * 100 : null
      const avgGuessEntries = memberStats.filter(entry => entry.avgGuesses !== null)
      const avgGuesses =
        avgGuessEntries.length > 0
          ? avgGuessEntries.reduce((sum, entry) => sum + (entry.avgGuesses || 0), 0) /
            avgGuessEntries.length
          : null
      const longestStreak = memberStats.reduce(
        (max, entry) => Math.max(max, entry.longestStreak),
        0
      )
      const allSolvedDates = Array.from(new Set(memberStats.flatMap(entry => entry.solvedDates))).sort()
      const currentStreak = getCurrentRun(allSolvedDates)
      const totalSolves = memberStats.reduce((sum, entry) => sum + entry.solves, 0)
      const totalFirstTrySolves = memberStats.reduce((sum, entry) => sum + entry.firstTrySolves, 0)
      const totalAttendingSolves = memberStats.reduce((sum, entry) => sum + entry.attendingSolves, 0)
      const activeMemberStats = memberStats.filter(entry => entry.totalGuesses > 0)
      const totalMemberScore = activeMemberStats.reduce((sum, entry) => sum + entry.score, 0)
      const teamworkBonus = calculateGroupTeamworkBonus(activeMemberStats.length, config)
      const score =
        activeMemberStats.length > 0
          ? Math.round(totalMemberScore / activeMemberStats.length) + teamworkBonus
          : 0
      const todayKey = getLocalIsoDate()
      const activeTodayCount = memberStats.filter(entry => entry.solvedDates.includes(todayKey)).length

      return {
        group,
        members: groupMembers,
        memberStats: memberStats.sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score
          if (b.longestStreak !== a.longestStreak) return b.longestStreak - a.longestStreak
          if (b.solves !== a.solves) return b.solves - a.solves
          if ((a.avgGuesses ?? Infinity) !== (b.avgGuesses ?? Infinity)) {
            return (a.avgGuesses ?? Infinity) - (b.avgGuesses ?? Infinity)
          }
          return b.firstTrySolves - a.firstTrySolves
        }),
        score,
        avgAccuracy,
        avgGuesses,
        longestStreak,
        currentStreak,
        totalSolves,
        totalFirstTrySolves,
        totalAttendingSolves,
        activeTodayCount,
        solvedDates: allSolvedDates,
      }
    })
    .sort((a, b) => b.score - a.score)
}

/**
 * @template T
 * @param {(from: number, to: number) => Promise<T[]>} fetchPage
 * @param {number} [pageSize]
 * @returns {Promise<T[]>}
 */
export async function fetchAllRows(fetchPage, pageSize = 1000) {
  /** @type {T[]} */
  const rows = []
  let from = 0

  while (true) {
    const to = from + pageSize - 1
    const batch = await fetchPage(from, to)
    rows.push(...batch)

    if (batch.length < pageSize) {
      break
    }

    from += pageSize
  }

  return rows
}
