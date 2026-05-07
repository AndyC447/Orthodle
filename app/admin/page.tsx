'use client'

import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { Header } from '@/components/Header'
import { supabase } from '@/lib/supabase'
import {
  normalizeAnswer,
  ORTHO_DIAGNOSIS_BANK,
  setTrackingDisabledForThisBrowser,
  todayISO,
} from '@/lib/utils'

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
  image_url_2: string | null
  image_credit_2: string | null
  image_reveal_clue_2: number | null
  clue_1: string | null
  clue_2: string | null
  clue_3: string | null
  clue_4: string | null
  clue_5: string | null
  clue_6: string | null
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
  image_url_2: string | null
  image_credit_2: string | null
  image_reveal_clue_2: number | null
  clue_1: string | null
  clue_2: string | null
  clue_3: string | null
  clue_4: string | null
  clue_5: string | null
  clue_6: string | null
  teaching_point: string | null
  created_at: string
}

type AnalyticsRow = {
  date: string
  visits: number
  guesses: number
  correct_guesses: number
  unique_sessions: number
  new_sessions: number
  returning_sessions: number
}

type VisitAnalyticsRow = {
  session_id: string
  created_at: string
  browser_timezone: string | null
  browser_locale: string | null
  browser_theme: 'light' | 'dark' | null
  geo_country: string | null
  geo_region: string | null
  geo_city: string | null
  geo_timezone: string | null
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
  totalUniqueUsers: number
  cumulativeDailyUsers: number
  totalGuesses: number
  archivePlays: number
  totalCorrectGuesses: number
  guessAccuracy: number
  averageGuessesPerUser: number
  darkModeUsers: number
  themeTrackedUsers: number
  darkModeRate: number
  todayUsers: number
  todayNewUsers: number
  todayReturningUsers: number
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

type AudienceSummary = {
  topRegions: Array<{ label: string; count: number }>
  topTimezones: Array<{ label: string; count: number }>
}

type DiagnosisChoiceLite = {
  label: string
}

type CaseCommunityStats = {
  players: number
  totalGuesses: number
  totalCorrectGuesses: number
  solveRate: number | null
  averageGuessesPerPlayer: number | null
  averageGuessesToSolve: number | null
  firstTrySolveRate: number | null
  mostCommonSolveClue: number | null
  mostCommonIncorrectGuesses: Array<{ label: string; count: number }>
}

type HomepageAnnouncementRow = {
  id: string
  message: string
  start_date: string
  end_date: string | null
  created_at: string
}

type HomepageSurveyRow = {
  id: string
  question: string
  option_1: string
  option_2: string
  option_3: string
  start_date: string
  end_date: string | null
  created_at: string
  response_counts?: Record<string, number>
}

type AdminSidebarSectionId =
  | 'button_subtitles'
  | 'analytics'
  | 'homepage_notes'
  | 'surveys'
  | 'submissions'
  | 'answer_choices'
  | 'feedback'
  | 'groups'
  | 'cases_by_date'

type AdminCollapsedSectionId =
  | 'analytics_today'
  | 'analytics_top_regions'
  | 'analytics_top_timezones'
  | 'case_stats_incorrect_guesses'
  | 'cases_jump_to_date'
  | 'homepage_notes'
  | 'surveys'
  | 'cases_by_date'

const today = todayISO()
const levelOrder: Level[] = ['med_student', 'resident', 'attending']
const ADMIN_SIDEBAR_ORDER_STORAGE_KEY = 'orthodle_admin_sidebar_order_v1'
const ADMIN_COLLAPSED_SECTIONS_STORAGE_KEY = 'orthodle_admin_collapsed_sections_v1'
const DEFAULT_ADMIN_SIDEBAR_ORDER: AdminSidebarSectionId[] = [
  'button_subtitles',
  'analytics',
  'homepage_notes',
  'surveys',
  'submissions',
  'answer_choices',
  'feedback',
  'groups',
  'cases_by_date',
]

function shiftISODate(dateText: string, days: number) {
  const baseDate = new Date(`${dateText}T12:00:00`)
  baseDate.setDate(baseDate.getDate() + days)
  return baseDate.toISOString().slice(0, 10)
}

function timestampToLocalISO(timestamp: string) {
  const date = new Date(timestamp)
  const timezoneOffsetMs = date.getTimezoneOffset() * 60 * 1000
  return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 10)
}

const ANALYTICS_PAGE_SIZE = 1000

export default function AdminPage() {
  const teachingPointRef = useRef<HTMLTextAreaElement | null>(null)
  const [previewMode, setPreviewMode] = useState<'mobile' | 'desktop'>('mobile')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [authReady, setAuthReady] = useState(false)
  const [caseDate, setCaseDate] = useState(shiftISODate(today, 1))
  const [level, setLevel] = useState<Level>('med_student')
  const [contributorName, setContributorName] = useState('')
  const [category, setCategory] = useState('')
  const [prompt, setPrompt] = useState('')
  const [answer, setAnswer] = useState('')
  const [synonyms, setSynonyms] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [imageCredit, setImageCredit] = useState('')
  const [imageRevealClue, setImageRevealClue] = useState('none')
  const [imageUrl2, setImageUrl2] = useState('')
  const [imageCredit2, setImageCredit2] = useState('')
  const [imageRevealClue2, setImageRevealClue2] = useState('none')
  const [clue1, setClue1] = useState('')
  const [clue2, setClue2] = useState('')
  const [clue3, setClue3] = useState('')
  const [clue4, setClue4] = useState('')
  const [clue5, setClue5] = useState('')
  const [clue6, setClue6] = useState('')
  const [teachingPoint, setTeachingPoint] = useState('')
  const [status, setStatus] = useState('')
  const [cases, setCases] = useState<CaseRow[]>([])
  const [analytics, setAnalytics] = useState<AnalyticsRow[]>([])
  const [analyticsSummary, setAnalyticsSummary] = useState<AnalyticsSummary | null>(null)
  const [levelAnalytics, setLevelAnalytics] = useState<LevelAnalytics[]>([])
  const [casePerformance, setCasePerformance] = useState<CasePerformance[]>([])
  const [audienceSummary, setAudienceSummary] = useState<AudienceSummary>({
    topRegions: [],
    topTimezones: [],
  })
  const [diagnosisChoices, setDiagnosisChoices] = useState<DiagnosisChoiceLite[]>([])
  const [caseCommunityStats, setCaseCommunityStats] = useState<CaseCommunityStats | null>(null)
  const [submissionSummary, setSubmissionSummary] = useState({
    total: 0,
    hasNew: false,
    latestCreatedAt: null as string | null,
  })
  const [feedbackSummary, setFeedbackSummary] = useState({
    total: 0,
    hasNew: false,
    latestCreatedAt: null as string | null,
  })
  const [homepageAnnouncements, setHomepageAnnouncements] = useState<HomepageAnnouncementRow[]>([])
  const [announcementMessage, setAnnouncementMessage] = useState('')
  const [announcementStartDate, setAnnouncementStartDate] = useState(shiftISODate(today, 1))
  const [announcementEndDate, setAnnouncementEndDate] = useState(shiftISODate(today, 1))
  const [editingAnnouncementId, setEditingAnnouncementId] = useState<string | null>(null)
  const [homepageSurveys, setHomepageSurveys] = useState<HomepageSurveyRow[]>([])
  const [surveyQuestion, setSurveyQuestion] = useState('To tailor my questions most effectively, what level of training are you?')
  const [surveyOption1, setSurveyOption1] = useState('Med Student')
  const [surveyOption2, setSurveyOption2] = useState('Resident')
  const [surveyOption3, setSurveyOption3] = useState('Attending')
  const [surveyStartDate, setSurveyStartDate] = useState(shiftISODate(today, 1))
  const [surveyEndDate, setSurveyEndDate] = useState(shiftISODate(today, 1))
  const [editingSurveyId, setEditingSurveyId] = useState<string | null>(null)
  const [activeSubmissionId, setActiveSubmissionId] = useState<string | null>(null)
  const [showComposer, setShowComposer] = useState(true)
  const [showAnalytics, setShowAnalytics] = useState(true)
  const [showCasesByDate, setShowCasesByDate] = useState(true)
  const [browseDate, setBrowseDate] = useState('')
  const [sidebarSectionOrder, setSidebarSectionOrder] = useState<AdminSidebarSectionId[]>(
    DEFAULT_ADMIN_SIDEBAR_ORDER
  )
  const [draggedSidebarSection, setDraggedSidebarSection] = useState<AdminSidebarSectionId | null>(null)
  const [sidebarDropTarget, setSidebarDropTarget] = useState<AdminSidebarSectionId | null>(null)
  const [collapsedSections, setCollapsedSections] = useState<Record<AdminCollapsedSectionId, boolean>>({
    analytics_today: false,
    analytics_top_regions: false,
    analytics_top_timezones: false,
    case_stats_incorrect_guesses: true,
    cases_jump_to_date: false,
    homepage_notes: false,
    surveys: false,
    cases_by_date: false,
  })

  useEffect(() => {
    const savedUnlock = window.sessionStorage.getItem('orthodle_admin_unlocked')
    setIsUnlocked(savedUnlock === 'true')
    setAuthReady(true)
  }, [])

  useEffect(() => {
    const savedOrder = window.localStorage.getItem(ADMIN_SIDEBAR_ORDER_STORAGE_KEY)
    if (!savedOrder) return

    try {
      const parsed = JSON.parse(savedOrder) as AdminSidebarSectionId[]
      const filtered = parsed.filter(sectionId =>
        DEFAULT_ADMIN_SIDEBAR_ORDER.includes(sectionId)
      )

      if (filtered.length === DEFAULT_ADMIN_SIDEBAR_ORDER.length) {
        setSidebarSectionOrder(filtered)
      }
    } catch {
      // Ignore malformed saved orders and fall back to the default layout.
    }
  }, [])

  useEffect(() => {
    const savedCollapsed = window.localStorage.getItem(ADMIN_COLLAPSED_SECTIONS_STORAGE_KEY)
    if (!savedCollapsed) return

    try {
      const parsed = JSON.parse(savedCollapsed) as Partial<Record<AdminCollapsedSectionId, boolean>>
      setCollapsedSections(prev => ({ ...prev, ...parsed }))
    } catch {
      // Ignore malformed saved collapse data and keep defaults.
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem(
      ADMIN_SIDEBAR_ORDER_STORAGE_KEY,
      JSON.stringify(sidebarSectionOrder)
    )
  }, [sidebarSectionOrder])

  useEffect(() => {
    window.localStorage.setItem(
      ADMIN_COLLAPSED_SECTIONS_STORAGE_KEY,
      JSON.stringify(collapsedSections)
    )
  }, [collapsedSections])

  useEffect(() => {
    if (!isUnlocked) return

    setTrackingDisabledForThisBrowser(true)
    loadCases()
    loadAnalytics()
    loadDiagnosisChoices()
    loadSubmissionSummary()
    loadFeedbackSummary()
    loadHomepageAnnouncements()
    loadHomepageSurveys()
  }, [isUnlocked])

  function moveSidebarSection(
    order: AdminSidebarSectionId[],
    draggedId: AdminSidebarSectionId,
    targetId: AdminSidebarSectionId
  ) {
    if (draggedId === targetId) return order

    const nextOrder = [...order]
    const draggedIndex = nextOrder.indexOf(draggedId)
    const targetIndex = nextOrder.indexOf(targetId)

    if (draggedIndex === -1 || targetIndex === -1) return order

    nextOrder.splice(draggedIndex, 1)
    nextOrder.splice(targetIndex, 0, draggedId)
    return nextOrder
  }

  function handleSidebarDragStart(sectionId: AdminSidebarSectionId) {
    setDraggedSidebarSection(sectionId)
    setSidebarDropTarget(sectionId)
  }

  function handleSidebarDragOver(
    event: DragEvent<HTMLDivElement>,
    sectionId: AdminSidebarSectionId
  ) {
    event.preventDefault()
    if (!draggedSidebarSection || draggedSidebarSection === sectionId) return
    setSidebarDropTarget(sectionId)
  }

  function handleSidebarDrop(sectionId: AdminSidebarSectionId) {
    if (!draggedSidebarSection) return

    setSidebarSectionOrder(prev =>
      moveSidebarSection(prev, draggedSidebarSection, sectionId)
    )
    setDraggedSidebarSection(null)
    setSidebarDropTarget(null)
  }

  function handleSidebarDragEnd() {
    setDraggedSidebarSection(null)
    setSidebarDropTarget(null)
  }

  function toggleCollapsedSection(sectionId: AdminCollapsedSectionId) {
    setCollapsedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }))
  }

  function autoGrowTextarea(event: React.FormEvent<HTMLTextAreaElement>) {
    const element = event.currentTarget
    element.style.height = '0px'
    element.style.height = `${element.scrollHeight}px`
  }

  useEffect(() => {
    if (!isUnlocked) return
    void loadCaseCommunityStats()
  }, [isUnlocked, caseDate, level, cases])

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

  const visibleCaseGroups = useMemo(() => {
    if (!browseDate) return groupedCases
    return groupedCases.filter(group => group.date === browseDate)
  }, [browseDate, groupedCases])

  const quickBrowseDates = useMemo(() => {
    const baseDates = groupedCases.slice(0, 8).map(group => group.date)
    if (browseDate && !baseDates.includes(browseDate)) {
      return [browseDate, ...baseDates].slice(0, 8)
    }
    return baseDates
  }, [browseDate, groupedCases])
  const tomorrow = shiftISODate(today, 1)

  const todaysCases = useMemo(
    () => groupedCases.find(group => group.date === today)?.items || [],
    [groupedCases]
  )

  const tomorrowsCases = useMemo(
    () => groupedCases.find(group => group.date === tomorrow)?.items || [],
    [groupedCases, tomorrow]
  )

  const browsedCases = useMemo(
    () => groupedCases.find(group => group.date === browseDate)?.items || [],
    [browseDate, groupedCases]
  )

  const previewClues = useMemo(
    () => [clue1, clue2, clue3, clue4, clue5, clue6].map(item => item.trim()).filter(Boolean),
    [clue1, clue2, clue3, clue4, clue5, clue6]
  )

  const composerGuardrails = useMemo(() => {
    const issues: string[] = []
    const answerPool = new Set<string>()

    for (const label of ORTHO_DIAGNOSIS_BANK) {
      answerPool.add(normalizeAnswer(label))
    }

    for (const item of diagnosisChoices) {
      if (item.label?.trim()) {
        answerPool.add(normalizeAnswer(item.label))
      }
    }

    for (const item of cases) {
      if (item.answer?.trim()) {
        answerPool.add(normalizeAnswer(item.answer))
      }
    }

    if (answer.trim() && !answerPool.has(normalizeAnswer(answer))) {
      issues.push('This answer is not in the master answer list yet.')
    }

    if (previewClues.length === 0) {
      issues.push('No clues are filled in yet.')
    }

    if (!imageUrl && imageRevealClue !== 'none') {
      issues.push('Image reveal is set, but no image is attached.')
    }

    if (imageUrl && imageRevealClue !== 'none') {
      const revealIndex = Number(imageRevealClue)
      const clueAtReveal = [clue1, clue2, clue3, clue4, clue5, clue6][revealIndex - 1]

      if (!clueAtReveal?.trim()) {
        issues.push(`Image reveal is tied to Clue ${revealIndex}, but that clue is empty.`)
      }
    }

    if (!imageUrl2 && imageRevealClue2 !== 'none') {
      issues.push('Second image reveal is set, but no second image is attached.')
    }

    if (imageUrl2 && imageRevealClue2 !== 'none') {
      const revealIndex = Number(imageRevealClue2)
      const clueAtReveal = [clue1, clue2, clue3, clue4, clue5, clue6][revealIndex - 1]

      if (!clueAtReveal?.trim()) {
        issues.push(`Second image reveal is tied to Clue ${revealIndex}, but that clue is empty.`)
      }
    }

    if (caseDate === today) {
      issues.push('This case is set to publish today, not tomorrow.')
    }

    return issues
  }, [
    answer,
    caseDate,
    cases,
    clue1,
    clue2,
    clue3,
    clue4,
    clue5,
    clue6,
    diagnosisChoices,
    imageRevealClue,
    imageRevealClue2,
    imageUrl,
    imageUrl2,
    previewClues.length,
  ])

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

  function formatShortDate(dateText: string) {
    return new Date(`${dateText}T12:00:00`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
  }

  function renderFormattedPreviewLine(line: string) {
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

  function formatPreviewTeachingPoint(text: string) {
    return text
      .split(/\n+/)
      .map(line => line.trim())
      .filter(Boolean)
  }

  function wrapTeachingPointSelection(marker: '**' | '*') {
    const textarea = teachingPointRef.current
    if (!textarea) return

    const selectionStart = textarea.selectionStart
    const selectionEnd = textarea.selectionEnd
    const selectedText = teachingPoint.slice(selectionStart, selectionEnd)
    const wrapped = `${marker}${selectedText || 'text'}${marker}`
    const nextValue =
      teachingPoint.slice(0, selectionStart) +
      wrapped +
      teachingPoint.slice(selectionEnd)

    setTeachingPoint(nextValue)

    requestAnimationFrame(() => {
      textarea.focus()
      const start = selectionStart + marker.length
      const end = start + (selectedText || 'text').length
      textarea.setSelectionRange(start, end)
    })
  }

  function handleTeachingPointKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!(event.metaKey || event.ctrlKey)) return

    const key = event.key.toLowerCase()
    if (key === 'b') {
      event.preventDefault()
      wrapTeachingPointSelection('**')
    }

    if (key === 'i') {
      event.preventDefault()
      wrapTeachingPointSelection('*')
    }
  }

  function nextMissingLevelForDate(dateText: string): Level | null {
    const items = groupedCases.find(group => group.date === dateText)?.items || []
    return levelOrder.find(levelValue => !items.some(item => item.level === levelValue)) || null
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
    window.sessionStorage.setItem('orthodle_admin_password', trimmedPassword)
    setIsUnlocked(true)
    setPassword('')
  }

  function lockAdmin() {
    window.sessionStorage.removeItem('orthodle_admin_unlocked')
    window.sessionStorage.removeItem('orthodle_admin_password')
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
    setImageUrl2('')
    setImageCredit2('')
    setImageRevealClue2('none')
    setClue1('')
    setClue2('')
    setClue3('')
    setClue4('')
    setClue5('')
    setClue6('')
    setTeachingPoint('')
    setStatus(`Creating ${formatLevel(nextLevel)} case for ${date}`)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function clearForm() {
    setCaseDate(shiftISODate(today, 1))
    setLevel('med_student')
    setContributorName('')
    setCategory('')
    setPrompt('')
    setAnswer('')
    setSynonyms('')
    setImageUrl('')
    setImageCredit('')
    setImageRevealClue('none')
    setImageUrl2('')
    setImageCredit2('')
    setImageRevealClue2('none')
    setClue1('')
    setClue2('')
    setClue3('')
    setClue4('')
    setClue5('')
    setClue6('')
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
      c.image_reveal_clue && c.image_reveal_clue >= 1 && c.image_reveal_clue <= 6
        ? String(c.image_reveal_clue)
        : 'none'
    )
    setImageUrl2(c.image_url_2 || '')
    setImageCredit2(c.image_credit_2 || '')
    setImageRevealClue2(
      c.image_reveal_clue_2 && c.image_reveal_clue_2 >= 1 && c.image_reveal_clue_2 <= 6
        ? String(c.image_reveal_clue_2)
        : 'none'
    )
    setClue1(c.clue_1 || '')
    setClue2(c.clue_2 || '')
    setClue3(c.clue_3 || '')
    setClue4(c.clue_4 || '')
    setClue5(c.clue_5 || '')
    setClue6(c.clue_6 || '')
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
      submission.image_reveal_clue && submission.image_reveal_clue >= 1 && submission.image_reveal_clue <= 6
        ? String(submission.image_reveal_clue)
        : 'none'
    )
    setImageUrl2(submission.image_url_2 || '')
    setImageCredit2(submission.image_credit_2 || '')
    setImageRevealClue2(
      submission.image_reveal_clue_2 && submission.image_reveal_clue_2 >= 1 && submission.image_reveal_clue_2 <= 6
        ? String(submission.image_reveal_clue_2)
        : 'none'
    )
    setClue1(submission.clue_1 || '')
    setClue2(submission.clue_2 || '')
    setClue3(submission.clue_3 || '')
    setClue4(submission.clue_4 || '')
    setClue5(submission.clue_5 || '')
    setClue6(submission.clue_6 || '')
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
      .limit(200)

    if (error) {
      setStatus(`Failed to load cases: ${error.message}`)
      return
    }

    setCases(data || [])
  }

  async function deleteCase(caseToDelete: Pick<CaseRow, 'id' | 'case_date' | 'level' | 'answer'>) {
    const confirmed = window.confirm(
      `Delete the ${formatLevel(caseToDelete.level)} case for ${caseToDelete.case_date}?\n\n${caseToDelete.answer}\n\nThis cannot be undone.`
    )

    if (!confirmed) return

    const adminPassword = window.sessionStorage.getItem('orthodle_admin_password') || ''
    const response = await fetch('/api/admin-delete-case', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        password: adminPassword,
        caseId: caseToDelete.id,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      const nextMessage = `Could not delete case: ${data.error || 'Unknown error'}`
      setStatus(nextMessage)
      window.alert(nextMessage)
      return
    }

    if (caseDate === caseToDelete.case_date && level === caseToDelete.level) {
      clearForm()
    }

    setStatus(`Deleted ${formatLevel(caseToDelete.level)} case for ${caseToDelete.case_date}.`)
    await loadCases()
  }

  async function loadAnalytics() {
    const visitPages: VisitAnalyticsRow[] = []
    let visitOffset = 0

    while (true) {
      const { data, error } = await supabase
        .from('visits')
        .select('session_id, created_at, browser_timezone, browser_locale, browser_theme, geo_country, geo_region, geo_city, geo_timezone')
        .range(visitOffset, visitOffset + ANALYTICS_PAGE_SIZE - 1)

      if (error) {
        setStatus(`Failed to load visits: ${error.message}`)
        return
      }

      if (!data || data.length === 0) break

      visitPages.push(...(data as VisitAnalyticsRow[]))

      if (data.length < ANALYTICS_PAGE_SIZE) break
      visitOffset += ANALYTICS_PAGE_SIZE
    }

    const guessPages: GuessAnalyticsRow[] = []
    let guessOffset = 0

    while (true) {
      const { data, error } = await supabase
        .from('guesses')
        .select('session_id, is_correct, created_at, case_id, cases(level, case_date, answer, category)')
        .range(guessOffset, guessOffset + ANALYTICS_PAGE_SIZE - 1)

      if (error) {
        setStatus(`Failed to load guesses: ${error.message}`)
        return
      }

      if (!data || data.length === 0) break

      guessPages.push(...(data as unknown as GuessAnalyticsRow[]))

      if (data.length < ANALYTICS_PAGE_SIZE) break
      guessOffset += ANALYTICS_PAGE_SIZE
    }

    const visits = visitPages
    const guesses = guessPages

    const byDate: Record<string, AnalyticsRow> = {}
    const sessionsByDate: Record<string, Set<string>> = {}

    for (const visit of visits) {
      const date = timestampToLocalISO(visit.created_at)

      if (!byDate[date]) {
        byDate[date] = {
          date,
          visits: 0,
          guesses: 0,
          correct_guesses: 0,
          unique_sessions: 0,
          new_sessions: 0,
          returning_sessions: 0,
        }
      }

      byDate[date].visits += 1

      if (!sessionsByDate[date]) sessionsByDate[date] = new Set()
      sessionsByDate[date].add(visit.session_id)
    }

    for (const guess of guesses) {
      const date = timestampToLocalISO(guess.created_at)

      if (!byDate[date]) {
        byDate[date] = {
          date,
          visits: 0,
          guesses: 0,
          correct_guesses: 0,
          unique_sessions: 0,
          new_sessions: 0,
          returning_sessions: 0,
        }
      }

      byDate[date].guesses += 1
      if (guess.is_correct) byDate[date].correct_guesses += 1

      if (!sessionsByDate[date]) sessionsByDate[date] = new Set()
      sessionsByDate[date].add(guess.session_id)
    }

    for (const date of Object.keys(byDate)) {
      byDate[date].unique_sessions = sessionsByDate[date]?.size || 0
    }

    const firstSeenBySession = new Map<string, string>()
    for (const [date, sessions] of Object.entries(sessionsByDate).sort((a, b) =>
      a[0].localeCompare(b[0])
    )) {
      for (const sessionId of sessions) {
        if (!firstSeenBySession.has(sessionId)) {
          firstSeenBySession.set(sessionId, date)
        }
      }
    }

    for (const [date, sessions] of Object.entries(sessionsByDate)) {
      let newSessions = 0
      let returningSessions = 0

      for (const sessionId of sessions) {
        if (firstSeenBySession.get(sessionId) === date) {
          newSessions += 1
        } else {
          returningSessions += 1
        }
      }

      if (byDate[date]) {
        byDate[date].new_sessions = newSessions
        byDate[date].returning_sessions = returningSessions
      }
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
    const regionCounts = new Map<string, number>()
    const timezoneCounts = new Map<string, number>()
    const sessionGeoSeen = new Set<string>()
    const latestThemeBySession = new Map<string, { theme: 'light' | 'dark'; createdAt: string }>()

    for (const visit of visits) {
      allSessions.add(visit.session_id)
      if (!sessionGeoSeen.has(visit.session_id)) {
        sessionGeoSeen.add(visit.session_id)
        const regionLabel =
          visit.geo_region && visit.geo_country
            ? `${visit.geo_region}, ${visit.geo_country}`
            : visit.geo_country || visit.browser_locale || null
        const timezoneLabel = visit.geo_timezone || visit.browser_timezone || null

        if (regionLabel) {
          regionCounts.set(regionLabel, (regionCounts.get(regionLabel) || 0) + 1)
        }

        if (timezoneLabel) {
          timezoneCounts.set(timezoneLabel, (timezoneCounts.get(timezoneLabel) || 0) + 1)
        }
      }

      if (visit.browser_theme === 'light' || visit.browser_theme === 'dark') {
        const existingTheme = latestThemeBySession.get(visit.session_id)
        if (!existingTheme || existingTheme.createdAt < visit.created_at) {
          latestThemeBySession.set(visit.session_id, {
            theme: visit.browser_theme,
            createdAt: visit.created_at,
          })
        }
      }
    }

    for (const guess of guesses) {
      allSessions.add(guess.session_id)
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

    const totalVisits = visits.length
    const totalUniqueUsers = allSessions.size
    const themeTrackedUsers = latestThemeBySession.size
    const darkModeUsers = [...latestThemeBySession.values()].filter(item => item.theme === 'dark').length
    const darkModeRate =
      themeTrackedUsers > 0 ? (darkModeUsers / themeTrackedUsers) * 100 : 0
    const totalGuesses = guesses.length
    const totalCorrectGuesses = guesses.filter(guess => guess.is_correct).length
    const cumulativeDailyUsers = Object.values(byDate).reduce(
      (sum, row) => sum + row.unique_sessions,
      0
    )
    const archivePlaySessions = new Set<string>()
    for (const guess of guesses) {
      const caseDate = guess.cases?.case_date
      if (!caseDate || caseDate >= today) continue

      const archiveKey =
        guess.case_id && guess.session_id
          ? `${guess.session_id}__${guess.case_id}`
          : `${guess.session_id}__${caseDate}__${guess.cases?.level || 'unknown'}`

      archivePlaySessions.add(archiveKey)
    }
    const archivePlays = archivePlaySessions.size
    const todayRow = byDate[today] || {
      date: today,
      visits: 0,
      guesses: 0,
      correct_guesses: 0,
      unique_sessions: 0,
      new_sessions: 0,
      returning_sessions: 0,
    }

    setAnalytics(
      Object.values(byDate)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 14)
    )

    setAnalyticsSummary({
      totalVisits,
      totalUniqueUsers,
      cumulativeDailyUsers,
      totalGuesses,
      archivePlays,
      totalCorrectGuesses,
      guessAccuracy: totalGuesses > 0 ? (totalCorrectGuesses / totalGuesses) * 100 : 0,
      averageGuessesPerUser: totalUniqueUsers > 0 ? totalGuesses / totalUniqueUsers : 0,
      darkModeUsers,
      themeTrackedUsers,
      darkModeRate,
      todayUsers: todayRow.unique_sessions,
      todayNewUsers: todayRow.new_sessions,
      todayReturningUsers: todayRow.returning_sessions,
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
    setAudienceSummary({
      topRegions: Array.from(regionCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([label, count]) => ({ label, count })),
      topTimezones: Array.from(timezoneCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([label, count]) => ({ label, count })),
    })
  }

  async function loadDiagnosisChoices() {
    const { data } = await supabase
      .from('diagnosis_choices')
      .select('label')
      .order('label', { ascending: true })

    setDiagnosisChoices((data || []) as DiagnosisChoiceLite[])
  }

  async function loadSubmissionSummary() {
    const { data, error, count } = await supabase
      .from('case_submissions')
      .select('created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(1)

    if (error) return

    const latestCreatedAt = data?.[0]?.created_at || null
    const seenAt = window.localStorage.getItem('orthodle_seen_submissions_at')
    setSubmissionSummary({
      total: count || 0,
      hasNew: Boolean(latestCreatedAt && latestCreatedAt !== seenAt),
      latestCreatedAt,
    })
  }

  async function loadFeedbackSummary() {
    const { data, error, count } = await supabase
      .from('case_feedback')
      .select('created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(1)

    if (error) return

    const latestCreatedAt = data?.[0]?.created_at || null
    const seenAt = window.localStorage.getItem('orthodle_seen_feedback_at')
    setFeedbackSummary({
      total: count || 0,
      hasNew: Boolean(latestCreatedAt && latestCreatedAt !== seenAt),
      latestCreatedAt,
    })
  }

  async function loadHomepageAnnouncements() {
    const { data } = await supabase
      .from('homepage_announcements')
      .select('id, message, start_date, end_date, created_at')
      .order('start_date', { ascending: false })
    setHomepageAnnouncements((data as HomepageAnnouncementRow[] | null) || [])
  }

  async function loadHomepageSurveys() {
    const { data } = await supabase
      .from('homepage_surveys')
      .select('id, question, option_1, option_2, option_3, start_date, end_date, created_at')
      .order('start_date', { ascending: false })

    const surveys = (data as HomepageSurveyRow[] | null) || []
    if (surveys.length === 0) {
      setHomepageSurveys([])
      return
    }

    const surveyIds = surveys.map(item => item.id)
    const { data: responseData } = await supabase
      .from('homepage_survey_responses')
      .select('survey_id, response')
      .in('survey_id', surveyIds)

    const countsBySurvey = new Map<string, Record<string, number>>()

    for (const survey of surveys) {
      countsBySurvey.set(survey.id, {
        [survey.option_1]: 0,
        [survey.option_2]: 0,
        [survey.option_3]: 0,
      })
    }

    for (const row of responseData || []) {
      const existing = countsBySurvey.get(row.survey_id)
      if (!existing) continue
      existing[row.response] = (existing[row.response] || 0) + 1
    }

    setHomepageSurveys(
      surveys.map(item => ({
        ...item,
        response_counts: countsBySurvey.get(item.id) || {},
      }))
    )
  }

  function resetAnnouncementForm() {
    setEditingAnnouncementId(null)
    setAnnouncementMessage('')
    setAnnouncementStartDate(tomorrow)
    setAnnouncementEndDate(tomorrow)
  }

  async function saveHomepageAnnouncement() {
    const trimmedMessage = announcementMessage.trim()

    if (!trimmedMessage) {
      setStatus('Add a homepage note before saving.')
      return
    }

    const payload = {
      message: trimmedMessage,
      start_date: announcementStartDate,
      end_date: announcementEndDate || null,
    }

    const result = editingAnnouncementId
      ? await supabase.from('homepage_announcements').update(payload).eq('id', editingAnnouncementId)
      : await supabase.from('homepage_announcements').insert(payload)

    if (result.error) {
      setStatus('Could not save the homepage note.')
      return
    }

    setStatus(editingAnnouncementId ? 'Homepage note updated.' : 'Homepage note scheduled.')
    resetAnnouncementForm()
    await loadHomepageAnnouncements()
  }

  function editHomepageAnnouncement(item: HomepageAnnouncementRow) {
    setEditingAnnouncementId(item.id)
    setAnnouncementMessage(item.message)
    setAnnouncementStartDate(item.start_date)
    setAnnouncementEndDate(item.end_date || item.start_date)
    setStatus('')
  }

  async function deleteHomepageAnnouncement(id: string) {
    const { error } = await supabase.from('homepage_announcements').delete().eq('id', id)

    if (error) {
      setStatus('Could not delete the homepage note.')
      return
    }

    if (editingAnnouncementId === id) {
      resetAnnouncementForm()
    }

    setStatus('Homepage note deleted.')
    setHomepageAnnouncements(prev => prev.filter(item => item.id !== id))
  }

  function resetSurveyForm() {
    setEditingSurveyId(null)
    setSurveyQuestion('To tailor my questions most effectively, what level of training are you?')
    setSurveyOption1('Med Student')
    setSurveyOption2('Resident')
    setSurveyOption3('Attending')
    setSurveyStartDate(tomorrow)
    setSurveyEndDate(tomorrow)
  }

  async function saveHomepageSurvey() {
    const question = surveyQuestion.trim()
    const option1 = surveyOption1.trim()
    const option2 = surveyOption2.trim()
    const option3 = surveyOption3.trim()

    if (!question || !option1 || !option2 || !option3) {
      setStatus('Add a survey question and all three answer choices before saving.')
      return
    }

    const payload = {
      question,
      option_1: option1,
      option_2: option2,
      option_3: option3,
      start_date: surveyStartDate,
      end_date: surveyEndDate || null,
    }

    const result = editingSurveyId
      ? await supabase.from('homepage_surveys').update(payload).eq('id', editingSurveyId)
      : await supabase.from('homepage_surveys').insert(payload)

    if (result.error) {
      setStatus('Could not save the homepage survey.')
      return
    }

    setStatus(editingSurveyId ? 'Homepage survey updated.' : 'Homepage survey scheduled.')
    resetSurveyForm()
    await loadHomepageSurveys()
  }

  function editHomepageSurvey(item: HomepageSurveyRow) {
    setEditingSurveyId(item.id)
    setSurveyQuestion(item.question)
    setSurveyOption1(item.option_1)
    setSurveyOption2(item.option_2)
    setSurveyOption3(item.option_3)
    setSurveyStartDate(item.start_date)
    setSurveyEndDate(item.end_date || item.start_date)
    setStatus('')
  }

  async function deleteHomepageSurvey(id: string) {
    const { error } = await supabase.from('homepage_surveys').delete().eq('id', id)

    if (error) {
      setStatus('Could not delete the homepage survey.')
      return
    }

    if (editingSurveyId === id) {
      resetSurveyForm()
    }

    setStatus('Homepage survey deleted.')
    setHomepageSurveys(prev => prev.filter(item => item.id !== id))
  }

  async function loadCaseCommunityStats() {
    const matchingCase = cases.find(item => item.case_date === caseDate && item.level === level)

    if (!matchingCase) {
      setCaseCommunityStats(null)
      return
    }

    const casePath = `/${level}/${caseDate}`
    const [{ data: visitRows }, { data: guessRows, error: guessError }] = await Promise.all([
      supabase.from('visits').select('session_id').eq('path', casePath),
      supabase
        .from('guesses')
        .select('session_id, is_correct, created_at, guess_text')
        .eq('case_id', matchingCase.id)
        .order('created_at', { ascending: true }),
    ])

    if (guessError) {
      setStatus(`Could not load case stats: ${guessError.message}`)
      setCaseCommunityStats(null)
      return
    }

    const players = new Set<string>([
      ...((visitRows || []).map(item => item.session_id)),
      ...((guessRows || []).map(item => item.session_id)),
    ])

    const guessesBySession = new Map<
      string,
      Array<{ is_correct: boolean; created_at: string }>
    >()

    for (const guessRow of guessRows || []) {
      const item = {
        is_correct: Boolean(guessRow.is_correct),
        created_at: guessRow.created_at,
      }
      const existing = guessesBySession.get(guessRow.session_id)

      if (existing) {
        existing.push(item)
      } else {
        guessesBySession.set(guessRow.session_id, [item])
      }
    }

    let solvedPlayers = 0
    let firstTrySolves = 0
    let totalGuessesBeforeSolve = 0
    const solveClueCounts = new Map<number, number>()
    const incorrectGuessCounts = new Map<string, { label: string; count: number }>()

    for (const sessionGuesses of guessesBySession.values()) {
      const solvedIndex = sessionGuesses.findIndex(item => item.is_correct)
      if (solvedIndex === -1) continue

      solvedPlayers += 1
      totalGuessesBeforeSolve += solvedIndex + 1
      const solveClue = solvedIndex + 1
      solveClueCounts.set(solveClue, (solveClueCounts.get(solveClue) || 0) + 1)

      if (solvedIndex === 0) {
        firstTrySolves += 1
      }
    }

    for (const guessRow of guessRows || []) {
      if (guessRow.is_correct) continue

      const normalizedGuess = guessRow.guess_text?.trim().toLowerCase()
      const rawGuess = guessRow.guess_text?.trim()

      if (!normalizedGuess || !rawGuess) continue

      const existing = incorrectGuessCounts.get(normalizedGuess)
      if (existing) {
        existing.count += 1
      } else {
        incorrectGuessCounts.set(normalizedGuess, { label: rawGuess, count: 1 })
      }
    }

    const mostCommonSolveClue =
      solveClueCounts.size > 0
        ? [...solveClueCounts.entries()].sort((a, b) => {
            if (b[1] !== a[1]) return b[1] - a[1]
            return a[0] - b[0]
          })[0][0]
        : null

    const mostCommonIncorrectGuesses =
      incorrectGuessCounts.size > 0
        ? [...incorrectGuessCounts.values()]
            .sort((a, b) => {
              if (b.count !== a.count) return b.count - a.count
              return a.label.localeCompare(b.label)
            })
            .slice(0, 3)
        : []

    setCaseCommunityStats({
      players: players.size,
      totalGuesses: (guessRows || []).length,
      totalCorrectGuesses: (guessRows || []).filter(item => item.is_correct).length,
      solveRate: players.size > 0 ? (solvedPlayers / players.size) * 100 : null,
      averageGuessesPerPlayer:
        players.size > 0 ? (guessRows || []).length / players.size : null,
      averageGuessesToSolve:
        solvedPlayers > 0 ? totalGuessesBeforeSolve / solvedPlayers : null,
      firstTrySolveRate:
        solvedPlayers > 0 ? (firstTrySolves / solvedPlayers) * 100 : null,
      mostCommonSolveClue,
      mostCommonIncorrectGuesses,
    })
  }

  async function uploadImage(file: File, slot: 1 | 2 = 1) {
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

    if (slot === 2) {
      setImageUrl2(data.publicUrl)
      setStatus('Second image uploaded.')
      return
    }

    setImageUrl(data.publicUrl)
    setStatus('Image uploaded.')
  }

  async function saveCase() {
    if (!caseDate || !level || !category || !prompt || !answer) {
      setStatus('Please fill out date, level, category, prompt, and answer.')
      return
    }

    const { data: existingCase, error: existingCaseError } = await supabase
      .from('cases')
      .select('id, answer, prompt, category')
      .eq('case_date', caseDate)
      .eq('level', level)
      .maybeSingle()

    if (existingCaseError) {
      setStatus(`Could not check existing case: ${existingCaseError.message}`)
      return
    }

    const isMeaningfullyDifferent =
      existingCase &&
      (
        (existingCase.answer || '').trim() !== answer.trim() ||
        (existingCase.prompt || '').trim() !== prompt.trim() ||
        (existingCase.category || '').trim() !== category.trim()
      )

    if (isMeaningfullyDifferent) {
      const confirmed = window.confirm(
        `A ${formatLevel(level)} case already exists for ${caseDate}.\n\nCurrent case: ${existingCase.answer || 'Untitled case'}\n\nDo you want to replace it?`
      )

      if (!confirmed) {
        setStatus('Save canceled. Existing case was not replaced.')
        return
      }
    }

    const synonymArray = synonyms
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)

    const parsedImageRevealClue =
      imageUrl && imageRevealClue !== 'none' ? Number(imageRevealClue) : null
    const parsedImageRevealClue2 =
      imageUrl2 && imageRevealClue2 !== 'none' ? Number(imageRevealClue2) : null

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
        image_url_2: imageUrl2 || null,
        image_credit_2: imageCredit2 || null,
        image_reveal_clue_2: parsedImageRevealClue2,
        clue_1: clue1 || null,
        clue_2: clue2 || null,
        clue_3: clue3 || null,
        clue_4: clue4 || null,
        clue_5: clue5 || null,
        clue_6: clue6 || null,
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
      <main className="app-surface min-h-screen">
        <Header />

        <div className="mx-auto max-w-md px-6 py-12">
          <section className="night-surface rounded-2xl border border-[#ded7ca] bg-white p-6 shadow-sm">
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

  const sidebarSections: Record<AdminSidebarSectionId, ReactNode> = {
    button_subtitles: (
      <section className="card rounded-2xl border border-[#e7e1d6] bg-white p-3.5 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
        <Link href="/admin/taglines" className="font-serif text-xl font-bold transition hover:text-[#1f6448]">
          Button Subtitles
        </Link>
      </section>
    ),
    homepage_notes: (
      <section className="card rounded-2xl border border-[#e7e1d6] bg-white p-3.5 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
        <button
          type="button"
          onClick={() => toggleCollapsedSection('homepage_notes')}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <h2 className="font-serif text-xl font-bold">Homepage Notes</h2>
          <div className="rounded-full border border-[#ded7ca] bg-[#fbfaf7] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#637268]">
            {homepageAnnouncements.length} scheduled
          </div>
        </button>

        {!collapsedSections.homepage_notes && (
        <div className="mt-3 space-y-2.5">
          <textarea
            value={announcementMessage}
            onChange={e => setAnnouncementMessage(e.target.value)}
            rows={3}
            placeholder="Add a short homepage note"
            className="w-full rounded-xl border border-[#ded7ca] bg-[#fcfbf8] px-3 py-2.5 text-sm text-[#102018] outline-none transition focus:border-[#1f6448] focus:ring-2 focus:ring-[#1f6448]/15"
          />

          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[#637268]">
              Start
              <input
                type="date"
                value={announcementStartDate}
                onChange={e => setAnnouncementStartDate(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#ded7ca] bg-[#fcfbf8] px-3 py-2 text-sm text-[#102018] outline-none transition focus:border-[#1f6448] focus:ring-2 focus:ring-[#1f6448]/15"
              />
            </label>

            <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[#637268]">
              End
              <input
                type="date"
                value={announcementEndDate}
                onChange={e => setAnnouncementEndDate(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#ded7ca] bg-[#fcfbf8] px-3 py-2 text-sm text-[#102018] outline-none transition focus:border-[#1f6448] focus:ring-2 focus:ring-[#1f6448]/15"
              />
            </label>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void saveHomepageAnnouncement()}
              className="rounded-lg bg-[#1f6448] px-3 py-2 text-xs font-bold uppercase tracking-[0.16em] text-white transition hover:bg-[#174c37]"
            >
              {editingAnnouncementId ? 'Update note' : 'Schedule note'}
            </button>
            {editingAnnouncementId && (
              <button
                type="button"
                onClick={resetAnnouncementForm}
                className="rounded-lg border border-[#ded7ca] px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#637268] transition hover:bg-white"
              >
                Cancel
              </button>
            )}
          </div>

          <div className="rounded-2xl border border-[#ead9b7] bg-[#fffaf1] px-4 py-3 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#637268]">
              Home page preview
            </div>
            <p className="mt-2 text-[13px] leading-5 text-[#102018]">
              {announcementMessage.trim() || 'Your scheduled homepage note will preview here.'}
            </p>
          </div>

          <div className="space-y-2">
            {homepageAnnouncements.map(item => (
              <div
                key={item.id}
                className="rounded-xl border border-[#ebe5db] bg-[#fcfbf8] p-3"
              >
                <p className="text-sm leading-5 text-[#102018]">{item.message}</p>
                <p className="mt-2 text-[11px] uppercase tracking-[0.16em] text-[#637268]">
                  {item.start_date}
                  {item.end_date && item.end_date !== item.start_date
                    ? ` to ${item.end_date}`
                    : ''}
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => editHomepageAnnouncement(item)}
                    className="rounded-lg border border-[#ded7ca] px-3 py-1.5 text-xs font-semibold text-[#102018] transition hover:bg-white"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteHomepageAnnouncement(item.id)}
                    className="rounded-lg border border-[#ead9b7] px-3 py-1.5 text-xs font-semibold text-[#a24d24] transition hover:bg-[#fff8ef]"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
        )}
      </section>
    ),
    surveys: (
      <section className="card rounded-2xl border border-[#e7e1d6] bg-white p-3.5 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
        <button
          type="button"
          onClick={() => toggleCollapsedSection('surveys')}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <h2 className="font-serif text-xl font-bold">Surveys</h2>
          <div className="rounded-full border border-[#ded7ca] bg-[#fbfaf7] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#637268]">
            {homepageSurveys.length} scheduled
          </div>
        </button>

        {!collapsedSections.surveys && (
        <div className="mt-3 space-y-2.5">
          <textarea
            value={surveyQuestion}
            onChange={e => setSurveyQuestion(e.target.value)}
            rows={2}
            placeholder="Add your survey question"
            className="w-full rounded-xl border border-[#ded7ca] bg-[#fcfbf8] px-3 py-2.5 text-sm text-[#102018] outline-none transition focus:border-[#1f6448] focus:ring-2 focus:ring-[#1f6448]/15"
          />

          <div className="grid gap-2 sm:grid-cols-3">
            <input
              type="text"
              value={surveyOption1}
              onChange={e => setSurveyOption1(e.target.value)}
              placeholder="Option 1"
              className="w-full rounded-xl border border-[#ded7ca] bg-[#fcfbf8] px-3 py-2 text-sm text-[#102018] outline-none transition focus:border-[#1f6448] focus:ring-2 focus:ring-[#1f6448]/15"
            />
            <input
              type="text"
              value={surveyOption2}
              onChange={e => setSurveyOption2(e.target.value)}
              placeholder="Option 2"
              className="w-full rounded-xl border border-[#ded7ca] bg-[#fcfbf8] px-3 py-2 text-sm text-[#102018] outline-none transition focus:border-[#1f6448] focus:ring-2 focus:ring-[#1f6448]/15"
            />
            <input
              type="text"
              value={surveyOption3}
              onChange={e => setSurveyOption3(e.target.value)}
              placeholder="Option 3"
              className="w-full rounded-xl border border-[#ded7ca] bg-[#fcfbf8] px-3 py-2 text-sm text-[#102018] outline-none transition focus:border-[#1f6448] focus:ring-2 focus:ring-[#1f6448]/15"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[#637268]">
              Start
              <input
                type="date"
                value={surveyStartDate}
                onChange={e => setSurveyStartDate(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#ded7ca] bg-[#fcfbf8] px-3 py-2 text-sm text-[#102018] outline-none transition focus:border-[#1f6448] focus:ring-2 focus:ring-[#1f6448]/15"
              />
            </label>

            <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[#637268]">
              End
              <input
                type="date"
                value={surveyEndDate}
                onChange={e => setSurveyEndDate(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#ded7ca] bg-[#fcfbf8] px-3 py-2 text-sm text-[#102018] outline-none transition focus:border-[#1f6448] focus:ring-2 focus:ring-[#1f6448]/15"
              />
            </label>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void saveHomepageSurvey()}
              className="rounded-lg bg-[#1f6448] px-3 py-2 text-xs font-bold uppercase tracking-[0.16em] text-white transition hover:bg-[#174c37]"
            >
              {editingSurveyId ? 'Update survey' : 'Schedule survey'}
            </button>
            {editingSurveyId && (
              <button
                type="button"
                onClick={resetSurveyForm}
                className="rounded-lg border border-[#ded7ca] px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#637268] transition hover:bg-white"
              >
                Cancel
              </button>
            )}
          </div>

          <div className="rounded-2xl border border-[#ead9b7] bg-[#fffaf1] px-4 py-3 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#637268]">
              Survey preview
            </div>
            <div className="mt-2 text-[13px] leading-5 text-[#102018]">
              {surveyQuestion.trim() || 'Your scheduled survey will preview here.'}
            </div>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {[surveyOption1, surveyOption2, surveyOption3].map((option, index) => (
                <div
                  key={`${option}-${index}`}
                  className="rounded-lg border border-[#ded7ca] bg-white px-3 py-2 text-[11px] font-semibold text-[#102018]"
                >
                  {option.trim() || `Option ${index + 1}`}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            {homepageSurveys.map(item => (
              <div
                key={item.id}
                className="rounded-xl border border-[#ebe5db] bg-[#fcfbf8] p-3"
              >
                <p className="text-sm leading-5 font-semibold text-[#102018]">{item.question}</p>
                <p className="mt-2 text-[11px] uppercase tracking-[0.16em] text-[#637268]">
                  {item.start_date}
                  {item.end_date && item.end_date !== item.start_date
                    ? ` to ${item.end_date}`
                    : ''}
                </p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  {[item.option_1, item.option_2, item.option_3].map(option => (
                    <div key={option} className="rounded-lg border border-[#ded7ca] bg-white px-2 py-2">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#637268]">
                        {option}
                      </div>
                      <div className="mt-1 text-sm font-semibold text-[#102018]">
                        {item.response_counts?.[option] ?? 0}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => editHomepageSurvey(item)}
                    className="rounded-lg border border-[#ded7ca] px-3 py-1.5 text-xs font-semibold text-[#102018] transition hover:bg-white"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteHomepageSurvey(item.id)}
                    className="rounded-lg border border-[#ead9b7] px-3 py-1.5 text-xs font-semibold text-[#a24d24] transition hover:bg-[#fff8ef]"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
        )}
      </section>
    ),
    submissions: (
      <section className="card rounded-2xl border border-[#e7e1d6] bg-white p-3.5 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/submissions"
              onClick={() => {
                if (submissionSummary.latestCreatedAt) {
                  window.localStorage.setItem(
                    'orthodle_seen_submissions_at',
                    submissionSummary.latestCreatedAt
                  )
                }
                setSubmissionSummary(prev => ({ ...prev, hasNew: false }))
              }}
              className="font-serif text-xl font-bold transition hover:text-[#1f6448]"
            >
              Submissions
            </Link>
            {submissionSummary.hasNew && (
              <div className="rounded-full bg-[#fff1e8] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#a24d24]">
                New
              </div>
            )}
          </div>
        </div>
        <p className="mt-2 text-sm text-[#8a948d]">{submissionSummary.total} total</p>
      </section>
    ),
    answer_choices: (
      <section className="card rounded-2xl border border-[#e7e1d6] bg-white p-3.5 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/admin/answer-choices"
            className="font-serif text-xl font-bold transition hover:text-[#1f6448]"
          >
            Answer Choices
          </Link>
        </div>
      </section>
    ),
    feedback: (
      <section className="card rounded-2xl border border-[#e7e1d6] bg-white p-3.5 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/feedback"
              onClick={() => {
                if (feedbackSummary.latestCreatedAt) {
                  window.localStorage.setItem(
                    'orthodle_seen_feedback_at',
                    feedbackSummary.latestCreatedAt
                  )
                }
                setFeedbackSummary(prev => ({ ...prev, hasNew: false }))
              }}
              className="font-serif text-xl font-bold transition hover:text-[#1f6448]"
            >
              Feedback
            </Link>
            {feedbackSummary.hasNew && (
              <div className="rounded-full bg-[#fff1e8] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#a24d24]">
                New
              </div>
            )}
          </div>
        </div>
        <p className="mt-2 text-sm text-[#8a948d]">{feedbackSummary.total} total</p>
      </section>
    ),
    groups: (
      <section className="card rounded-2xl border border-[#e7e1d6] bg-white p-3.5 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/admin/groups"
            className="font-serif text-xl font-bold transition hover:text-[#1f6448]"
          >
            Groups
          </Link>
        </div>
        <p className="mt-2 text-sm text-[#8a948d]">Manage group boards</p>
      </section>
    ),
    analytics: (
      <section className="card rounded-2xl border border-[#e7e1d6] bg-white p-3.5 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
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

        <div className="mt-3">
          <Link
            href="/admin/impact"
            className="inline-flex items-center rounded-lg border border-[#ded7ca] px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#637268] transition hover:bg-white hover:text-[#1f6448]"
          >
            Open impact snapshot
          </Link>
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
                      {analyticsSummary.totalUniqueUsers}
                    </div>
                  </div>

                  <div className="rounded-lg border border-[#ded7ca] bg-white px-3 py-2.5">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#637268]">
                      Combined daily users
                    </div>
                    <div className="mt-1 font-serif text-xl font-bold text-[#102018]">
                      {analyticsSummary.cumulativeDailyUsers}
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

                  <div className="rounded-lg border border-[#ded7ca] bg-white px-3 py-2.5">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#637268]">
                      Archive plays
                    </div>
                    <div className="mt-1 font-serif text-xl font-bold text-[#102018]">
                      {analyticsSummary.archivePlays}
                    </div>
                  </div>

                  <div className="rounded-lg border border-[#ded7ca] bg-white px-3 py-2.5">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#637268]">
                      Night mode users
                    </div>
                    <div className="mt-1 font-serif text-xl font-bold text-[#102018]">
                      {formatPercent(analyticsSummary.darkModeRate)}
                    </div>
                    <div className="mt-1 text-[11px] text-[#637268]">
                      {analyticsSummary.darkModeUsers} of {analyticsSummary.themeTrackedUsers} tracked users
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-[#ded7ca] bg-[#fbfaf7] p-3">
                  <button
                    type="button"
                    onClick={() => toggleCollapsedSection('analytics_today')}
                    className="flex w-full items-center justify-between gap-3 text-left"
                  >
                    <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#637268]">
                      Today
                    </div>
                  </button>
                  {!collapsedSections.analytics_today && (
                    <div className="mt-3 space-y-3">
                      <div className="grid grid-cols-3 gap-3 text-center">
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

                      <div className="grid grid-cols-2 gap-3 text-center">
                        <div>
                          <div className="font-serif text-xl font-bold text-[#102018]">
                            {analyticsSummary.todayNewUsers}
                          </div>
                          <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-[#637268]">
                            New
                          </div>
                        </div>
                        <div>
                          <div className="font-serif text-xl font-bold text-[#102018]">
                            {analyticsSummary.todayReturningUsers}
                          </div>
                          <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-[#637268]">
                            Returning
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-[#ded7ca] bg-[#fbfaf7] p-3">
                    <button
                      type="button"
                      onClick={() => toggleCollapsedSection('analytics_top_regions')}
                      className="flex w-full items-center justify-between gap-3 text-left"
                    >
                      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#637268]">
                        Top regions
                      </div>
                    </button>
                    {!collapsedSections.analytics_top_regions && (
                      <div className="mt-3 space-y-2">
                        {audienceSummary.topRegions.length > 0 ? (
                          audienceSummary.topRegions.map(item => (
                            <div key={item.label} className="flex items-start justify-between gap-3 text-sm text-[#102018]">
                              <span className="min-w-0 break-all">{item.label}</span>
                              <span className="font-semibold text-[#637268]">{item.count}</span>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-[#637268]">No region data yet.</p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="rounded-lg border border-[#ded7ca] bg-[#fbfaf7] p-3">
                    <button
                      type="button"
                      onClick={() => toggleCollapsedSection('analytics_top_timezones')}
                      className="flex w-full items-center justify-between gap-3 text-left"
                    >
                      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#637268]">
                        Top timezones
                      </div>
                    </button>
                    {!collapsedSections.analytics_top_timezones && (
                      <div className="mt-3 space-y-2">
                        {audienceSummary.topTimezones.length > 0 ? (
                          audienceSummary.topTimezones.map(item => (
                            <div key={item.label} className="flex items-start justify-between gap-3 text-sm text-[#102018]">
                              <span className="min-w-0 break-all">{item.label}</span>
                              <span className="font-semibold text-[#637268]">{item.count}</span>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-[#637268]">No timezone data yet.</p>
                        )}
                      </div>
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
    ),
    cases_by_date: (
      <section className="card rounded-2xl border border-[#e7e1d6] bg-white p-4 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
        <button
          type="button"
          onClick={() => toggleCollapsedSection('cases_by_date')}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <h2 className="font-serif text-xl font-bold">Cases by Date</h2>
          {browseDate ? (
            <div className="rounded-full border border-[#ded7ca] bg-[#fbfaf7] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#637268]">
              {formatShortDate(browseDate)}
            </div>
          ) : null}
        </button>

        {!collapsedSections.cases_by_date && showCasesByDate && (
          <div className="mt-4 space-y-3">
            <div className="rounded-xl border border-[#ebe5db] bg-[#fcfbf8] p-3">
              <button
                type="button"
                onClick={() => toggleCollapsedSection('cases_jump_to_date')}
                className="flex w-full items-center justify-between gap-3 text-left"
              >
                <div className="text-sm font-semibold text-[#637268]">Jump to date</div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#637268]">
                  {collapsedSections.cases_jump_to_date ? 'Show' : 'Hide'}
                </div>
              </button>

              {!collapsedSections.cases_jump_to_date && (
                <>
                  <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                    <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                      <span className="sr-only">Jump to date</span>
                      <input
                        type="date"
                        value={browseDate}
                        onChange={e => setBrowseDate(e.target.value)}
                        className="rounded-lg border border-[#ded7ca] bg-white px-3 py-2.5 text-sm text-[#102018]"
                      />
                    </label>

                    <button
                      type="button"
                      onClick={() => {
                        setCaseDate(browseDate || today)
                        setShowComposer(true)
                        window.scrollTo({ top: 0, behavior: 'smooth' })
                      }}
                      className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm font-semibold text-[#102018] transition hover:bg-white"
                    >
                      Open in editor
                    </button>
                  </div>

                  {quickBrowseDates.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {quickBrowseDates.map(date => (
                        <button
                          key={date}
                          type="button"
                          onClick={() => setBrowseDate(date)}
                          className={
                            browseDate === date
                              ? 'rounded-full border border-[#cfded4] bg-[#f7fbf8] px-3 py-1.5 text-[11px] font-semibold text-[#1f6448]'
                              : 'rounded-full border border-[#ded7ca] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#637268] transition hover:bg-[#fbfaf7]'
                          }
                        >
                          {formatShortDate(date)}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}

              {browseDate && (
                <div className="mt-4 rounded-xl border border-[#e7e1d6] bg-white p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#637268]">
                      {browseDate} overview
                    </div>
                    <div className="rounded-full border border-[#ded7ca] bg-[#fbfaf7] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#637268]">
                      {browsedCases.length}/3 ready
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2">
                    {levelOrder.map(levelValue => {
                      const item = browsedCases.find(entry => entry.level === levelValue)
                      const nextMissing = nextMissingLevelForDate(browseDate)

                      return (
                        <div
                          key={`browse-${browseDate}-${levelValue}`}
                          className={
                            item
                              ? 'rounded-xl border border-[#cfded4] bg-[#f7fbf8] px-3 py-3'
                              : 'rounded-xl border border-dashed border-[#ded7ca] bg-[#fcfbf8] px-3 py-3'
                          }
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#637268]">
                                {formatLevel(levelValue)}
                              </div>
                              <div className="mt-1.5 font-semibold text-[#102018]">
                                {item ? item.answer : 'Not scheduled'}
                              </div>
                              <div className="mt-1 text-sm text-[#637268]">
                                {item ? item.category : 'Open slot'}
                              </div>
                            </div>

                            {item ? (
                              <button
                                type="button"
                                onClick={() => editCase(item)}
                                className="rounded-lg border border-[#ded7ca] px-3 py-1.5 text-sm font-semibold text-[#102018] transition hover:bg-white"
                              >
                                Edit
                              </button>
                            ) : nextMissing === levelValue ? (
                              <button
                                type="button"
                                onClick={() => startCaseFor(browseDate, levelValue)}
                                className="rounded-lg border border-[#ded7ca] px-3 py-1.5 text-sm font-semibold text-[#102018] transition hover:bg-white"
                              >
                                Add
                              </button>
                            ) : null}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    ),
  }

  return (
    <main className="app-surface min-h-screen">
      <Header />

      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-serif text-3xl font-bold text-[#102018]">
              Admin Dashboard
            </h1>

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

        <section className="night-surface mt-3 rounded-2xl border border-[#e7e1d6] bg-white p-3.5 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#637268]">
                Today overview
              </div>
            </div>

            <div className="rounded-full border border-[#ded7ca] bg-[#fbfaf7] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#637268]">
              {todaysCases.length}/3 ready
            </div>
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-3">
            {levelOrder.map(levelValue => {
              const item = todaysCases.find(entry => entry.level === levelValue)
              const nextMissing = nextMissingLevelForDate(today)

              return (
                <div
                  key={levelValue}
                  className={
                    item
                      ? 'rounded-xl border border-[#cfded4] bg-[#f7fbf8] px-3 py-3'
                      : 'rounded-xl border border-dashed border-[#ded7ca] bg-[#fcfbf8] px-3 py-3'
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#637268]">
                        {formatLevel(levelValue)}
                      </div>
                      <div className="mt-1.5 font-semibold text-[#102018]">
                        {item ? item.answer : 'Not scheduled'}
                      </div>
                      <div className="mt-1 text-sm text-[#637268]">
                        {item ? item.category : 'Open slot'}
                      </div>
                    </div>

                    {item ? (
                      <button
                        type="button"
                        onClick={() => editCase(item)}
                        className="rounded-lg border border-[#ded7ca] px-3 py-1.5 text-sm font-semibold text-[#102018] transition hover:bg-white"
                      >
                        Edit
                      </button>
                    ) : nextMissing === levelValue ? (
                      <button
                        type="button"
                        onClick={() => startCaseFor(today, levelValue)}
                        className="rounded-lg border border-[#ded7ca] px-3 py-1.5 text-sm font-semibold text-[#102018] transition hover:bg-white"
                      >
                        Add
                      </button>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <section className="night-surface mt-3 rounded-2xl border border-[#e7e1d6] bg-white p-3.5 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#637268]">
                Tomorrow overview
              </div>
            </div>

            <div className="rounded-full border border-[#ded7ca] bg-[#fbfaf7] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#637268]">
              {tomorrowsCases.length}/3 ready
            </div>
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-3">
            {levelOrder.map(levelValue => {
              const item = tomorrowsCases.find(entry => entry.level === levelValue)
              const nextMissing = nextMissingLevelForDate(tomorrow)

              return (
                <div
                  key={`tomorrow-${levelValue}`}
                  className={
                    item
                      ? 'rounded-xl border border-[#cfded4] bg-[#f7fbf8] px-3 py-3'
                      : 'rounded-xl border border-dashed border-[#ded7ca] bg-[#fcfbf8] px-3 py-3'
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#637268]">
                        {formatLevel(levelValue)}
                      </div>
                      <div className="mt-1.5 font-semibold text-[#102018]">
                        {item ? item.answer : 'Not scheduled'}
                      </div>
                      <div className="mt-1 text-sm text-[#637268]">
                        {item ? item.category : 'Open slot'}
                      </div>
                    </div>

                    {item ? (
                      <button
                        type="button"
                        onClick={() => editCase(item)}
                        className="rounded-lg border border-[#ded7ca] px-3 py-1.5 text-sm font-semibold text-[#102018] transition hover:bg-white"
                      >
                        Edit
                      </button>
                    ) : nextMissing === levelValue ? (
                      <button
                        type="button"
                        onClick={() => startCaseFor(tomorrow, levelValue)}
                        className="rounded-lg border border-[#ded7ca] px-3 py-1.5 text-sm font-semibold text-[#102018] transition hover:bg-white"
                      >
                        Add
                      </button>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_320px]">
          <section className="card rounded-2xl border border-[#e7e1d6] bg-white p-3.5 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
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
            <div className="mt-3 grid gap-2.5">
              <div className="grid gap-2.5 sm:grid-cols-2">
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
              </div>

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

              <div className="rounded-xl border border-[#ebe5db] bg-[#fcfbf8] p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-2.5">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#637268]">
                      Image 1
                    </div>
                    <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                      Image 1 URL
                      <input
                        value={imageUrl}
                        onChange={e => setImageUrl(e.target.value)}
                        placeholder="Paste a hosted x-ray or image URL"
                        className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                      Image 1 Reveal
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
                        <option value="5">Reveal with Clue 5</option>
                        <option value="6">Reveal with Clue 6</option>
                      </select>
                    </label>
                    <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                      Image 1 Credit
                      <input
                        value={imageCredit}
                        onChange={e => setImageCredit(e.target.value)}
                        placeholder="Optional small credit"
                        className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                      />
                    </label>
                  </div>

                  <div className="grid gap-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#637268]">
                        Image 2
                      </div>
                      {imageUrl2 && (
                        <button
                          type="button"
                          onClick={() => {
                            setImageUrl2('')
                            setImageCredit2('')
                            setImageRevealClue2('none')
                          }}
                          className="rounded-lg border border-[#ead9b7] px-2.5 py-1 text-[11px] font-semibold text-[#a24d24] transition hover:bg-[#fff8ef]"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                      Image 2 URL
                      <input
                        value={imageUrl2}
                        onChange={e => setImageUrl2(e.target.value)}
                        placeholder="Optional second hosted image URL"
                        className="min-w-0 flex-1 rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                      Image 2 Reveal
                      <select
                        value={imageRevealClue2}
                        onChange={e => setImageRevealClue2(e.target.value)}
                        className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                      >
                        <option value="none">Show immediately</option>
                        <option value="1">Reveal with Clue 1</option>
                        <option value="2">Reveal with Clue 2</option>
                        <option value="3">Reveal with Clue 3</option>
                        <option value="4">Reveal with Clue 4</option>
                        <option value="5">Reveal with Clue 5</option>
                        <option value="6">Reveal with Clue 6</option>
                      </select>
                    </label>
                    <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                      Image 2 Credit
                      <input
                        value={imageCredit2}
                        onChange={e => setImageCredit2(e.target.value)}
                        placeholder="Optional second image credit"
                        className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                      />
                    </label>
                  </div>
                </div>
              </div>

              {imageUrl && (
                <div className="rounded-lg border border-[#ded7ca] p-2.5">
                  <img
                    src={imageUrl}
                    alt="Uploaded case"
                    className="max-h-48 rounded-lg object-contain"
                  />
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

              {imageUrl2 && (
                <div className="rounded-lg border border-[#ded7ca] p-2.5">
                  <img
                    src={imageUrl2}
                    alt="Uploaded second case"
                    className="max-h-48 rounded-lg object-contain"
                  />
                  {imageCredit2 && (
                    <p className="mt-1 text-[11px] text-[#8a948d]">{imageCredit2}</p>
                  )}
                  <button
                    onClick={() => setImageUrl2('')}
                    className="mt-2 rounded-lg border border-[#ded7ca] px-3 py-1.5 text-sm font-semibold text-[#102018] transition hover:bg-white"
                  >
                    Remove second image
                  </button>
                </div>
              )}

              <div className="rounded-xl border border-[#ebe5db] bg-[#fcfbf8] p-3">
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                    Clue 1
                    <textarea
                      value={clue1}
                      onChange={e => setClue1(e.target.value)}
                      onInput={autoGrowTextarea}
                      rows={1}
                      className="min-h-[46px] resize-none overflow-hidden rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                    />
                  </label>

                  <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                    Clue 2
                    <textarea
                      value={clue2}
                      onChange={e => setClue2(e.target.value)}
                      onInput={autoGrowTextarea}
                      rows={1}
                      className="min-h-[46px] resize-none overflow-hidden rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                    />
                  </label>

                  <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                    Clue 3
                    <textarea
                      value={clue3}
                      onChange={e => setClue3(e.target.value)}
                      onInput={autoGrowTextarea}
                      rows={1}
                      className="min-h-[46px] resize-none overflow-hidden rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                    />
                  </label>

                  <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                    Clue 4
                    <textarea
                      value={clue4}
                      onChange={e => setClue4(e.target.value)}
                      onInput={autoGrowTextarea}
                      rows={1}
                      className="min-h-[46px] resize-none overflow-hidden rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                    />
                  </label>

                  <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                    Clue 5
                    <textarea
                      value={clue5}
                      onChange={e => setClue5(e.target.value)}
                      placeholder="Optional"
                      onInput={autoGrowTextarea}
                      rows={1}
                      className="min-h-[46px] resize-none overflow-hidden rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                    />
                  </label>

                  <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                    Clue 6
                    <textarea
                      value={clue6}
                      onChange={e => setClue6(e.target.value)}
                      placeholder="Optional"
                      onInput={autoGrowTextarea}
                      rows={1}
                      className="min-h-[46px] resize-none overflow-hidden rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                    />
                  </label>
                </div>
              </div>

              <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                Teaching Point
                <textarea
                  ref={teachingPointRef}
                  value={teachingPoint}
                  onChange={e => setTeachingPoint(e.target.value)}
                  onKeyDown={handleTeachingPointKeyDown}
                  placeholder={`Clinical Context: **Most common cause of anterior knee pain** in adolescent athletes

Who:
- Adolescents (10-15)
- During growth spurts

Pathophys:
- Repetitive traction on an open tibial tubercle apophysis

Key Clues:
- Anterior knee pain in a young athlete
- Gradual onset, not acute

Imaging:
- Lateral X-ray with tibial tubercle fragmentation

Tx:
- Relative rest, NSAIDs, stretching

Don't Miss:
- Tibial tubercle avulsion fracture

Classic Pitfall:
- Calling this a fracture instead of traction apophysitis

Board Pearl:
- Self-limited and improves with skeletal maturity

DDx:
- Patellar tendinopathy
- Tibial tubercle avulsion fracture`}
                  rows={7}
                  className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                />
                <span className="text-xs font-normal text-[#8a948d]">
                  Line breaks are preserved. Use Ctrl/Cmd + B for bold and Ctrl/Cmd + I for italics. Orthodle Insight is added automatically when case stats exist.
                </span>
              </label>

              {composerGuardrails.length > 0 && (
                <div className="rounded-xl border border-[#ead9b7] bg-[#fffaf1] px-3 py-3 text-sm text-[#8a5a2b]">
                  <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#8a5a2b]">
                    Guardrails
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {composerGuardrails.map(issue => (
                      <p key={issue}>{issue}</p>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={saveCase}
                className="rounded-lg bg-[#1f6448] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#174c37]"
              >
                Save / Update Case
              </button>

              <button
                type="button"
                onClick={async () => {
                  const { data: existingCase, error } = await supabase
                    .from('cases')
                    .select('id, case_date, level, answer')
                    .eq('case_date', caseDate)
                    .eq('level', level)
                    .maybeSingle()

                  if (error) {
                    setStatus(`Could not check case before deleting: ${error.message}`)
                    return
                  }

                  if (!existingCase) {
                    setStatus('No saved case exists for this date and level yet.')
                    return
                  }

                  await deleteCase(existingCase as Pick<CaseRow, 'id' | 'case_date' | 'level' | 'answer'>)
                }}
                className="rounded-lg border border-[#ead9b7] bg-[#fffaf1] px-5 py-3 text-sm font-semibold text-[#a24d24] transition hover:bg-[#fff4e8]"
              >
                Delete current slot
              </button>

              {status && <p className="text-sm text-[#637268]">{status}</p>}

              <div className="rounded-2xl border border-[#ebe5db] bg-[#fcfbf8] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#637268]">
                    Case stats
                  </div>
                  <div className="rounded-full border border-[#ded7ca] bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#637268]">
                    Read only
                  </div>
                </div>

                {caseCommunityStats ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-xl border border-[#ded7ca] bg-white px-3 py-2.5">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#637268]">
                        Players
                      </div>
                      <div className="mt-1 font-serif text-xl font-bold text-[#102018]">
                        {caseCommunityStats.players}
                      </div>
                    </div>
                    <div className="rounded-xl border border-[#ded7ca] bg-white px-3 py-2.5">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#637268]">
                        Total guesses
                      </div>
                      <div className="mt-1 font-serif text-xl font-bold text-[#102018]">
                        {caseCommunityStats.totalGuesses}
                      </div>
                    </div>
                    <div className="rounded-xl border border-[#ded7ca] bg-white px-3 py-2.5">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#637268]">
                        Solve rate
                      </div>
                      <div className="mt-1 font-serif text-xl font-bold text-[#102018]">
                        {caseCommunityStats.solveRate !== null
                          ? formatPercent(caseCommunityStats.solveRate)
                          : '—'}
                      </div>
                    </div>
                    <div className="rounded-xl border border-[#ded7ca] bg-white px-3 py-2.5">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#637268]">
                        Avg guesses / player
                      </div>
                      <div className="mt-1 font-serif text-xl font-bold text-[#102018]">
                        {caseCommunityStats.averageGuessesPerPlayer?.toFixed(1) ?? '—'}
                      </div>
                    </div>
                    <div className="rounded-xl border border-[#ded7ca] bg-white px-3 py-2.5">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#637268]">
                        Avg to solve
                      </div>
                      <div className="mt-1 font-serif text-xl font-bold text-[#102018]">
                        {caseCommunityStats.averageGuessesToSolve?.toFixed(1) ?? '—'}
                      </div>
                    </div>
                    <div className="rounded-xl border border-[#ded7ca] bg-white px-3 py-2.5">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#637268]">
                        First-try solves
                      </div>
                      <div className="mt-1 font-serif text-xl font-bold text-[#102018]">
                        {caseCommunityStats.firstTrySolveRate !== null
                          ? formatPercent(caseCommunityStats.firstTrySolveRate)
                          : '—'}
                      </div>
                    </div>
                    <div className="rounded-xl border border-[#ded7ca] bg-white px-3 py-2.5">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#637268]">
                        Most common solve clue
                      </div>
                      <div className="mt-1 font-serif text-xl font-bold text-[#102018]">
                        {caseCommunityStats.mostCommonSolveClue !== null
                          ? `Clue ${caseCommunityStats.mostCommonSolveClue}`
                          : '—'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleCollapsedSection('case_stats_incorrect_guesses')}
                      className="rounded-xl border border-[#ded7ca] bg-white px-3 py-2.5 text-left transition hover:bg-[#fcfbf8]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#637268]">
                            Top incorrect guesses
                          </div>
                          <div className="mt-1 font-serif text-xl font-bold text-[#102018]">
                            {caseCommunityStats.mostCommonIncorrectGuesses[0]?.label || '—'}
                          </div>
                        </div>
                        <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#637268]">
                          {collapsedSections.case_stats_incorrect_guesses ? 'Show' : 'Hide'}
                        </span>
                      </div>

                      {!collapsedSections.case_stats_incorrect_guesses &&
                        caseCommunityStats.mostCommonIncorrectGuesses.length > 0 && (
                          <div className="mt-2 space-y-1.5 border-t border-[#ebe5db] pt-2 text-sm text-[#102018]">
                            {caseCommunityStats.mostCommonIncorrectGuesses.map((guess, index) => (
                              <div key={`${guess.label}-${index}`} className="flex items-center justify-between gap-3">
                                <span className="min-w-0 truncate">
                                  {index + 1}. {guess.label}
                                </span>
                                <span className="shrink-0 text-[11px] font-semibold text-[#637268]">
                                  {guess.count}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                    </button>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-[#637268]">
                    No saved case stats for this date and level yet.
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-[#ebe5db] bg-[#fcfbf8] p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#637268]">
                      Preview
                    </div>
                    <p className="mt-1 text-[12px] text-[#637268]">
                      A quick read on how this case will appear to players.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <div className="inline-flex rounded-full border border-[#ded7ca] bg-white p-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#637268]">
                      <button
                        type="button"
                        onClick={() => setPreviewMode('mobile')}
                        className={`rounded-full px-2.5 py-1 transition ${
                          previewMode === 'mobile'
                            ? 'bg-[#1f6448] text-white'
                            : 'text-[#637268] hover:bg-[#fbfaf7]'
                        }`}
                      >
                        Mobile
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewMode('desktop')}
                        className={`rounded-full px-2.5 py-1 transition ${
                          previewMode === 'desktop'
                            ? 'bg-[#1f6448] text-white'
                            : 'text-[#637268] hover:bg-[#fbfaf7]'
                        }`}
                      >
                        Desktop
                      </button>
                    </div>
                    <div className="rounded-full border border-[#ded7ca] bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#637268]">
                      {caseDate} · {formatLevel(level)}
                    </div>
                  </div>
                </div>

                <div className={`mt-3 ${previewMode === 'mobile' ? 'mx-auto max-w-[390px]' : ''}`}>
                  <div className={`overflow-hidden rounded-2xl border border-[#e7e1d6] bg-white ${previewMode === 'mobile' ? 'shadow-[0_18px_36px_rgba(16,32,24,0.10)]' : ''}`}>
                    <div className="mx-px mt-px h-1.5 rounded-t-[15px] bg-gradient-to-r from-[#1f6448] via-[#c76b3a] to-[#ead9b7]" />

                    <div className={previewMode === 'mobile' ? 'px-3 py-4' : 'p-4'}>
                      <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#637268]">
                        <span className="rounded-full border border-[#ded7ca] bg-white px-2.5 py-1">
                          {category || 'Category'}
                        </span>
                        {contributorName && (
                          <span className="rounded-full border border-[#ded7ca] bg-[#fbfaf7] px-2.5 py-1">
                            {contributorName}
                          </span>
                        )}
                      </div>

                      <div className={previewMode === 'mobile' ? 'mt-3 space-y-2.5' : 'mt-3 space-y-3'}>
                        <div className={`font-serif font-bold leading-tight text-[#102018] ${previewMode === 'mobile' ? 'text-[18px]' : 'text-[20px]'}`}>
                          {answer || 'Diagnosis preview'}
                        </div>

                        <div className={`font-serif text-[#102018] ${previewMode === 'mobile' ? 'text-[15px] leading-7' : 'text-[16px] leading-7'}`}>
                          {prompt || 'Your case prompt will show up here.'}
                        </div>

                        {(imageUrl || imageUrl2) && (
                          <div className={`grid gap-2 ${imageUrl && imageUrl2 ? (previewMode === 'mobile' ? 'grid-cols-1' : 'md:grid-cols-2') : 'grid-cols-1'}`}>
                            {imageUrl && (
                              <div className="rounded-xl border border-[#ebe5db] bg-[#fcfbf8] p-2.5">
                                <img
                                  src={imageUrl}
                                  alt="Case preview"
                                  className="max-h-56 rounded-lg object-contain"
                                />
                                {imageCredit && (
                                  <p className="mt-2 text-[11px] text-[#8a948d]">{imageCredit}</p>
                                )}
                                <p className="mt-1 text-[11px] text-[#637268]">
                                  {imageRevealClue === 'none'
                                    ? 'Image 1 shows immediately.'
                                    : `Image 1 reveals with clue ${imageRevealClue}.`}
                                </p>
                              </div>
                            )}
                            {imageUrl2 && (
                              <div className="rounded-xl border border-[#ebe5db] bg-[#fcfbf8] p-2.5">
                                <img
                                  src={imageUrl2}
                                  alt="Second case preview"
                                  className="max-h-56 rounded-lg object-contain"
                                />
                                {imageCredit2 && (
                                  <p className="mt-2 text-[11px] text-[#8a948d]">{imageCredit2}</p>
                                )}
                                <p className="mt-1 text-[11px] text-[#637268]">
                                  {imageRevealClue2 === 'none'
                                    ? 'Image 2 shows immediately.'
                                    : `Image 2 reveals with clue ${imageRevealClue2}.`}
                                </p>
                              </div>
                            )}
                          </div>
                        )}

                        <div className="night-soft-surface rounded-xl border border-dashed border-[#d7e5db] bg-[#fdfefe] p-3">
                          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#315f4d]">
                            Clinical findings
                          </div>
                          {previewClues.length > 0 ? (
                            <ul className="mt-2 space-y-2">
                              {previewClues.map((clue, index) => (
                                <li
                                  key={`${clue}-${index}`}
                                  className="orthodle-finding-card rounded-lg border border-[#ead9b7] px-3 py-2.5 text-sm leading-6 text-[#102018]"
                                >
                                  <span className="mr-2 text-[#637268]">{index + 1}.</span>
                                  {clue}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-2 text-sm text-[#8a948d]">
                              Add clues to preview the reveal sequence.
                            </p>
                          )}
                        </div>

                        <div className="rounded-xl border border-[#ebe5db] bg-[#fcfbf8] p-3">
                          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#315f4d]">
                            Quick takeaway
                          </div>
                          {teachingPoint.trim() ? (
                            <div className="mt-2 space-y-2">
                              {formatPreviewTeachingPoint(teachingPoint).map((line, index) => (
                                <p key={`${line}-${index}`} className="text-sm leading-6 text-[#102018]">
                                  {renderFormattedPreviewLine(line)}
                                </p>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-2 text-sm text-[#8a948d]">
                              Add a short takeaway to show after the solve.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            )}
          </section>

          <aside className="flex flex-col gap-3">
            {sidebarSectionOrder.map(sectionId => (
              <div
                key={sectionId}
                draggable
                onDragStart={() => handleSidebarDragStart(sectionId)}
                onDragOver={event => handleSidebarDragOver(event, sectionId)}
                onDrop={() => handleSidebarDrop(sectionId)}
                onDragEnd={handleSidebarDragEnd}
                className={
                  sidebarDropTarget === sectionId && draggedSidebarSection !== sectionId
                    ? 'rounded-[22px] border-2 border-dashed border-[#cfded4] bg-[#f7fbf8] p-1 transition'
                    : '[&>section>div:first-child]:active:cursor-grabbing [&>section>div:first-child]:cursor-grab transition'
                }
              >
                {sidebarSections[sectionId]}
              </div>
            ))}
          </aside>
        </div>
      </div>
    </main>
  )
}
