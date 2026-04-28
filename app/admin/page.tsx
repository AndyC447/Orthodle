'use client'

import { useEffect, useMemo, useState } from 'react'
import { Header } from '@/components/Header'
import { supabase } from '@/lib/supabase'

type Level = 'med_student' | 'resident' | 'attending'

type CaseRow = {
  id: string
  case_date: string
  level: Level
  contributor_name: string | null
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
  teaching_point: string | null
}

type SubmissionRow = {
  id: string
  contributor_name: string | null
  status: string
  scheduled_date: string | null
  published_case_id: string | null
  level: Level
  category: string | null
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
  teaching_point: string | null
  created_at: string
}

type AnalyticsRow = {
  date: string
  visits: number
  guesses: number
  correct_guesses: number
  unique_sessions: number
}

type GuessAnalyticsRow = {
  session_id: string
  is_correct: boolean
  created_at: string
  case_id: string | null
  cases: {
    level: Level
    case_date: string
    answer: string
    category: string | null
  } | null
}

type AnalyticsSummary = {
  totalVisits: number
  totalUsers: number
  totalGuesses: number
  totalCorrectGuesses: number
  guessAccuracy: number
  averageGuessesPerUser: number
  todayUsers: number
  todayGuesses: number
  todayCorrectGuesses: number
}

type LevelAnalytics = {
  level: Level
  users: number
  guesses: number
  correctGuesses: number
}

type CasePerformance = {
  caseId: string
  answer: string
  category: string
  level: Level
  caseDate: string
  guesses: number
  correctGuesses: number
  players: number
}

const today = new Date().toISOString().slice(0, 10)
const levelOrder: Level[] = ['med_student', 'resident', 'attending']

export default function AdminPage() {
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [authReady, setAuthReady] = useState(false)
  const [caseDate, setCaseDate] = useState(today)
  const [level, setLevel] = useState<Level>('med_student')
  const [contributorName, setContributorName] = useState('')
  const [category, setCategory] = useState('')
  const [prompt, setPrompt] = useState('')
  const [answer, setAnswer] = useState('')
  const [synonyms, setSynonyms] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [imageCredit, setImageCredit] = useState('')
  const [imageRevealClue, setImageRevealClue] = useState('none')
  const [clue1, setClue1] = useState('')
  const [clue2, setClue2] = useState('')
  const [clue3, setClue3] = useState('')
  const [clue4, setClue4] = useState('')
  const [teachingPoint, setTeachingPoint] = useState('')
  const [status, setStatus] = useState('')
  const [cases, setCases] = useState<CaseRow[]>([])
  const [analytics, setAnalytics] = useState<AnalyticsRow[]>([])
  const [analyticsSummary, setAnalyticsSummary] = useState<AnalyticsSummary | null>(null)
  const [levelAnalytics, setLevelAnalytics] = useState<LevelAnalytics[]>([])
  const [casePerformance, setCasePerformance] = useState<CasePerformance[]>([])
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([])
  const [activeSubmissionId, setActiveSubmissionId] = useState<string | null>(null)
  const [showComposer, setShowComposer] = useState(true)
  const [showAnalytics, setShowAnalytics] = useState(true)
  const [showCasesByDate, setShowCasesByDate] = useState(true)
  const [showSubmissions, setShowSubmissions] = useState(true)

  useEffect(() => {
    const savedUnlock = window.sessionStorage.getItem('orthodle_admin_unlocked')
    setIsUnlocked(savedUnlock === 'true')
    setAuthReady(true)
  }, [])

  useEffect(() => {
    if (!isUnlocked) return

    loadCases()
    loadAnalytics()
    loadSubmissions()
  }, [isUnlocked])

  const groupedCases = useMemo(() => {
    const grouped = new Map<string, CaseRow[]>()

    for (const item of cases) {
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
  }, [cases])

  const incompleteDates = useMemo(
    () =>
      groupedCases
        .filter(group => group.items.length < 3)
        .map(group => ({
          date: group.date,
          ready: group.items.length,
        })),
    [groupedCases]
  )

  function formatLevel(levelValue: Level) {
    if (levelValue === 'med_student') return 'Med Student'
    if (levelValue === 'resident') return 'Resident'
    return 'Attending'
  }

  function formatPercent(value: number) {
    return `${Math.round(value)}%`
  }

  async function unlockAdmin() {
    setAuthError('')

    const trimmedPassword = password.trim()
    if (!trimmedPassword) {
      setAuthError('Enter the admin password to continue.')
      return
    }

    const res = await fetch('/api/admin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: trimmedPassword }),
    })

    if (!res.ok) {
      setAuthError('Incorrect password.')
      return
    }

    window.sessionStorage.setItem('orthodle_admin_unlocked', 'true')
    setIsUnlocked(true)
    setPassword('')
  }

  function lockAdmin() {
    window.sessionStorage.removeItem('orthodle_admin_unlocked')
    setIsUnlocked(false)
    setPassword('')
    setAuthError('')
  }

  function startCaseFor(date: string, nextLevel: Level) {
    setCaseDate(date)
    setLevel(nextLevel)
    setContributorName('')
    setCategory('')
    setPrompt('')
    setAnswer('')
    setSynonyms('')
    setImageUrl('')
    setImageCredit('')
    setImageRevealClue('none')
    setClue1('')
    setClue2('')
    setClue3('')
    setClue4('')
    setTeachingPoint('')
    setStatus(`Creating ${formatLevel(nextLevel)} case for ${date}`)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function clearForm() {
    setCaseDate(today)
    setLevel('med_student')
    setContributorName('')
    setCategory('')
    setPrompt('')
    setAnswer('')
    setSynonyms('')
    setImageUrl('')
    setImageCredit('')
    setImageRevealClue('none')
    setClue1('')
    setClue2('')
    setClue3('')
    setClue4('')
    setTeachingPoint('')
    setActiveSubmissionId(null)
    setStatus('')
  }

  function editCase(c: CaseRow) {
    setCaseDate(c.case_date)
    setLevel(c.level)
    setContributorName(c.contributor_name || '')
    setCategory(c.category || '')
    setPrompt(c.prompt || '')
    setAnswer(c.answer || '')
    setSynonyms((c.synonyms || []).join(', '))
    setImageUrl(c.image_url || '')
    setImageCredit(c.image_credit || '')
    setImageRevealClue(
      c.image_reveal_clue && c.image_reveal_clue >= 1 && c.image_reveal_clue <= 4
        ? String(c.image_reveal_clue)
        : 'none'
    )
    setClue1(c.clue_1 || '')
    setClue2(c.clue_2 || '')
    setClue3(c.clue_3 || '')
    setClue4(c.clue_4 || '')
    setTeachingPoint(c.teaching_point || '')
    setActiveSubmissionId(null)
    setStatus(`Editing ${c.case_date} · ${c.level}`)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function editSubmission(submission: SubmissionRow) {
    setCaseDate(submission.scheduled_date || today)
    setLevel(submission.level)
    setContributorName(submission.contributor_name || '')
    setCategory(submission.category || '')
    setPrompt(submission.prompt || '')
    setAnswer(submission.answer || '')
    setSynonyms((submission.synonyms || []).join(', '))
    setImageUrl(submission.image_url || '')
    setImageCredit(submission.image_credit || '')
    setImageRevealClue(
      submission.image_reveal_clue && submission.image_reveal_clue >= 1 && submission.image_reveal_clue <= 4
        ? String(submission.image_reveal_clue)
        : 'none'
    )
    setClue1(submission.clue_1 || '')
    setClue2(submission.clue_2 || '')
    setClue3(submission.clue_3 || '')
    setClue4(submission.clue_4 || '')
    setTeachingPoint(submission.teaching_point || '')
    setActiveSubmissionId(submission.id)
    setShowComposer(true)
    setStatus(
      `Editing submission from ${submission.contributor_name || 'Anonymous contributor'}`
    )
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function loadCases() {
    const { data, error } = await supabase
      .from('cases')
      .select('*')
      .order('case_date', { ascending: false })
      .order('level', { ascending: true })
      .limit(30)

    if (error) {
      setStatus(`Failed to load cases: ${error.message}`)
      return
    }

    setCases(data || [])
  }

  async function loadSubmissions() {
    const { data, error } = await supabase
      .from('case_submissions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(40)

    if (error) {
      setStatus(`Failed to load submissions: ${error.message}`)
      return
    }

    setSubmissions((data || []) as SubmissionRow[])
  }

  async function updateSubmissionStatus(
    submissionId: string,
    nextStatus: 'accepted' | 'needs_edits' | 'rejected'
  ) {
    const { error } = await supabase
      .from('case_submissions')
      .update({ status: nextStatus })
      .eq('id', submissionId)

    if (error) {
      setStatus(`Failed to update submission: ${error.message}`)
      return
    }

    if (activeSubmissionId === submissionId && nextStatus === 'rejected') {
      clearForm()
    }

    setStatus(`Submission marked as ${nextStatus.replace('_', ' ')}.`)
    await loadSubmissions()
  }

  async function loadAnalytics() {
    const { data: visits, error: visitsError } = await supabase
      .from('visits')
      .select('session_id, created_at')

    if (visitsError) {
      setStatus(`Failed to load visits: ${visitsError.message}`)
      return
    }

    const { data: guesses, error: guessesError } = await supabase
      .from('guesses')
      .select('session_id, is_correct, created_at, case_id, cases(level, case_date, answer, category)')

    if (guessesError) {
      setStatus(`Failed to load guesses: ${guessesError.message}`)
      return
    }

    const byDate: Record<string, AnalyticsRow> = {}
    const sessionsByDate: Record<string, Set<string>> = {}

    for (const visit of visits || []) {
      const date = visit.created_at.slice(0, 10)

      if (!byDate[date]) {
        byDate[date] = {
          date,
          visits: 0,
          guesses: 0,
          correct_guesses: 0,
          unique_sessions: 0,
        }
      }

      byDate[date].visits += 1

      if (!sessionsByDate[date]) sessionsByDate[date] = new Set()
      sessionsByDate[date].add(visit.session_id)
    }

    for (const guess of guesses || []) {
      const date = guess.created_at.slice(0, 10)

      if (!byDate[date]) {
        byDate[date] = {
          date,
          visits: 0,
          guesses: 0,
          correct_guesses: 0,
          unique_sessions: 0,
        }
      }

      byDate[date].guesses += 1
      if (guess.is_correct) byDate[date].correct_guesses += 1
    }

    for (const date of Object.keys(byDate)) {
      byDate[date].unique_sessions = sessionsByDate[date]?.size || 0
    }

    const allSessions = new Set<string>()
    const levelSessions: Record<Level, Set<string>> = {
      med_student: new Set(),
      resident: new Set(),
      attending: new Set(),
    }
    const levelTotals: Record<Level, LevelAnalytics> = {
      med_student: { level: 'med_student', users: 0, guesses: 0, correctGuesses: 0 },
      resident: { level: 'resident', users: 0, guesses: 0, correctGuesses: 0 },
      attending: { level: 'attending', users: 0, guesses: 0, correctGuesses: 0 },
    }
    const caseTotals = new Map<string, CasePerformance & { playerSessions: Set<string> }>()

    for (const visit of visits || []) {
      allSessions.add(visit.session_id)
    }

for (const guess of (guesses || []) as unknown as GuessAnalyticsRow[]) {
      const relatedCase = guess.cases
      if (!relatedCase || !guess.case_id) continue

      const levelValue = relatedCase.level
      levelTotals[levelValue].guesses += 1
      if (guess.is_correct) levelTotals[levelValue].correctGuesses += 1
      levelSessions[levelValue].add(guess.session_id)

      const existingCase = caseTotals.get(guess.case_id)
      if (existingCase) {
        existingCase.guesses += 1
        if (guess.is_correct) existingCase.correctGuesses += 1
        existingCase.playerSessions.add(guess.session_id)
      } else {
        caseTotals.set(guess.case_id, {
          caseId: guess.case_id,
          answer: relatedCase.answer,
          category: relatedCase.category || 'Uncategorized',
          level: relatedCase.level,
          caseDate: relatedCase.case_date,
          guesses: 1,
          correctGuesses: guess.is_correct ? 1 : 0,
          players: 0,
          playerSessions: new Set([guess.session_id]),
        })
      }
    }

    for (const levelValue of levelOrder) {
      levelTotals[levelValue].users = levelSessions[levelValue].size
    }

    const totalVisits = (visits || []).length
    const totalGuesses = (guesses || []).length
    const totalCorrectGuesses = (guesses || []).filter(guess => guess.is_correct).length
    const todayRow = byDate[today] || {
      date: today,
      visits: 0,
      guesses: 0,
      correct_guesses: 0,
      unique_sessions: 0,
    }

    setAnalytics(
      Object.values(byDate)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 14)
    )

    setAnalyticsSummary({
      totalVisits,
      totalUsers: allSessions.size,
      totalGuesses,
      totalCorrectGuesses,
      guessAccuracy: totalGuesses > 0 ? (totalCorrectGuesses / totalGuesses) * 100 : 0,
      averageGuessesPerUser: allSessions.size > 0 ? totalGuesses / allSessions.size : 0,
      todayUsers: todayRow.unique_sessions,
      todayGuesses: todayRow.guesses,
      todayCorrectGuesses: todayRow.correct_guesses,
    })

    setLevelAnalytics(levelOrder.map(levelValue => levelTotals[levelValue]))
    setCasePerformance(
      Array.from(caseTotals.values())
        .map(item => ({
          caseId: item.caseId,
          answer: item.answer,
          category: item.category,
          level: item.level,
          caseDate: item.caseDate,
          guesses: item.guesses,
          correctGuesses: item.correctGuesses,
          players: item.playerSessions.size,
        }))
        .sort((a, b) => {
          if (b.players !== a.players) return b.players - a.players
          return b.guesses - a.guesses
        })
        .slice(0, 6)
    )
  }

  async function uploadImage(file: File) {
    setStatus('Uploading image...')

    const fileExt = file.name.split('.').pop()
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`

    const { error } = await supabase.storage
      .from('case-images')
      .upload(fileName, file)

    if (error) {
      setStatus(`Image upload failed: ${error.message}`)
      return
    }

    const { data } = supabase.storage
      .from('case-images')
      .getPublicUrl(fileName)

    setImageUrl(data.publicUrl)
    setStatus('Image uploaded.')
  }

  async function saveCase() {
    if (!caseDate || !level || !category || !prompt || !answer) {
      setStatus('Please fill out date, level, category, prompt, and answer.')
      return
    }

    const synonymArray = synonyms
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)

    const parsedImageRevealClue =
      imageUrl && imageRevealClue !== 'none' ? Number(imageRevealClue) : null

    const { error } = await supabase.from('cases').upsert(
      {
        case_date: caseDate,
        level,
        contributor_name: contributorName || null,
        category,
        prompt,
        answer,
        synonyms: synonymArray,
        image_url: imageUrl || null,
        image_credit: imageCredit || null,
        image_reveal_clue: parsedImageRevealClue,
        clue_1: clue1 || null,
        clue_2: clue2 || null,
        clue_3: clue3 || null,
        clue_4: clue4 || null,
        teaching_point: teachingPoint || null,
      },
      {
        onConflict: 'case_date,level',
      }
    )

    if (error) {
      setStatus(`Error saving case: ${error.message}`)
      return
    }

    setStatus(`Case saved for ${caseDate} · ${level}.`)
    if (activeSubmissionId) {
      const { data: savedCase } = await supabase
        .from('cases')
        .select('id')
        .eq('case_date', caseDate)
        .eq('level', level)
        .maybeSingle()

      await supabase
        .from('case_submissions')
        .update({
          status: 'scheduled',
          scheduled_date: caseDate,
          published_case_id: savedCase?.id || null,
        })
        .eq('id', activeSubmissionId)
    }

    clearForm()
    await loadCases()
    await loadSubmissions()
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

        <div className="mx-auto max-w-md px-6 py-12">
          <section className="rounded-2xl border border-[#ded7ca] bg-white p-6 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#637268]">
              Admin Access
            </div>

            <h1 className="mt-3 font-serif text-3xl font-bold text-[#102018]">
              Enter password
            </h1>

            <p className="mt-2 text-sm leading-6 text-[#637268]">
              This page is protected. Enter the admin password to manage cases and analytics.
            </p>

            <div className="mt-5 space-y-3">
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && unlockAdmin()}
                placeholder="Password"
                className="w-full rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018] outline-none transition focus:border-[#1f6448] focus:ring-2 focus:ring-[#1f6448]/15"
              />

              <button
                type="button"
                onClick={unlockAdmin}
                className="w-full rounded-lg bg-[#1f6448] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#174c37]"
              >
                Unlock admin
              </button>

              {authError && (
                <p className="text-sm text-[#a24d24]">{authError}</p>
              )}
            </div>
          </section>
        </div>
      </main>
    )
  }

  return (
    <main>
      <Header />

      <div className="mx-auto max-w-6xl px-6 py-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl font-bold text-[#102018]">
              Admin Dashboard
            </h1>

            <p className="mt-1.5 text-sm text-[#637268]">
              Schedule cases, review submissions, and keep an eye on the daily flow.
            </p>
            {incompleteDates.length > 0 && (
              <div className="mt-3 rounded-xl border border-[#ead9b7] bg-[#fffaf1] px-3 py-2 text-sm text-[#8a5a2b]">
                Missing cases on {incompleteDates.map(item => `${item.date} (${item.ready}/3)`).join(', ')}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={lockAdmin}
            className="rounded-lg border border-[#ded7ca] px-3 py-1.5 text-sm font-semibold text-[#102018] transition hover:bg-white"
          >
            Lock
          </button>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_360px]">
          <section className="card rounded-2xl border border-[#e7e1d6] bg-white p-4 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
            <div className="flex items-center justify-between gap-4">
              <h2 className="font-serif text-xl font-bold">
                Create / Schedule Case
              </h2>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowComposer(prev => !prev)}
                  className="rounded-lg border border-[#ded7ca] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#637268] transition hover:bg-white"
                >
                  {showComposer ? 'Hide' : 'Show'}
                </button>

                <button
                  onClick={clearForm}
                  className="rounded-lg border border-[#ded7ca] px-3 py-1.5 text-sm font-semibold text-[#102018] transition hover:bg-white"
                >
                  Clear
                </button>
              </div>
            </div>

            {showComposer && (
            <div className="mt-4 grid gap-3">
              <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                Publish Date
                <input
                  type="date"
                  value={caseDate}
                  onChange={e => setCaseDate(e.target.value)}
                  className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                />
              </label>

              <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                Level
                <select
                  value={level}
                  onChange={e => setLevel(e.target.value as Level)}
                  className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                >
                  <option value="med_student">Med Student</option>
                  <option value="resident">Resident</option>
                  <option value="attending">Attending</option>
                </select>
              </label>

              <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                Contributor Credit
                <input
                  value={contributorName}
                  onChange={e => setContributorName(e.target.value)}
                  placeholder="Optional contributor name shown after solving"
                  className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                />
              </label>

              <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                Category
                <input
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  placeholder="Wrist / nerve"
                  className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                />
              </label>

              <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                Case Prompt
                <textarea
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  placeholder="Write the case stem..."
                  rows={4}
                  className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                />
              </label>

              <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                Answer
                <input
                  value={answer}
                  onChange={e => setAnswer(e.target.value)}
                  placeholder="Carpal tunnel syndrome"
                  className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                />
              </label>

              <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                Synonyms
                <input
                  value={synonyms}
                  onChange={e => setSynonyms(e.target.value)}
                  placeholder="CTS, carpal tunnel, median nerve compression"
                  className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                />
              </label>

              <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                Question Image URL
                <input
                  value={imageUrl}
                  onChange={e => setImageUrl(e.target.value)}
                  placeholder="Paste a hosted x-ray or image URL"
                  className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                />
              </label>

              <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                Upload X-ray / Image
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (file) uploadImage(file)
                  }}
                  className="rounded-lg border border-[#ded7ca] bg-white px-3 py-2.5 text-sm text-[#102018]"
                />
                <span className="text-xs font-normal text-[#8a948d]">
                  Upload an x-ray, MRI, clinical photo, or other question image. You can choose
                  when it appears as a clue.
                </span>
              </label>

              <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                Image Reveal
                <select
                  value={imageRevealClue}
                  onChange={e => setImageRevealClue(e.target.value)}
                  className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                >
                  <option value="none">Show immediately</option>
                  <option value="1">Reveal with Clue 1</option>
                  <option value="2">Reveal with Clue 2</option>
                  <option value="3">Reveal with Clue 3</option>
                  <option value="4">Reveal with Clue 4</option>
                </select>
              </label>

              <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                Image Credit
                <input
                  value={imageCredit}
                  onChange={e => setImageCredit(e.target.value)}
                  placeholder="Optional small credit shown under the image"
                  className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                />
              </label>

              {imageUrl && (
                <div className="rounded-lg border border-[#ded7ca] p-2.5">
                  <img
                    src={imageUrl}
                    alt="Uploaded case"
                    className="max-h-48 rounded-lg object-contain"
                  />
                  <p className="mt-2 break-all text-xs text-[#637268]">
                    {imageUrl}
                  </p>
                  {imageCredit && (
                    <p className="mt-1 text-[11px] text-[#8a948d]">{imageCredit}</p>
                  )}
                  <button
                    onClick={() => setImageUrl('')}
                    className="mt-2 rounded-lg border border-[#ded7ca] px-3 py-1.5 text-sm font-semibold text-[#102018] transition hover:bg-white"
                  >
                    Remove image
                  </button>
                </div>
              )}

              <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                Clue 1
                <input
                  value={clue1}
                  onChange={e => setClue1(e.target.value)}
                  className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                />
              </label>

              <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                Clue 2
                <input
                  value={clue2}
                  onChange={e => setClue2(e.target.value)}
                  className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                />
              </label>

              <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                Clue 3
                <input
                  value={clue3}
                  onChange={e => setClue3(e.target.value)}
                  className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                />
              </label>

              <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                Clue 4
                <input
                  value={clue4}
                  onChange={e => setClue4(e.target.value)}
                  className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                />
              </label>

              <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                Teaching Point
                <textarea
                  value={teachingPoint}
                  onChange={e => setTeachingPoint(e.target.value)}
                  placeholder={`Who: Obese adolescents (10-16), often bilateral
Presentation: Limp + hip/groin/knee pain
Exam: ↓ internal rotation, obligate external rotation
Imaging: AP + frog-leg lateral; Klein's line abnormal
Stable vs Unstable: weight-bearing vs not -> unstable = high AVN risk
Tx: Non-weight bearing + in situ screw fixation (no reduction)
Pearl: Knee pain in teens -> always check the hip`}
                  rows={4}
                  className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                />
                <span className="text-xs font-normal text-[#8a948d]">
                  Line breaks are preserved. Use `**bold**` and `*italics*` for emphasis.
                </span>
              </label>

              <button
                onClick={saveCase}
                className="rounded-lg bg-[#1f6448] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#174c37]"
              >
                Save / Update Case
              </button>

              {status && <p className="text-sm text-[#637268]">{status}</p>}
            </div>
            )}
          </section>

          <aside className="space-y-4">
            <section className="card rounded-2xl border border-[#e7e1d6] bg-white p-4 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-serif text-xl font-bold">Submissions</h2>
                <button
                  type="button"
                  onClick={() => setShowSubmissions(prev => !prev)}
                  className="rounded-lg border border-[#ded7ca] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#637268] transition hover:bg-white"
                >
                  {showSubmissions ? 'Hide' : 'Show'}
                </button>
              </div>

              {showSubmissions && (
                <div className="mt-4 space-y-2">
                  {submissions.length === 0 ? (
                    <p className="text-sm text-[#637268]">No submissions yet.</p>
                  ) : (
                    submissions.map(item => (
                      <div
                        key={item.id}
                        className="rounded-lg border border-[#ded7ca] bg-white px-3 py-2.5"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#637268]">
                              {item.status} · {formatLevel(item.level)}
                            </div>
                            <div className="mt-1 font-semibold text-[#102018]">
                              {item.answer}
                            </div>
                            <div className="text-sm text-[#637268]">
                              {item.category || 'Uncategorized'}
                            </div>
                            <div className="mt-1 text-xs text-[#8a948d]">
                              By {item.contributor_name || 'Anonymous'} · {item.created_at.slice(0, 10)}
                            </div>
                            {item.scheduled_date && (
                              <div className="mt-1 text-xs text-[#315f4d]">
                                Scheduled for {item.scheduled_date}
                              </div>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => editSubmission(item)}
                            className="rounded-lg border border-[#ded7ca] px-3 py-1.5 text-sm font-semibold text-[#102018] transition hover:bg-white"
                          >
                            Review
                          </button>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => updateSubmissionStatus(item.id, 'accepted')}
                            className="rounded-lg border border-[#cfded4] bg-[#e8f3ed] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[#1f6448] transition hover:bg-[#dff0e7]"
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            onClick={() => updateSubmissionStatus(item.id, 'needs_edits')}
                            className="rounded-lg border border-[#ead9b7] bg-[#fffaf1] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[#a06a2c] transition hover:bg-[#fff5e4]"
                          >
                            Needs edits
                          </button>
                          <button
                            type="button"
                            onClick={() => updateSubmissionStatus(item.id, 'rejected')}
                            className="rounded-lg border border-[#f0d7c8] bg-[#fff1e8] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[#a24d24] transition hover:bg-[#ffe8da]"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </section>

            <section className="card rounded-2xl border border-[#e7e1d6] bg-white p-4 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-serif text-xl font-bold">Analytics</h2>
                <button
                  type="button"
                  onClick={() => setShowAnalytics(prev => !prev)}
                  className="rounded-lg border border-[#ded7ca] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#637268] transition hover:bg-white"
                >
                  {showAnalytics ? 'Hide' : 'Show'}
                </button>
              </div>

              {showAnalytics && (
              <div className="mt-4 space-y-4">
                {analyticsSummary ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg border border-[#ded7ca] bg-white px-3 py-2.5">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#637268]">
                          Total users
                        </div>
                        <div className="mt-1 font-serif text-xl font-bold text-[#102018]">
                          {analyticsSummary.totalUsers}
                        </div>
                      </div>

                      <div className="rounded-lg border border-[#ded7ca] bg-white px-3 py-2.5">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#637268]">
                          Total guesses
                        </div>
                        <div className="mt-1 font-serif text-xl font-bold text-[#102018]">
                          {analyticsSummary.totalGuesses}
                        </div>
                      </div>

                      <div className="rounded-lg border border-[#ded7ca] bg-white px-3 py-2.5">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#637268]">
                          Guess accuracy
                        </div>
                        <div className="mt-1 font-serif text-xl font-bold text-[#102018]">
                          {formatPercent(analyticsSummary.guessAccuracy)}
                        </div>
                      </div>

                      <div className="rounded-lg border border-[#ded7ca] bg-white px-3 py-2.5">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#637268]">
                          Avg guesses / user
                        </div>
                        <div className="mt-1 font-serif text-xl font-bold text-[#102018]">
                          {analyticsSummary.averageGuessesPerUser.toFixed(1)}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border border-[#ded7ca] bg-[#fbfaf7] p-3">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#637268]">
                        Today
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-3 text-center">
                        <div>
                          <div className="font-serif text-xl font-bold text-[#102018]">
                            {analyticsSummary.todayUsers}
                          </div>
                          <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-[#637268]">
                            Users
                          </div>
                        </div>
                        <div>
                          <div className="font-serif text-xl font-bold text-[#102018]">
                            {analyticsSummary.todayGuesses}
                          </div>
                          <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-[#637268]">
                            Guesses
                          </div>
                        </div>
                        <div>
                          <div className="font-serif text-xl font-bold text-[#102018]">
                            {analyticsSummary.todayCorrectGuesses}
                          </div>
                          <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-[#637268]">
                            Correct
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#637268]">
                        By difficulty
                      </div>
                      <div className="mt-3 space-y-2">
                        {levelAnalytics.map(row => (
                          <div
                            key={row.level}
                            className="rounded-lg border border-[#ded7ca] bg-white px-3 py-2.5"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="font-semibold text-[#102018]">
                                {formatLevel(row.level)}
                              </div>
                              <div className="text-sm text-[#637268]">
                                {row.users} users
                              </div>
                            </div>
                            <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-[#637268]">
                              <div>Guesses: {row.guesses}</div>
                              <div>
                                Accuracy:{' '}
                                {formatPercent(
                                  row.guesses > 0
                                    ? (row.correctGuesses / row.guesses) * 100
                                    : 0
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#637268]">
                        Top cases
                      </div>
                      <div className="mt-3 space-y-2">
                        {casePerformance.length === 0 ? (
                          <p className="text-sm text-[#637268]">No case performance data yet.</p>
                        ) : (
                          casePerformance.map(item => (
                            <div
                              key={item.caseId}
                              className="rounded-lg border border-[#ded7ca] bg-white px-3 py-2.5"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#637268]">
                                    {item.caseDate} · {formatLevel(item.level)}
                                  </div>
                                  <div className="mt-1 font-semibold text-[#102018]">
                                    {item.answer}
                                  </div>
                                  <div className="text-sm text-[#637268]">{item.category}</div>
                                </div>
                                <div className="text-right text-sm text-[#637268]">
                                  <div>{item.players} players</div>
                                  <div>{item.guesses} guesses</div>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#637268]">
                        Daily activity
                      </div>
                      <div className="mt-3 space-y-2">
                        {analytics.length === 0 ? (
                          <p className="text-sm text-[#637268]">No analytics yet.</p>
                        ) : (
                          analytics.map(row => (
                            <div
                              key={row.date}
                              className="rounded-lg border border-[#ded7ca] bg-white/70 p-3"
                            >
                              <div className="font-semibold text-[#102018]">
                                {row.date}
                              </div>
                              <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-[#637268]">
                                <div>Visits: {row.visits}</div>
                                <div>Users: {row.unique_sessions}</div>
                                <div>Guesses: {row.guesses}</div>
                                <div>Correct: {row.correct_guesses}</div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-[#637268]">No analytics yet.</p>
                )}
              </div>
              )}
            </section>

            <section className="card rounded-2xl border border-[#e7e1d6] bg-white p-4 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-serif text-xl font-bold">Cases by Date</h2>
                <button
                  type="button"
                  onClick={() => setShowCasesByDate(prev => !prev)}
                  className="rounded-lg border border-[#ded7ca] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#637268] transition hover:bg-white"
                >
                  {showCasesByDate ? 'Hide' : 'Show'}
                </button>
              </div>

              {showCasesByDate && (
              <div className="mt-4 space-y-3">
                {groupedCases.length === 0 ? (
                  <p className="text-sm text-[#637268]">No cases yet.</p>
                ) : (
                  groupedCases.map(group => (
                    <div key={group.date} className="rounded-lg border border-[#ded7ca] bg-white/70 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-semibold text-[#102018]">{group.date}</div>
                        <div className="text-xs uppercase tracking-[0.2em] text-[#637268]">
                          {group.items.length}/3 ready
                        </div>
                      </div>

                      <div className="mt-3 space-y-2">
                        {levelOrder.map(levelValue => {
                          const item = group.items.find(entry => entry.level === levelValue)

                          if (!item) {
                            return (
                              <div
                                key={`${group.date}-${levelValue}`}
                                className="rounded-lg border border-dashed border-[#ded7ca] bg-[#fbfaf7] px-3 py-2.5"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#637268]">
                                      {formatLevel(levelValue)}
                                    </div>
                                    <div className="mt-1 text-sm text-[#8a948d]">
                                      No case scheduled yet.
                                    </div>
                                  </div>

                                  <button
                                    onClick={() => startCaseFor(group.date, levelValue)}
                                    className="rounded-lg border border-[#ded7ca] px-3 py-1.5 text-sm font-semibold text-[#102018] transition hover:bg-white"
                                  >
                                    Add
                                  </button>
                                </div>
                              </div>
                            )
                          }

                          return (
                            <div
                              key={item.id}
                              className="rounded-lg border border-[#ded7ca] bg-white px-3 py-2.5"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#637268]">
                                    {formatLevel(item.level)}
                                  </div>
                                  <div className="mt-1 font-semibold text-[#102018]">
                                    {item.answer}
                                  </div>
                                  <div className="text-sm text-[#637268]">{item.category}</div>
                                  {item.image_url && (
                                    <div className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#1f6448]">
                                      Includes image
                                    </div>
                                  )}
                                </div>

                                <button
                                  onClick={() => editCase(item)}
                                  className="rounded-lg border border-[#ded7ca] px-3 py-1.5 text-sm font-semibold text-[#102018] transition hover:bg-white"
                                >
                                  Edit
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
              )}
            </section>
          </aside>
        </div>
      </div>
    </main>
  )
}
