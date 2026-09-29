'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Header } from '@/components/Header'
import { PublicFooter } from '@/components/PublicFooter'
import { isAnatomyQuizCaseRecord } from '@/lib/anatomy-quiz'
import {
  DEFAULT_LEVEL_TITLES,
  normalizeLevelTitles,
  readCachedLevelTitles,
  writeCachedLevelTitles,
} from '@/lib/level-display'
import { supabase } from '@/lib/supabase'
import { getCompletedCaseKeys, getSessionId, todayISO } from '@/lib/utils'

type Level = 'med_student' | 'resident' | 'attending'

type ArchiveCase = {
  id: string
  case_date: string
  level: Level
  answer: string
  synonyms: string[] | null
  category: string | null
  image_url: string | null
  clue_1: string | null
  clue_2: string | null
  clue_3: string | null
  clue_4: string | null
  clue_5: string | null
  clue_6: string | null
}

type GuessLite = {
  case_id: string | null
  session_id: string
  is_correct: boolean
}

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
  const [loadError, setLoadError] = useState('')
  const [month, setMonth] = useState(today.slice(0, 7))
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [answerQuery, setAnswerQuery] = useState('')
  const [completedArchiveKeys, setCompletedArchiveKeys] = useState<Set<string>>(new Set())
  const [levelTitles, setLevelTitles] = useState(DEFAULT_LEVEL_TITLES)
  useEffect(() => {
    setCompletedArchiveKeys(new Set([...getCompletedCaseKeys()].map(key => key.replace(/:daily$/, ':archive'))))
  }, [])

  useEffect(() => {
    setLevelTitles(readCachedLevelTitles())
  }, [])

  useEffect(() => {
    async function loadArchive() {
      try {
      const [{ data }, { data: guessData }, { data: levelTitleData }] = await Promise.all([
        (async () => {
          const data: ArchiveCase[] = []
          const pageSize = 500
          for (let offset = 0; ; offset += pageSize) {
            const result = await supabase
              .from('cases')
              .select('id, case_date, level, answer, synonyms, category, image_url, clue_1, clue_2, clue_3, clue_4, clue_5, clue_6')
              .gte('case_date', LAUNCH_DATE)
              .lt('case_date', today)
              .order('case_date', { ascending: false })
              .order('id')
              .range(offset, offset + pageSize - 1)
            if (result.error) throw result.error
            data.push(...(result.data || []) as ArchiveCase[])
            if ((result.data || []).length < pageSize) break
          }
          return { data }
        })(),
        (async () => {
          const data: GuessLite[] = []
          for (let offset = 0; ; offset += 500) {
            const result = await supabase.from('guesses')
              .select('case_id, session_id, is_correct')
              .eq('session_id', sessionId).order('id').range(offset, offset + 499)
            if (result.error) return { data: [] as GuessLite[] }
            data.push(...(result.data || []) as GuessLite[])
            if ((result.data || []).length < 500) break
          }
          return { data }
        })(),
        supabase
          .from('level_display_settings')
          .select('level, title'),
      ])

      const nextCases = (data || []) as ArchiveCase[]
      const nextGuessRows = (guessData || []) as GuessLite[]

      setCases(nextCases)
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
      const ownGuesses = new Map<string, GuessLite[]>()
      for (const row of nextGuessRows) {
        if (row.session_id !== sessionId || !row.case_id) continue
        ownGuesses.set(row.case_id, [...(ownGuesses.get(row.case_id) || []), row])
      }
      const completedKeysFromServer = new Set(nextCases.filter(item => {
        const guesses = ownGuesses.get(item.id) || []
        return guesses.some(row => row.is_correct) || guesses.length >= (item.level === 'attending' && isAnatomyQuizCaseRecord(item) ? 1 : 6)
      }).map(item => `${item.case_date}:${item.level}:archive`))
      if (completedKeysFromServer.size > 0) {
        setCompletedArchiveKeys(current => new Set([...current, ...completedKeysFromServer]))
      }
      } catch {
        setLoadError('Could not load the full archive. Please reload to try again.')
      } finally {
        setLoading(false)
      }
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
      if (selectedCategory !== 'all' && (item.category || '') !== selectedCategory) return false
      if (
        normalizedAnswerQuery &&
        !item.answer.toLowerCase().includes(normalizedAnswerQuery) &&
        !(item.category || '').toLowerCase().includes(normalizedAnswerQuery)
      ) {
        return false
      }
      return true
    })
  }, [answerQuery, cases, selectedCategory, today])

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

  function formatLevel(level: Level, dateText = today, caseItem: ArchiveCase | null = null) {
    if (level === 'med_student') return levelTitles.med_student
    if (level === 'resident') return levelTitles.resident
    if (caseItem && !isAnatomyQuizCaseRecord(caseItem)) return 'Attending'
    return isSurgicalAnatomyDate(dateText) ? levelTitles.attending : 'Attending'
  }

  function formatCategoryLabel(value: string | null | undefined) {
    const trimmed = typeof value === 'string' ? value.trim() : ''
    return trimmed ? toTitleCase(trimmed) : 'Case'
  }

  const hasActiveFilters = selectedCategory !== 'all' || Boolean(answerQuery.trim())
  const surprisePool = useMemo(() => {
    return filteredCases.filter(
      item => !completedArchiveKeys.has(`${item.case_date}:${item.level}:archive`)
    )
  }, [completedArchiveKeys, filteredCases])
  const surpriseTarget = useMemo(() => surprisePool.length > 0
    ? surprisePool[Math.floor(Math.random() * surprisePool.length)]
    : null, [surprisePool])
  const monthDates = groupedDates.filter(group => group.date.startsWith(month))
  const activeDate = monthDates.some(group => group.date === selectedDate) ? selectedDate : monthDates[0]?.date || ''
  const activeCases = monthDates.find(group => group.date === activeDate)?.items || []
  const [year, monthNumber] = month.split('-').map(Number)
  const firstWeekday = new Date(year, monthNumber - 1, 1).getDay()
  const daysInMonth = new Date(year, monthNumber, 0).getDate()
  const monthTitle = new Date(year, monthNumber - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const earliestMonth = LAUNCH_DATE.slice(0, 7)
  const latestMonth = today.slice(0, 7)
  const monthOptions: string[] = []
  for (let value = earliestMonth; value <= latestMonth;) {
    monthOptions.push(value)
    const [y, m] = value.split('-').map(Number)
    value = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}`
  }
  function changeMonth(offset: number) {
    const date = new Date(year, monthNumber - 1 + offset, 1)
    setMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`)
  }
  function completed(item: ArchiveCase) {
    return completedArchiveKeys.has(`${item.case_date}:${item.level}:archive`)
  }
  const buttonClass = 'archive-control inline-flex items-center justify-center rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-35'
  return (
    <main className="app-surface archive-calendar-page min-h-screen">
      <Header />
      <section className="mx-auto max-w-[1080px] px-3 py-6 sm:px-6 sm:py-9">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div><h1 className="font-serif text-3xl font-bold sm:text-4xl">Archives</h1>
            <p className="mt-2 text-sm text-[#637268]">Pick a day and explore its cases. Daily, anatomy, and classification questions are all here.</p></div>
          {surpriseTarget && <Link className={`${buttonClass} archive-surprise`} href={`/?case=${surpriseTarget.id}&date=${surpriseTarget.case_date}&level=${surpriseTarget.level}`}>Surprise me</Link>}
        </div>
        <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="grid gap-1.5 text-sm font-semibold">Search cases
            <input className="archive-control rounded-xl border px-3 py-2 font-normal" type="search" placeholder="Diagnosis or category" value={answerQuery} onChange={event => setAnswerQuery(event.target.value)} />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold">Category
            <select className="archive-control rounded-xl border px-3 py-2 font-normal" value={selectedCategory} onChange={event => setSelectedCategory(event.target.value)}>
              <option value="all">All categories</option>
              {categoryOptions.map(option => <option key={option} value={option}>{formatCategoryLabel(option)}</option>)}
            </select>
          </label>
          {hasActiveFilters && <button className={buttonClass} onClick={() => { setSelectedCategory('all'); setAnswerQuery('') }}>Clear filters</button>}
        </div>
        {loadError ? <p role="alert" className="py-8">{loadError}</p> : loading ? <p role="status" className="py-8">Loading archive…</p> : <>
          <div className="archive-calendar-shell rounded-2xl border p-2 sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 px-1">
              <h2 className="font-serif text-xl font-bold sm:text-2xl" aria-live="polite">{monthTitle}</h2>
              <div className="flex items-center gap-2">
                <button className={buttonClass} aria-label="Previous month" disabled={month <= earliestMonth} onClick={() => changeMonth(-1)}>←</button>
                <select aria-label="Jump to month" className="archive-control min-w-0 rounded-xl border px-2 py-2 text-sm" value={month} onChange={event => setMonth(event.target.value)}>
                  {[...monthOptions].reverse().map(value => <option key={value} value={value}>{new Date(`${value}-01T12:00:00`).toLocaleDateString('en-US', {month:'short', year:'numeric'})}</option>)}
                </select>
                <button className={buttonClass} aria-label="Next month" disabled={month >= latestMonth} onClick={() => changeMonth(1)}>→</button>
              </div>
            </div>
            <div className="mb-4 flex flex-wrap gap-x-4 gap-y-2 px-1 text-xs">
              <span className="flex items-center gap-2"><span className="archive-swatch archive-available" />Available</span>
              <span className="flex items-center gap-2"><span className="archive-swatch archive-completed" />Completed</span>
              <span className="text-[#637268]">Select a day to see its cases</span>
            </div>
            <div className="grid grid-cols-7 gap-1 sm:gap-2">
              {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(day => <div key={day} className="py-2 text-center text-[11px] font-semibold text-[#637268] sm:text-sm">{day}</div>)}
              {Array.from({length:firstWeekday}, (_, index) => <div key={`blank-${index}`} aria-hidden="true" />)}
              {Array.from({length:daysInMonth}, (_, index) => {
                const date = `${month}-${String(index+1).padStart(2,'0')}`
                const dayCases = monthDates.find(group => group.date === date)?.items || []
                const done = dayCases.filter(completed).length
                const allDone = dayCases.length > 0 && done === dayCases.length
                return <button key={date} type="button" disabled={!dayCases.length} aria-pressed={date === activeDate}
                  aria-label={`${formatDate(date)}: ${dayCases.length ? `${dayCases.length} cases, ${done} completed, ${dayCases.length-done} available` : 'No available cases'}`}
                  onClick={() => setSelectedDate(date)}
                  className={`archive-day ${!dayCases.length ? 'archive-empty' : allDone ? 'archive-completed' : 'archive-available'} ${date === activeDate ? 'archive-day-selected' : ''}`}>
                  <span className="text-sm font-bold sm:text-lg">{index+1}</span>
                  {dayCases.length > 0 && <><span className="hidden text-xs sm:block">{dayCases.length} case{dayCases.length === 1 ? '' : 's'}</span><span className="text-[9px] sm:text-[11px]">{allDone ? '✓' : `${done}/${dayCases.length}`}<span className="hidden sm:inline"> {allDone ? 'Done' : 'done'}</span></span></>}
                </button>
              })}
            </div>
          </div>
          <section className="mt-6" aria-label="Cases for selected day" aria-live="polite">
            {activeDate ? <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="font-serif text-xl font-bold">{formatDate(activeDate)}</h2><span className="text-sm text-[#637268]">Choose a case to play or revisit</span></div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{activeCases.map(item => <Link key={item.id} href={`/?case=${item.id}&date=${item.case_date}&level=${item.level}`} className={`archive-case rounded-xl border p-4 ${completed(item) ? 'archive-completed' : 'archive-available'}`}>
                <div className="text-xs font-semibold">{toTitleCase(formatLevel(item.level, item.case_date, item).toLowerCase())}</div>
                <h3 className="mt-1 font-serif text-xl font-bold">{formatCategoryLabel(item.category)}</h3>
                <div className="mt-4 flex items-center justify-between text-sm font-semibold"><span>{completed(item) ? '✓ Completed · Play again' : 'Available · Open case'}</span><span aria-hidden="true">→</span></div>
              </Link>)}</div>
            </> : <div className="py-5"><h2 className="font-semibold">{hasActiveFilters ? 'No matching cases this month' : 'No archived cases this month'}</h2><p className="mt-1 text-sm text-[#637268]">{hasActiveFilters ? 'Try another month or clear your filters.' : 'Choose an earlier month to explore previous cases.'}</p></div>}
            {hasActiveFilters && <div className="mt-4 flex flex-wrap items-center gap-2 text-sm"><span>{filteredCases.length} matching cases across the archive.</span>{Array.from(new Set(groupedDates.map(group => group.date.slice(0,7)))).filter(value => value !== month).map(value => <button key={value} className={buttonClass} onClick={() => setMonth(value)}>{new Date(`${value}-01T12:00:00`).toLocaleDateString('en-US',{month:'short',year:'numeric'})}</button>)}</div>}
          </section>
        </>}
      </section>
      <PublicFooter />
    </main>
  )
}
