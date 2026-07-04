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
      label: 'Total users reached',
      value: formatCount(metrics.totalUsers),
      note: 'Distinct learners who have used Orthodle',
    },
    {
      label: 'Weekly active users',
      value: formatCount(metrics.weeklyActiveUsers),
      note: 'Recent recurring engagement across the platform',
    },
    {
      label: 'Countries reached',
      value: formatCount(metrics.countriesReached),
      note: 'International footprint from real usage',
    },
    {
      label: 'Cases published',
      value: formatCount(caseCount),
      note: 'Original clinical cases built and shipped',
    },
    {
      label: 'Total guesses logged',
      value: formatCount(metrics.totalGuesses),
      note: 'Active learner interaction, not passive traffic',
    },
    {
      label: 'Guess accuracy',
      value: formatPercent(metrics.guessAccuracy),
      note: 'Signal of challenge calibration and engagement',
    },
  ]

  const tractionRows = [
    {
      label: 'Returning users today',
      value: formatCount(metrics.returningUsersToday),
      sublabel: `${formatPercent(metrics.returningRateToday)} of today’s active users`,
    },
    {
      label: 'Feedback entries',
      value: formatCount(metrics.feedbackEntries),
      sublabel: 'Written learner feedback captured on-platform',
    },
    {
      label: 'Quick reactions',
      value: formatCount(metrics.reactionCount),
      sublabel: 'Lightweight product feedback signals',
    },
    {
      label: 'Case submissions',
      value: formatCount(submissionCount),
      sublabel: 'Inbound contributor interest and collaboration',
    },
  ]

  const resumeBullets = [
    `Built and launched Orthodle, a daily orthopedics learning platform with ${formatCount(metrics.totalUsers)} total users and ${formatCount(metrics.weeklyActiveUsers)} weekly active users.`,
    `Designed and maintained a clinical content library of ${formatCount(caseCount)} published cases that has generated ${formatCount(metrics.totalGuesses)} learner guesses across ${formatCount(metrics.countriesReached)} countries.`,
    `Created a feedback-driven product loop with ${formatCount(metrics.feedbackEntries)} written feedback entries, ${formatCount(metrics.reactionCount)} quick reactions, and ${formatCount(submissionCount)} case submissions.`,
  ]

  return (
    <>
      <div className="night-surface overflow-hidden rounded-[28px] border border-[#e7e1d6] bg-white p-5 shadow-[0_10px_24px_rgba(16,32,24,0.04)] sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#637268]">
              Impact snapshot
            </div>
            <h1 className="mt-2 font-serif text-[32px] font-bold leading-tight tracking-[-0.04em] text-[#102018] sm:text-[38px]">
              Orthodle is a live product, not just a side project.
            </h1>
            <p className="mt-3 text-[14px] leading-6 text-[#637268] sm:text-[15px]">
              This page is built to make the project legible to interviewers, faculty, and anyone
              evaluating product ownership, execution, and real-world traction.
            </p>
          </div>

          <div className="rounded-[24px] border border-[#ead9b7] bg-[#fffaf1] px-4 py-4 shadow-[0_10px_24px_rgba(138,107,63,0.08)] xl:max-w-[340px]">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#a24d24]">
              Resume-ready headline
            </div>
            <p className="mt-2 font-serif text-[20px] font-bold leading-tight tracking-[-0.03em] text-[#102018]">
              Built, shipped, and grew a daily orthopedics learning platform with real user traction.
            </p>
            <p className="mt-2 text-[13px] leading-5 text-[#7a6954]">
              Usage, content depth, feedback volume, and repeat engagement are all live below.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {spotlightCards.map(card => (
            <div
              key={card.label}
              className="rounded-[22px] border border-[#e7e1d6] bg-[#fbfaf7] px-4 py-4"
            >
              <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#637268]">
                {card.label}
              </div>
              <div className="mt-2 font-serif text-[30px] font-bold text-[#102018]">
                {loading ? '—' : card.value}
              </div>
              <div className="mt-1.5 text-[12px] leading-5 text-[#6f786f]">
                {card.note}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="night-surface rounded-[24px] border border-[#e7e1d6] bg-white p-5 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
          <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#315f4d]">
            Resume bullets
          </div>
          <div className="mt-4 space-y-3">
            {resumeBullets.map((bullet, index) => (
              <div
                key={index}
                className="rounded-[18px] border border-[#e7e1d6] bg-[#fcfbf8] px-4 py-3"
              >
                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#7a857c]">
                  Bullet {index + 1}
                </div>
                <p className="mt-1.5 text-[14px] leading-6 text-[#102018]">{bullet}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="night-surface rounded-[24px] border border-[#e7e1d6] bg-white p-5 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
          <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#315f4d]">
            What I owned
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            {[
              ['Product design', 'Daily gameplay flow, mobile UX, solved-state polish, onboarding, and retention loops.'],
              ['Full-stack build', 'Case engine, archive play, stats, groups, admin tools, and analytics instrumentation.'],
              ['Content system', 'Clinical case publishing workflow, image handling, scheduling, and quality guardrails.'],
              ['Growth feedback loop', 'Surveys, case feedback, usage tracking, and ongoing iteration from real learner behavior.'],
            ].map(([title, body]) => (
              <div key={title} className="rounded-[18px] border border-[#e7e1d6] bg-[#fcfbf8] px-4 py-3">
                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#7a857c]">
                  {title}
                </div>
                <p className="mt-1.5 text-[13px] leading-5.5 text-[#102018]">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_0.9fr]">
        <div className="night-surface rounded-[24px] border border-[#e7e1d6] bg-white p-5 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
          <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#315f4d]">
            Why this matters
          </div>
          <div className="mt-4 space-y-3 text-[14px] leading-6 text-[#102018]">
            <p>
              Orthodle demonstrates product ownership beyond shipping a one-off app. It combines
              repeated learner usage, original clinical content, and an admin system built for
              ongoing operation.
            </p>
            <p>
              The strongest signals here are not vanity metrics. They are repeat engagement,
              real interaction volume, international reach, and continued feedback from users.
            </p>
            <p className="text-[#637268]">
              In resume language: this is a live educational product with traction, content depth,
              and a measurable iteration loop.
            </p>
          </div>
        </div>

        <div className="night-surface rounded-[24px] border border-[#e7e1d6] bg-white p-5 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
          <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#315f4d]">
            Traction signals
          </div>
          <div className="mt-4 space-y-3">
            {tractionRows.map(item => (
              <div
                key={item.label}
                className="flex items-start justify-between gap-4 rounded-[18px] border border-[#e7e1d6] bg-[#fcfbf8] px-4 py-3"
              >
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#7a857c]">
                    {item.label}
                  </div>
                  <div className="mt-1 text-[12px] leading-5 text-[#6f786f]">{item.sublabel}</div>
                </div>
                <div className="shrink-0 font-serif text-[26px] font-bold text-[#102018]">
                  {loading ? '—' : item.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_0.9fr]">
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

        <div className="night-surface rounded-[24px] border border-[#e7e1d6] bg-white p-5 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
          <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#315f4d]">
            Interview framing
          </div>
          <div className="mt-4 space-y-3 text-[14px] leading-6 text-[#102018]">
            <p>
              If someone asks what makes Orthodle meaningful, the short answer is that it blends
              clinical education, consumer-product polish, and operational tooling into one
              continuously used platform.
            </p>
            <p>
              The strongest talking points are: you built the product, shipped the content system,
              instrumented the analytics, and kept iterating from real learner behavior.
            </p>
            <p className="text-[#637268]">
              This makes the project useful both as a learning initiative and as evidence of
              product execution, design judgment, and full-stack ownership.
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
