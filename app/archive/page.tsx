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
  const actionButtonClass =
    'inline-flex min-h-[34px] items-center justify-center rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition'
  const softButtonClass = `${actionButtonClass} border-[#ded7ca] bg-white text-[#55645b] hover:bg-[#fbfaf7]`
  const activeButtonClass = `${actionButtonClass} border-[#1f6448] bg-[#1f6448] text-white hover:bg-[#174c37]`
  const accentButtonClass = `${actionButtonClass} border-[#d9c7a6] bg-[#fffaf1] text-[#8a5a2b] hover:bg-[#fff3e0]`
  const sectionLabelClass = 'text-[10px] font-bold uppercase tracking-[0.18em] text-[#637268]'
  const fieldLabelClass = 'text-[10px] font-bold uppercase tracking-[0.14em] text-[#637268]'
  const caseMetaLabelClass = 'text-[10px] font-semibold tracking-[0.01em] text-[#637268]'
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

      <section className="mx-auto max-w-4xl px-3 py-4 sm:px-6 sm:py-5">
        <div className="night-surface rounded-[24px] border border-[#e7e1d6] bg-white p-3 shadow-[0_10px_24px_rgba(16,32,24,0.04)] sm:p-4.5">
          <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#637268]">
            Archive
          </div>
          <h1 className="mt-1.5 font-serif text-[23px] font-bold leading-tight tracking-[-0.03em] text-[#102018] sm:text-[28px]">
            Browse older cases
          </h1>

          {(surpriseTarget || filteredCases.length > 0) && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {surpriseTarget ? (
                <Link
                  href={`/?case=${surpriseTarget.id}&date=${surpriseTarget.case_date}&level=${surpriseTarget.level}`}
                  className={activeButtonClass}
                >
                  Surprise me
                </Link>
              ) : (
                <div className={softButtonClass}>
                  All done
                </div>
              )}
              {hardestPick && (
                <Link
                  href={`/?case=${hardestPick.id}&date=${hardestPick.case_date}&level=${hardestPick.level}`}
                  className={accentButtonClass}
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
                className={softButtonClass}
              >
                Reset cases
              </button>
            </div>
          )}

          <div className="mt-3 rounded-[20px] bg-[#fcfbf8] px-2.5 py-2.5 ring-1 ring-inset ring-[#ebe5db]/70 sm:px-3 sm:py-3">
            <div className={sectionLabelClass}>
              Filters
            </div>

            <div className="mt-2.5 space-y-2">
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <label className="grid gap-1.5">
                  <span className={fieldLabelClass}>Difficulty</span>
                  <div className="relative" ref={levelMenuRef}>
                    <button
                      type="button"
                      onClick={() => setLevelMenuOpen(current => !current)}
                      className="flex min-h-[38px] w-full items-center justify-between rounded-lg border border-[#ded7ca] bg-white px-3 py-2 text-left text-[13px] text-[#102018] transition hover:bg-[#fbfaf7]"
                    >
                      <span>{selectedLevelLabel}</span>
                      <span className="ml-3 text-[10px] text-[#7a857c]">{levelMenuOpen ? '▲' : '▼'}</span>
                    </button>
                    {levelMenuOpen && (
                      <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-40 overflow-hidden rounded-xl border border-[#e7e1d6] bg-white shadow-[0_18px_40px_rgba(16,32,24,0.06)]">
                        <div className="border-b border-[#f3eee5] px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7a857c]">
                          Difficulty
                        </div>
                        <div className="p-1.5">
                          {levelOptions.map(option => (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => {
                                setSelectedLevel(option.value)
                                setLevelMenuOpen(false)
                              }}
                              className={`block w-full rounded-lg px-3 py-2 text-left text-[13px] transition ${
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
                </label>
                <div className="sm:pb-0">
                  <button
                    type="button"
                    onClick={() => setImagingOnly(current => !current)}
                    className={imagingOnly ? activeButtonClass : softButtonClass}
                  >
                    Imaging
                  </button>
                </div>
              </div>

              <label className={`grid gap-1.5 ${fieldLabelClass}`}>
                Diagnosis
                <input
                  value={answerQuery}
                  onChange={e => setAnswerQuery(e.target.value)}
                  placeholder="Search diagnosis or answer"
                  className="min-h-[38px] rounded-lg border border-[#ded7ca] bg-white px-3 py-2 text-[13px] font-medium text-[#102018] placeholder:text-[#8b938d]"
                />
              </label>

              <label className={`grid gap-1.5 ${fieldLabelClass}`}>
                Category
                <div className="relative" ref={categoryMenuRef}>
                  <button
                    type="button"
                    onClick={() => setCategoryMenuOpen(current => !current)}
                    className="flex min-h-[38px] w-full items-center justify-between rounded-lg border border-[#ded7ca] bg-white px-3 py-2 text-left text-[13px] text-[#102018] transition hover:bg-[#fbfaf7]"
                  >
                    <span>{selectedCategory === 'all' ? 'All categories' : formatCategoryLabel(selectedCategory)}</span>
                    <span className="ml-3 text-[10px] text-[#7a857c]">{categoryMenuOpen ? '▲' : '▼'}</span>
                  </button>
                  {categoryMenuOpen && (
                    <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-40 overflow-hidden rounded-xl border border-[#e7e1d6] bg-white shadow-[0_18px_40px_rgba(16,32,24,0.06)]">
                      <div className="border-b border-[#f3eee5] px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7a857c]">
                        Category
                      </div>
                      <div className="max-h-[280px] overflow-y-auto p-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCategory('all')
                            setCategoryMenuOpen(false)
                          }}
                          className={`block w-full rounded-lg px-3 py-2 text-left text-[13px] transition ${
                            selectedCategory === 'all'
                              ? 'bg-[#f7fbf8] font-semibold text-[#1f6448]'
                              : 'text-[#102018] hover:bg-[#fbfaf7]'
                          }`}
                        >
                          All categories
                        </button>
                        {categoryOptions.map(option => (
                          <button
                            key={option}
                            type="button"
                            onClick={() => {
                              setSelectedCategory(option)
                              setCategoryMenuOpen(false)
                            }}
                            className={`block w-full rounded-lg px-3 py-2 text-left text-[13px] transition ${
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
              <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-[#eee8de] pt-2.5">
                <p className="text-[11px] text-[#637268]">
                  {filteredCases.length} case{filteredCases.length === 1 ? '' : 's'}
                </p>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedLevel('all')
                    setSelectedCategory('all')
                    setAnswerQuery('')
                    setImagingOnly(false)
                  }}
                  className={softButtonClass}
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2">
            <div className={sectionLabelClass}>
              Previous cases
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowAnswers(current => !current)}
                className={softButtonClass}
              >
                {showAnswers ? 'Show Category' : 'Show Answer'}
              </button>
              <button
                type="button"
                onClick={() => setShowCaseList(current => !current)}
                className={softButtonClass}
              >
                {showCaseList ? 'Collapse' : 'Expand'}
              </button>
            </div>
          </div>

          {loading ? (
            <div className="mt-4 rounded-2xl bg-[#fbfaf7] px-4 py-5 text-[13px] text-[#637268] ring-1 ring-inset ring-[#ded7ca]">Loading archive...</div>
          ) : groupedDates.length === 0 ? (
            <div className="mt-4 rounded-2xl bg-[#fbfaf7] px-4 py-5 text-[13px] text-[#637268] ring-1 ring-inset ring-[#ded7ca]">No archive cases are available yet.</div>
          ) : !showCaseList ? (
            <div className="mt-4 rounded-2xl bg-[#fbfaf7] px-4 py-4 text-[13px] text-[#637268] ring-1 ring-inset ring-[#ded7ca]">
              {groupedDates.length} dates ready. Expand to browse the full archive.
            </div>
          ) : (
            <div className="mt-3 space-y-2.5">
              {groupedDates.map((group, groupIndex) => (
                <div
                  key={group.date}
                  className="orthodle-archive-group rounded-[20px] bg-[#fcfbf8] px-2.5 py-2.5 ring-1 ring-inset ring-[#e7e1d6] sm:px-3 sm:py-3"
                  style={{ animationDelay: `${Math.min(groupIndex * 0.04, 0.24)}s` }}
                >
                  <div className={sectionLabelClass}>
                    {formatDate(group.date)}
                  </div>

                  <div className="mt-2 space-y-1.5 sm:grid sm:grid-cols-3 sm:gap-2 sm:space-y-0">
                    {levelOrder.map((level, levelIndex) => {
                      const item = group.items.find(entry => entry.level === level)
                      if (!item) return null

                      const isCompleted = completedArchiveKeys.has(
                        `${item.case_date}:${item.level}:archive`
                      )

                      return (
                        <Link
                          key={`${group.date}-${level}`}
                          href={`/?case=${item.id}&date=${group.date}&level=${level}`}
                          className="orthodle-archive-entry rounded-[16px] bg-white px-3 py-2.5 ring-1 ring-inset ring-[#e3dccf] transition hover:bg-[#f8fbf9]"
                          style={{ animationDelay: `${Math.min(groupIndex * 0.04 + levelIndex * 0.05, 0.34)}s` }}
                        >
                          <div className={caseMetaLabelClass}>
                            {toTitleCase(formatLevel(level, item.case_date))}
                          </div>
                          <div className="mt-1 line-clamp-2 font-serif text-[13px] font-bold leading-tight tracking-[-0.01em] text-[#102018]">
                            {showAnswers ? item.answer : formatCategoryLabel(item.category)}
                          </div>
                          {showAnswers && item.category && (
                            <div className="mt-0.5 text-[10px] tracking-[0.01em] text-[#8b938d]">
                              {formatCategoryLabel(item.category)}
                            </div>
                          )}
                          <div className={`mt-1.5 text-[10px] font-semibold ${isCompleted ? 'text-[#8a5a2b]' : 'text-[#1f6448]'}`}>
                            {isCompleted ? 'Completed case' : 'Open case'}
                          </div>
                        </Link>
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
