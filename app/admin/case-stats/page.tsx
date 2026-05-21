'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Header } from '@/components/Header'
import { supabase } from '@/lib/supabase'
import { fetchExcludedStatsSessionIds, filterExcludedSessionRows } from '@/lib/stats-exclusions'
import { setTrackingDisabledForThisBrowser } from '@/lib/utils'

type Level = 'med_student' | 'resident' | 'attending'

type CaseRow = {
  id: string
  case_date: string
  level: Level
  answer: string
  category: string | null
}

type GuessCaseRelation = {
  level: Level
  case_date: string
  answer: string
  category: string | null
}

type GuessRow = {
  session_id: string
  case_id: string | null
  is_correct: boolean
  created_at: string
  cases: GuessCaseRelation | GuessCaseRelation[] | null
}

type CasePerformanceRow = {
  caseId: string
  answer: string
  category: string
  level: Level
  players: number
  solves: number
  firstTrySolves: number
  averageGuessCorrect: number | null
}

type CasePerformanceAccumulator = CasePerformanceRow & {
  bucket: CaseStatsBucketId
  playerSet: Set<string>
}

type CaseStatsBucketId =
  | 'med_student'
  | 'resident'
  | 'attending_legacy'
  | 'attending_anatomy'

type TrendDay = {
  date: string
  label: string
  solves: number
  activeUsers: number
  firstTryRate: number | null
}

type LevelStats = {
  level: CaseStatsBucketId
  label: string
  caseCount: number
  uniquePlayers: number
  averageGuessCorrect: number | null
  firstTryRate: number | null
  avgUsersPerCategory: number | null
  avgPlayersPerCase: number | null
  totalSolves: number
  trend: TrendDay[]
  topCategories: Array<{
    category: string
    avgPlayers: number
    firstTryRate: number | null
    cases: number
  }>
  hottestCases: CasePerformanceRow[]
}

type CaseStatsPayload = {
  levelStats: LevelStats[]
  lastUpdatedAt: string
  totalCases: number
  totalPlayers: number
  totalSolves: number
}

const LEVEL_LABELS: Record<Level, string> = {
  med_student: 'Med Student',
  resident: 'Resident',
  attending: 'Anatomy',
}

const CASE_STATS_BUCKET_LABELS: Record<CaseStatsBucketId, string> = {
  med_student: 'Med Student',
  resident: 'Resident',
  attending_legacy: 'Attending',
  attending_anatomy: 'Anatomy',
}

const SURGICAL_ANATOMY_LAUNCH_DATE = '2026-05-14'

const PACIFIC_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const PACIFIC_LABEL_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles',
  weekday: 'short',
  month: 'short',
  day: 'numeric',
})

function getPacificIsoDate(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value)
  const parts = PACIFIC_DATE_FORMATTER.formatToParts(date)
  const year = parts.find(part => part.type === 'year')?.value || '0000'
  const month = parts.find(part => part.type === 'month')?.value || '00'
  const day = parts.find(part => part.type === 'day')?.value || '00'
  return `${year}-${month}-${day}`
}

function formatPacificLabel(dateText: string) {
  return PACIFIC_LABEL_FORMATTER.format(new Date(`${dateText}T12:00:00`))
}

function formatAverage(value: number | null, digits = 1) {
  if (value === null || Number.isNaN(value)) return '—'
  return value.toFixed(digits)
}

function formatPercent(value: number | null) {
  if (value === null || Number.isNaN(value)) return '—'
  return `${Math.round(value)}%`
}

function normalizeGuessCase(caseRelation: GuessRow['cases']) {
  if (Array.isArray(caseRelation)) return caseRelation[0] || null
  return caseRelation
}

function buildLastSevenPacificDates() {
  const days: string[] = []
  const base = new Date()
  for (let offset = 6; offset >= 0; offset -= 1) {
    const day = new Date(base)
    day.setDate(base.getDate() - offset)
    days.push(getPacificIsoDate(day))
  }
  return days
}

function getCaseStatsBucket(level: Level, caseDate: string): CaseStatsBucketId {
  if (level === 'med_student') return 'med_student'
  if (level === 'resident') return 'resident'
  return caseDate >= SURGICAL_ANATOMY_LAUNCH_DATE ? 'attending_anatomy' : 'attending_legacy'
}

function buildCaseStats(cases: CaseRow[], guessRows: GuessRow[]): CaseStatsPayload {
  const caseLookup = new Map(cases.map(item => [item.id, item]))
  const guessesByCaseSession = new Map<string, GuessRow[]>()
  const levelCaseCounts = new Map<CaseStatsBucketId, number>([
    ['med_student', 0],
    ['resident', 0],
    ['attending_legacy', 0],
    ['attending_anatomy', 0],
  ])

  for (const item of cases) {
    const bucket = getCaseStatsBucket(item.level, item.case_date)
    levelCaseCounts.set(bucket, (levelCaseCounts.get(bucket) || 0) + 1)
  }

  for (const row of guessRows) {
    if (!row.case_id) continue
    const caseInfo = normalizeGuessCase(row.cases) || caseLookup.get(row.case_id)
    if (!caseInfo) continue
    const key = `${row.case_id}:${row.session_id}`
    if (!guessesByCaseSession.has(key)) {
      guessesByCaseSession.set(key, [])
    }
    guessesByCaseSession.get(key)?.push(row)
  }

  const lastSeven = buildLastSevenPacificDates()
  const trendSkeleton = Object.fromEntries(
    lastSeven.map(date => [
      date,
      {
        solves: 0,
        firstTrySolves: 0,
        activeUsers: new Set<string>(),
      },
    ])
  ) as Record<string, { solves: number; firstTrySolves: number; activeUsers: Set<string> }>

  const casePerformanceById = new Map<
    string,
    CasePerformanceAccumulator
  >()

  const levelAccumulators = new Map<
    CaseStatsBucketId,
    {
      solveCount: number
      firstTrySolves: number
      totalGuessCorrect: number
      playerSet: Set<string>
      trend: Record<string, { solves: number; firstTrySolves: number; activeUsers: Set<string> }>
      categories: Map<
        string,
        { caseIds: Set<string>; totalPlayers: number; firstTrySolves: number; solveCount: number }
      >
    }
  >(
    (Object.keys(CASE_STATS_BUCKET_LABELS) as CaseStatsBucketId[]).map(level => [
      level,
      {
        solveCount: 0,
        firstTrySolves: 0,
        totalGuessCorrect: 0,
        playerSet: new Set<string>(),
        trend: Object.fromEntries(
          lastSeven.map(date => [
            date,
            {
              solves: 0,
              firstTrySolves: 0,
              activeUsers: new Set<string>(),
            },
          ])
        ) as Record<string, { solves: number; firstTrySolves: number; activeUsers: Set<string> }>,
        categories: new Map(),
      },
    ])
  )

  for (const rows of guessesByCaseSession.values()) {
    const orderedRows = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at))
    const sample = orderedRows[0]
    if (!sample.case_id) continue
    const caseInfo = normalizeGuessCase(sample.cases) || caseLookup.get(sample.case_id)
    if (!caseInfo) continue

    const caseRow = caseLookup.get(sample.case_id)
    const caseDate = caseRow?.case_date || caseInfo.case_date
    const level = getCaseStatsBucket(caseInfo.level, caseDate)
    const accumulator = levelAccumulators.get(level)
    if (!accumulator) continue

    const playerId = sample.session_id
    accumulator.playerSet.add(playerId)

    let performance = casePerformanceById.get(sample.case_id)
    if (!performance) {
      performance = {
        caseId: sample.case_id,
        answer: caseInfo.answer,
        category: caseInfo.category || 'Uncategorized',
        level: caseInfo.level,
        players: 0,
        solves: 0,
        firstTrySolves: 0,
        averageGuessCorrect: null,
        playerSet: new Set<string>(),
        bucket: level,
      }
      casePerformanceById.set(sample.case_id, performance)
    }

    if (!performance.playerSet.has(playerId)) {
      performance.playerSet.add(playerId)
      performance.players += 1
    }

    const firstCorrectIndex = orderedRows.findIndex(row => row.is_correct)
    if (firstCorrectIndex === -1) continue

    const guessNumber = firstCorrectIndex + 1
    accumulator.solveCount += 1
    accumulator.totalGuessCorrect += guessNumber
    performance.solves += 1

    if (guessNumber === 1) {
      accumulator.firstTrySolves += 1
      performance.firstTrySolves += 1
    }

    const categoryKey = caseInfo.category || 'Uncategorized'
    const categoryEntry = accumulator.categories.get(categoryKey) || {
      caseIds: new Set<string>(),
      totalPlayers: 0,
      firstTrySolves: 0,
      solveCount: 0,
    }
    categoryEntry.caseIds.add(sample.case_id)
    categoryEntry.totalPlayers += 1
    categoryEntry.solveCount += 1
    if (guessNumber === 1) categoryEntry.firstTrySolves += 1
    accumulator.categories.set(categoryKey, categoryEntry)

    const solvedAt = orderedRows[firstCorrectIndex]?.created_at
    const solvedDate = caseDate || getPacificIsoDate(solvedAt)
    if (lastSeven.includes(solvedDate)) {
      const trendEntry = accumulator.trend[solvedDate] || trendSkeleton[solvedDate]
      trendEntry.solves += 1
      trendEntry.activeUsers.add(playerId)
      if (guessNumber === 1) trendEntry.firstTrySolves += 1
      accumulator.trend[solvedDate] = trendEntry
    }
  }

  for (const entry of casePerformanceById.values()) {
    entry.averageGuessCorrect = entry.solves > 0 ? entry.solves === 0 ? null : null : null
  }

  const guessTotalsByCase = new Map<string, { solves: number; totalGuessCorrect: number }>()
  for (const rows of guessesByCaseSession.values()) {
    const orderedRows = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at))
    const sample = orderedRows[0]
    if (!sample.case_id) continue
    const firstCorrectIndex = orderedRows.findIndex(row => row.is_correct)
    if (firstCorrectIndex === -1) continue
    const value = guessTotalsByCase.get(sample.case_id) || { solves: 0, totalGuessCorrect: 0 }
    value.solves += 1
    value.totalGuessCorrect += firstCorrectIndex + 1
    guessTotalsByCase.set(sample.case_id, value)
  }

  for (const [caseId, totals] of guessTotalsByCase.entries()) {
    const performance = casePerformanceById.get(caseId)
    if (!performance) continue
    performance.averageGuessCorrect =
      totals.solves > 0 ? totals.totalGuessCorrect / totals.solves : null
  }

  const levelStats = (Object.keys(CASE_STATS_BUCKET_LABELS) as CaseStatsBucketId[]).map(level => {
    const accumulator = levelAccumulators.get(level)!
    const categories = Array.from(accumulator.categories.entries()).map(([category, value]) => ({
      category,
      avgPlayers: value.caseIds.size > 0 ? value.totalPlayers / value.caseIds.size : 0,
      firstTryRate: value.solveCount > 0 ? (value.firstTrySolves / value.solveCount) * 100 : null,
      cases: value.caseIds.size,
    }))

    const avgUsersPerCategory =
      categories.length > 0
        ? categories.reduce((sum, item) => sum + item.avgPlayers, 0) / categories.length
        : null

    const levelCases = Array.from(casePerformanceById.values()).filter(item => item.bucket === level)

    const trend = lastSeven.map(date => {
      const trendEntry = accumulator.trend[date] || trendSkeleton[date]
      return {
        date,
        label: formatPacificLabel(date),
        solves: trendEntry.solves,
        activeUsers: trendEntry.activeUsers.size,
        firstTryRate: trendEntry.solves > 0 ? (trendEntry.firstTrySolves / trendEntry.solves) * 100 : null,
      }
    })

    const caseCount = levelCaseCounts.get(level) || 0
    const avgPlayersPerCase =
      levelCases.length > 0 ? levelCases.reduce((sum, item) => sum + item.players, 0) / levelCases.length : null

    return {
      level,
      label: CASE_STATS_BUCKET_LABELS[level],
      caseCount,
      uniquePlayers: accumulator.playerSet.size,
      averageGuessCorrect:
        accumulator.solveCount > 0 ? accumulator.totalGuessCorrect / accumulator.solveCount : null,
      firstTryRate:
        accumulator.solveCount > 0 ? (accumulator.firstTrySolves / accumulator.solveCount) * 100 : null,
      avgUsersPerCategory,
      avgPlayersPerCase,
      totalSolves: accumulator.solveCount,
      trend,
      topCategories: categories.sort((a, b) => b.avgPlayers - a.avgPlayers).slice(0, 4),
      hottestCases: Array.from(casePerformanceById.values())
        .filter(item => item.bucket === level)
        .sort((a, b) => {
          if (b.players !== a.players) return b.players - a.players
          if (b.solves !== a.solves) return b.solves - a.solves
          return a.answer.localeCompare(b.answer)
        })
        .slice(0, 4)
        .map(({ playerSet: _playerSet, bucket: _bucket, ...rest }) => rest),
    }
  })

  const totalPlayers = new Set(guessRows.map(row => row.session_id)).size
  const totalSolves = levelStats.reduce((sum, item) => sum + item.totalSolves, 0)

  return {
    levelStats,
    lastUpdatedAt: new Date().toISOString(),
    totalCases: cases.length,
    totalPlayers,
    totalSolves,
  }
}

export default function AdminCaseStatsPage() {
  const [authReady, setAuthReady] = useState(false)
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [payload, setPayload] = useState<CaseStatsPayload | null>(null)

  useEffect(() => {
    const savedUnlock = window.sessionStorage.getItem('orthodle_admin_unlocked')
    setIsUnlocked(savedUnlock === 'true')
    setAuthReady(true)
  }, [])

  useEffect(() => {
    if (!isUnlocked) return
    setTrackingDisabledForThisBrowser(true)
    void loadStats()
  }, [isUnlocked])

  async function loadStats() {
    setLoading(true)
    setStatus('')

    try {
      const { data: caseData, error: caseError } = await supabase
        .from('cases')
        .select('id, case_date, level, answer, category')
        .order('case_date', { ascending: false })

      if (caseError) throw caseError

      const guessRows: GuessRow[] = []
      const pageSize = 1000
      let from = 0

      while (true) {
        const { data, error } = await supabase
          .from('guesses')
          .select('session_id, case_id, is_correct, created_at, cases(level, case_date, answer, category)')
          .order('created_at', { ascending: true })
          .range(from, from + pageSize - 1)

        if (error) throw error

        const batch = ((data || []) as GuessRow[]) || []
        guessRows.push(...batch)
        if (batch.length < pageSize) break
        from += pageSize
      }

      const excludedIds = new Set(await fetchExcludedStatsSessionIds())
      const filteredGuesses = filterExcludedSessionRows(guessRows, excludedIds)
      setPayload(buildCaseStats(((caseData || []) as CaseRow[]) || [], filteredGuesses))
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not load case stats.')
    } finally {
      setLoading(false)
    }
  }

  const strongestTrendHeight = useMemo(() => {
    const maxSolves = payload
      ? Math.max(1, ...payload.levelStats.flatMap(level => level.trend.map(day => day.solves)))
      : 1
    return maxSolves
  }, [payload])

  if (!authReady) {
    return (
      <main className="app-surface min-h-screen">
        <Header />
      </main>
    )
  }

  if (!isUnlocked) {
    return (
      <main className="app-surface min-h-screen">
        <Header />
        <section className="mx-auto max-w-3xl px-5 py-10">
          <div className="rounded-[28px] border border-[#e7e1d6] bg-white p-8 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
            <div className="text-[11px] font-bold uppercase tracking-[0.28em] text-[#637268]">
              Admin
            </div>
            <h1 className="mt-3 font-serif text-3xl font-bold text-[#102018]">Case Stats</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[#637268]">
              Unlock the admin dashboard first, then come back here for the cumulative case trends.
            </p>
            <Link
              href="/admin"
              className="mt-6 inline-flex rounded-full bg-[#1f6448] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#174c37]"
            >
              Back to admin
            </Link>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="app-surface min-h-screen">
      <Header />

      <section className="mx-auto max-w-6xl px-5 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.28em] text-[#637268]">
              Admin
            </div>
            <h1 className="mt-2 font-serif text-[34px] font-bold tracking-[-0.03em] text-[#102018]">
              Case Stats
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#637268]">
              Cumulative performance by level, category pull, and weekly case trends so you can see which kinds of cases land best.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin"
              className="rounded-full border border-[#ded7ca] bg-white px-4 py-2 text-sm font-semibold text-[#102018] transition hover:bg-[#fbfaf7]"
            >
              Back to admin
            </Link>
            <button
              type="button"
              onClick={() => void loadStats()}
              className="rounded-full bg-[#1f6448] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#174c37]"
            >
              Refresh stats
            </button>
          </div>
        </div>

        {status && (
          <div className="mt-4 rounded-2xl border border-[#ead9b7] bg-[#fffaf1] px-4 py-3 text-sm text-[#a24d24]">
            {status}
          </div>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-[#e7e1d6] bg-white p-4 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
            <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#637268]">Cases tracked</div>
            <div className="mt-2 font-serif text-3xl font-bold text-[#102018]">
              {payload?.totalCases ?? '—'}
            </div>
          </div>
          <div className="rounded-2xl border border-[#e7e1d6] bg-white p-4 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
            <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#637268]">Players in sample</div>
            <div className="mt-2 font-serif text-3xl font-bold text-[#102018]">
              {payload?.totalPlayers ?? '—'}
            </div>
          </div>
          <div className="rounded-2xl border border-[#e7e1d6] bg-white p-4 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
            <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#637268]">Correct solves logged</div>
            <div className="mt-2 font-serif text-3xl font-bold text-[#102018]">
              {payload?.totalSolves ?? '—'}
            </div>
            {payload?.lastUpdatedAt && (
              <div className="mt-2 text-xs text-[#8a948d]">
                Updated {new Date(payload.lastUpdatedAt).toLocaleString()}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-3">
          {(payload?.levelStats || []).map(level => (
            <section
              key={level.level}
              className="rounded-[26px] border border-[#e7e1d6] bg-white p-4 shadow-[0_10px_24px_rgba(16,32,24,0.04)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#637268]">
                    {level.label}
                  </div>
                  <h2 className="mt-2 font-serif text-[28px] font-bold text-[#102018]">
                    {formatAverage(level.averageGuessCorrect)}
                  </h2>
                  <p className="text-sm text-[#637268]">Average guess when players get it right</p>
                </div>
                <div className="rounded-full border border-[#d9e6df] bg-[#f7fbf8] px-3 py-1 text-xs font-semibold text-[#1f6448]">
                  {formatPercent(level.firstTryRate)} first try
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2.5">
                <div className="rounded-2xl border border-[#ebe5db] bg-[#fcfbf8] p-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#637268]">Avg users / category</div>
                  <div className="mt-2 font-serif text-2xl font-bold text-[#102018]">
                    {formatAverage(level.avgUsersPerCategory)}
                  </div>
                </div>
                <div className="rounded-2xl border border-[#ebe5db] bg-[#fcfbf8] p-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#637268]">Avg players / case</div>
                  <div className="mt-2 font-serif text-2xl font-bold text-[#102018]">
                    {formatAverage(level.avgPlayersPerCase)}
                  </div>
                </div>
                <div className="rounded-2xl border border-[#ebe5db] bg-[#fcfbf8] p-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#637268]">Cases</div>
                  <div className="mt-2 font-serif text-2xl font-bold text-[#102018]">{level.caseCount}</div>
                </div>
                <div className="rounded-2xl border border-[#ebe5db] bg-[#fcfbf8] p-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#637268]">Unique players</div>
                  <div className="mt-2 font-serif text-2xl font-bold text-[#102018]">{level.uniquePlayers}</div>
                </div>
              </div>

              <div className="mt-5">
                <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#315f4d]">
                  Past week trend
                </div>
                <div className="mt-3 grid grid-cols-7 gap-2">
                  {level.trend.map(day => (
                    <div key={day.date} className="text-center">
                      <div className="flex h-24 items-end justify-center">
                        <div
                          className="w-full rounded-t-xl bg-gradient-to-t from-[#1f6448] to-[#5a9a73]"
                          style={{
                            height: `${Math.max(10, (day.solves / strongestTrendHeight) * 96)}px`,
                            opacity: day.solves > 0 ? 1 : 0.18,
                          }}
                        />
                      </div>
                      <div className="mt-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#637268]">
                        {day.label.split(',')[0]}
                      </div>
                      <div className="mt-1 text-sm font-semibold text-[#102018]">{day.solves}</div>
                      <div className="text-[10px] text-[#8a948d]">
                        {day.activeUsers} users · {formatPercent(day.firstTryRate)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-5 border-t border-[#eee7dc] pt-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#315f4d]">
                  Strongest category pull
                </div>
                <div className="mt-3 space-y-2">
                  {level.topCategories.length > 0 ? (
                    level.topCategories.map(category => (
                      <div
                        key={`${level.level}-${category.category}`}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-[#ebe5db] bg-[#fcfbf8] px-3 py-2.5"
                      >
                        <div>
                          <div className="text-sm font-semibold text-[#102018]">{category.category}</div>
                          <div className="text-xs text-[#637268]">
                            {category.cases} case{category.cases === 1 ? '' : 's'} · {formatPercent(category.firstTryRate)} first try
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-serif text-xl font-bold text-[#1f6448]">
                            {formatAverage(category.avgPlayers)}
                          </div>
                          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#637268]">
                            avg users
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-[#ded7ca] bg-[#fbfaf7] px-3 py-3 text-sm text-[#8a948d]">
                      No solved cases at this level yet.
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-5 border-t border-[#eee7dc] pt-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#315f4d]">
                  Cases with the most pull
                </div>
                <div className="mt-3 space-y-2">
                  {level.hottestCases.length > 0 ? (
                    level.hottestCases.map(item => (
                      <div
                        key={item.caseId}
                        className="rounded-2xl border border-[#ebe5db] bg-white px-3 py-2.5"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-[#102018]">{item.answer}</div>
                            <div className="text-xs text-[#637268]">
                              {item.category} · {item.players} players
                            </div>
                          </div>
                          <div className="text-right text-xs text-[#637268]">
                            <div>{formatAverage(item.averageGuessCorrect)} avg guess</div>
                            <div>{formatPercent(item.solves > 0 ? (item.firstTrySolves / item.solves) * 100 : null)} first try</div>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-[#ded7ca] bg-[#fbfaf7] px-3 py-3 text-sm text-[#8a948d]">
                      No case pull data yet.
                    </div>
                  )}
                </div>
              </div>
            </section>
          ))}
        </div>

        {loading && (
          <div className="mt-6 rounded-2xl border border-[#e7e1d6] bg-white px-4 py-3 text-sm text-[#637268]">
            Loading case stats...
          </div>
        )}
      </section>
    </main>
  )
}
