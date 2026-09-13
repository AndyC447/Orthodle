'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type VisitRow = {
  session_id: string
  created_at: string
  geo_country: string | null
}

type GuessRow = {
  session_id: string
  created_at: string
  is_correct: boolean
}

type CountRow = { id: string }
type FeedbackRow = { id: string; feedback_tags: string[] | null }
type SurveyResponseRow = { response: string }

const PAGE_SIZE = 1000

function timestampToLocalISO(timestamp: string) {
  const date = new Date(timestamp)
  const timezoneOffsetMs = date.getTimezoneOffset() * 60 * 1000
  return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 10)
}

function formatCount(value: number) {
  return value.toLocaleString('en-US')
}

function formatPercent(value: number, digits = 0) {
  return `${value.toFixed(digits)}%`
}

export function ImpactDashboard() {
  const [screenshotMode, setScreenshotMode] = useState(false)
  const [visits, setVisits] = useState<VisitRow[]>([])
  const [guesses, setGuesses] = useState<GuessRow[]>([])
  const [caseCount, setCaseCount] = useState(0)
  const [submissionCount, setSubmissionCount] = useState(0)
  const [feedbackRows, setFeedbackRows] = useState<FeedbackRow[]>([])
  const [surveyResponses, setSurveyResponses] = useState<SurveyResponseRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function fetchPaged<T>(table: string, select: string) {
      const rows: T[] = []
      let offset = 0

      while (true) {
        const { data, error } = await supabase
          .from(table)
          .select(select)
          .range(offset, offset + PAGE_SIZE - 1)

        if (error) break
        if (!data || data.length === 0) break

        rows.push(...(data as T[]))

        if (data.length < PAGE_SIZE) break
        offset += PAGE_SIZE
      }

      return rows
    }

    async function load() {
      const [visitRows, guessRows, caseRows, submissionRows, feedbackData, surveyData] =
        await Promise.all([
          fetchPaged<VisitRow>('visits', 'session_id, created_at, geo_country'),
          fetchPaged<GuessRow>('guesses', 'session_id, created_at, is_correct'),
          fetchPaged<CountRow>('cases', 'id'),
          fetchPaged<CountRow>('case_submissions', 'id'),
          fetchPaged<FeedbackRow>('case_feedback', 'id, feedback_tags'),
          fetchPaged<SurveyResponseRow>('homepage_survey_responses', 'response'),
        ])

      if (!cancelled) {
        setVisits(visitRows)
        setGuesses(guessRows)
        setCaseCount(caseRows.length)
        setSubmissionCount(submissionRows.length)
        setFeedbackRows(feedbackData)
        setSurveyResponses(surveyData)
        setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const metrics = useMemo(() => {
    const uniqueUsers = new Set<string>()
    const firstSeenBySession = new Map<string, string>()
    const sessionsByDate = new Map<string, Set<string>>()
    const countries = new Set<string>()
    const today = timestampToLocalISO(new Date().toISOString())
    let correctGuesses = 0

    for (const visit of visits) {
      uniqueUsers.add(visit.session_id)
      const date = timestampToLocalISO(visit.created_at)
      if (!sessionsByDate.has(date)) sessionsByDate.set(date, new Set())
      sessionsByDate.get(date)!.add(visit.session_id)
      if (!firstSeenBySession.has(visit.session_id) || date < firstSeenBySession.get(visit.session_id)!) {
        firstSeenBySession.set(visit.session_id, date)
      }
      if (visit.geo_country?.trim()) countries.add(visit.geo_country.trim())
    }

    for (const guess of guesses) {
      if (guess.is_correct) correctGuesses += 1
      const date = timestampToLocalISO(guess.created_at)
      if (!sessionsByDate.has(date)) sessionsByDate.set(date, new Set())
      sessionsByDate.get(date)!.add(guess.session_id)
      if (!firstSeenBySession.has(guess.session_id) || date < firstSeenBySession.get(guess.session_id)!) {
        firstSeenBySession.set(guess.session_id, date)
      }
      uniqueUsers.add(guess.session_id)
    }

    const todaySessions = sessionsByDate.get(today) || new Set<string>()
    let newUsersToday = 0
    let returningUsersToday = 0
    for (const sessionId of todaySessions) {
      if (firstSeenBySession.get(sessionId) === today) newUsersToday += 1
      else returningUsersToday += 1
    }

    const recentDays = [...sessionsByDate.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 7)

    const weeklyActiveUsers = new Set<string>()
    for (const [, sessions] of recentDays) {
      for (const sessionId of sessions) weeklyActiveUsers.add(sessionId)
    }

    const surveyBreakdown = new Map<string, number>()
    for (const row of surveyResponses) {
      const label = row.response?.trim()
      if (!label) continue
      surveyBreakdown.set(label, (surveyBreakdown.get(label) || 0) + 1)
    }

    const reactionCount = feedbackRows.reduce(
      (sum, row) => sum + ((row.feedback_tags || []).length > 0 ? 1 : 0),
      0
    )

    return {
      totalUsers: uniqueUsers.size,
      todayUsers: todaySessions.size,
      newUsersToday,
      returningUsersToday,
      weeklyActiveUsers: weeklyActiveUsers.size,
      totalGuesses: guesses.length,
      correctGuesses,
      guessAccuracy: guesses.length > 0 ? (correctGuesses / guesses.length) * 100 : 0,
      averageGuessesPerUser: uniqueUsers.size > 0 ? guesses.length / uniqueUsers.size : 0,
      returningRateToday:
        todaySessions.size > 0 ? (returningUsersToday / todaySessions.size) * 100 : 0,
      countriesReached: countries.size,
      feedbackEntries: feedbackRows.length,
      reactionCount,
      surveyBreakdown: [...surveyBreakdown.entries()]
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.label.localeCompare(b.label))),
    }
  }, [feedbackRows, guesses, surveyResponses, visits])

  const spotlightCards = [
    {
      title: 'Reach',
      primaryValue: formatCount(metrics.totalUsers),
      primaryLabel: 'total users',
      secondaryValue: formatCount(metrics.weeklyActiveUsers),
      secondaryLabel: 'weekly active',
    },
    {
      title: 'Engagement',
      primaryValue: formatCount(metrics.totalGuesses),
      primaryLabel: 'total guesses',
      secondaryValue: formatPercent(metrics.guessAccuracy),
      secondaryLabel: 'guess accuracy',
    },
    {
      title: 'Content',
      primaryValue: formatCount(caseCount),
      primaryLabel: 'published cases',
      secondaryValue: formatCount(metrics.countriesReached),
      secondaryLabel: 'countries reached',
    },
    {
      title: 'Feedback loop',
      primaryValue: formatCount(metrics.feedbackEntries),
      primaryLabel: 'feedback entries',
      secondaryValue: formatCount(submissionCount),
      secondaryLabel: 'case submissions',
    },
  ]

  const cvLine = `Built and launched Orthodle, a daily orthopedics learning platform with ${formatCount(metrics.totalUsers)} users, ${formatCount(caseCount)} published cases, ${formatCount(metrics.totalGuesses)} learner guesses, and reach across ${formatCount(metrics.countriesReached)} countries.`

  const compactHighlights = [
    `${formatCount(metrics.returningUsersToday)} returning users today`,
    `${formatPercent(metrics.returningRateToday)} returning rate today`,
    `${formatCount(metrics.reactionCount)} quick reactions`,
  ]

  return (
    <>
      <div className={`mb-4 flex flex-wrap items-center justify-between gap-3 ${screenshotMode ? 'opacity-80' : ''}`}>
        <div className="rounded-full border border-[#ead9b7] bg-[#fffaf1] px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#a24d24]">
          {screenshotMode ? 'Screenshot mode on' : 'Resume asset mode'}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setScreenshotMode(prev => !prev)}
            className="inline-flex items-center rounded-full border border-[#ded7ca] bg-white px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#637268] transition hover:bg-[#fbfaf7]"
          >
            {screenshotMode ? 'Exit screenshot mode' : 'Screenshot mode'}
          </button>
        </div>
      </div>

      <div className="night-surface overflow-hidden rounded-[28px] border border-[#e7e1d6] bg-white p-5 shadow-[0_10px_24px_rgba(16,32,24,0.04)] sm:p-6">
        <div className="max-w-4xl">
          <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#637268]">
            Impact snapshot
          </div>
          <h1 className="mt-2 font-serif text-[32px] font-bold leading-tight tracking-[-0.04em] text-[#102018] sm:text-[38px]">
            Orthodle traction
          </h1>
        </div>

        <div className="mt-4 rounded-[22px] border border-[#dfe9e2] bg-[#f7fbf8] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
          <p className="text-[14px] leading-6 text-[#102018] sm:text-[15px]">
            {loading ? 'Loading impact summary…' : cvLine}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {compactHighlights.map(item => (
              <div
                key={item}
                className="rounded-full border border-[#d8e5dd] bg-white px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#315f4d]"
              >
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {spotlightCards.map(card => (
            <div
              key={card.title}
              className="rounded-[22px] border border-[#e7e1d6] bg-[#fbfaf7] px-4 py-4"
            >
              <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#637268]">
                {card.title}
              </div>
              <div className="mt-3 font-serif text-[30px] font-bold leading-none text-[#102018]">
                {loading ? '—' : card.primaryValue}
              </div>
              <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-[#6f786f]">
                {card.primaryLabel}
              </div>
              <div className="mt-4 border-t border-[#e7e1d6] pt-3">
                <div className="font-serif text-[24px] font-bold leading-none text-[#102018]">
                  {loading ? '—' : card.secondaryValue}
                </div>
                <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-[#6f786f]">
                  {card.secondaryLabel}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="night-surface rounded-[24px] border border-[#e7e1d6] bg-white p-5 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
          <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#315f4d]">
            Resume line
          </div>
          <p className="mt-3 text-[14px] leading-6 text-[#102018]">
            {loading ? 'Loading resume line…' : cvLine}
          </p>
        </div>

        <div className="night-surface rounded-[24px] border border-[#e7e1d6] bg-white p-5 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
          <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#315f4d]">
            Ownership
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {['Product design', 'Full-stack build', 'Content system', 'Analytics + iteration'].map(item => (
              <div
                key={item}
                className="rounded-full border border-[#e7e1d6] bg-[#fcfbf8] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#637268]"
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
