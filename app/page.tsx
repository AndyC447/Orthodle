'use client'
import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Header } from '@/components/Header'
import { supabase } from '@/lib/supabase'
import {
  getStatsSummary,
  normalizeAnswer,
  ORTHO_DIAGNOSIS_BANK,
  getRoundProgress,
  getSessionId,
  recordGameResult,
  saveRoundProgress,
  todayISO,
} from '@/lib/utils'

type Level = 'med_student' | 'resident' | 'attending'

type Case = {
  id: string
  case_date: string
  level: Level
  contributor_name?: string | null
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

type CommunityCaseStats = {
  solveRate: number | null
  averageGuessesPerPlayer: number | null
  averageGuessesToSolve: number | null
  firstTrySolveRate: number | null
}

const MAX_GUESSES = 6
const LAUNCH_DATE = '2026-04-27'

const levels = [
  { key: 'med_student' as Level, label: 'Med Student', subtitle: 'Foundations' },
  { key: 'resident' as Level, label: 'Resident', subtitle: 'Clinic & Call' },
  { key: 'attending' as Level, label: 'Attending', subtitle: 'Zebras & Nuance' },
]

const confettiPieces = Array.from({ length: 18 }, (_, index) => ({
  id: index,
  left: 6 + index * 5.1,
  delay: (index % 6) * 0.08,
  duration: 2.4 + (index % 5) * 0.18,
  rotation: -24 + (index % 7) * 9,
  color: ['#1f7a4d', '#c76b3a', '#ead9b7', '#315f4d'][index % 4],
}))

function PlayPageContent() {
  const searchParams = useSearchParams()
  const findingsRef = useRef<HTMLDivElement | null>(null)
  const [selectedLevel, setSelectedLevel] = useState<Level>('med_student')
  const [selectedDate, setSelectedDate] = useState(todayISO())
  const [dailyCase, setDailyCase] = useState<Case | null>(null)
  const [guess, setGuess] = useState('')
  const [answerOptions, setAnswerOptions] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [guesses, setGuesses] = useState<Guess[]>([])
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [gameWon, setGameWon] = useState(false)
  const [gameOver, setGameOver] = useState(false)
  const [shakeInput, setShakeInput] = useState(false)
  const [pulseSuccess, setPulseSuccess] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)
  const [imageExpanded, setImageExpanded] = useState(false)
  const [imageHidden, setImageHidden] = useState(false)
  const [communityStats, setCommunityStats] = useState<CommunityCaseStats | null>(null)
  const [showArchiveTools, setShowArchiveTools] = useState(false)
  const [dailySummary, setDailySummary] = useState({
    date: todayISO(),
    played: 0,
    wins: 0,
    losses: 0,
    levelsSolved: 0,
    averageGuesses: null as number | null,
    levels: [] as Array<{
      level: Level
      won: boolean
      guessesUsed: number
      answer: string
      category: string
    }>,
  })

  useEffect(() => {
    const levelParam = searchParams.get('level')
    const dateParam = searchParams.get('date')

    if (
      levelParam === 'med_student' ||
      levelParam === 'resident' ||
      levelParam === 'attending'
    ) {
      setSelectedLevel(levelParam)
    }

    if (dateParam && dateParam >= LAUNCH_DATE && dateParam <= todayISO()) {
      setSelectedDate(dateParam)
      setShowArchiveTools(true)
    }
  }, [searchParams])

  useEffect(() => {
    setDailySummary(getStatsSummary().today)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadAnswerOptions() {
      const { data } = await supabase
        .from('cases')
        .select('answer')
        .range(0, 1999)
      if (cancelled) return

      const uniqueAnswers = Array.from(
        new Map(
          [...ORTHO_DIAGNOSIS_BANK, ...((data || []).map(item => item.answer?.trim()).filter(Boolean) as string[])]
            .filter(Boolean)
            .map(answer => [normalizeAnswer(answer as string), answer as string])
        ).values()
      ).sort((a, b) => a.localeCompare(b))

      setAnswerOptions(uniqueAnswers)
    }

    void loadAnswerOptions()

    return () => {
      cancelled = true
    }
  }, [])

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
      setShowConfetti(false)
      setImageExpanded(false)
      setImageHidden(false)
      setCommunityStats(null)

      try {
        const sessionId = getSessionId()

        void supabase.from('visits').insert({
          session_id: sessionId,
          path: `/${selectedLevel}/${selectedDate}`,
        })

        const { data, error } = await supabase
          .from('cases')
          .select('*')
          .eq('case_date', selectedDate)
          .eq('level', selectedLevel)
          .maybeSingle()

        if (cancelled) return

        if (error || !data) {
          setMessage(`No ${formatLevel(selectedLevel)} case is available for ${formatArchiveDate(selectedDate)}.`)
          setDailyCase(null)
          return
        }

        setDailyCase(data)

        const isArchiveCase = data.case_date !== todayISO()
        const savedProgress = getRoundProgress(data.case_date, data.level, isArchiveCase)

        if (savedProgress && savedProgress.caseId === data.id) {
          setGuesses(savedProgress.guesses)
          setGameWon(savedProgress.gameWon)
          setGameOver(savedProgress.gameOver)
          setMessage(savedProgress.message)
        }

        const [{ data: visitRows }, { data: guessRows }] = await Promise.all([
          supabase.from('visits').select('session_id').eq('path', `/${selectedLevel}/${selectedDate}`),
          supabase
            .from('guesses')
            .select('session_id, is_correct, created_at')
            .eq('case_id', data.id)
            .order('created_at', { ascending: true }),
        ])

        if (cancelled) return

        const players = new Set<string>([
          ...(visitRows || []).map(item => item.session_id),
          ...(guessRows || []).map(item => item.session_id),
        ])

        const guessesBySession = new Map<
          string,
          Array<{ is_correct: boolean; created_at: string }>
        >()

        for (const guessRow of guessRows || []) {
          const existing = guessesBySession.get(guessRow.session_id)
          const item = {
            is_correct: Boolean(guessRow.is_correct),
            created_at: guessRow.created_at,
          }

          if (existing) {
            existing.push(item)
          } else {
            guessesBySession.set(guessRow.session_id, [item])
          }
        }

        let solvedPlayers = 0
        let firstTrySolves = 0
        let totalGuessesBeforeSolve = 0

        for (const sessionGuesses of guessesBySession.values()) {
          const solvedIndex = sessionGuesses.findIndex(item => item.is_correct)
          if (solvedIndex === -1) continue

          solvedPlayers += 1
          totalGuessesBeforeSolve += solvedIndex + 1

          if (solvedIndex === 0) {
            firstTrySolves += 1
          }
        }

        setCommunityStats({
          solveRate: players.size > 0 ? (solvedPlayers / players.size) * 100 : null,
          averageGuessesPerPlayer:
            players.size > 0 ? (guessRows || []).length / players.size : null,
          averageGuessesToSolve:
            solvedPlayers > 0 ? totalGuessesBeforeSolve / solvedPlayers : null,
          firstTrySolveRate:
            solvedPlayers > 0 ? (firstTrySolves / solvedPlayers) * 100 : null,
        })
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
  }, [selectedLevel, selectedDate])

  function formatLevel(level: Level) {
    if (level === 'med_student') return 'Med Student'
    if (level === 'resident') return 'Resident'
    return 'Attending'
  }

  function formatArchiveDate(dateText: string) {
    return new Date(`${dateText}T12:00:00`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  function shiftSelectedDate(direction: -1 | 1) {
    const baseDate = new Date(`${selectedDate}T12:00:00`)
    baseDate.setDate(baseDate.getDate() + direction)
    const nextDate = baseDate.toISOString().slice(0, 10)

    if (nextDate < LAUNCH_DATE) return
    if (nextDate > todayISO()) return

    setSelectedDate(nextDate)
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
  const mobileInputDisabled = !dailyCase || gameWon || gameOver

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

  function triggerConfetti() {
    setShowConfetti(false)
    requestAnimationFrame(() => {
      setShowConfetti(true)
      window.setTimeout(() => setShowConfetti(false), 3400)
    })
  }

  function buildShareText() {
    const score = gameWon ? `${guesses.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`
    const boxes = Array.from({ length: MAX_GUESSES }, (_, index) => {
      const item = guesses[index]

      if (!item) return '⬜'
      return item.correct ? '🟩' : '🟧'
    }).join('')
    const prettyDate = formatArchiveDate(dailyCase?.case_date || selectedDate)
    const archiveLabel = (dailyCase?.case_date || selectedDate) === todayISO() ? '' : ' Archive'

    return [
      `Orthodle${archiveLabel} ${formatLevel(selectedLevel)} ${score}`,
      prettyDate,
      boxes,
      'https://orthodle.com',
    ].join('\n')
  }

  async function shareResult() {
    const shareText = buildShareText()

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Orthodle',
          text: shareText,
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

  const filteredAnswerOptions = useMemo(() => {
    const query = normalizeAnswer(guess)
    if (!query) return []

    const startsWith = answerOptions.filter(option =>
      normalizeAnswer(option).startsWith(query)
    )
    const includes = answerOptions.filter(option => {
      const normalized = normalizeAnswer(option)
      return !normalized.startsWith(query) && normalized.includes(query)
    })

    return [...startsWith, ...includes].slice(0, 12)
  }, [answerOptions, guess])

  function selectSuggestion(option: string) {
    setGuess(option)
    setShowSuggestions(false)
  }

  function renderSuggestionList(className: string) {
    if (!showSuggestions || mobileInputDisabled || filteredAnswerOptions.length === 0) return null

    return (
      <div
        className={className}
      >
        {filteredAnswerOptions.map(option => (
          <button
            key={option}
            type="button"
            onMouseDown={e => {
              e.preventDefault()
              selectSuggestion(option)
            }}
            className="w-full border-b border-[#f0ebe1] px-3 py-2 text-left text-[13px] text-[#102018] transition hover:bg-[#fbfaf7] last:border-b-0"
          >
            {option}
          </button>
        ))}
      </div>
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

    const nextGuesses = [...guesses, { text: currentGuess, correct: data.correct }]

    setGuesses(nextGuesses)
    setGuess('')

    if (data.correct) {
      setGameWon(true)
      const nextMessage =
        `Correct — solved in ${nextGuessCount} ${
          nextGuessCount === 1 ? 'guess' : 'guesses'
        }.`
      setMessage(nextMessage)
      saveRoundProgress({
        caseId: dailyCase.id,
        caseDate: dailyCase.case_date,
        level: dailyCase.level,
        isArchive: dailyCase.case_date !== todayISO(),
        guesses: nextGuesses,
        gameWon: true,
        gameOver: false,
        message: nextMessage,
      })
      triggerSuccessPulse()
      triggerConfetti()
      return
    }

    triggerShake()

    if (nextGuessCount >= MAX_GUESSES) {
      setGameOver(true)
      const nextMessage = `Out of guesses. Answer: ${dailyCase.answer}`
      setMessage(nextMessage)
      saveRoundProgress({
        caseId: dailyCase.id,
        caseDate: dailyCase.case_date,
        level: dailyCase.level,
        isArchive: dailyCase.case_date !== todayISO(),
        guesses: nextGuesses,
        gameWon: false,
        gameOver: true,
        message: nextMessage,
      })
      return
    }

    const nextMessage = `Not quite. ${MAX_GUESSES - nextGuessCount} guesses remaining.`
    setMessage(nextMessage)
    saveRoundProgress({
      caseId: dailyCase.id,
      caseDate: dailyCase.case_date,
      level: dailyCase.level,
      isArchive: dailyCase.case_date !== todayISO(),
      guesses: nextGuesses,
      gameWon: false,
      gameOver: false,
      message: nextMessage,
    })
  }

  useEffect(() => {
    if (unlockedFindings === 0 || roundComplete) return

    const timeoutId = window.setTimeout(() => {
      findingsRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    }, 180)

    return () => window.clearTimeout(timeoutId)
  }, [unlockedFindings, roundComplete])

  useEffect(() => {
    if (!dailyCase || !roundComplete || guesses.length === 0) return

    recordGameResult({
      caseDate: dailyCase.case_date,
      level: dailyCase.level,
      isArchive: dailyCase.case_date !== todayISO(),
      won: gameWon,
      guessesUsed: guesses.length,
      answer: dailyCase.answer,
      category: dailyCase.category,
    })
    setDailySummary(getStatsSummary().today)
  }, [dailyCase, roundComplete, gameWon, guesses])

  const todayCompletedLevels = new Set(
  dailySummary.levels
    .filter(item => item.won || item.guessesUsed === 6) // completed (win OR used all guesses)
    .map(item => item.level)
).size

const todayComplete = todayCompletedLevels === 3
  const onTodayCard = selectedDate === todayISO()

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

        @keyframes orthodle-confetti-fall {
          0% {
            opacity: 0;
            transform: translate3d(0, -24px, 0) rotate(0deg) scale(0.9);
          }
          10% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            transform: translate3d(0, 92vh, 0) rotate(540deg) scale(1);
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

        .orthodle-win-glow {
          box-shadow:
            0 18px 36px rgba(31, 122, 77, 0.12),
            0 0 0 1px rgba(31, 122, 77, 0.08);
        }

        .orthodle-confetti-piece {
          position: absolute;
          top: 0;
          width: 10px;
          height: 18px;
          border-radius: 999px;
          animation-name: orthodle-confetti-fall;
          animation-timing-function: ease-out;
          animation-fill-mode: forwards;
          will-change: transform, opacity;
        }

        .orthodle-date-input {
          position: absolute;
          inset: 0;
          opacity: 0;
          cursor: pointer;
        }

        .orthodle-date-input::-webkit-calendar-picker-indicator {
          opacity: 0;
          cursor: pointer;
        }
      `}</style>

      {showConfetti && (
        <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
          {confettiPieces.map(piece => (
            <span
              key={piece.id}
              className="orthodle-confetti-piece"
              style={{
                left: `${piece.left}%`,
                backgroundColor: piece.color,
                animationDelay: `${piece.delay}s`,
                animationDuration: `${piece.duration}s`,
                transform: `rotate(${piece.rotation}deg)`,
              }}
            />
          ))}
        </div>
      )}

      <section className="mx-auto max-w-5xl px-4 pt-4 pb-1 text-center sm:px-6 sm:pt-6">
        <h1 className="font-serif text-[34px] font-bold leading-[1.02] tracking-[-0.03em] text-[#102018] sm:text-[42px] md:text-[46px]">
          Read the case.
          <br />
          Guess the diagnosis.
        </h1>

        {onTodayCard && todayComplete && (
          <div className="mx-auto mt-3 max-w-lg rounded-2xl border border-[#d8e5dd] bg-[#f8fbf9] px-4 py-3 text-left shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#1f6448]">
              Daily card complete
            </div>
            <p className="mt-1.5 text-[13px] leading-5 text-[#637268]">
              You&apos;ve already finished today&apos;s three cases. Check your stats or browse older cases in the archive.
            </p>
          </div>
        )}

        <div className="mx-auto mt-3 grid max-w-lg grid-cols-3 rounded-2xl border border-[#ded7ca] bg-white p-1 shadow-sm">
          {levels.map(level => {
            const active = selectedLevel === level.key

            return (
              <button
                key={level.key}
                onClick={() => setSelectedLevel(level.key)}
                className={
                  active
                    ? 'rounded-xl bg-[#1f6448] px-2.5 py-2 text-center text-white shadow-sm transition duration-200 hover:scale-[1.01] sm:px-3 sm:py-2.5'
                    : 'rounded-xl px-2.5 py-2 text-center text-[#102018] transition duration-200 hover:scale-[1.01] hover:bg-[#f7f5f0] sm:px-3 sm:py-2.5'
                }
              >
                <div className="font-serif text-[12px] font-bold leading-none sm:text-[13px]">
                  {level.label}
                </div>

                <div
                  className={
                    active
                      ? 'mt-1 text-[7px] font-semibold uppercase tracking-[0.18em] text-[#dbe7e0] sm:text-[8px] sm:tracking-[0.22em]'
                      : 'mt-1 text-[7px] font-semibold uppercase tracking-[0.18em] text-[#637268] sm:text-[8px] sm:tracking-[0.22em]'
                  }
                >
                  {level.subtitle}
                </div>
              </button>
            )
          })}
        </div>

      </section>

      <div className="mx-auto grid max-w-[980px] items-start gap-3 px-4 py-2 pb-28 sm:gap-4 sm:px-6 sm:pb-8 lg:grid-cols-[620px_280px] lg:justify-center lg:gap-6">
        <section className="space-y-4">
          <div className="overflow-visible rounded-2xl border border-[#e7e1d6] bg-white shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
            <div className="h-1.5 bg-gradient-to-r from-[#1f6448] via-[#c76b3a] to-[#ead9b7]" />

            <div className="p-3.5 sm:px-3.5 sm:py-4">
              <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#637268]">
                  <span>{dailyCase?.category || formatLevel(selectedLevel)}</span>
                </div>
              </div>

              <p className="mt-1 font-serif text-[15px] leading-[1.55] tracking-[-0.01em] text-[#102018] sm:mt-2.5 sm:text-[17px]">
                {loading
                  ? 'Loading...'
                  : dailyCase
                    ? dailyCase.prompt
                    : 'No case available for this level today.'}
              </p>

              {dailyCase?.image_url && imageRevealed && (
                imageHidden ? (
                  <div className="mt-3.5 flex items-center justify-between rounded-xl border border-dashed border-[#d9d4ca] bg-[#fbfaf7] px-3 py-2.5">
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
                  <div className="mt-3.5 rounded-xl border border-[#e2ddd3] bg-[#f8f6f1] p-2">
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
                          onClick={() => setImageExpanded(true)}
                          className="rounded-full border border-[#ded7ca] bg-white px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#102018] transition hover:bg-[#fbfaf7]"
                        >
                          Enlarge
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
                        className="block max-h-[260px] max-w-full bg-white object-contain sm:max-h-[320px]"
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

              <div ref={findingsRef} className="mt-4 border-t border-dashed border-[#ded7ca] pt-3">
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
                        className="orthodle-reveal rounded-lg border border-[#ead9b7] bg-[#fffaf1] px-3 py-2.5 text-[#102018] sm:px-3.5"
                      >
                        <div className="flex gap-3">
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c76b3a]" />
                          <p className="font-serif text-[14px] leading-5.5 tracking-[-0.01em] sm:text-[15px]">
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

              <div className="mt-3.5 hidden border-t border-[#ded7ca] pt-3 sm:block">
                <div className="relative">
                  <div className={shakeInput ? 'orthodle-shake flex gap-2' : 'flex gap-2'}>
                    <input
                      value={guess}
                      onChange={e => {
                        setGuess(e.target.value)
                        setShowSuggestions(true)
                      }}
                      onFocus={() => setShowSuggestions(true)}
                      onBlur={() => window.setTimeout(() => setShowSuggestions(false), 120)}
                      onKeyDown={e => e.key === 'Enter' && submitGuess()}
                      placeholder={
                        !dailyCase
                          ? 'No case available'
                          : gameWon || gameOver
                            ? 'Round complete'
                            : 'Start typing to narrow the diagnosis...'
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

                  {renderSuggestionList(
                    'absolute inset-x-0 top-[calc(100%+8px)] z-30 max-h-64 overflow-y-auto rounded-xl border border-[#ded7ca] bg-white shadow-[0_12px_28px_rgba(16,32,24,0.08)]'
                  )}
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
                  ? 'orthodle-success-pulse orthodle-win-glow rounded-2xl border border-[#d8e5dd] bg-white p-4 shadow-[0_10px_24px_rgba(16,32,24,0.04)]'
                  : 'rounded-2xl border border-[#e7e1d6] bg-white p-4 shadow-[0_10px_24px_rgba(16,32,24,0.04)]'
              }
            >
              <div className="flex flex-col items-start gap-2">
                <div
                  className={
                    gameWon
                      ? 'inline-flex rounded-full border border-[#cfe2d8] bg-[#e8f3ed] px-3 py-1.5 text-[13px] font-semibold text-[#1f6448]'
                      : 'inline-flex rounded-full bg-[#fff1e8] px-3 py-1.5 text-[13px] font-semibold text-[#a24d24]'
                  }
                >
                  {gameWon
                    ? `Solved in ${guesses.length} ${guesses.length === 1 ? 'guess' : 'guesses'}`
                    : 'Round complete'}
                </div>

                {gameWon && (
                  <button
                    onClick={shareResult}
                    className="inline-flex rounded-full border border-[#cfe2d8] bg-[#f2faf5] px-3 py-1.5 text-[13px] font-semibold text-[#1f6448] transition hover:bg-[#eaf6ef]"
                  >
                    Share the win
                  </button>
                )}
              </div>

              <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-serif text-[26px] font-bold leading-tight tracking-[-0.03em] text-[#102018]">
                    {dailyCase.answer}
                  </h3>
                  {gameWon && (
                    <p className="mt-1 max-w-md text-[12px] leading-5 text-[#637268]">
                      {guesses.length === 1
                        ? 'First-shot finish.'
                        : guesses.length <= 3
                          ? 'Strong solve.'
                          : 'Clutched it late.'}{' '}
                      Keep the takeaway handy.
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {dailyCase.contributor_name && (
                  <div className="inline-flex rounded-full border border-[#dfe7e1] bg-[#fbfdfb] px-3 py-1 text-[11px] font-semibold text-[#315f4d]">
                    Contributed by {dailyCase.contributor_name}
                  </div>
                )}

                <div className="border-l-2 border-[#cfe2d8] pl-4">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#315f4d]">
                    Quick takeaway
                  </div>
                  <div className="mt-2 space-y-1">
                    {renderTeachingPoint(teachingPoint)}
                  </div>
                </div>

                {communityStats && (
                  <div className="grid gap-x-4 gap-y-1.5 border-t border-[#ebe5db] pt-3 text-[12px] text-[#637268] sm:grid-cols-2">
                    <div>
                      Solve rate{' '}
                      <span className="font-semibold text-[#102018]">
                        {communityStats.solveRate !== null
                          ? `${Math.round(communityStats.solveRate)}%`
                          : '—'}
                      </span>
                    </div>
                    <div>
                      Avg guesses{' '}
                      <span className="font-semibold text-[#102018]">
                        {communityStats.averageGuessesPerPlayer?.toFixed(1) ?? '—'}
                      </span>
                    </div>
                    <div>
                      Avg to solve{' '}
                      <span className="font-semibold text-[#102018]">
                        {communityStats.averageGuessesToSolve?.toFixed(1) ?? '—'}
                      </span>
                    </div>
                    <div>
                      First-try solves{' '}
                      <span className="font-semibold text-[#102018]">
                        {communityStats.firstTrySolveRate !== null
                          ? `${Math.round(communityStats.firstTrySolveRate)}%`
                          : '—'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        <aside className="space-y-3">
          <div className="rounded-2xl border border-[#ded7ca] bg-white p-3 shadow-sm sm:hidden">
            <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.24em] text-[#102018]">
              <span>Your guesses</span>
              <span className="font-semibold text-[#637268]">
                {guesses.length}/{MAX_GUESSES}
              </span>
            </div>

            <div className="grid grid-cols-6 gap-1.5">
              {Array.from({ length: MAX_GUESSES }).map((_, i) => {
                const item = guesses[i]

                return (
                  <div
                    key={`mobile-${i}`}
                    className={
                      item
                        ? item.correct
                          ? 'flex min-h-[52px] flex-col items-center justify-center rounded-lg border border-[#cfded4] bg-[#e8f3ed] px-1 py-1.5 text-[#102018]'
                          : 'flex min-h-[52px] flex-col items-center justify-center rounded-lg bg-[#fffaf1] px-1 py-1.5 text-[#102018]'
                        : 'flex min-h-[52px] flex-col items-center justify-center rounded-lg border border-dashed border-[#ded7ca] bg-white px-1 py-1.5 text-[#9aa39c]'
                    }
                  >
                    <span className="text-[10px] font-mono text-[#637268]">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="mt-1 text-[11px] font-semibold">
                      {item ? (item.correct ? '✓' : '×') : '•'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="hidden rounded-2xl border border-[#e7e1d6] bg-white p-4 shadow-[0_10px_24px_rgba(16,32,24,0.04)] sm:block">
            <div className="mb-3 text-center text-[11px] font-bold uppercase tracking-[0.24em] text-[#102018]">
              Your guesses
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

          <div className="hidden rounded-2xl border border-[#ebe5db] bg-[#fcfbf8] p-3 sm:block">
            <button
              type="button"
              onClick={() => setShowArchiveTools(prev => !prev)}
              className="mb-2 flex w-full items-center justify-between text-left text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7a857c]"
            >
              <span>Archive</span>
              <span>{showArchiveTools ? 'Hide' : formatArchiveDate(selectedDate)}</span>
            </button>

            {showArchiveTools && (
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
              <button
                type="button"
                onClick={() => shiftSelectedDate(-1)}
                disabled={selectedDate === LAUNCH_DATE}
                className="rounded-xl border border-[#ded7ca] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#102018] transition hover:bg-[#fbfaf7] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Prev
              </button>

              <div className="relative min-w-0 text-center">
                <div className="w-full rounded-lg border border-[#ded7ca] bg-[#fbfaf7] px-2 py-2 text-center text-[12px] font-semibold leading-4.5 text-[#102018]">
                  {formatArchiveDate(selectedDate)}
                </div>
                <input
                  type="date"
                  value={selectedDate}
                  min={LAUNCH_DATE}
                  max={todayISO()}
                  onChange={e => setSelectedDate(e.target.value)}
                  className="orthodle-date-input"
                  aria-label="Select case date"
                />
              </div>

              <button
                type="button"
                onClick={() => shiftSelectedDate(1)}
                disabled={selectedDate === todayISO()}
                className="rounded-xl border border-[#ded7ca] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#102018] transition hover:bg-[#fbfaf7] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
            )}
          </div>

        </aside>
      </div>

      <section className="mx-auto mt-4 max-w-lg px-4 sm:hidden">
        <button
          type="button"
          onClick={() => setShowArchiveTools(prev => !prev)}
          className="mb-2 w-full rounded-full border border-[#ebe5db] bg-[#fcfbf8] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7a857c]"
        >
          Archive · {showArchiveTools ? 'Hide' : formatArchiveDate(selectedDate)}
        </button>
        {showArchiveTools && (
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-end gap-2 rounded-2xl border border-[#ebe5db] bg-[#fcfbf8] px-2 py-2 shadow-none">
          <button
            type="button"
            onClick={() => shiftSelectedDate(-1)}
            disabled={selectedDate === LAUNCH_DATE}
            className="rounded-xl border border-[#ded7ca] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#102018] transition hover:bg-[#fbfaf7] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Prev
          </button>

          <div className="relative min-w-0 px-1 text-center">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#637268]">
              Case date
            </div>
            <div>
              <div className="w-full rounded-lg border border-[#ded7ca] bg-[#fbfaf7] px-2 py-2 text-center text-[12px] font-semibold text-[#102018]">
                {formatArchiveDate(selectedDate)}
              </div>
            </div>
            <input
              type="date"
              value={selectedDate}
              min={LAUNCH_DATE}
              max={todayISO()}
              onChange={e => setSelectedDate(e.target.value)}
              className="orthodle-date-input"
              aria-label="Select case date"
            />
          </div>

          <button
            type="button"
            onClick={() => shiftSelectedDate(1)}
            disabled={selectedDate === todayISO()}
            className="rounded-xl border border-[#ded7ca] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#102018] transition hover:bg-[#fbfaf7] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        </div>
        )}
      </section>

      <footer className="mx-auto mt-8 max-w-4xl border-t border-[#e7e1d6] px-4 py-6 text-center text-[10px] uppercase tracking-[0.28em] text-[#637268] sm:mt-10 sm:px-6 sm:py-7 sm:tracking-[0.3em]">
        Orthodle — for education &amp; entertainment. Not medical advice.
      </footer>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#ded7ca] bg-[#fbfaf7]/96 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-10px_30px_rgba(16,32,24,0.08)] backdrop-blur sm:hidden">
        {roundComplete ? (
          <button
            type="button"
            onClick={shareResult}
            className="w-full rounded-xl bg-[#1f6448] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#174c37]"
          >
            Share result
          </button>
        ) : (
          <>
            <div className="relative">
              <div className={shakeInput ? 'orthodle-shake flex gap-2' : 'flex gap-2'}>
                <input
                  value={guess}
                  onChange={e => {
                    setGuess(e.target.value)
                    setShowSuggestions(true)
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => window.setTimeout(() => setShowSuggestions(false), 120)}
                  onKeyDown={e => e.key === 'Enter' && submitGuess()}
                  placeholder={!dailyCase ? 'No case available' : 'Start typing to narrow the diagnosis...'}
                  disabled={mobileInputDisabled}
                  className="flex-1 rounded-xl border border-[#ded7ca] bg-white px-3.5 py-3 text-[16px] text-[#102018] outline-none transition placeholder:text-[#9aa39c] focus:border-[#1f6448] focus:ring-2 focus:ring-[#1f6448]/20 disabled:cursor-not-allowed disabled:bg-[#f7f5f0] disabled:text-[#a0a7a2]"
                />
                <button
                  onClick={submitGuess}
                  disabled={mobileInputDisabled}
                  className="rounded-xl bg-[#1f6448] px-4 py-3 text-[13px] font-bold text-white transition hover:bg-[#174c37] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Guess
                </button>
              </div>

              {renderSuggestionList(
                'absolute inset-x-0 bottom-[calc(100%+8px)] z-50 max-h-56 overflow-y-auto rounded-xl border border-[#ded7ca] bg-white shadow-[0_12px_28px_rgba(16,32,24,0.12)]'
              )}
            </div>
            <p className="mt-2 text-[12px] leading-5 text-[#637268]">
              {message || `${MAX_GUESSES - guesses.length} guesses remaining`}
            </p>
          </>
        )}
      </div>

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
export default function PlayPage() {
  return (
    <Suspense fallback={null}>
      <PlayPageContent />
    </Suspense>
  )
}
