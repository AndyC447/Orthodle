'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Header } from '@/components/Header'
import { PublicFooter } from '@/components/PublicFooter'
import { supabase } from '@/lib/supabase'

type VisitRow = {
  session_id: string
  created_at: string
  geo_country: string | null
}

type GuessRow = {
  session_id: string
  created_at: string
  is_correct: boolean | null
  cases?: { case_date: string | null } | null
}

type CountRow = { id: string }

const PAGE_SIZE = 1000
const ABOUT_TEXT_STORAGE_KEY = 'orthodle_admin_impact_about_text_v1'
const DEFAULT_ABOUT_TEXT = `I am a fourth-year medical student at UCLA currently on sub-internships and applying into orthopedic surgery this year.

I built Orthodle as a way to combine my interest in website design, teaching, daily puzzle games, and orthopedic learning. As I see interesting cases on sub-I rotations, I use the process of building them into Orthodle cases to study the pathology more deeply, sharpen the teaching point, and turn that learning into something useful for other learners.`

function timestampToLocalISO(timestamp: string) {
  const date = new Date(timestamp)
  const timezoneOffsetMs = date.getTimezoneOffset() * 60 * 1000
  return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 10)
}

function todayISO() {
  return timestampToLocalISO(new Date().toISOString())
}

function formatCount(value: number) {
  return value.toLocaleString('en-US')
}

function AnimatedCount({ value, loading }: { value: number; loading: boolean }) {
  const [displayValue, setDisplayValue] = useState(0)

  useEffect(() => {
    if (loading) {
      setDisplayValue(0)
      return
    }

    if (typeof window === 'undefined') {
      setDisplayValue(value)
      return
    }

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) {
      setDisplayValue(value)
      return
    }

    let frameId = 0
    const startAt = performance.now()
    const duration = 950

    function tick(now: number) {
      const progress = Math.min(1, (now - startAt) / duration)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayValue(Math.round(value * eased))

      if (progress < 1) {
        frameId = requestAnimationFrame(tick)
      }
    }

    frameId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameId)
  }, [loading, value])

  return <>{loading ? '...' : formatCount(displayValue)}</>
}

export function PublicImpactPage({ adminMode = false }: { adminMode?: boolean }) {
  const [visits, setVisits] = useState<VisitRow[]>([])
  const [guesses, setGuesses] = useState<GuessRow[]>([])
  const [caseCount, setCaseCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [aboutText, setAboutText] = useState(DEFAULT_ABOUT_TEXT)
  const [aboutDraft, setAboutDraft] = useState(DEFAULT_ABOUT_TEXT)
  const [aboutStatus, setAboutStatus] = useState('')

  useEffect(() => {
    if (!adminMode || typeof window === 'undefined') return
    const savedText = window.localStorage.getItem(ABOUT_TEXT_STORAGE_KEY)
    if (!savedText) return
    setAboutText(savedText)
    setAboutDraft(savedText)
  }, [adminMode])

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

        if (error || !data || data.length === 0) break

        rows.push(...(data as T[]))

        if (data.length < PAGE_SIZE) break
        offset += PAGE_SIZE
      }

      return rows
    }

    async function loadStats() {
      const [visitRows, guessRows, caseRows] = await Promise.all([
        fetchPaged<VisitRow>('visits', 'session_id, created_at, geo_country'),
        fetchPaged<GuessRow>('guesses', 'session_id, created_at, is_correct, cases(case_date)'),
        fetchPaged<CountRow>('cases', 'id'),
      ])

      if (cancelled) return

      setVisits(visitRows)
      setGuesses(guessRows)
      setCaseCount(caseRows.length)
      setLoading(false)
    }

    void loadStats()
    return () => {
      cancelled = true
    }
  }, [])

  const metrics = useMemo(() => {
    const uniqueUsers = new Set<string>()
    const sessionsByDate = new Map<string, Set<string>>()
    const countries = new Set<string>()
    const today = todayISO()
    let archiveGuesses = 0

    for (const visit of visits) {
      uniqueUsers.add(visit.session_id)
      const date = timestampToLocalISO(visit.created_at)
      if (!sessionsByDate.has(date)) sessionsByDate.set(date, new Set())
      sessionsByDate.get(date)!.add(visit.session_id)
      if (visit.geo_country?.trim()) countries.add(visit.geo_country.trim())
    }

    for (const guess of guesses) {
      uniqueUsers.add(guess.session_id)
      const date = timestampToLocalISO(guess.created_at)
      if (!sessionsByDate.has(date)) sessionsByDate.set(date, new Set())
      sessionsByDate.get(date)!.add(guess.session_id)

      const caseDate = guess.cases?.case_date
      if (caseDate && caseDate < today) archiveGuesses += 1
    }

    const combinedDailyUsers = [...sessionsByDate.values()].reduce(
      (sum, sessions) => sum + sessions.size,
      0
    )

    return {
      usersReached: Math.max(uniqueUsers.size, combinedDailyUsers),
      uniqueUsers: uniqueUsers.size,
      combinedDailyUsers,
      totalGuesses: guesses.length,
      archiveGuesses,
      countriesReached: countries.size,
    }
  }, [guesses, visits])

  const statCards = [
    {
      label: 'Users reached',
      value: metrics.usersReached,
    },
    {
      label: 'Published cases',
      value: caseCount,
    },
    {
      label: 'Learner guesses',
      value: metrics.totalGuesses,
    },
    {
      label: 'Archive plays',
      value: metrics.archiveGuesses,
    },
  ]

  function saveAboutText() {
    const nextText = aboutDraft.trim() || DEFAULT_ABOUT_TEXT
    setAboutText(nextText)
    setAboutDraft(nextText)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ABOUT_TEXT_STORAGE_KEY, nextText)
    }
    setAboutStatus('About text updated.')
  }

  function resetAboutText() {
    setAboutText(DEFAULT_ABOUT_TEXT)
    setAboutDraft(DEFAULT_ABOUT_TEXT)
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(ABOUT_TEXT_STORAGE_KEY)
    }
    setAboutStatus('About text reset.')
  }

  return (
    <main className="app-surface min-h-screen">
      <Header />

      <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {adminMode ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <Link
              href="/admin"
              className="inline-flex h-9 items-center justify-center rounded-[10px] border border-[#ded7ca] bg-white px-3.5 text-[11px] font-bold uppercase tracking-[0.16em] text-[#637268] transition hover:bg-[#fbfaf7]"
            >
              Back to admin
            </Link>
            <div className="rounded-[10px] border border-[#ead9b7] bg-[#fffaf1] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#a24d24]">
              Private admin view
            </div>
          </div>
        ) : null}

        <div className="rounded-[28px] border border-[#e7e1d6] bg-white px-5 py-6 shadow-[0_14px_34px_rgba(16,32,24,0.06)] sm:px-7 sm:py-7">
          <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#1f6448]">
                Orthodle impact
              </div>
              <h1 className="mt-2 font-serif text-[34px] font-bold leading-tight text-[#102018] sm:text-[46px]">
                A daily orthopedics case platform built around teaching, design, and repetition.
              </h1>
              <div className="mt-4 max-w-2xl space-y-3">
                {aboutText.split(/\n{2,}/).map(paragraph => (
                  <p key={paragraph} className="text-[15px] leading-7 text-[#4f5e55] sm:text-[16px]">
                    {paragraph}
                  </p>
                ))}
              </div>

              {adminMode ? (
                <div className="mt-5 rounded-[16px] border border-[#e7e1d6] bg-[#fcfbf8] p-3">
                  <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#637268]">
                    Edit about text
                  </label>
                  <textarea
                    value={aboutDraft}
                    onChange={event => {
                      setAboutDraft(event.target.value)
                      setAboutStatus('')
                    }}
                    rows={5}
                    className="mt-2 w-full resize-y rounded-[12px] border border-[#ded7ca] bg-white px-3 py-2.5 text-[13px] leading-6 text-[#102018] outline-none transition focus:border-[#1f6448] focus:ring-2 focus:ring-[#1f6448]/10"
                  />
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-[11px] font-medium text-[#637268]">{aboutStatus}</div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={resetAboutText}
                        className="inline-flex h-9 items-center justify-center rounded-[10px] border border-[#ded7ca] bg-white px-3 text-[11px] font-bold text-[#637268] transition hover:bg-[#fbfaf7]"
                      >
                        Reset
                      </button>
                      <button
                        type="button"
                        onClick={saveAboutText}
                        className="inline-flex h-9 items-center justify-center rounded-[10px] bg-[#1f6448] px-3 text-[11px] font-bold text-white transition hover:bg-[#18543c]"
                      >
                        Save text
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-[22px] border border-[#dce8e1] bg-[#f7fbf8] p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#637268]">
                Live snapshot
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {statCards.map(card => (
                  <div
                    key={card.label}
                    className="rounded-[16px] border border-[#dfe5dd] bg-white px-3 py-3"
                  >
                    <div className="font-serif text-[28px] font-bold leading-none text-[#102018] sm:text-[32px]">
                      <AnimatedCount value={card.value} loading={loading} />
                    </div>
                    <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#637268]">
                      {card.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link
            href="/"
            className="inline-flex h-10 items-center justify-center rounded-[10px] bg-[#1f6448] px-4 text-[12px] font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.24),0_8px_18px_rgba(31,100,72,0.18)] transition hover:bg-[#18543c]"
          >
            View today&apos;s case
          </Link>
          <Link
            href="/archive"
            className="inline-flex h-10 items-center justify-center rounded-[10px] border border-[#ded7ca] bg-white px-4 text-[12px] font-bold text-[#102018] transition hover:bg-[#fbfaf7]"
          >
            Browse archive
          </Link>
        </div>
      </section>

      <PublicFooter />
    </main>
  )
}
