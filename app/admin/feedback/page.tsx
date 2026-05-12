'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Header } from '@/components/Header'
import { supabase } from '@/lib/supabase'
import { fetchExcludedStatsSessionIds, filterExcludedSessionRows } from '@/lib/stats-exclusions'

type FeedbackRow = {
  id: string
  case_id: string | null
  case_date: string | null
  level: 'med_student' | 'resident' | 'attending' | null
  answer: string | null
  feedback_text: string
  feedback_tags: string[] | null
  created_at: string
  session_id: string | null
}

const FEEDBACK_TAG_OPTIONS = ['Too easy', 'Too hard', 'Unclear clue', 'Great case'] as const

export default function AdminFeedbackPage() {
  const [authReady, setAuthReady] = useState(false)
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [feedbackRows, setFeedbackRows] = useState<FeedbackRow[]>([])
  const [status, setStatus] = useState('')
  const [showAllReactionCases, setShowAllReactionCases] = useState(false)
  const [showReactionsByCase, setShowReactionsByCase] = useState(false)

  const feedbackTagSummary = useMemo(() => {
    const counts = Object.fromEntries(
      FEEDBACK_TAG_OPTIONS.map(tag => [tag, 0])
    ) as Record<(typeof FEEDBACK_TAG_OPTIONS)[number], number>

    for (const row of feedbackRows) {
      for (const tag of row.feedback_tags || []) {
        if (tag in counts) {
          counts[tag as keyof typeof counts] += 1
        }
      }
    }

    return counts
  }, [feedbackRows])

  const reactionsByCase = useMemo(() => {
    const grouped = new Map<
      string,
      {
        caseDate: string
        level: FeedbackRow['level']
        answer: string
        counts: Record<(typeof FEEDBACK_TAG_OPTIONS)[number], number>
        total: number
      }
    >()

    for (const row of feedbackRows) {
      if (!row.feedback_tags || row.feedback_tags.length === 0) continue

      const caseDate = row.case_date || row.created_at.slice(0, 10)
      const level = row.level
      const answer = row.answer || 'Unknown'
      const key = `${caseDate}__${level || 'unknown'}__${answer}`

      if (!grouped.has(key)) {
        grouped.set(key, {
          caseDate,
          level,
          answer,
          counts: Object.fromEntries(
            FEEDBACK_TAG_OPTIONS.map(tag => [tag, 0])
          ) as Record<(typeof FEEDBACK_TAG_OPTIONS)[number], number>,
          total: 0,
        })
      }

      const entry = grouped.get(key)!
      for (const tag of row.feedback_tags) {
        if (tag in entry.counts) {
          entry.counts[tag as keyof typeof entry.counts] += 1
          entry.total += 1
        }
      }
    }

    return Array.from(grouped.values()).sort((a, b) => {
      if (b.caseDate !== a.caseDate) return b.caseDate.localeCompare(a.caseDate)
      return b.total - a.total
    })
  }, [feedbackRows])

  const recentReactionCases = useMemo(() => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 2)
    const cutoffIso = cutoff.toISOString().slice(0, 10)
    return reactionsByCase.filter(item => item.caseDate >= cutoffIso)
  }, [reactionsByCase])

  const visibleReactionCases = showAllReactionCases ? reactionsByCase : recentReactionCases

  useEffect(() => {
    const savedUnlock = window.sessionStorage.getItem('orthodle_admin_unlocked')
    setIsUnlocked(savedUnlock === 'true')
    setAuthReady(true)
  }, [])

  useEffect(() => {
    if (!isUnlocked) return
    void loadFeedback()
  }, [isUnlocked])

  async function loadFeedback() {
    const excludedSessionIdSet = new Set(await fetchExcludedStatsSessionIds())
    const { data, error } = await supabase
      .from('case_feedback')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      setStatus(`Could not load feedback: ${error.message}`)
      return
    }

    setFeedbackRows(filterExcludedSessionRows((data || []) as FeedbackRow[], excludedSessionIdSet))
  }

  async function deleteFeedback(id: string) {
    const { error } = await supabase.from('case_feedback').delete().eq('id', id)

    if (error) {
      setStatus(`Could not remove feedback: ${error.message}`)
      return
    }

    setFeedbackRows(prev => prev.filter(item => item.id !== id))
    setStatus('Feedback removed.')
  }

  function formatLevel(level: FeedbackRow['level']) {
    if (level === 'med_student') return 'Med Student'
    if (level === 'resident') return 'Resident'
    if (level === 'attending') return 'Attending'
    return 'Unknown'
  }

  if (!authReady) {
    return (
      <main>
        <Header />
      </main>
    )
  }

  if (!isUnlocked) {
    return (
      <main className="min-h-screen bg-[#fbfaf7]">
        <Header />
        <div className="mx-auto max-w-xl px-4 py-10 sm:px-6 sm:py-12">
          <section className="rounded-2xl border border-[#ded7ca] bg-white p-5 shadow-sm sm:p-6">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#637268]">
              Admin Access
            </div>
            <h1 className="mt-3 font-serif text-3xl font-bold text-[#102018]">
              Unlock admin first
            </h1>
            <p className="mt-2 text-sm leading-6 text-[#637268]">
              Open the main admin page first, then come back here to review case feedback.
            </p>
            <Link
              href="/admin"
              className="mt-5 inline-flex rounded-lg bg-[#1f6448] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#174c37]"
            >
              Go to admin
            </Link>
          </section>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#fbfaf7]">
      <Header />

      <div className="mx-auto max-w-5xl px-3 py-4 sm:px-6 sm:py-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#637268]">
              Admin
            </div>
            <h1 className="mt-2 font-serif text-[30px] font-bold leading-none text-[#102018] sm:text-3xl">
              Case Feedback
            </h1>
            <p className="mt-1.5 text-sm text-[#637268]">
              Review player feedback from completed cases.
            </p>
          </div>

          <Link
            href="/admin"
            className="self-start rounded-lg border border-[#ded7ca] px-3 py-1.5 text-sm font-semibold text-[#102018] transition hover:bg-white"
          >
            Back to admin
          </Link>
        </div>

        {status && (
          <p className="mt-4 text-sm text-[#637268]">{status}</p>
        )}

        <section className="mt-4 rounded-2xl border border-[#e7e1d6] bg-white p-3 shadow-[0_10px_24px_rgba(16,32,24,0.04)] sm:mt-5 sm:p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="font-serif text-xl font-bold text-[#102018]">
              Feedback sheet
            </h2>
            <div className="rounded-full border border-[#ded7ca] bg-[#fbfaf7] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#637268]">
              {feedbackRows.length} rows
            </div>
          </div>

          <div className="mt-3 hidden overflow-hidden rounded-xl border border-[#e7e1d6] md:block">
            <div className="grid grid-cols-[110px_130px_150px_minmax(0,1fr)_100px] border-b border-[#e7e1d6] bg-[#fbfaf7] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#637268]">
              <div>Date</div>
              <div>Level</div>
              <div>Answer</div>
              <div>Feedback</div>
              <div className="text-center">Remove</div>
            </div>

            <div className="max-h-[720px] overflow-y-auto">
              {feedbackRows.length === 0 ? (
                <div className="px-3 py-4 text-sm text-[#637268]">
                  No feedback yet.
                </div>
              ) : (
                feedbackRows.map(item => (
                  <div
                    key={item.id}
                    className="grid grid-cols-[110px_130px_150px_minmax(0,1fr)_100px] items-start gap-2 border-b border-[#f1ece2] px-3 py-3 last:border-b-0"
                  >
                    <div className="text-sm text-[#102018]">
                      {item.case_date || item.created_at.slice(0, 10)}
                    </div>
                    <div className="text-sm text-[#102018]">
                      {formatLevel(item.level)}
                    </div>
                    <div className="text-sm text-[#102018]">
                      {item.answer || 'Unknown'}
                    </div>
                    <div className="text-sm leading-6 text-[#102018]">
                      {item.feedback_tags && item.feedback_tags.length > 0 && (
                        <div className="mb-2 flex flex-wrap gap-1.5">
                          {item.feedback_tags.map(tag => (
                            <span
                              key={`${item.id}-${tag}`}
                              className="rounded-full border border-[#ded7ca] bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#102018]"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      {item.feedback_text}
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteFeedback(item.id)}
                      className="rounded-lg border border-[#f0d7c8] bg-[#fff1e8] px-3 py-2 text-sm font-semibold text-[#a24d24] transition hover:bg-[#ffe8da]"
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mt-3 space-y-2.5 md:hidden">
            {feedbackRows.length === 0 ? (
              <div className="rounded-xl border border-[#e7e1d6] bg-[#fcfbf8] px-3 py-4 text-sm text-[#637268]">
                No feedback yet.
              </div>
            ) : (
              feedbackRows.map(item => (
                <article
                  key={item.id}
                  className="rounded-xl border border-[#e7e1d6] bg-[#fcfbf8] p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full border border-[#ded7ca] bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#637268]">
                          {item.case_date || item.created_at.slice(0, 10)}
                        </span>
                        <span className="rounded-full border border-[#ded7ca] bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#637268]">
                          {formatLevel(item.level)}
                        </span>
                      </div>
                      <div className="mt-2 text-sm font-semibold text-[#102018]">
                        {item.answer || 'Unknown'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteFeedback(item.id)}
                      className="shrink-0 rounded-lg border border-[#f0d7c8] bg-[#fff1e8] px-3 py-1.5 text-xs font-semibold text-[#a24d24] transition hover:bg-[#ffe8da]"
                    >
                      Remove
                    </button>
                  </div>

                  {item.feedback_tags && item.feedback_tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {item.feedback_tags.map(tag => (
                        <span
                          key={`${item.id}-${tag}`}
                          className="rounded-full border border-[#ded7ca] bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#102018]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <p className="mt-2 text-sm leading-6 text-[#102018]">
                    {item.feedback_text}
                  </p>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="mt-4 rounded-2xl border border-[#e7e1d6] bg-white p-3 shadow-[0_10px_24px_rgba(16,32,24,0.04)] sm:mt-5 sm:p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="font-serif text-xl font-bold text-[#102018]">
              Quick reactions
            </h2>
            <div className="rounded-full border border-[#ded7ca] bg-[#fbfaf7] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#637268]">
              Tag totals
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-4">
            {FEEDBACK_TAG_OPTIONS.map(tag => (
              <div
                key={tag}
                className="rounded-xl border border-[#ded7ca] bg-white px-2.5 py-2.5 text-center sm:px-3 sm:py-3"
              >
                <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#102018] sm:text-[10px] sm:tracking-[0.16em]">
                  {tag}
                </div>
                <div className="mt-1 font-serif text-xl font-bold text-[#102018] sm:text-2xl">
                  {feedbackTagSummary[tag]}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-4 rounded-2xl border border-[#e7e1d6] bg-white p-3 shadow-[0_10px_24px_rgba(16,32,24,0.04)] sm:mt-5 sm:p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="font-serif text-xl font-bold text-[#102018]">
              Reactions by case
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-full border border-[#ded7ca] bg-[#fbfaf7] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#637268]">
                {reactionsByCase.length} cases
              </div>
              <button
                type="button"
                onClick={() => setShowReactionsByCase(prev => !prev)}
                className="rounded-lg border border-[#ded7ca] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#637268] transition hover:bg-white"
              >
                {showReactionsByCase ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {!showReactionsByCase ? (
            <p className="mt-4 text-sm text-[#637268]">
              Showing this section is optional. It starts collapsed to keep the page lighter.
            </p>
          ) : reactionsByCase.length === 0 ? (
            <p className="mt-4 text-sm text-[#637268]">
              No quick reactions yet.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {visibleReactionCases.map(item => (
                <div
                  key={`${item.caseDate}-${item.level}-${item.answer}`}
                  className="rounded-xl border border-[#e7e1d6] bg-white p-3"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#637268]">
                        {item.caseDate} · {formatLevel(item.level)}
                      </div>
                      <div className="mt-1 text-base font-semibold text-[#102018]">
                        {item.answer}
                      </div>
                    </div>
                    <div className="rounded-full border border-[#ded7ca] bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#637268]">
                      {item.total} reactions
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-4">
                    {FEEDBACK_TAG_OPTIONS.map(tag => (
                      <div
                        key={`${item.caseDate}-${item.answer}-${tag}`}
                        className="rounded-lg border border-[#ded7ca] bg-white px-2.5 py-2 text-center sm:px-3"
                      >
                        <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#102018] sm:text-[10px] sm:tracking-[0.14em]">
                          {tag}
                        </div>
                        <div className="mt-1 text-lg font-semibold text-[#102018]">
                          {item.counts[tag]}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {reactionsByCase.length > recentReactionCases.length && (
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => setShowAllReactionCases(prev => !prev)}
                    className="rounded-lg border border-[#ded7ca] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#637268] transition hover:bg-white"
                  >
                    {showAllReactionCases ? 'Show recent only' : 'Show more'}
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
