import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

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
const CACHE_TTL_MS = 90 * 1000

let cachedStats: ImpactStats | null = null
let cachedAt = 0

function timestampToLocalISO(timestamp: string) {
  const date = new Date(timestamp)
  const timezoneOffsetMs = date.getTimezoneOffset() * 60 * 1000
  return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 10)
}

function todayISO() {
  return timestampToLocalISO(new Date().toISOString())
}

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
  const [visits, guesses, caseCount] = await Promise.all([
    fetchPaged<VisitRow>('visits', 'session_id, created_at, geo_country, geo_city'),
    fetchPaged<GuessRow>('guesses', 'session_id, created_at, cases(case_date)'),
    fetchCount('cases'),
  ])

  const uniqueUsers = new Set<string>()
  const sessionsByDate = new Map<string, Set<string>>()
  const countries = new Set<string>()
  const citySessions = new Map<string, Set<string>>()
  const today = todayISO()
  let archiveGuesses = 0

  for (const visit of visits) {
    uniqueUsers.add(visit.session_id)
    const date = timestampToLocalISO(visit.created_at)
    if (!sessionsByDate.has(date)) sessionsByDate.set(date, new Set())
    sessionsByDate.get(date)!.add(visit.session_id)
    if (visit.geo_country?.trim()) countries.add(visit.geo_country.trim())

    const city = cleanLocationLabel(visit.geo_city)
    if (city) {
      if (!citySessions.has(city)) citySessions.set(city, new Set())
      citySessions.get(city)!.add(visit.session_id)
    }
  }

  for (const guess of guesses) {
    uniqueUsers.add(guess.session_id)
    const date = timestampToLocalISO(guess.created_at)
    if (!sessionsByDate.has(date)) sessionsByDate.set(date, new Set())
    sessionsByDate.get(date)!.add(guess.session_id)

    const caseDate = getCaseDate(guess)
    if (caseDate && caseDate < today) archiveGuesses += 1
  }

  const combinedDailyUsers = [...sessionsByDate.values()].reduce(
    (sum, sessions) => sum + sessions.size,
    0
  )
  const topCities = [...citySessions.entries()]
    .sort(([cityA, sessionsA], [cityB, sessionsB]) => {
      const sessionDelta = sessionsB.size - sessionsA.size
      return sessionDelta || cityA.localeCompare(cityB)
    })
    .slice(0, 6)
    .map(([city]) => city)

  return {
    usersReached: Math.max(uniqueUsers.size, combinedDailyUsers),
    uniqueUsers: uniqueUsers.size,
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
    'Cache-Control': 'public, s-maxage=90, stale-while-revalidate=600',
  }

  if (cachedStats && now - cachedAt < CACHE_TTL_MS) {
    return NextResponse.json(cachedStats, { headers })
  }

  try {
    const stats = await buildImpactStats()
    cachedStats = stats
    cachedAt = now
    return NextResponse.json(stats, { headers })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load impact stats.'
    if (cachedStats) return NextResponse.json(cachedStats, { headers })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
