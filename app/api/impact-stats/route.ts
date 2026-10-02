import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { analyticsDateISO, calculateAudienceStats } from '@/lib/audience-stats'
import { filterExcludedSessionRows, getExcludedStatsSessionIds } from '@/lib/stats-exclusions'

type VisitRow = {
  session_id: string
  created_at: string
  geo_country: string | null
  geo_city: string | null
}

type GuessRow = {
  session_id: string
  created_at: string
  cases?: { case_date: string | null } | { case_date: string | null }[] | null
}

type ImpactStats = {
  usersReached: number
  uniqueUsers: number
  combinedDailyUsers: number
  totalGuesses: number
  archiveGuesses: number
  countriesReached: number
  topCities: string[]
  caseCount: number
}

const PAGE_SIZE = 1000
const CACHE_TTL_MS = 60 * 1000

let cachedStats: ImpactStats | null = null
let cachedAt = 0
let pendingStats: Promise<ImpactStats> | null = null

function cleanLocationLabel(value: string | null) {
  if (!value) return ''
  const trimmed = value.trim()
  if (!trimmed) return ''

  let decoded = trimmed
  try {
    decoded = decodeURIComponent(trimmed.replace(/\+/g, ' '))
  } catch {
    decoded = trimmed
  }

  const normalized = decoded.replace(/\s+/g, ' ').trim()

  if (!normalized || /^(unknown|undefined|null|n\/a|not available)$/i.test(normalized)) {
    return ''
  }

  return normalized
}

function getCaseDate(guess: GuessRow) {
  if (!guess.cases) return null
  if (Array.isArray(guess.cases)) return guess.cases[0]?.case_date || null
  return guess.cases.case_date
}

async function fetchPaged<T>(table: string, select: string) {
  const rows: T[] = []
  let offset = 0

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .order('id')
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break

    rows.push(...(data as T[]))

    if (data.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  return rows
}

async function fetchCount(table: string) {
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true })

  if (error) throw new Error(error.message)
  return count || 0
}

async function buildImpactStats(): Promise<ImpactStats> {
  const [visitRows, guessRows, caseCount, excludedIds] = await Promise.all([
    fetchPaged<VisitRow>('visits', 'session_id, created_at, geo_country, geo_city'),
    fetchPaged<GuessRow>('guesses', 'session_id, created_at, cases(case_date)'),
    fetchCount('cases'),
    getExcludedStatsSessionIds(),
  ])

  const excluded = new Set(excludedIds)
  const visits = filterExcludedSessionRows(visitRows, excluded)
  const guesses = filterExcludedSessionRows(guessRows, excluded)
  const { uniqueUsers, combinedDailyUsers } = calculateAudienceStats([...visits, ...guesses])
  const countries = new Set<string>()
  const citySessions = new Map<string, Set<string>>()
  const today = analyticsDateISO(new Date().toISOString())!
  let archiveGuesses = 0

  for (const visit of visits) {
    if (visit.geo_country?.trim()) countries.add(visit.geo_country.trim())

    const city = cleanLocationLabel(visit.geo_city)
    if (city) {
      if (!citySessions.has(city)) citySessions.set(city, new Set())
      citySessions.get(city)!.add(visit.session_id)
    }
  }

  for (const guess of guesses) {
    const caseDate = getCaseDate(guess)
    if (caseDate && caseDate < today) archiveGuesses += 1
  }

  const topCities = [...citySessions.entries()]
    .sort(([cityA, sessionsA], [cityB, sessionsB]) => {
      const sessionDelta = sessionsB.size - sessionsA.size
      return sessionDelta || cityA.localeCompare(cityB)
    })
    .slice(0, 6)
    .map(([city]) => city)

  return {
    usersReached: combinedDailyUsers,
    uniqueUsers,
    combinedDailyUsers,
    totalGuesses: guesses.length,
    archiveGuesses,
    countriesReached: countries.size,
    topCities,
    caseCount,
  }
}

export async function GET() {
  const now = Date.now()
  const headers = {
    'Cache-Control': 'no-store',
  }

  if (cachedStats && now - cachedAt < CACHE_TTL_MS) {
    return NextResponse.json(cachedStats, { headers })
  }

  try {
    if (!pendingStats) {
      pendingStats = buildImpactStats().finally(() => { pendingStats = null })
    }
    const stats = await pendingStats
    cachedStats = stats
    cachedAt = Date.now()
    return NextResponse.json(stats, { headers })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load impact stats.'
    if (cachedStats) return NextResponse.json({ ...cachedStats, stale: true }, { headers })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
