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
  image_credit: string | null
  image_reveal_clue: number | null
  clue_1: string | null
  clue_2: string | null
  clue_3: string | null
  clue_4: string | null
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
  const [shakeInput, setShakeInput] = useState(false)
  const [pulseSuccess, setPulseSuccess] = useState(false)
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
      setShakeInput(false)
      setPulseSuccess(false)
      setImageExpanded(false)
      setImageHidden(false)

      try {
        const sessionId = getSessionId()

        void supabase.from('visits').insert({
          session_id: sessionId,
          path: `/${selectedLevel}`,
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

    return [dailyCase.clue_1, dailyCase.clue_2, dailyCase.clue_3, dailyCase.clue_4].filter(
      (item): item is string => Boolean(item && item.trim())
    )
  }, [dailyCase])

  const roundComplete = gameWon || gameOver

  const unlockedFindings = roundComplete
    ? findings.length
    : Math.min(guesses.filter(g => !g.correct).length, findings.length)

  const visibleFindings = findings.slice(0, unlockedFindings)
  const imageRevealStep =
    dailyCase?.image_url && dailyCase?.image_reveal_clue && dailyCase.image_reveal_clue >= 1
      ? dailyCase.image_reveal_clue
      : null
  const imageRevealed =
    Boolean(dailyCase?.image_url) &&
    (roundComplete || imageRevealStep === null || unlockedFindings >= imageRevealStep)

  const teachingPoint =
    dailyCase?.teaching_point ||
    `Review the key clinical findings that point toward ${
      dailyCase?.answer || 'the diagnosis'
    }. Focus on the pattern of symptoms, exam findings, imaging clues, and risk factors that distinguish it from similar orthopaedic diagnoses.`

  function triggerShake() {
    setShakeInput(false)
    requestAnimationFrame(() => {
      setShakeInput(true)
      window.setTimeout(() => setShakeInput(false), 450)
    })
  }

  function triggerSuccessPulse() {
    setPulseSuccess(false)
    requestAnimationFrame(() => {
      setPulseSuccess(true)
      window.setTimeout(() => setPulseSuccess(false), 900)
    })
  }

  function buildShareText() {
    const score = gameWon ? `${guesses.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`
    const guessRows = guesses.map(item => (item.correct ? '🟩' : '🟧')).join('')
    const emptyRows = Array.from({ length: Math.max(0, MAX_GUESSES - guesses.length) })
      .map(() => '⬜')
      .join('')
    const rows = [guessRows, emptyRows].filter(Boolean).join('\n')

    return [
      `Orthodle ${todayISO()} ${formatLevel(selectedLevel)} ${score}`,
      rows,
      'https://orthodle.com',
    ].join('\n')
  }

  async function shareResult() {
    const shareText = buildShareText()
    const shareUrl = 'https://orthodle.com'

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Orthodle',
          text: shareText,
          url: shareUrl,
        })
        return
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }
      }
    }

    await navigator.clipboard.writeText(shareText)
    setMessage('Result copied.')
  }

  function renderFormattedLine(line: string) {
    const parts = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g)

    return parts.map((part, index) => {
      if (!part) return null

      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={index}>{part.slice(2, -2)}</strong>
      }

      if (part.startsWith('*') && part.endsWith('*')) {
        return <em key={index}>{part.slice(1, -1)}</em>
      }

      return <span key={index}>{part}</span>
    })
  }

  function renderTeachingPoint(text: string) {
    return text.split('\n').map((line, index) =>
      line.trim() ? (
        <p key={index} className="font-serif text-[15px] leading-6 tracking-[-0.01em] text-[#102018]">
          {renderFormattedLine(line)}
        </p>
      ) : (
        <div key={index} className="h-2.5" />
      )
    )
  }

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
      triggerSuccessPulse()
      return
    }

    triggerShake()

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

      <style jsx global>{`
        @keyframes orthodle-shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-5px); }
          80% { transform: translateX(5px); }
        }

        @keyframes orthodle-reveal {
          0% {
            opacity: 0;
            transform: translateY(8px) scale(0.98);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes orthodle-success-pulse {
          0% {
            transform: scale(1);
            box-shadow: 0 0 0 0 rgba(31, 122, 77, 0.35);
          }
          45% {
            transform: scale(1.025);
            box-shadow: 0 0 0 10px rgba(31, 122, 77, 0);
          }
          100% {
            transform: scale(1);
            box-shadow: 0 0 0 0 rgba(31, 122, 77, 0);
          }
        }

        .orthodle-shake {
          animation: orthodle-shake 0.42s ease-in-out;
        }

        .orthodle-reveal {
          animation: orthodle-reveal 0.32s ease-out both;
        }

        .orthodle-success-pulse {
          animation: orthodle-success-pulse 0.85s ease-out;
        }
      `}</style>

      <section className="mx-auto max-w-5xl px-6 pt-6 pb-1 text-center">
        <h1 className="font-serif text-[42px] font-bold leading-[1.04] tracking-[-0.03em] text-[#102018] md:text-[46px]">
          Read the case.
          <br />
          Guess the diagnosis.
        </h1>

        <div className="mx-auto mt-3.5 grid max-w-lg grid-cols-3 rounded-2xl border border-[#ded7ca] bg-white p-1 shadow-sm">
          {levels.map(level => {
            const active = selectedLevel === level.key

            return (
              <button
                key={level.key}
                onClick={() => setSelectedLevel(level.key)}
                className={
                  active
                    ? 'rounded-xl bg-[#1f6448] px-3 py-2.5 text-center text-white shadow-sm transition duration-200 hover:scale-[1.01]'
                    : 'rounded-xl px-3 py-2.5 text-center text-[#102018] transition duration-200 hover:scale-[1.01] hover:bg-[#f7f5f0]'
                }
              >
                <div className="font-serif text-[13px] font-bold leading-none">
                  {level.label}
                </div>

                <div
                  className={
                    active
                      ? 'mt-1 text-[8px] font-semibold uppercase tracking-[0.22em] text-[#dbe7e0]'
                      : 'mt-1 text-[8px] font-semibold uppercase tracking-[0.22em] text-[#637268]'
                  }
                >
                  {level.subtitle}
                </div>
              </button>
            )
          })}
        </div>

      </section>

      <div className="mx-auto grid max-w-5xl items-start gap-4 px-6 py-2 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-[#ded7ca] bg-white shadow-sm">
            <div className="h-1.5 bg-gradient-to-r from-[#1f6448] via-[#c76b3a] to-[#ead9b7]" />

            <div className="p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-[#637268]">
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

              <p className="mt-2.5 font-serif text-[17px] leading-[1.5] tracking-[-0.01em] text-[#102018]">
                {loading
                  ? 'Loading...'
                  : dailyCase
                    ? dailyCase.prompt
                    : 'No case available for this level today.'}
              </p>

              {dailyCase?.image_url && imageRevealed && (
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
                    {dailyCase.image_credit && (
                      <p className="mt-2 text-[10px] leading-4 text-[#8a948d]">
                        {dailyCase.image_credit}
                      </p>
                    )}
                  </div>
                )
              )}

              <div className="mt-4 border-t border-dashed border-[#ded7ca] pt-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#315f4d]">
                    Clinical findings
                  </div>

                  {unlockedFindings > 0 && (
                    <div className="rounded-full border border-[#ded7ca] bg-[#f7f5f0] px-2.5 py-0.5 text-[11px] text-[#637268]">
                      {unlockedFindings}/{findings.length || 4}
                    </div>
                  )}
                </div>

                {visibleFindings.length > 0 ? (
                  <div className="mt-2.5 space-y-2">
                    {visibleFindings.map((finding, index) => (
                      <div
                        key={`${finding}-${index}`}
                        className="orthodle-reveal rounded-lg border border-[#ead9b7] bg-[#fffaf1] px-3.5 py-2.5 text-[#102018]"
                      >
                        <div className="flex gap-3">
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c76b3a]" />
                          <p className="font-serif text-[14px] leading-5.5 tracking-[-0.01em]">
                            {finding}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-[12.5px] leading-5 text-[#8a948d]">
                    Incorrect guesses will reveal additional clinical findings and any delayed imaging clues.
                  </p>
                )}
              </div>

              <div className="mt-3.5 border-t border-[#ded7ca] pt-3">
                <div className={shakeInput ? 'orthodle-shake flex gap-2' : 'flex gap-2'}>
                  <input
                    value={guess}
                    onChange={e => setGuess(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submitGuess()}
                    placeholder={
                      !dailyCase
                        ? 'No case available'
                        : gameWon || gameOver
                          ? 'Round complete'
                          : 'Type your diagnosis...'
                    }
                    disabled={!dailyCase || gameWon || gameOver}
                    className="flex-1 rounded-lg border border-[#ded7ca] bg-white px-3.5 py-2 text-[13px] text-[#102018] outline-none transition placeholder:text-[#9aa39c] focus:border-[#1f6448] focus:ring-2 focus:ring-[#1f6448]/20 disabled:cursor-not-allowed disabled:bg-[#f7f5f0] disabled:text-[#a0a7a2]"
                  />

                  <button
                    onClick={submitGuess}
                    disabled={!dailyCase || gameWon || gameOver}
                    className="rounded-lg bg-[#1f6448] px-3 py-2 text-[12px] font-bold text-white transition duration-200 hover:scale-[1.02] hover:bg-[#174c37] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
                  >
                    Submit
                  </button>
                </div>

                <p className="mt-2 text-[12px] leading-5 text-[#637268]">
                  {message || `${MAX_GUESSES - guesses.length} guesses remaining`}
                </p>
              </div>
            </div>
          </div>

          {roundComplete && dailyCase && (
            <div
              className={
                pulseSuccess
                  ? 'orthodle-success-pulse rounded-2xl border border-[#ded7ca] bg-white p-4 shadow-sm'
                  : 'rounded-2xl border border-[#ded7ca] bg-white p-4 shadow-sm'
              }
            >
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
                  <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#637268]">
                    Diagnosis
                  </div>

                  <h3 className="mt-1.5 font-serif text-[26px] font-bold leading-tight tracking-[-0.03em] text-[#102018]">
                    {dailyCase.answer}
                  </h3>
                </div>

                <button
                  onClick={shareResult}
                  className="rounded-lg border border-[#ded7ca] px-3 py-1.5 text-[12px] font-semibold text-[#102018] transition hover:scale-[1.02] hover:bg-[#f7f5f0]"
                >
                  Share result
                </button>
              </div>

              <div className="mt-4 rounded-xl border border-[#cfded4] bg-[#f7fbf8] p-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#315f4d]">
                  Teaching point
                </div>

                <div className="mt-2.5 space-y-1">
                  {renderTeachingPoint(teachingPoint)}
                </div>

                {findings.length > 0 && (
                  <>
                    <div className="my-4 border-t border-dashed border-[#cfded4]" />

                    <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#315f4d]">
                      All findings
                    </div>

                    <ul className="mt-2.5 space-y-2">
                      {findings.map((finding, index) => (
                        <li
                          key={index}
                          className="flex gap-3 font-serif text-[14px] leading-5.5 tracking-[-0.01em]"
                        >
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
            <div className="mb-3 flex justify-between text-[11px] font-bold uppercase tracking-[0.24em] text-[#102018]">
              <span>Your guesses</span>
              <span className="font-semibold text-[#637268]">
                {guesses.length}/{MAX_GUESSES}
              </span>
            </div>

            <div className="space-y-1.5">
              {Array.from({ length: MAX_GUESSES }).map((_, i) => {
                const item = guesses[i]
                const isLatestCorrect = item?.correct && i === guesses.length - 1 && gameWon

                return (
                  <div
                    key={i}
                    className={
                      item
                        ? item.correct
                          ? `${
                              isLatestCorrect ? 'orthodle-success-pulse' : ''
                            } flex min-h-[38px] items-center gap-2 rounded-lg border border-[#cfded4] bg-[#e8f3ed] px-3 py-1.5 text-[12px] font-semibold text-[#102018] transition duration-200 hover:-translate-y-0.5 hover:shadow-sm`
                          : 'flex min-h-[38px] items-center gap-2 rounded-lg bg-[#fffaf1] px-3 py-1.5 text-[12px] font-semibold text-[#102018] transition duration-200 hover:-translate-y-0.5 hover:shadow-sm'
                        : 'flex min-h-[38px] items-center gap-2 rounded-lg border border-dashed border-[#ded7ca] bg-white px-3 py-1.5 text-[12px] text-[#9aa39c] transition duration-200 hover:bg-[#fbfaf7]'
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

        </aside>
      </div>

      <footer className="mx-auto mt-10 max-w-4xl border-t border-[#ded7ca] px-6 py-7 text-center text-[10px] uppercase tracking-[0.3em] text-[#637268]">
        Orthodle — for education &amp; entertainment. Not medical advice.
      </footer>

      {dailyCase?.image_url && imageRevealed && imageExpanded && (
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
              {dailyCase.image_credit && (
                <p className="mt-3 text-center text-[10px] leading-4 text-[#8a948d]">
                  {dailyCase.image_credit}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
