'use client'

import { useEffect, useMemo, useState } from 'react'
import { Header } from '@/components/Header'
import { supabase } from '@/lib/supabase'
import { getSessionId, recordGameResult, todayISO } from '@/lib/utils'

type Level = 'med_student' | 'resident' | 'attending'

type Case = {
  id: string
  case_date: string
  level: Level
  category: string
  prompt: string
  answer: string
  synonyms: string[] | null
  image_url: string | null
  clue_1: string | null
  clue_2: string | null
  clue_3: string | null
  teaching_point?: string | null
}

type Guess = {
  text: string
  correct: boolean
}

const MAX_GUESSES = 6

const levels = [
  { key: 'med_student' as Level, label: 'Med Student', subtitle: 'Foundations' },
  { key: 'resident' as Level, label: 'Resident', subtitle: 'Clinic & Call' },
  { key: 'attending' as Level, label: 'Attending', subtitle: 'Zebras & Nuance' },
]

export default function PlayPage() {
  const [selectedLevel, setSelectedLevel] = useState<Level>('med_student')
  const [dailyCase, setDailyCase] = useState<Case | null>(null)
  const [guess, setGuess] = useState('')
  const [guesses, setGuesses] = useState<Guess[]>([])
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [gameWon, setGameWon] = useState(false)
  const [gameOver, setGameOver] = useState(false)
  const [imageExpanded, setImageExpanded] = useState(false)
  const [imageHidden, setImageHidden] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadCase() {
      setLoading(true)
      setDailyCase(null)
      setGuess('')
      setGuesses([])
      setGameWon(false)
      setGameOver(false)
      setMessage('')
      setImageExpanded(false)
      setImageHidden(false)

      try {
        const sessionId = getSessionId()

        void supabase.from('visits').insert({
          session_id: sessionId,
          path: `/play/${selectedLevel}`,
        })

        const { data, error } = await supabase
          .from('cases')
          .select('*')
          .eq('case_date', todayISO())
          .eq('level', selectedLevel)
          .maybeSingle()

        if (cancelled) return

        if (error || !data) {
          setMessage(`No ${formatLevel(selectedLevel)} case has been published for today yet.`)
          setDailyCase(null)
          return
        }

        setDailyCase(data)
      } catch {
        if (cancelled) return

        setDailyCase(null)
        setMessage('Unable to load today\'s case right now.')
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadCase()

    return () => {
      cancelled = true
    }
  }, [selectedLevel])

  function formatLevel(level: Level) {
    if (level === 'med_student') return 'Med Student'
    if (level === 'resident') return 'Resident'
    return 'Attending'
  }

  const findings = useMemo(() => {
    if (!dailyCase) return []

    return [dailyCase.clue_1, dailyCase.clue_2, dailyCase.clue_3]
      .filter((item): item is string => Boolean(item && item.trim()))
  }, [dailyCase])

  const roundComplete = gameWon || gameOver

  const unlockedFindings = roundComplete
    ? findings.length
    : Math.min(
        guesses.filter(g => !g.correct).length,
        findings.length
      )

  const teachingPoint =
    dailyCase?.teaching_point ||
    `Review the key clinical findings that point toward ${dailyCase?.answer || 'the diagnosis'}. Focus on the pattern of symptoms, exam findings, imaging clues, and risk factors that distinguish it from similar orthopaedic diagnoses.`

  async function submitGuess() {
    if (!dailyCase || !guess.trim() || gameWon || gameOver) return

    const currentGuess = guess.trim()
    const sessionId = getSessionId()

    const res = await fetch('/api/guess', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caseId: dailyCase.id, guess: currentGuess, sessionId }),
    })

    const data = await res.json()
    const nextGuessCount = guesses.length + 1

    setGuesses(prev => [...prev, { text: currentGuess, correct: data.correct }])
    setGuess('')

    if (data.correct) {
      setGameWon(true)
      setMessage(
        `Correct — solved in ${nextGuessCount} ${
          nextGuessCount === 1 ? 'guess' : 'guesses'
        }.`
      )
      return
    }

    if (nextGuessCount >= MAX_GUESSES) {
      setGameOver(true)
      setMessage(`Out of guesses. Answer: ${dailyCase.answer}`)
      return
    }

    setMessage(`Not quite. ${MAX_GUESSES - nextGuessCount} guesses remaining.`)
  }

  useEffect(() => {
    if (!dailyCase || !roundComplete || guesses.length === 0) return

    recordGameResult({
      caseDate: dailyCase.case_date,
      level: dailyCase.level,
      won: gameWon,
      guessesUsed: guesses.length,
      answer: dailyCase.answer,
      category: dailyCase.category,
    })
  }, [dailyCase, roundComplete, gameWon, guesses])

  return (
    <main className="min-h-screen bg-[#fbfaf7]">
      <Header />

      <section className="mx-auto max-w-5xl px-6 pt-6 pb-1">
        <div className="text-center">
          <h1 className="font-serif text-[42px] font-bold leading-[1.04] tracking-[-0.03em] text-[#102018] md:text-[46px]">
            Read the case.
            <br />
            Guess the diagnosis.
          </h1>

        </div>

        <div className="mx-auto mt-3.5 grid max-w-lg grid-cols-3 rounded-2xl border border-[#ded7ca] bg-white p-1 shadow-sm">
          {levels.map(level => {
            const active = selectedLevel === level.key

            return (
              <button
                key={level.key}
                onClick={() => setSelectedLevel(level.key)}
                className={
                  active
                    ? 'rounded-xl bg-[#1f6448] px-3 py-2.5 text-white shadow-sm transition'
                    : 'rounded-xl px-3 py-2.5 text-[#102018] transition hover:bg-[#f7f5f0]'
                }
              >
                <div className="font-serif text-[13px] font-bold leading-none">{level.label}</div>
                <div
                  className={
                    active
                      ? 'mt-1 text-[8px] uppercase tracking-[0.22em] text-[#dbe7e0]'
                      : 'mt-1 text-[8px] uppercase tracking-[0.22em] text-[#637268]'
                  }
                >
                  {level.subtitle}
                </div>
              </button>
            )
          })}
        </div>

        <p className="mx-auto mt-3 max-w-xl text-[14px] leading-[1.5] text-[#637268]">
          Three fresh cases every day. Six guesses. Each miss unlocks another
          clinical finding.
        </p>
      </section>

      <div className="mx-auto grid max-w-5xl gap-4 px-6 py-2 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-[#ded7ca] bg-white shadow-sm">
            <div className="h-1.5 bg-gradient-to-r from-[#1f6448] via-[#c76b3a] to-[#ead9b7]" />

            <div className="p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.2em] text-[#637268]">
                  <span className="rounded-full border border-[#ded7ca] bg-white px-3 py-1">
                    Case
                  </span>
                  <span>⌖</span>
                  <span>{dailyCase?.category || formatLevel(selectedLevel)}</span>
                </div>
              </div>

              <h2 className="font-serif text-[26px] font-bold leading-tight tracking-[-0.025em] text-[#102018]">
                What&apos;s the diagnosis?
              </h2>

              <p className="mt-2.5 font-serif text-[17px] leading-[1.5] text-[#102018]">
                {loading
                  ? 'Loading...'
                  : dailyCase
                    ? dailyCase.prompt
                    : 'No case available for this level today.'}
              </p>

              {dailyCase?.image_url && (
                imageHidden ? (
                  <div className="mt-4 flex items-center justify-between rounded-xl border border-dashed border-[#d9d4ca] bg-[#fbfaf7] px-3 py-2.5">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#637268]">
                      Imaging hidden
                    </div>
                    <button
                      onClick={() => setImageHidden(false)}
                      className="rounded-full border border-[#ded7ca] bg-white px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#102018] transition hover:bg-[#fbfaf7]"
                    >
                      Show
                    </button>
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl border border-[#e2ddd3] bg-[#f8f6f1] p-2.5">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#637268]">
                        Imaging
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setImageHidden(true)}
                          className="rounded-full border border-[#ded7ca] bg-white px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#102018] transition hover:bg-[#fbfaf7]"
                        >
                          Hide
                        </button>
                        <button
                          onClick={() => setImageExpanded(prev => !prev)}
                          className="rounded-full border border-[#ded7ca] bg-white px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#102018] transition hover:bg-[#fbfaf7]"
                        >
                          {imageExpanded ? 'Minimize' : 'Enlarge'}
                        </button>
                      </div>
                    </div>

                    <button
                      onClick={() => setImageExpanded(true)}
                      className="flex w-full items-center justify-center overflow-hidden rounded-lg border border-[#d9d4ca] bg-white py-2"
                    >
                      <img
                        src={dailyCase.image_url}
                        alt="Case image"
                        className="block max-h-[320px] max-w-full bg-white object-contain"
                      />
                    </button>
                  </div>
                )
              )}

              <div className="my-4 border-t border-dashed border-[#ded7ca]" />

              <div className="flex items-center justify-between gap-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#315f4d]">
                  Additional findings
                </div>

                <div className="rounded-full border border-[#ded7ca] bg-[#f7f5f0] px-2.5 py-0.5 text-[11px] text-[#637268]">
                  {unlockedFindings}/{findings.length || 3}
                </div>
              </div>

              <div className="mt-2.5 space-y-2">
                {findings.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[#ded7ca] bg-[#fbfaf7] p-3.5 text-[13px] text-[#637268]">
                    No additional findings have been added for this case.
                  </div>
                ) : (
                  findings.map((finding, index) => {
                    const unlocked = index < unlockedFindings

                    return (
                      <div
                        key={index}
                        className={
                          unlocked
                            ? 'rounded-xl border border-[#ead9b7] bg-[#fffaf1] p-3.5 text-[#102018]'
                            : 'rounded-xl border border-dashed border-[#ded7ca] bg-white p-3.5 text-[#9aa39c]'
                        }
                      >
                        {unlocked ? (
                          <div className="flex gap-3">
                            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c76b3a]" />
                            <p className="font-serif text-[14px] leading-5.5">{finding}</p>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2.5 text-[12px]">
                            <span>🔒</span>
                            <span>Incorrect guesses unlock additional findings.</span>
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>

              <div className="mt-3.5 border-t border-[#ded7ca] pt-3">
                <div className="flex gap-3">
                  <input
                    value={guess}
                    onChange={e => setGuess(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submitGuess()}
                    placeholder={
                      !dailyCase
                        ? 'No case available'
                        : gameWon
                          ? 'Round complete'
                          : gameOver
                            ? 'Round complete'
                            : 'Type your diagnosis...'
                    }
                    disabled={!dailyCase || gameWon || gameOver}
                    className="flex-1 rounded-xl border border-[#ded7ca] bg-white px-3.5 py-2.5 text-[13px] text-[#102018] outline-none transition focus:border-[#1f6448] focus:ring-2 focus:ring-[#1f6448]/20 disabled:cursor-not-allowed disabled:bg-[#f7f5f0] disabled:text-[#a0a7a2]"
                  />

                  <button
                    onClick={submitGuess}
                    disabled={!dailyCase || gameWon || gameOver}
                    className="rounded-xl bg-[#1f6448] px-4 py-2.5 text-[12px] font-semibold text-white transition hover:bg-[#174c37] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Submit →
                  </button>
                </div>

                <p className="mt-2 text-[12px] text-[#637268]">
                  {message || `${MAX_GUESSES - guesses.length} guesses remaining`}
                </p>
              </div>
            </div>
          </div>

          {roundComplete && dailyCase && (
            <div className="rounded-2xl border border-[#ded7ca] bg-white p-4 shadow-sm">
              <div
                className={
                  gameWon
                    ? 'inline-flex rounded-full bg-[#e8f3ed] px-3 py-1.5 text-[13px] font-semibold text-[#1f6448]'
                    : 'inline-flex rounded-full bg-[#fff1e8] px-3 py-1.5 text-[13px] font-semibold text-[#a24d24]'
                }
              >
                {gameWon
                  ? `Solved in ${guesses.length} ${guesses.length === 1 ? 'guess' : 'guesses'}`
                  : 'Round complete'}
              </div>

              <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#637268]">
                    Diagnosis
                  </div>

                  <h3 className="mt-1.5 font-serif text-[26px] font-bold text-[#102018]">
                    {dailyCase.answer}
                  </h3>
                </div>

                <button
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `Orthodle ${formatLevel(selectedLevel)}: ${
                        gameWon ? `${guesses.length}/6` : 'X/6'
                      }`
                    )
                    setMessage('Result copied.')
                  }}
                  className="rounded-xl border border-[#ded7ca] px-3 py-1.5 text-[12px] font-semibold text-[#102018] transition hover:bg-[#f7f5f0]"
                >
                  Share result
                </button>
              </div>

              <div className="mt-4 rounded-xl border border-[#cfded4] bg-[#f7fbf8] p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#315f4d]">
                  Teaching point
                </div>

                <p className="mt-2.5 font-serif text-[15px] leading-6 text-[#102018]">
                  {teachingPoint}
                </p>

                {findings.length > 0 && (
                  <>
                    <div className="my-4 border-t border-dashed border-[#cfded4]" />

                    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#315f4d]">
                      All findings
                    </div>

                    <ul className="mt-2.5 space-y-2">
                      {findings.map((finding, index) => (
                        <li key={index} className="flex gap-3 font-serif text-[14px] leading-5.5">
                          <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c76b3a]" />
                          <span>{finding}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-[#ded7ca] bg-white p-4 shadow-sm">
            <div className="mb-3 flex justify-between text-[11px] uppercase tracking-[0.2em] text-[#102018]">
              <span>Your guesses</span>
              <span className="text-[#637268]">{guesses.length}/{MAX_GUESSES}</span>
            </div>

            <div className="space-y-1.5">
              {Array.from({ length: MAX_GUESSES }).map((_, i) => {
                const item = guesses[i]

                return (
                  <div
                    key={i}
                    className={
                      item
                        ? item.correct
                          ? 'flex min-h-[38px] items-center gap-2 rounded-xl border border-[#cfded4] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#102018]'
                          : 'flex min-h-[38px] items-center gap-2 rounded-xl border border-[#ead9b7] bg-[#fffaf1] px-3 py-1.5 text-[12px] font-semibold text-[#102018]'
                        : 'flex min-h-[38px] items-center gap-2 rounded-xl border border-dashed border-[#ded7ca] bg-white px-3 py-1.5 text-[12px] text-[#9aa39c]'
                    }
                  >
                    <span className="w-5 font-mono text-[11px] text-[#637268]">
                      {String(i + 1).padStart(2, '0')}
                    </span>

                    <span
                      className={
                        item
                          ? item.correct
                            ? 'flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#1f7a4d] text-[10px] text-white'
                            : 'flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#c76b3a] text-[10px] text-white'
                          : 'h-5 w-5 shrink-0 rounded-full bg-[#f1eee8]'
                      }
                    >
                      {item ? (item.correct ? '✓' : '×') : ''}
                    </span>

                    <span className="truncate font-serif text-[13px] font-bold leading-none">
                      {item?.text || '—'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-dashed border-[#ded7ca] bg-white/70 p-4 text-[12px] leading-5.5 text-[#637268]">
            <p className="font-semibold uppercase tracking-[0.2em] text-[#315f4d]">
              Tip
            </p>
            <p className="mt-2.5 font-serif text-[14px] text-[#102018]">
              Common abbreviations and synonyms are accepted.
            </p>
            <p className="mt-2">
              Write out full names for best match — e.g. “slipped capital femoral
              epiphysis” or “SCFE.”
            </p>
          </div>
        </aside>
      </div>

      <footer className="mx-auto mt-8 max-w-4xl border-t border-[#ded7ca] px-6 py-6 text-center text-[10px] uppercase tracking-[0.28em] text-[#637268]">
        Orthodle — for education &amp; entertainment. Not medical advice.
      </footer>

      {dailyCase?.image_url && imageExpanded && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#102018]/75 px-4 py-8">
          <div className="w-full max-w-5xl overflow-hidden rounded-[28px] border border-white/15 bg-[#fbfaf7] shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-[#d7d9dc] bg-white px-5 py-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#637268]">
                  Imaging
                </div>
                <div className="mt-1 font-serif text-[22px] font-bold text-[#102018]">
                  Expanded case image
                </div>
              </div>

              <button
                onClick={() => setImageExpanded(false)}
                className="rounded-full border border-[#ded7ca] bg-[#fbfaf7] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#102018] transition hover:bg-white"
              >
                Minimize
              </button>
            </div>

            <div className="bg-[#f7f4ee] p-5">
              <img
                src={dailyCase.image_url}
                alt="Expanded case image"
                className="mx-auto block max-h-[78vh] max-w-full rounded-2xl border border-[#d7d9dc] bg-white object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
