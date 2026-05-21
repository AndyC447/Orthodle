'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Header } from '@/components/Header'
import { PublicFooter } from '@/components/PublicFooter'
import {
  DEFAULT_LEVEL_TITLES,
  normalizeLevelTitles,
  readCachedLevelTitles,
  writeCachedLevelTitles,
} from '@/lib/level-display'
import { supabase } from '@/lib/supabase'
import { fetchExcludedStatsSessionIds, filterExcludedSessionRows } from '@/lib/stats-exclusions'
import { clearStatsSummary, getCompletedCaseKeys, getSessionId, todayISO } from '@/lib/utils'

type Level = 'med_student' | 'resident' | 'attending'

type ArchiveCase = {
  id: string
  case_date: string
  level: Level
  answer: string
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

function toTitleCase(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(word => {
      if (word.toUpperCase() === word && word.length <= 4) return word
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(' ')
}

export default function ArchivePage() {
  const today = todayISO()
  const sessionId = useMemo(() => getSessionId(), [])
  const [cases, setCases] = useState<ArchiveCase[]>([])
  const [loading, setLoading] = useState(true)
  const [showCaseList, setShowCaseList] = useState(true)
  const [showAnswers, setShowAnswers] = useState(false)
  const [selectedLevel, setSelectedLevel] = useState<ArchiveLevelFilter>('all')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [answerQuery, setAnswerQuery] = useState('')
  const [imagingOnly, setImagingOnly] = useState(false)
  const [completedArchiveKeys, setCompletedArchiveKeys] = useState<Set<string>>(new Set())
  const [guessRows, setGuessRows] = useState<GuessLite[]>([])
  const [feedbackRows, setFeedbackRows] = useState<FeedbackLite[]>([])
  const [levelTitles, setLevelTitles] = useState(DEFAULT_LEVEL_TITLES)
  const [levelMenuOpen, setLevelMenuOpen] = useState(false)
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false)
  const levelMenuRef = useRef<HTMLDivElement | null>(null)
  const categoryMenuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setCompletedArchiveKeys(getCompletedCaseKeys(true))
  }, [])

  useEffect(() => {
    setLevelTitles(readCachedLevelTitles())
  }, [])

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (levelMenuRef.current && !levelMenuRef.current.contains(event.target as Node)) {
        setLevelMenuOpen(false)
      }
      if (categoryMenuRef.current && !categoryMenuRef.current.contains(event.target as Node)) {
        setCategoryMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  useEffect(() => {
    async function loadArchive() {
      const [excludedSessionIds, { data }, { data: guessData }, { data: feedbackData }, { data: levelTitleData }] = await Promise.all([
        fetchExcludedStatsSessionIds(),
        supabase
          .from('cases')
          .select('id, case_date, level, answer, category, image_url')
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
        supabase
          .from('level_display_settings')
          .select('level, title'),
      ])

      const nextCases = (data || []) as ArchiveCase[]
      const nextGuessRows = filterExcludedSessionRows(
        (guessData || []) as GuessLite[],
        new Set(excludedSessionIds)
      )

      setCases(nextCases)
      setGuessRows(nextGuessRows)
      setFeedbackRows((feedbackData || []) as FeedbackLite[])
      const nextTitles = normalizeLevelTitles(
        ((levelTitleData || []) as Array<{ level: Level; title: string }>).reduce(
          (acc, item) => {
            acc[item.level] = item.title
            return acc
          },
          {} as Partial<Record<Level, string>>
        )
      )
      setLevelTitles(nextTitles)
      writeCachedLevelTitles(nextTitles)
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
    const normalizedAnswerQuery = answerQuery.trim().toLowerCase()

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
      if (
        normalizedAnswerQuery &&
        !item.answer.toLowerCase().includes(normalizedAnswerQuery) &&
        !(item.category || '').toLowerCase().includes(normalizedAnswerQuery)
      ) {
        return false
      }
      if (imagingOnly && !item.image_url) return false
      return true
    })
  }, [answerQuery, cases, imagingOnly, selectedCategory, selectedLevel, today])

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
    if (level === 'med_student') return levelTitles.med_student
    if (level === 'resident') return levelTitles.resident
    return isSurgicalAnatomyDate(dateText) ? levelTitles.attending : 'Attending'
  }

  function formatCategoryLabel(value: string | null | undefined) {
    const trimmed = typeof value === 'string' ? value.trim() : ''
    return trimmed ? toTitleCase(trimmed) : 'Case'
  }

  const hasActiveFilters =
    selectedLevel !== 'all' || selectedCategory !== 'all' || imagingOnly || Boolean(answerQuery.trim())
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
  const pillButtonClass =
    'inline-flex min-h-[31px] items-center justify-center rounded-full border px-3 py-1.5 text-[8.5px] font-semibold tracking-[0.01em] transition sm:min-h-[34px] sm:px-3.5 sm:text-[9px]'
  const sectionLabelClass = 'text-[10px] font-bold uppercase tracking-[0.2em] text-[#637268]'
  const fieldLabelClass = 'text-[9px] font-bold uppercase tracking-[0.16em] text-[#637268]'
  const caseMetaLabelClass = 'text-[9px] font-semibold tracking-[0.01em] text-[#637268]'
  const levelOptions: Array<{ value: ArchiveLevelFilter; label: string }> = [
    { value: 'all', label: 'All Levels' },
    { value: 'med_student', label: formatLevel('med_student') },
    { value: 'resident', label: formatLevel('resident') },
    { value: 'attending', label: 'Attending' },
    { value: 'anatomy', label: formatLevel('attending') },
  ]
  const selectedLevelLabel =
    levelOptions.find(option => option.value === selectedLevel)?.label || 'All Levels'

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
            <div className="mt-3 flex flex-wrap gap-1.5">
              {surpriseTarget ? (
                <Link
                  href={`/?case=${surpriseTarget.id}&date=${surpriseTarget.case_date}&level=${surpriseTarget.level}`}
                  className={`${pillButtonClass} border-[#cfded4] bg-[#f7fbf8] text-[#1f6448] hover:bg-white`}
                >
                  Surprise me
                </Link>
              ) : (
                <div className={`${pillButtonClass} border-[#ded7ca] bg-[#fbfaf7] text-[#8b938d]`}>
                  All done
                </div>
              )}
              {hardestPick && (
                <Link
                  href={`/?case=${hardestPick.id}&date=${hardestPick.case_date}&level=${hardestPick.level}`}
                  className={`${pillButtonClass} border-[#ead9b7] bg-[#fff8ef] text-[#a24d24] hover:bg-[#fff2e2]`}
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
                className={`${pillButtonClass} border-[#ded7ca] bg-white text-[#637268] hover:bg-[#fbfaf7]`}
              >
                Reset cases
              </button>
            </div>
          )}

          <div className="mt-3 rounded-[22px] border border-[#ebe5db] bg-[#fcfbf8] p-2.5 sm:p-3">
            <div className={sectionLabelClass}>
              Filters
            </div>

            <div className="mt-2.5 space-y-2.5">
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <div className={`${fieldLabelClass} mb-1.5`}>
                  Difficulty
                </div>
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div className="relative" ref={levelMenuRef}>
                    <button
                      type="button"
                      onClick={() => setLevelMenuOpen(current => !current)}
                      className="flex min-h-[36px] w-full items-center justify-between rounded-xl border border-[#ded7ca] bg-white px-3 py-2 text-left text-[12px] text-[#102018] transition hover:bg-[#fbfaf7]"
                    >
                      <span>{selectedLevelLabel}</span>
                      <span className="ml-3 text-[10px] text-[#7a857c]">{levelMenuOpen ? '▲' : '▼'}</span>
                    </button>
                    {levelMenuOpen && (
                      <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-40 overflow-hidden rounded-2xl border border-[#e7e1d6] bg-white shadow-[0_18px_40px_rgba(16,32,24,0.06)]">
                        <div className="border-b border-[#f3eee5] px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#7a857c]">
                          Difficulty
                        </div>
                        <div className="p-2">
                          {levelOptions.map(option => (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => {
                                setSelectedLevel(option.value)
                                setLevelMenuOpen(false)
                              }}
                              className={`block w-full rounded-xl px-3 py-2 text-left text-[12px] transition ${
                                selectedLevel === option.value
                                  ? 'bg-[#f7fbf8] font-semibold text-[#1f6448]'
                                  : 'text-[#102018] hover:bg-[#fbfaf7]'
                              }`}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setImagingOnly(current => !current)}
                    className={`rounded-full border px-2.5 py-1.5 text-[8.5px] font-semibold tracking-[0.01em] transition sm:text-[9px] ${
                      imagingOnly
                        ? 'border-[#1f6448] bg-[#eef7f2] text-[#1f6448]'
                        : 'border-[#ded7ca] bg-white text-[#637268] hover:bg-[#fbfaf7]'
                    }`}
                  >
                    Has Imaging
                  </button>
                </div>
              </div>

              <label className={`grid gap-1.5 ${fieldLabelClass}`}>
                Diagnosis
                <input
                  value={answerQuery}
                  onChange={e => setAnswerQuery(e.target.value)}
                  placeholder="Search diagnosis or answer"
                  className="min-h-[36px] rounded-xl border border-[#ded7ca] bg-white px-3 py-2 text-[12px] font-medium normal-case tracking-normal text-[#102018] placeholder:text-[#8b938d]"
                />
              </label>

              <label className={`grid gap-1.5 ${fieldLabelClass}`}>
                Category
                <div className="relative" ref={categoryMenuRef}>
                  <button
                    type="button"
                    onClick={() => setCategoryMenuOpen(current => !current)}
                    className="flex min-h-[36px] w-full items-center justify-between rounded-xl border border-[#ded7ca] bg-white px-3 py-2 text-left text-[13px] text-[#102018] transition hover:bg-[#fbfaf7]"
                  >
                    <span>{selectedCategory === 'all' ? 'All Categories' : formatCategoryLabel(selectedCategory)}</span>
                    <span className="ml-3 text-[10px] text-[#7a857c]">{categoryMenuOpen ? '▲' : '▼'}</span>
                  </button>
                  {categoryMenuOpen && (
                    <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-40 overflow-hidden rounded-2xl border border-[#e7e1d6] bg-white shadow-[0_18px_40px_rgba(16,32,24,0.06)]">
                      <div className="border-b border-[#f3eee5] px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#7a857c]">
                        Category
                      </div>
                      <div className="max-h-[280px] overflow-y-auto p-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCategory('all')
                            setCategoryMenuOpen(false)
                          }}
                          className={`block w-full rounded-xl px-3 py-2 text-left text-[12px] transition ${
                            selectedCategory === 'all'
                              ? 'bg-[#f7fbf8] font-semibold text-[#1f6448]'
                              : 'text-[#102018] hover:bg-[#fbfaf7]'
                          }`}
                        >
                          All Categories
                        </button>
                        {categoryOptions.map(option => (
                          <button
                            key={option}
                            type="button"
                            onClick={() => {
                              setSelectedCategory(option)
                              setCategoryMenuOpen(false)
                            }}
                            className={`block w-full rounded-xl px-3 py-2 text-left text-[12px] transition ${
                              selectedCategory === option
                                ? 'bg-[#f7fbf8] font-semibold text-[#1f6448]'
                                : 'text-[#102018] hover:bg-[#fbfaf7]'
                            }`}
                          >
                            {formatCategoryLabel(option)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </label>
            </div>

            {hasActiveFilters && (
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-[#eee8de] pt-2.5">
                <p className="text-[11px] text-[#637268]">
                  Showing {filteredCases.length} matching case{filteredCases.length === 1 ? '' : 's'}.
                </p>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedLevel('all')
                    setSelectedCategory('all')
                    setAnswerQuery('')
                    setImagingOnly(false)
                  }}
                  className="rounded-full border border-[#ded7ca] bg-white px-2.5 py-1 text-[8.5px] font-semibold tracking-[0.01em] text-[#637268] transition hover:bg-[#fbfaf7]"
                >
                  Clear Filters
                </button>
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <div className={sectionLabelClass}>
              Previous cases
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowAnswers(current => !current)}
                className="rounded-full border border-[#ded7ca] bg-white px-2.5 py-1 text-[8.5px] font-semibold tracking-[0.01em] text-[#637268] transition hover:bg-[#fbfaf7]"
              >
                {showAnswers ? 'Show Category' : 'Show Answer'}
              </button>
              <button
                type="button"
                onClick={() => setShowCaseList(current => !current)}
                className="rounded-full border border-[#ded7ca] bg-white px-2.5 py-1 text-[8.5px] font-semibold tracking-[0.01em] text-[#637268] transition hover:bg-[#fbfaf7]"
              >
                {showCaseList ? 'Collapse' : 'Expand'}
              </button>
            </div>
          </div>

          {loading ? (
            <div className="mt-5 rounded-2xl border border-dashed border-[#ded7ca] bg-[#fbfaf7] px-4 py-5 text-[14px] text-[#637268]">Loading archive...</div>
          ) : groupedDates.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-dashed border-[#ded7ca] bg-[#fbfaf7] px-4 py-5 text-[14px] text-[#637268]">No archive cases are available yet.</div>
          ) : !showCaseList ? (
            <div className="mt-4 rounded-2xl border border-dashed border-[#ded7ca] bg-[#fbfaf7] px-4 py-4 text-[14px] text-[#637268]">
              {groupedDates.length} dates ready. Expand to browse the full archive.
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {groupedDates.map(group => (
                <div
                  key={group.date}
                  className="rounded-[20px] border border-[#e7e1d6] bg-[#fcfbf8] p-2.5 sm:p-3"
                >
                  <div className={sectionLabelClass}>
                    {formatDate(group.date)}
                  </div>

                  <div className="mt-2 grid gap-1.5 sm:grid-cols-3 sm:gap-2">
                    {levelOrder.map(level => {
                      const item = group.items.find(entry => entry.level === level)
                      const isCompleted = item
                        ? completedArchiveKeys.has(`${item.case_date}:${item.level}:archive`)
                        : false

                      return item ? (
                        <Link
                          key={`${group.date}-${level}`}
                          href={`/?case=${item.id}&date=${group.date}&level=${level}`}
                          className="rounded-[16px] border border-[#e3dccf] bg-white px-2.5 py-2 transition hover:bg-[#f8fbf9]"
                        >
                          <div className={caseMetaLabelClass}>
                            {toTitleCase(formatLevel(level, item.case_date))}
                          </div>
                          <div className="mt-0.5 line-clamp-2 font-serif text-[12px] font-bold leading-tight tracking-[-0.01em] text-[#102018] sm:text-[13px]">
                            {showAnswers ? item.answer : formatCategoryLabel(item.category)}
                          </div>
                          {showAnswers && item.category && (
                            <div className="mt-0.5 text-[9px] tracking-[0.01em] text-[#8b938d]">
                              {formatCategoryLabel(item.category)}
                            </div>
                          )}
                          <div className={`mt-1 text-[10px] ${isCompleted ? 'text-[#a24d24]' : 'text-[#1f6448]'}`}>
                            {isCompleted ? 'Completed case' : 'Open case'}
                          </div>
                        </Link>
                      ) : (
                        <div
                          key={`${group.date}-${level}`}
                          className="rounded-[16px] border border-dashed border-[#ded7ca] bg-[#fffdfa] px-2.5 py-2 text-[#9aa39c]"
                        >
                          <div className={caseMetaLabelClass}>
                            {toTitleCase(formatLevel(level, group.date))}
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
