'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Header } from '@/components/Header'
import { PublicFooter } from '@/components/PublicFooter'
import { supabase } from '@/lib/supabase'
import { fetchExcludedStatsSessionIds, filterExcludedSessionRows } from '@/lib/stats-exclusions'
import { clearStatsSummary, getCompletedCaseKeys, getSessionId, todayISO } from '@/lib/utils'

type Level = 'med_student' | 'resident' | 'attending'

type ArchiveCase = {
  id: string
  case_date: string
  level: Level
  category: string | null
  image_url: string | null
}

type GuessLite = {
  case_id: string | null
  session_id: string
}

type FeedbackLite = {
  case_id: string | null
  feedback_tags: string[] | null
}

type ArchiveLevelFilter = 'all' | Level | 'anatomy'

const levelOrder: Level[] = ['med_student', 'resident', 'attending']
const LAUNCH_DATE = '2026-04-27'
const SURGICAL_ANATOMY_LAUNCH_DATE = '2026-05-14'

export default function ArchivePage() {
  const today = todayISO()
  const sessionId = useMemo(() => getSessionId(), [])
  const [cases, setCases] = useState<ArchiveCase[]>([])
  const [loading, setLoading] = useState(true)
  const [showCaseList, setShowCaseList] = useState(true)
  const [selectedLevel, setSelectedLevel] = useState<ArchiveLevelFilter>('all')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [imagingOnly, setImagingOnly] = useState(false)
  const [completedArchiveKeys, setCompletedArchiveKeys] = useState<Set<string>>(new Set())
  const [guessRows, setGuessRows] = useState<GuessLite[]>([])
  const [feedbackRows, setFeedbackRows] = useState<FeedbackLite[]>([])

  useEffect(() => {
    setCompletedArchiveKeys(getCompletedCaseKeys(true))
  }, [])

  useEffect(() => {
    async function loadArchive() {
      const [excludedSessionIds, { data }, { data: guessData }, { data: feedbackData }] = await Promise.all([
        fetchExcludedStatsSessionIds(),
        supabase
          .from('cases')
          .select('id, case_date, level, category, image_url')
          .gte('case_date', LAUNCH_DATE)
          .lte('case_date', today)
          .order('case_date', { ascending: false })
          .limit(240),
        supabase
          .from('guesses')
          .select('case_id, session_id')
          .limit(5000),
        supabase
          .from('case_feedback')
          .select('case_id, feedback_tags')
          .limit(5000),
      ])

      const nextCases = (data || []) as ArchiveCase[]
      const nextGuessRows = filterExcludedSessionRows(
        (guessData || []) as GuessLite[],
        new Set(excludedSessionIds)
      )

      setCases(nextCases)
      setGuessRows(nextGuessRows)
      setFeedbackRows((feedbackData || []) as FeedbackLite[])
      const completedKeysFromServer = new Set(
        nextGuessRows
          .filter(row => row.session_id === sessionId && row.case_id)
          .map(row => nextCases.find(item => item.id === row.case_id))
          .filter((item): item is ArchiveCase => Boolean(item) && item.case_date !== today)
          .map(item => `${item.case_date}:${item.level}:archive`)
      )
      if (completedKeysFromServer.size > 0) {
        setCompletedArchiveKeys(current => new Set([...current, ...completedKeysFromServer]))
      }
      setLoading(false)
    }

    void loadArchive()
  }, [sessionId, today])

  const categoryOptions = useMemo(() => {
    return Array.from(
      new Set(
        cases
          .map(item => item.category?.trim())
          .filter((item): item is string => Boolean(item))
      )
    ).sort((a, b) => a.localeCompare(b))
  }, [cases])

  const filteredCases = useMemo(() => {
    return cases.filter(item => {
      if (item.case_date === today) return false
      if (selectedLevel === 'attending') {
        if (item.level !== 'attending' || isSurgicalAnatomyDate(item.case_date)) return false
      } else if (selectedLevel === 'anatomy') {
        if (item.level !== 'attending' || !isSurgicalAnatomyDate(item.case_date)) return false
      } else if (selectedLevel !== 'all' && item.level !== selectedLevel) {
        return false
      }
      if (selectedCategory !== 'all' && (item.category || '') !== selectedCategory) return false
      if (imagingOnly && !item.image_url) return false
      return true
    })
  }, [cases, imagingOnly, selectedCategory, selectedLevel, today])

  const groupedDates = useMemo(() => {
    const grouped = new Map<string, ArchiveCase[]>()

    for (const item of filteredCases) {
      const existing = grouped.get(item.case_date)
      if (existing) {
        existing.push(item)
      } else {
        grouped.set(item.case_date, [item])
      }
    }

    return Array.from(grouped.entries()).map(([date, items]) => ({
      date,
      items: [...items].sort(
        (a, b) => levelOrder.indexOf(a.level) - levelOrder.indexOf(b.level)
      ),
    }))
  }, [filteredCases])

  function formatDate(dateText: string) {
    return new Date(`${dateText}T12:00:00`).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  function isSurgicalAnatomyDate(dateText: string) {
    return dateText >= SURGICAL_ANATOMY_LAUNCH_DATE
  }

  function formatLevel(level: Level, dateText = today) {
    if (level === 'med_student') return 'Med Student'
    if (level === 'resident') return 'Resident'
    return isSurgicalAnatomyDate(dateText) ? 'Anatomy' : 'Attending'
  }

  const hasActiveFilters =
    selectedLevel !== 'all' || selectedCategory !== 'all' || imagingOnly
  const surprisePool = useMemo(() => {
    return filteredCases.filter(
      item => !completedArchiveKeys.has(`${item.case_date}:${item.level}:archive`)
    )
  }, [completedArchiveKeys, filteredCases])
  const surpriseTarget =
    surprisePool.length > 0
      ? surprisePool[Math.floor(Math.random() * surprisePool.length)]
      : null
  const caseDifficultyMap = useMemo(() => {
    const byCase = new Map<string, { guesses: number; players: Set<string> }>()

    for (const row of guessRows) {
      if (!row.case_id) continue
      if (!byCase.has(row.case_id)) {
        byCase.set(row.case_id, { guesses: 0, players: new Set() })
      }
      const current = byCase.get(row.case_id)!
      current.guesses += 1
      current.players.add(row.session_id)
    }

    return new Map(
      [...byCase.entries()].map(([caseId, value]) => [
        caseId,
        value.players.size > 0 ? value.guesses / value.players.size : 0,
      ])
    )
  }, [guessRows])
  const attendingPick = useMemo(() => {
    const pool = filteredCases.filter(item => item.level === 'attending')
    return pool.length > 0 ? pool[0] : null
  }, [filteredCases])
  const hardestPick = useMemo(() => {
    return [...filteredCases]
      .filter(item => caseDifficultyMap.has(item.id))
      .sort((a, b) => (caseDifficultyMap.get(b.id) || 0) - (caseDifficultyMap.get(a.id) || 0))[0] || null
  }, [caseDifficultyMap, filteredCases])

  return (
    <main className="app-surface min-h-screen">
      <Header />

      <section className="mx-auto max-w-5xl px-4 py-4 sm:px-6 sm:py-5">
        <div className="night-surface rounded-[28px] border border-[#e7e1d6] bg-white p-3 shadow-[0_10px_24px_rgba(16,32,24,0.04)] sm:p-5">
          <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#637268]">
            Archive
          </div>
          <h1 className="mt-2 font-serif text-[26px] font-bold leading-tight tracking-[-0.03em] text-[#102018] sm:text-[30px]">
            Browse older cases
          </h1>

          {(surpriseTarget || filteredCases.length > 0) && (
            <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              {surpriseTarget ? (
                <Link
                  href={`/?case=${surpriseTarget.id}&date=${surpriseTarget.case_date}&level=${surpriseTarget.level}`}
                  className="inline-flex min-h-[34px] items-center justify-center rounded-full border border-[#cfded4] bg-[#f7fbf8] px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#1f6448] transition hover:bg-white sm:min-w-[124px] sm:px-3.5 sm:text-[10px] sm:tracking-[0.16em]"
                >
                  Surprise me
                </Link>
              ) : (
                <div className="inline-flex min-h-[34px] items-center justify-center rounded-full border border-[#ded7ca] bg-[#fbfaf7] px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#8b938d] sm:min-w-[124px] sm:px-3.5 sm:text-[10px] sm:tracking-[0.16em]">
                  All done
                </div>
              )}
              {hardestPick && (
                <Link
                  href={`/?case=${hardestPick.id}&date=${hardestPick.case_date}&level=${hardestPick.level}`}
                  className="inline-flex min-h-[34px] items-center justify-center rounded-full border border-[#ead9b7] bg-[#fff8ef] px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#a24d24] transition hover:bg-[#fff2e2] sm:min-w-[124px] sm:px-3.5 sm:text-[10px] sm:tracking-[0.16em]"
                >
                  Hardest pick
                </Link>
              )}
              <button
                type="button"
                onClick={() => {
                  clearStatsSummary()
                  setCompletedArchiveKeys(new Set())
                }}
                className="inline-flex min-h-[34px] items-center justify-center rounded-full border border-[#ded7ca] bg-white px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#637268] transition hover:bg-[#fbfaf7] sm:min-w-[124px] sm:px-3.5 sm:text-[10px] sm:tracking-[0.16em]"
              >
                Reset cases
              </button>
            </div>
          )}

          <div className="mt-3 rounded-2xl border border-[#ebe5db] bg-[#fcfbf8] p-2.5 sm:p-3">
            <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.18em] text-[#637268]">
              Filters
            </div>

            <div className="space-y-2.5">
              <div>
                <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.14em] text-[#637268]">
                  Difficulty
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    ['all', 'All levels'],
                    ['med_student', 'Med Student'],
                    ['resident', 'Resident'],
                    ['attending', 'Attending'],
                    ['anatomy', 'Anatomy'],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setSelectedLevel(value as ArchiveLevelFilter)}
                      className={`rounded-full border px-3 py-1.5 text-[10px] font-semibold transition ${
                        selectedLevel === value
                          ? 'border-[#1f6448] bg-[#1f6448] text-white'
                          : 'border-[#ded7ca] bg-white text-[#637268] hover:bg-[#fbfaf7]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setImagingOnly(current => !current)}
                    className={`rounded-full border px-3 py-1.5 text-[10px] font-semibold transition ${
                      imagingOnly
                        ? 'border-[#1f6448] bg-[#eef7f2] text-[#1f6448]'
                        : 'border-[#ded7ca] bg-white text-[#637268] hover:bg-[#fbfaf7]'
                    }`}
                  >
                    Has imaging
                  </button>
                </div>
              </div>

              <label className="grid gap-1 text-[9px] font-bold uppercase tracking-[0.14em] text-[#637268]">
                Category
                <select
                  value={selectedCategory}
                  onChange={e => setSelectedCategory(e.target.value)}
                  className="min-h-[36px] rounded-lg border border-[#ded7ca] bg-white px-3 py-2 text-[12px] text-[#102018]"
                >
                  <option value="all">All categories</option>
                  {categoryOptions.map(option => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {hasActiveFilters && (
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="text-[11px] text-[#637268]">
                  Showing {filteredCases.length} matching case{filteredCases.length === 1 ? '' : 's'}.
                </p>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedLevel('all')
                    setSelectedCategory('all')
                    setImagingOnly(false)
                  }}
                  className="rounded-lg border border-[#ded7ca] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#637268] transition hover:bg-white"
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#637268]">
              Previous cases
            </div>
            <button
              type="button"
              onClick={() => setShowCaseList(current => !current)}
              className="rounded-full border border-[#ded7ca] bg-white px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-[#637268] transition hover:bg-[#fbfaf7]"
            >
              {showCaseList ? 'Collapse' : 'Expand'}
            </button>
          </div>

          {loading ? (
            <div className="mt-5 rounded-xl border border-dashed border-[#ded7ca] bg-[#fbfaf7] px-4 py-4 text-sm text-[#637268]">Loading archive...</div>
          ) : groupedDates.length === 0 ? (
            <div className="mt-5 rounded-xl border border-dashed border-[#ded7ca] bg-[#fbfaf7] px-4 py-4 text-sm text-[#637268]">No archive cases are available yet.</div>
          ) : !showCaseList ? (
            <div className="mt-4 rounded-xl border border-dashed border-[#ded7ca] bg-[#fbfaf7] px-4 py-3 text-sm text-[#637268]">
              {groupedDates.length} dates ready. Expand to browse the full archive.
            </div>
          ) : (
            <div className="mt-3 space-y-1.5">
              {groupedDates.map(group => (
                <div
                  key={group.date}
                  className="rounded-2xl border border-[#e7e1d6] bg-[#fcfbf8] p-2 sm:p-3"
                >
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#637268]">
                    {formatDate(group.date)}
                  </div>

                  <div className="mt-1.5 grid gap-1.5 sm:grid-cols-3 sm:gap-2">
                    {levelOrder.map(level => {
                      const item = group.items.find(entry => entry.level === level)
                      const isCompleted = item
                        ? completedArchiveKeys.has(`${item.case_date}:${item.level}:archive`)
                        : false

                      return item ? (
                        <Link
                          key={`${group.date}-${level}`}
                          href={`/?case=${item.id}&date=${group.date}&level=${level}`}
                          className="rounded-xl border border-[#ded7ca] bg-white px-2.5 py-1.5 transition hover:bg-[#f8fbf9]"
                        >
                          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#637268]">
                            {formatLevel(level, item.case_date)}
                          </div>
                          <div className="mt-0.5 font-serif text-[13px] font-bold leading-tight text-[#102018]">
                            {item.category || 'Case'}
                          </div>
                          <div className={`mt-0.5 text-[10px] ${isCompleted ? 'text-[#a24d24]' : 'text-[#1f6448]'}`}>
                            {isCompleted ? 'Completed case' : 'Open case'}
                          </div>
                        </Link>
                      ) : (
                        <div
                          key={`${group.date}-${level}`}
                          className="rounded-xl border border-dashed border-[#ded7ca] bg-white px-2.5 py-1.5 text-[#9aa39c]"
                        >
                          <div className="text-[10px] font-bold uppercase tracking-[0.16em]">
                            {formatLevel(level, group.date)}
                          </div>
                          <div className="mt-0.5 text-[11px]">No case saved</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
      <PublicFooter />
    </main>
  )
}
