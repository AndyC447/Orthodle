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

export function ImpactDashboard() {
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
      countriesReached: countries.size,
      feedbackEntries: feedbackRows.length,
      reactionCount,
      surveyBreakdown: [...surveyBreakdown.entries()]
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.label.localeCompare(b.label))),
    }
  }, [feedbackRows, guesses, surveyResponses, visits])

  const statCards = [
    ['Total users', metrics.totalUsers],
    ['Weekly active users', metrics.weeklyActiveUsers],
    ['New users today', metrics.newUsersToday],
    ['Returning users today', metrics.returningUsersToday],
    ['Countries reached', metrics.countriesReached],
    ['Cases published', caseCount],
    ['Total guesses', metrics.totalGuesses],
    ['Feedback entries', metrics.feedbackEntries],
    ['Quick reactions', metrics.reactionCount],
    ['Case submissions', submissionCount],
  ]

  return (
    <>
      <div className="night-surface rounded-[28px] border border-[#e7e1d6] bg-white p-5 shadow-[0_10px_24px_rgba(16,32,24,0.04)] sm:p-6">
        <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#637268]">
          Impact
        </div>
        <h1 className="mt-2 font-serif text-[30px] font-bold leading-tight tracking-[-0.03em] text-[#102018]">
          Orthodle at a glance
        </h1>
        <p className="mt-3 max-w-3xl text-[14px] leading-6 text-[#637268]">
          A cleaner platform snapshot for interviews, your CV, or anyone who wants to understand
          the educational reach and traction behind the project.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {statCards.map(([label, value]) => (
            <div
              key={label}
              className="rounded-[22px] border border-[#e7e1d6] bg-[#fbfaf7] px-4 py-4"
            >
              <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#637268]">
                {label}
              </div>
              <div className="mt-2 font-serif text-[28px] font-bold text-[#102018]">
                {loading ? '—' : formatCount(Number(value))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="night-surface rounded-[24px] border border-[#e7e1d6] bg-white p-5 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
          <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#315f4d]">
            What this says
          </div>
          <div className="mt-4 space-y-3 text-[14px] leading-6 text-[#102018]">
            <p>
              Orthodle is not just a static portfolio piece. It has live usage, recurring
              visitors, international reach, and an active feedback loop.
            </p>
            <p>
              The most useful headline metrics right now are the repeat-user split, the number of
              countries reached, and the continued flow of guesses, feedback, and submissions.
            </p>
            <p className="text-[#637268]">
              If you want, this page can keep evolving into a cleaner “project dossier” over time
              as the case library and audience grow.
            </p>
          </div>
        </div>

        <div className="night-surface rounded-[24px] border border-[#e7e1d6] bg-white p-5 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
          <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#315f4d]">
            Training snapshot
          </div>
          <div className="mt-4 space-y-2.5">
            {metrics.surveyBreakdown.length > 0 ? (
              metrics.surveyBreakdown.map(item => (
                <div
                  key={item.label}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-[#e7e1d6] px-3.5 py-2.5"
                >
                  <div className="text-[14px] font-medium text-[#102018]">{item.label}</div>
                  <div className="text-[13px] font-semibold text-[#637268]">
                    {formatCount(item.count)}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-[13px] text-[#637268]">Survey responses will appear here.</div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
