'use client'

import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { Header } from '@/components/Header'
import {
  buildMultiSelectSynonymMetadata,
  extractPlainSynonyms,
  getAnatomyChoiceItems,
  getCorrectAnatomyChoiceLetters,
  parseAnatomyGuessLetters,
  parseChoiceLetterList,
} from '@/lib/anatomy-quiz'
import { supabase } from '@/lib/supabase'
import { fetchExcludedStatsSessionIds, filterExcludedSessionRows } from '@/lib/stats-exclusions'
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
  learning_image_url: string | null
  learning_image_credit: string | null
  learning_image_url_2: string | null
  learning_image_credit_2: string | null
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
  learning_image_url: string | null
  learning_image_credit: string | null
  learning_image_url_2: string | null
  learning_image_credit_2: string | null
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
  anatomyResponseCount: number
  anatomyChoiceBreakdown: Array<{
    letter: string
    label: string
    count: number
    rate: number
    isCorrect: boolean
  }>
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

type AnatomySurveyRow = {
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
  | 'case_stats'
  | 'email_reminders'
  | 'analytics'
  | 'homepage_notes'
  | 'surveys'
  | 'submissions'
  | 'answer_choices'
  | 'feedback'
  | 'groups'
  | 'no_resident_mode'
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

type PlayModeSettingsRow = {
  no_resident_mode: boolean
  no_resident_mode_start_date: string | null
}

type ReminderStatusSummary = {
  activeSubscribers: number
  totalSubscribers: number
  isConfigured: boolean
  missingConfig: string[]
  fromEmail: string | null
  siteUrl: string
  cronSecretPresent: boolean
}

function buildAnatomyChoiceBreakdown(
  choiceSource: Array<string | null | undefined>,
  guessRows: Array<{ session_id: string; guess_text?: string | null }>,
  answer: string,
  synonyms: string[] | null | undefined
) {
  const choices = getAnatomyChoiceItems(choiceSource)

  if (choices.length < 2) {
    return {
      responseCount: 0,
      breakdown: [] as Array<{
        letter: string
        label: string
        count: number
        rate: number
        isCorrect: boolean
      }>,
    }
  }

  const correctLetters = new Set(
    getCorrectAnatomyChoiceLetters(choiceSource, answer, synonyms)
  )
  const firstGuessBySession = new Map<string, string>()

  for (const row of guessRows) {
    if (!firstGuessBySession.has(row.session_id)) {
      const guessText = typeof row.guess_text === 'string' ? row.guess_text.trim() : ''
      firstGuessBySession.set(row.session_id, guessText)
    }
  }

  const counts = choices.map(() => 0)

  for (const guessText of firstGuessBySession.values()) {
    const selectedLetters = parseAnatomyGuessLetters(guessText, choiceSource)
    if (selectedLetters.length === 0) continue
    for (const letter of selectedLetters) {
      const matchIndex = choices.findIndex(choice => choice.letter === letter)
      if (matchIndex !== -1) {
        counts[matchIndex] += 1
      }
    }
  }

  return {
    responseCount: firstGuessBySession.size,
    breakdown: choices.map((choice, index) => {
      return {
        letter: choice.letter,
        label: choice.label,
        count: counts[index] || 0,
        rate: firstGuessBySession.size > 0 ? ((counts[index] || 0) / firstGuessBySession.size) * 100 : 0,
        isCorrect: correctLetters.has(choice.letter),
      }
    }),
  }
}

const today = todayISO()
const levelOrder: Level[] = ['med_student', 'resident', 'attending']
const noResidentLevelOrder: Level[] = ['med_student', 'attending']
const ADMIN_SIDEBAR_ORDER_STORAGE_KEY = 'orthodle_admin_sidebar_order_v1'
const ADMIN_COLLAPSED_SECTIONS_STORAGE_KEY = 'orthodle_admin_collapsed_sections_v1'
const ADMIN_DRAFT_STORAGE_KEY = 'orthodle_admin_case_draft_v1'
const DEFAULT_ADMIN_SIDEBAR_ORDER: AdminSidebarSectionId[] = [
  'button_subtitles',
  'case_stats',
  'email_reminders',
  'analytics',
  'homepage_notes',
  'surveys',
  'submissions',
  'answer_choices',
  'feedback',
  'groups',
  'no_resident_mode',
  'cases_by_date',
]
const DEFAULT_IMAGE_CREDIT_TEMPLATE = 'Credit:'
const DEFAULT_TEACHING_POINT_TEMPLATE = `**<u>Who</u>**

**<u>Pathophys</u>**

**<u>Key Clues</u>**

**<u>Tx</u>**

**<u>Classic Pitfall</u>**`

type AdminCaseDraft = {
  caseDate: string
  level: Level
  contributorName: string
  category: string
  prompt: string
  answer: string
  synonyms: string
  anatomyCorrectChoices: string
  imageUrl: string
  imageCredit: string
  imageRevealClue: string
  imageUrl2: string
  imageCredit2: string
  imageRevealClue2: string
  learningImageUrl: string
  learningImageCredit: string
  learningImageUrl2: string
  learningImageCredit2: string
  clue1: string
  clue2: string
  clue3: string
  clue4: string
  clue5: string
  clue6: string
  teachingPoint: string
  activeSubmissionId: string | null
  savedAt: string
}

type CasePreviewCache = {
  savedAt: number
  case: CaseRow
}

const ADMIN_CASE_PREVIEW_CACHE_KEY = 'orthodle_admin_case_preview_v1'

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
  const [anatomyCorrectChoices, setAnatomyCorrectChoices] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [imageCredit, setImageCredit] = useState(DEFAULT_IMAGE_CREDIT_TEMPLATE)
  const [imageRevealClue, setImageRevealClue] = useState('none')
  const [imageUrl2, setImageUrl2] = useState('')
  const [imageCredit2, setImageCredit2] = useState(DEFAULT_IMAGE_CREDIT_TEMPLATE)
  const [imageRevealClue2, setImageRevealClue2] = useState('none')
  const [learningImageUrl, setLearningImageUrl] = useState('')
  const [learningImageCredit, setLearningImageCredit] = useState(DEFAULT_IMAGE_CREDIT_TEMPLATE)
  const [learningImageUrl2, setLearningImageUrl2] = useState('')
  const [learningImageCredit2, setLearningImageCredit2] = useState(DEFAULT_IMAGE_CREDIT_TEMPLATE)
  const [imagesCollapsed, setImagesCollapsed] = useState(true)
  const [clue1, setClue1] = useState('')
  const [clue2, setClue2] = useState('')
  const [clue3, setClue3] = useState('')
  const [clue4, setClue4] = useState('')
  const [clue5, setClue5] = useState('')
  const [clue6, setClue6] = useState('')
  const [teachingPoint, setTeachingPoint] = useState(DEFAULT_TEACHING_POINT_TEMPLATE)
  const [status, setStatus] = useState('')
  const [draftStatus, setDraftStatus] = useState('')
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
  const [reminderSummary, setReminderSummary] = useState<ReminderStatusSummary | null>(null)
  const [reminderStatusMessage, setReminderStatusMessage] = useState('')
  const [testReminderEmail, setTestReminderEmail] = useState('')
  const [sendingTestReminder, setSendingTestReminder] = useState(false)
  const [noResidentMode, setNoResidentMode] = useState(false)
  const [noResidentModeStartDate, setNoResidentModeStartDate] = useState(shiftISODate(today, 1))
  const [savingNoResidentMode, setSavingNoResidentMode] = useState(false)
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
  const [anatomySurveys, setAnatomySurveys] = useState<AnatomySurveyRow[]>([])
  const [anatomySurveyQuestion, setAnatomySurveyQuestion] = useState(
    'Do you like the new anatomy quiz format, or would you rather have a third case?'
  )
  const [anatomySurveyOption1, setAnatomySurveyOption1] = useState('I like the anatomy quiz')
  const [anatomySurveyOption2, setAnatomySurveyOption2] = useState('I prefer a third case')
  const [anatomySurveyOption3, setAnatomySurveyOption3] = useState('I like both')
  const [anatomySurveyStartDate, setAnatomySurveyStartDate] = useState(shiftISODate(today, 1))
  const [anatomySurveyEndDate, setAnatomySurveyEndDate] = useState(shiftISODate(today, 1))
  const [editingAnatomySurveyId, setEditingAnatomySurveyId] = useState<string | null>(null)
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

  function isNoResidentModeActiveOn(dateText: string) {
    if (!noResidentMode) return false
    const effectiveStartDate = noResidentModeStartDate || today
    return dateText >= effectiveStartDate
  }

  useEffect(() => {
    if (isNoResidentModeActiveOn(caseDate) && level === 'resident') {
      setLevel('med_student')
    }
  }, [caseDate, level, noResidentMode, noResidentModeStartDate])

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
    loadReminderSummary()
    loadHomepageAnnouncements()
    loadPlayModeSettings()
    loadHomepageSurveys()
    loadAnatomySurveys()

    if (typeof window !== 'undefined') {
      try {
        const rawDraft = window.localStorage.getItem(ADMIN_DRAFT_STORAGE_KEY)
        if (rawDraft) {
          const draft = JSON.parse(rawDraft) as Partial<AdminCaseDraft>
          if (draft.caseDate) setCaseDate(draft.caseDate)
          if (draft.level === 'med_student' || draft.level === 'resident' || draft.level === 'attending') {
            setLevel(draft.level)
          }
          setContributorName(draft.contributorName || '')
          setCategory(draft.category || '')
          setPrompt(draft.prompt || '')
          setAnswer(draft.answer || '')
          setSynonyms(draft.synonyms || '')
          setAnatomyCorrectChoices(draft.anatomyCorrectChoices || '')
          setImageUrl(draft.imageUrl || '')
          setImageCredit(draft.imageCredit || DEFAULT_IMAGE_CREDIT_TEMPLATE)
          setImageRevealClue(draft.imageRevealClue || 'none')
          setImageUrl2(draft.imageUrl2 || '')
          setImageCredit2(draft.imageCredit2 || DEFAULT_IMAGE_CREDIT_TEMPLATE)
          setImageRevealClue2(draft.imageRevealClue2 || 'none')
          setLearningImageUrl(draft.learningImageUrl || '')
          setLearningImageCredit(draft.learningImageCredit || DEFAULT_IMAGE_CREDIT_TEMPLATE)
          setLearningImageUrl2(draft.learningImageUrl2 || '')
          setLearningImageCredit2(draft.learningImageCredit2 || DEFAULT_IMAGE_CREDIT_TEMPLATE)
          setClue1(draft.clue1 || '')
          setClue2(draft.clue2 || '')
          setClue3(draft.clue3 || '')
          setClue4(draft.clue4 || '')
          setClue5(draft.clue5 || '')
          setClue6(draft.clue6 || '')
          setTeachingPoint(draft.teachingPoint || DEFAULT_TEACHING_POINT_TEMPLATE)
          setActiveSubmissionId(draft.activeSubmissionId || null)
          setDraftStatus(
            draft.savedAt
              ? `Draft restored from ${new Date(draft.savedAt).toLocaleString()}`
              : 'Draft restored.'
          )
        }
      } catch {
        window.localStorage.removeItem(ADMIN_DRAFT_STORAGE_KEY)
      }
    }
  }, [isUnlocked])

  useEffect(() => {
    if (!isUnlocked || typeof window === 'undefined') return

    const hasMeaningfulDraftContent = Boolean(
      contributorName.trim() ||
        category.trim() ||
        prompt.trim() ||
        answer.trim() ||
        synonyms.trim() ||
        anatomyCorrectChoices.trim() ||
        imageUrl.trim() ||
        normalizeCreditValue(imageCredit) ||
        imageUrl2.trim() ||
        normalizeCreditValue(imageCredit2) ||
        learningImageUrl.trim() ||
        normalizeCreditValue(learningImageCredit) ||
        learningImageUrl2.trim() ||
        normalizeCreditValue(learningImageCredit2) ||
        clue1.trim() ||
        clue2.trim() ||
        clue3.trim() ||
        clue4.trim() ||
        clue5.trim() ||
        clue6.trim() ||
        teachingPoint.trim() !== DEFAULT_TEACHING_POINT_TEMPLATE.trim() ||
        activeSubmissionId
    )

    if (!hasMeaningfulDraftContent) {
      window.localStorage.removeItem(ADMIN_DRAFT_STORAGE_KEY)
      return
    }

    const draft: AdminCaseDraft = {
      caseDate,
      level,
      contributorName,
      category,
      prompt,
      answer,
      synonyms,
      anatomyCorrectChoices,
      imageUrl,
      imageCredit,
      imageRevealClue,
      imageUrl2,
      imageCredit2,
      imageRevealClue2,
      learningImageUrl,
      learningImageCredit,
      learningImageUrl2,
      learningImageCredit2,
      clue1,
      clue2,
      clue3,
      clue4,
      clue5,
      clue6,
      teachingPoint,
      activeSubmissionId,
      savedAt: new Date().toISOString(),
    }

    window.localStorage.setItem(ADMIN_DRAFT_STORAGE_KEY, JSON.stringify(draft))
    setDraftStatus(`Draft autosaved at ${new Date(draft.savedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`)
  }, [
    isUnlocked,
    caseDate,
    level,
    contributorName,
    category,
    prompt,
    answer,
    synonyms,
    anatomyCorrectChoices,
    imageUrl,
    imageCredit,
    imageRevealClue,
    imageUrl2,
    imageCredit2,
    imageRevealClue2,
    learningImageUrl,
    learningImageCredit,
    learningImageUrl2,
    learningImageCredit2,
    clue1,
    clue2,
    clue3,
    clue4,
    clue5,
    clue6,
    teachingPoint,
    activeSubmissionId,
  ])

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
  const composerLevelOrder = useMemo<Level[]>(
    () => (isNoResidentModeActiveOn(caseDate) ? noResidentLevelOrder : levelOrder),
    [caseDate, noResidentMode, noResidentModeStartDate]
  )

  const browsedCases = useMemo(
    () => groupedCases.find(group => group.date === browseDate)?.items || [],
    [browseDate, groupedCases]
  )

  const browsedLevelOrder = useMemo<Level[]>(
    () => (browseDate && isNoResidentModeActiveOn(browseDate) ? noResidentLevelOrder : levelOrder),
    [browseDate, noResidentMode, noResidentModeStartDate]
  )

  const todaysLevelOrder = useMemo<Level[]>(
    () => (isNoResidentModeActiveOn(today) ? noResidentLevelOrder : levelOrder),
    [noResidentMode, noResidentModeStartDate]
  )

  const tomorrowsLevelOrder = useMemo<Level[]>(
    () => (isNoResidentModeActiveOn(tomorrow) ? noResidentLevelOrder : levelOrder),
    [noResidentMode, noResidentModeStartDate, tomorrow]
  )

  const previewClues = useMemo(
    () => [clue1, clue2, clue3, clue4, clue5, clue6].map(item => item.trim()).filter(Boolean),
    [clue1, clue2, clue3, clue4, clue5, clue6]
  )
  const anatomyChoiceItemsForComposer = useMemo(
    () => getAnatomyChoiceItems([clue1, clue2, clue3, clue4, clue5, clue6]),
    [clue1, clue2, clue3, clue4, clue5, clue6]
  )
  const normalizedAnatomyCorrectChoices = useMemo(
    () => parseChoiceLetterList(anatomyCorrectChoices),
    [anatomyCorrectChoices]
  )

  const duplicateAnswerMatches = useMemo(() => {
    const normalizedAnswer = normalizeAnswer(answer)
    if (!answer.trim() || !normalizedAnswer) return []

    return cases.filter(item => {
      if (!item.answer?.trim()) return false
      if (normalizeAnswer(item.answer) !== normalizedAnswer) return false
      return !(item.case_date === caseDate && item.level === level)
    })
  }, [answer, caseDate, cases, level])

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

    if (duplicateAnswerMatches.length > 0) {
      const duplicateSummary = duplicateAnswerMatches
        .slice(0, 3)
        .map(item => `${item.case_date} · ${formatLevel(item.level)}`)
        .join(', ')
      const extraCount = duplicateAnswerMatches.length - 3

      issues.push(
        `This diagnosis already exists on ${duplicateSummary}${extraCount > 0 ? `, plus ${extraCount} more` : ''}.`
      )
    }

    if (previewClues.length === 0) {
      issues.push('No clues are filled in yet.')
    }

    if (!imageUrl && imageRevealClue !== 'none') {
      issues.push('Image reveal is set, but no image is attached.')
    }

    if (imageUrl && imageRevealClue !== 'none' && imageRevealClue !== 'after') {
      const revealIndex = Number(imageRevealClue)
      const clueAtReveal = [clue1, clue2, clue3, clue4, clue5, clue6][revealIndex - 1]

      if (!clueAtReveal?.trim()) {
        issues.push(`Image reveal is tied to Clue ${revealIndex}, but that clue is empty.`)
      }
    }

    if (!imageUrl2 && imageRevealClue2 !== 'none') {
      issues.push('Second image reveal is set, but no second image is attached.')
    }

    if (imageUrl2 && imageRevealClue2 !== 'none' && imageRevealClue2 !== 'after') {
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
    duplicateAnswerMatches,
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
        .map(group => ({
          date: group.date,
          required: isNoResidentModeActiveOn(group.date) ? 2 : 3,
          ready: (isNoResidentModeActiveOn(group.date) ? noResidentLevelOrder : levelOrder).filter(levelValue =>
            group.items.some(item => item.level === levelValue)
          ).length,
        }))
        .filter(group => group.ready < group.required)
        ,
    [groupedCases, noResidentMode, noResidentModeStartDate]
  )

  function formatLevel(levelValue: Level) {
    if (levelValue === 'med_student') return 'Med Student'
    if (levelValue === 'resident') return 'Resident'
    return 'Anatomy'
  }

  function formatPercent(value: number) {
    return `${Math.round(value)}%`
  }

  function buildPreviewCase() {
    const synonymArray = synonyms
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)
    const multiSelectMetadata =
      level === 'attending'
        ? buildMultiSelectSynonymMetadata(normalizedAnatomyCorrectChoices)
        : null
    const storedSynonyms = multiSelectMetadata ? [...synonymArray, multiSelectMetadata] : synonymArray

    return {
      id: `preview-${level}-${caseDate}`,
      case_date: caseDate,
      level,
      contributor_name: null,
      category: category.trim(),
      prompt: prompt.trim(),
      answer: answer.trim(),
      synonyms: storedSynonyms,
      image_url: imageUrl.trim() || null,
      image_credit: normalizeCreditValue(imageCredit),
      image_reveal_clue:
        imageUrl.trim() && imageRevealClue !== 'none'
          ? imageRevealClue === 'after'
            ? 0
            : Number(imageRevealClue)
          : null,
      image_url_2: imageUrl2.trim() || null,
      image_credit_2: normalizeCreditValue(imageCredit2),
      image_reveal_clue_2:
        imageUrl2.trim() && imageRevealClue2 !== 'none'
          ? imageRevealClue2 === 'after'
            ? 0
            : Number(imageRevealClue2)
          : null,
      clue_1: clue1.trim() || null,
      clue_2: clue2.trim() || null,
      clue_3: clue3.trim() || null,
      clue_4: clue4.trim() || null,
      clue_5: clue5.trim() || null,
      clue_6: clue6.trim() || null,
      teaching_point: teachingPoint.trim() || null,
      learning_image_url: learningImageUrl.trim() || null,
      learning_image_credit: normalizeCreditValue(learningImageCredit),
      learning_image_url_2: learningImageUrl2.trim() || null,
      learning_image_credit_2: normalizeCreditValue(learningImageCredit2),
    } satisfies CaseRow
  }

  function openCasePreview() {
    if (typeof window === 'undefined') return

    const previewCase = buildPreviewCase()
    const payload = JSON.stringify({
      savedAt: Date.now(),
      case: previewCase,
    } satisfies CasePreviewCache)
    window.localStorage.setItem(ADMIN_CASE_PREVIEW_CACHE_KEY, payload)
    window.sessionStorage.setItem(ADMIN_CASE_PREVIEW_CACHE_KEY, payload)
    window.open(`/?preview=1&date=${previewCase.case_date}&level=${previewCase.level}`, '_blank', 'noopener,noreferrer')
  }

  function formatShortDate(dateText: string) {
    return new Date(`${dateText}T12:00:00`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
  }

  function normalizeCreditValue(value: string) {
    const trimmed = value.trim()
    if (!trimmed || trimmed === DEFAULT_IMAGE_CREDIT_TEMPLATE) return null
    return trimmed
  }

  function clueMentionsShownAbove(value: string) {
    return value.toLowerCase().includes('shown above')
  }

  function firstShownAboveClueIndex(clues: string[]) {
    const index = clues.findIndex(clueMentionsShownAbove)
    return index >= 0 ? index + 1 : null
  }

  function secondShownAboveClueIndex(clues: string[]) {
    const indices = clues
      .map((clue, index) => (clueMentionsShownAbove(clue) ? index + 1 : null))
      .filter((value): value is number => value !== null)
    return indices[1] ?? null
  }

  function syncImageRevealFromClues(
    nextClues: string[],
    options?: { hasImage1?: boolean; hasImage2?: boolean }
  ) {
    if (level === 'attending') return

    const firstIndex = firstShownAboveClueIndex(nextClues)
    const secondIndex = secondShownAboveClueIndex(nextClues)
    const hasImage1 = options?.hasImage1 ?? Boolean(imageUrl)
    const hasImage2 = options?.hasImage2 ?? Boolean(imageUrl2)

    if (hasImage1 && imageRevealClue === 'none' && firstIndex !== null) {
      setImageRevealClue(String(firstIndex))
    }

    if (hasImage2 && imageRevealClue2 === 'none') {
      const linkedIndex = secondIndex ?? (hasImage1 && imageRevealClue !== 'none' ? null : firstIndex)
      if (linkedIndex !== null) {
        setImageRevealClue2(String(linkedIndex))
      }
    }
  }

  function updateClueAt(index: number, value: string) {
    const nextClues = [clue1, clue2, clue3, clue4, clue5, clue6]
    nextClues[index] = value

    setClue1(nextClues[0])
    setClue2(nextClues[1])
    setClue3(nextClues[2])
    setClue4(nextClues[3])
    setClue5(nextClues[4])
    setClue6(nextClues[5])

    syncImageRevealFromClues(nextClues)
  }

  function normalizeImageRevealValueForEditor(value: number | null | undefined) {
    if (value === 0) return 'after'
    if (value && value >= 1 && value <= 6) return String(value)
    return 'none'
  }

  function wrapTeachingPointSelection(format: 'bold' | 'italic' | 'underline') {
    const textarea = teachingPointRef.current
    if (!textarea) return

    const markers =
      format === 'bold'
        ? { open: '**', close: '**' }
        : format === 'italic'
          ? { open: '*', close: '*' }
          : { open: '<u>', close: '</u>' }

    const selectionStart = textarea.selectionStart
    const selectionEnd = textarea.selectionEnd
    const selectedText = teachingPoint.slice(selectionStart, selectionEnd)
    const wrapped = `${markers.open}${selectedText || 'text'}${markers.close}`
    const nextValue =
      teachingPoint.slice(0, selectionStart) +
      wrapped +
      teachingPoint.slice(selectionEnd)

    setTeachingPoint(nextValue)

    requestAnimationFrame(() => {
      textarea.focus()
      const start = selectionStart + markers.open.length
      const end = start + (selectedText || 'text').length
      textarea.setSelectionRange(start, end)
    })
  }

  function insertTeachingPointLink() {
    const textarea = teachingPointRef.current
    if (!textarea) return

    const url = window.prompt('Paste the reference URL')
    if (!url) return

    const trimmedUrl = url.trim()
    if (!/^https?:\/\//i.test(trimmedUrl)) {
      setStatus('Links need to start with http:// or https://')
      return
    }

    const selectionStart = textarea.selectionStart
    const selectionEnd = textarea.selectionEnd
    const selectedText = teachingPoint.slice(selectionStart, selectionEnd).trim() || 'Link to reference'
    const inserted = `[${selectedText}](${trimmedUrl})`
    const nextValue =
      teachingPoint.slice(0, selectionStart) +
      inserted +
      teachingPoint.slice(selectionEnd)

    setTeachingPoint(nextValue)
    setStatus('Reference link inserted.')

    requestAnimationFrame(() => {
      textarea.focus()
      const nextCaret = selectionStart + inserted.length
      textarea.setSelectionRange(nextCaret, nextCaret)
    })
  }

  function handleTeachingPointKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!(event.metaKey || event.ctrlKey)) return

    const key = event.key.toLowerCase()
    if (key === 'b') {
      event.preventDefault()
      wrapTeachingPointSelection('bold')
    }

    if (key === 'i') {
      event.preventDefault()
      wrapTeachingPointSelection('italic')
    }

    if (key === 'u') {
      event.preventDefault()
      wrapTeachingPointSelection('underline')
    }
  }

  function nextMissingLevelForDate(dateText: string): Level | null {
    const items = groupedCases.find(group => group.date === dateText)?.items || []
    const requiredLevels = isNoResidentModeActiveOn(dateText) ? noResidentLevelOrder : levelOrder
    return requiredLevels.find(levelValue => !items.some(item => item.level === levelValue)) || null
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
    setAnatomyCorrectChoices('')
    setImageUrl('')
    setImageCredit(DEFAULT_IMAGE_CREDIT_TEMPLATE)
    setImageRevealClue('none')
    setImageUrl2('')
    setImageCredit2(DEFAULT_IMAGE_CREDIT_TEMPLATE)
    setImageRevealClue2('none')
    setLearningImageUrl('')
    setLearningImageCredit(DEFAULT_IMAGE_CREDIT_TEMPLATE)
    setLearningImageUrl2('')
    setLearningImageCredit2(DEFAULT_IMAGE_CREDIT_TEMPLATE)
    setClue1('')
    setClue2('')
    setClue3('')
    setClue4('')
    setClue5('')
    setClue6('')
    setTeachingPoint(DEFAULT_TEACHING_POINT_TEMPLATE)
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
    setAnatomyCorrectChoices('')
    setImageUrl('')
    setImageCredit(DEFAULT_IMAGE_CREDIT_TEMPLATE)
    setImageRevealClue('none')
    setImageUrl2('')
    setImageCredit2(DEFAULT_IMAGE_CREDIT_TEMPLATE)
    setImageRevealClue2('none')
    setLearningImageUrl('')
    setLearningImageCredit(DEFAULT_IMAGE_CREDIT_TEMPLATE)
    setLearningImageUrl2('')
    setLearningImageCredit2(DEFAULT_IMAGE_CREDIT_TEMPLATE)
    setClue1('')
    setClue2('')
    setClue3('')
    setClue4('')
    setClue5('')
    setClue6('')
    setTeachingPoint(DEFAULT_TEACHING_POINT_TEMPLATE)
    setActiveSubmissionId(null)
    setStatus('')
    setDraftStatus('Draft cleared.')
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(ADMIN_DRAFT_STORAGE_KEY)
    }
  }

  function editCase(c: CaseRow) {
    setCaseDate(c.case_date)
    setLevel(c.level)
    setContributorName(c.contributor_name || '')
    setCategory(c.category || '')
    setPrompt(c.prompt || '')
    setAnswer(c.answer || '')
    setSynonyms(extractPlainSynonyms(c.synonyms || []).join(', '))
    setAnatomyCorrectChoices(getCorrectAnatomyChoiceLetters(
      [c.clue_1, c.clue_2, c.clue_3, c.clue_4, c.clue_5, c.clue_6],
      c.answer || '',
      c.synonyms || []
    ).join(', '))
    setImageUrl(c.image_url || '')
    setImageCredit(c.image_credit || DEFAULT_IMAGE_CREDIT_TEMPLATE)
    setImageRevealClue(normalizeImageRevealValueForEditor(c.image_reveal_clue))
    setImageUrl2(c.image_url_2 || '')
    setImageCredit2(c.image_credit_2 || DEFAULT_IMAGE_CREDIT_TEMPLATE)
    setImageRevealClue2(normalizeImageRevealValueForEditor(c.image_reveal_clue_2))
    setLearningImageUrl(c.learning_image_url || '')
    setLearningImageCredit(c.learning_image_credit || DEFAULT_IMAGE_CREDIT_TEMPLATE)
    setLearningImageUrl2(c.learning_image_url_2 || '')
    setLearningImageCredit(c.learning_image_credit_2 || DEFAULT_IMAGE_CREDIT_TEMPLATE)
    setClue1(c.clue_1 || '')
    setClue2(c.clue_2 || '')
    setClue3(c.clue_3 || '')
    setClue4(c.clue_4 || '')
    setClue5(c.clue_5 || '')
    setClue6(c.clue_6 || '')
    setTeachingPoint(c.teaching_point || DEFAULT_TEACHING_POINT_TEMPLATE)
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
    setSynonyms(extractPlainSynonyms(submission.synonyms || []).join(', '))
    setAnatomyCorrectChoices(getCorrectAnatomyChoiceLetters(
      [submission.clue_1, submission.clue_2, submission.clue_3, submission.clue_4, submission.clue_5, submission.clue_6],
      submission.answer || '',
      submission.synonyms || []
    ).join(', '))
    setImageUrl(submission.image_url || '')
    setImageCredit(submission.image_credit || DEFAULT_IMAGE_CREDIT_TEMPLATE)
    setImageRevealClue(normalizeImageRevealValueForEditor(submission.image_reveal_clue))
    setImageUrl2(submission.image_url_2 || '')
    setImageCredit2(submission.image_credit_2 || DEFAULT_IMAGE_CREDIT_TEMPLATE)
    setImageRevealClue2(normalizeImageRevealValueForEditor(submission.image_reveal_clue_2))
    setLearningImageUrl(submission.learning_image_url || '')
    setLearningImageCredit(submission.learning_image_credit || DEFAULT_IMAGE_CREDIT_TEMPLATE)
    setLearningImageUrl2(submission.learning_image_url_2 || '')
    setLearningImageCredit2(submission.learning_image_credit_2 || DEFAULT_IMAGE_CREDIT_TEMPLATE)
    setClue1(submission.clue_1 || '')
    setClue2(submission.clue_2 || '')
    setClue3(submission.clue_3 || '')
    setClue4(submission.clue_4 || '')
    setClue5(submission.clue_5 || '')
    setClue6(submission.clue_6 || '')
    setTeachingPoint(submission.teaching_point || DEFAULT_TEACHING_POINT_TEMPLATE)
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
    const excludedSessionIdSet = new Set(await fetchExcludedStatsSessionIds())
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

    const visits = filterExcludedSessionRows(visitPages, excludedSessionIdSet)
    const guesses = filterExcludedSessionRows(guessPages, excludedSessionIdSet)

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
    const excludedSessionIdSet = new Set(await fetchExcludedStatsSessionIds())
    const { data, error } = await supabase
      .from('case_feedback')
      .select('created_at, session_id')
      .order('created_at', { ascending: false })
      .limit(5000)

    if (error) return

    const visibleRows = filterExcludedSessionRows(data || [], excludedSessionIdSet)
    const latestCreatedAt = visibleRows[0]?.created_at || null
    const seenAt = window.localStorage.getItem('orthodle_seen_feedback_at')
    setFeedbackSummary({
      total: visibleRows.length,
      hasNew: Boolean(latestCreatedAt && latestCreatedAt !== seenAt),
      latestCreatedAt,
    })
  }

  async function loadReminderSummary() {
    try {
      const response = await fetch('/api/reminders/status', { cache: 'no-store' })
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        setReminderStatusMessage(data.error || 'Could not load reminder status.')
        return
      }

      setReminderSummary(data as ReminderStatusSummary)
      setReminderStatusMessage('')
    } catch {
      setReminderStatusMessage('Could not load reminder status.')
    }
  }

  async function sendTestReminderEmail() {
    const email = testReminderEmail.trim()
    if (!email) {
      setReminderStatusMessage('Enter a test email address first.')
      return
    }

    const adminPassword = window.sessionStorage.getItem('orthodle_admin_password') || ''
    setSendingTestReminder(true)
    setReminderStatusMessage('')

    try {
      const response = await fetch('/api/reminders/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password: adminPassword,
        }),
      })
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        setReminderStatusMessage(data.error || 'Could not send the test reminder email.')
        return
      }

      setReminderStatusMessage(data.message || 'Test reminder sent.')
    } catch {
      setReminderStatusMessage('Could not send the test reminder email.')
    } finally {
      setSendingTestReminder(false)
    }
  }

  async function loadHomepageAnnouncements() {
    const { data } = await supabase
      .from('homepage_announcements')
      .select('id, message, start_date, end_date, created_at')
      .order('start_date', { ascending: false })
    setHomepageAnnouncements((data as HomepageAnnouncementRow[] | null) || [])
  }

  async function loadPlayModeSettings() {
    const { data } = await supabase
      .from('play_mode_settings')
      .select('no_resident_mode, no_resident_mode_start_date')
      .eq('id', 'default')
      .maybeSingle()

    const row = (data as PlayModeSettingsRow | null) || null
    setNoResidentMode(Boolean(row?.no_resident_mode))
    setNoResidentModeStartDate(row?.no_resident_mode_start_date || shiftISODate(today, 1))
  }

  async function saveNoResidentModeSchedule(enabled: boolean) {
    setSavingNoResidentMode(true)

    const { error } = await supabase.from('play_mode_settings').upsert(
      {
        id: 'default',
        no_resident_mode: enabled,
        no_resident_mode_start_date: enabled ? noResidentModeStartDate : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    )

    if (error) {
      setStatus(
        error.message.includes('relation') || error.message.includes('does not exist')
          ? 'Play mode settings are not set up yet. Run the SQL once, then try again.'
          : `Could not save play mode: ${error.message}`
      )
      setSavingNoResidentMode(false)
      return
    }

    setNoResidentMode(enabled)
    if (enabled && isNoResidentModeActiveOn(caseDate) && level === 'resident') {
      setLevel('med_student')
    }
    setStatus(
      enabled
        ? `No resident mode will start on ${noResidentModeStartDate || shiftISODate(today, 1)}.`
        : 'Resident case mode restored.'
    )
    setSavingNoResidentMode(false)
  }

  async function loadHomepageSurveys() {
    const excludedSessionIdSet = new Set(await fetchExcludedStatsSessionIds())
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
      .select('survey_id, response, session_id')
      .in('survey_id', surveyIds)

    const countsBySurvey = new Map<string, Record<string, number>>()

    for (const survey of surveys) {
      countsBySurvey.set(survey.id, {
        [survey.option_1]: 0,
        [survey.option_2]: 0,
        [survey.option_3]: 0,
      })
    }

    for (const row of filterExcludedSessionRows(responseData || [], excludedSessionIdSet)) {
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

  async function loadAnatomySurveys() {
    const excludedSessionIdSet = new Set(await fetchExcludedStatsSessionIds())
    const { data, error } = await supabase
      .from('anatomy_case_surveys')
      .select('id, question, option_1, option_2, option_3, start_date, end_date, created_at')
      .order('start_date', { ascending: false })

    if (error) {
      setStatus(
        error.message.includes('relation') || error.message.includes('does not exist')
          ? 'Anatomy surveys are not set up yet. Run the new SQL once, then try again.'
          : `Could not load anatomy surveys: ${error.message}`
      )
      return
    }

    const surveys = (data as AnatomySurveyRow[] | null) || []
    if (surveys.length === 0) {
      setAnatomySurveys([])
      return
    }

    const surveyIds = surveys.map(item => item.id)
    const { data: responseData } = await supabase
      .from('anatomy_case_survey_responses')
      .select('survey_id, response, session_id')
      .in('survey_id', surveyIds)

    const countsBySurvey = new Map<string, Record<string, number>>()

    for (const survey of surveys) {
      countsBySurvey.set(survey.id, {
        [survey.option_1]: 0,
        [survey.option_2]: 0,
        [survey.option_3]: 0,
      })
    }

    for (const row of filterExcludedSessionRows(responseData || [], excludedSessionIdSet)) {
      const existing = countsBySurvey.get(row.survey_id)
      if (!existing) continue
      existing[row.response] = (existing[row.response] || 0) + 1
    }

    setAnatomySurveys(
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

  function resetAnatomySurveyForm() {
    setEditingAnatomySurveyId(null)
    setAnatomySurveyQuestion('Do you like the new anatomy quiz format, or would you rather have a third case?')
    setAnatomySurveyOption1('I like the anatomy quiz')
    setAnatomySurveyOption2('I prefer a third case')
    setAnatomySurveyOption3('I like both')
    setAnatomySurveyStartDate(tomorrow)
    setAnatomySurveyEndDate(tomorrow)
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

  async function saveAnatomySurvey() {
    const question = anatomySurveyQuestion.trim()
    const option1 = anatomySurveyOption1.trim()
    const option2 = anatomySurveyOption2.trim()
    const option3 = anatomySurveyOption3.trim()

    if (!question || !option1 || !option2 || !option3) {
      setStatus('Add an anatomy survey question and all three answer choices before saving.')
      return
    }

    const payload = {
      question,
      option_1: option1,
      option_2: option2,
      option_3: option3,
      start_date: anatomySurveyStartDate,
      end_date: anatomySurveyEndDate || null,
    }

    const result = editingAnatomySurveyId
      ? await supabase.from('anatomy_case_surveys').update(payload).eq('id', editingAnatomySurveyId)
      : await supabase.from('anatomy_case_surveys').insert(payload)

    if (result.error) {
      setStatus(
        result.error.message.includes('relation') || result.error.message.includes('does not exist')
          ? 'Anatomy surveys are not set up yet. Run the new SQL once, then try again.'
          : `Could not save the anatomy survey: ${result.error.message}`
      )
      return
    }

    setStatus(editingAnatomySurveyId ? 'Anatomy survey updated.' : 'Anatomy survey scheduled.')
    resetAnatomySurveyForm()
    await loadAnatomySurveys()
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

  function editAnatomySurvey(item: AnatomySurveyRow) {
    setEditingAnatomySurveyId(item.id)
    setAnatomySurveyQuestion(item.question)
    setAnatomySurveyOption1(item.option_1)
    setAnatomySurveyOption2(item.option_2)
    setAnatomySurveyOption3(item.option_3)
    setAnatomySurveyStartDate(item.start_date)
    setAnatomySurveyEndDate(item.end_date || item.start_date)
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

  async function deleteAnatomySurvey(id: string) {
    const { error } = await supabase.from('anatomy_case_surveys').delete().eq('id', id)

    if (error) {
      setStatus(
        error.message.includes('relation') || error.message.includes('does not exist')
          ? 'Anatomy surveys are not set up yet. Run the new SQL once, then try again.'
          : `Could not delete the anatomy survey: ${error.message}`
      )
      return
    }

    if (editingAnatomySurveyId === id) {
      resetAnatomySurveyForm()
    }

    setStatus('Anatomy survey deleted.')
    setAnatomySurveys(prev => prev.filter(item => item.id !== id))
  }

  async function loadCaseCommunityStats() {
    const excludedSessionIdSet = new Set(await fetchExcludedStatsSessionIds())
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

    const publicVisitRows = filterExcludedSessionRows(visitRows || [], excludedSessionIdSet)
    const publicGuessRows = filterExcludedSessionRows(guessRows || [], excludedSessionIdSet)

    const players = new Set<string>([
      ...publicVisitRows.map(item => item.session_id),
      ...publicGuessRows.map(item => item.session_id),
    ])

    const guessesBySession = new Map<
      string,
      Array<{ is_correct: boolean; created_at: string }>
    >()

    for (const guessRow of publicGuessRows) {
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

    for (const guessRow of publicGuessRows) {
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

    const anatomyChoiceStats =
      matchingCase.level === 'attending'
        ? buildAnatomyChoiceBreakdown(
            [
              matchingCase.clue_1,
              matchingCase.clue_2,
              matchingCase.clue_3,
              matchingCase.clue_4,
              matchingCase.clue_5,
              matchingCase.clue_6,
            ],
            publicGuessRows,
            matchingCase.answer,
            matchingCase.synonyms || []
          )
        : { responseCount: 0, breakdown: [] }

    setCaseCommunityStats({
      players: players.size,
      totalGuesses: publicGuessRows.length,
      totalCorrectGuesses: publicGuessRows.filter(item => item.is_correct).length,
      solveRate: players.size > 0 ? (solvedPlayers / players.size) * 100 : null,
      averageGuessesPerPlayer:
        players.size > 0 ? publicGuessRows.length / players.size : null,
      averageGuessesToSolve:
        solvedPlayers > 0 ? totalGuessesBeforeSolve / solvedPlayers : null,
      firstTrySolveRate:
        solvedPlayers > 0 ? (firstTrySolves / solvedPlayers) * 100 : null,
      mostCommonSolveClue,
      mostCommonIncorrectGuesses,
      anatomyResponseCount: anatomyChoiceStats.responseCount,
      anatomyChoiceBreakdown: anatomyChoiceStats.breakdown,
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
    const invalidAnatomyLetters = normalizedAnatomyCorrectChoices.filter(
      letter => !anatomyChoiceItemsForComposer.some(choice => choice.letter === letter)
    )

    if (level === 'attending' && invalidAnatomyLetters.length > 0) {
      setStatus(`Correct choices include invalid letters: ${invalidAnatomyLetters.join(', ')}.`)
      return
    }

    const multiSelectMetadata =
      level === 'attending'
        ? buildMultiSelectSynonymMetadata(normalizedAnatomyCorrectChoices)
        : null
    const storedSynonyms = multiSelectMetadata ? [...synonymArray, multiSelectMetadata] : synonymArray

    const savedImageCredit = normalizeCreditValue(imageCredit)
    const savedImageCredit2 = normalizeCreditValue(imageCredit2)
    const savedLearningImageCredit = normalizeCreditValue(learningImageCredit)
    const savedLearningImageCredit2 = normalizeCreditValue(learningImageCredit2)

    const parsedImageRevealClue =
      imageUrl && imageRevealClue !== 'none'
        ? imageRevealClue === 'after'
          ? 0
          : Number(imageRevealClue)
        : null
    const parsedImageRevealClue2 =
      imageUrl2 && imageRevealClue2 !== 'none'
        ? imageRevealClue2 === 'after'
          ? 0
          : Number(imageRevealClue2)
        : null

    const { error } = await supabase.from('cases').upsert(
      {
        case_date: caseDate,
        level,
        contributor_name: null,
        category,
        prompt,
        answer,
        synonyms: storedSynonyms,
        image_url: imageUrl || null,
        image_credit: savedImageCredit,
        image_reveal_clue: parsedImageRevealClue,
        image_url_2: imageUrl2 || null,
        image_credit_2: savedImageCredit2,
        image_reveal_clue_2: parsedImageRevealClue2,
        learning_image_url: learningImageUrl || null,
        learning_image_credit: savedLearningImageCredit,
        learning_image_url_2: learningImageUrl2 || null,
        learning_image_credit_2: savedLearningImageCredit2,
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

    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(ADMIN_DRAFT_STORAGE_KEY)
    }
    setDraftStatus('Draft cleared after save.')
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
    case_stats: (
      <section className="card rounded-2xl border border-[#e7e1d6] bg-white p-3.5 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
        <Link href="/admin/case-stats" className="font-serif text-xl font-bold transition hover:text-[#1f6448]">
          Case Stats
        </Link>
      </section>
    ),
    email_reminders: (
      <section className="card rounded-2xl border border-[#e7e1d6] bg-white p-3.5 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-xl font-bold">Email Reminders</h2>
          </div>
          <button
            type="button"
            onClick={() => void loadReminderSummary()}
            className="rounded-full border border-[#ded7ca] bg-[#fbfaf7] px-3 py-1.5 text-[10px] font-semibold text-[#637268] transition hover:bg-white"
          >
            Refresh
          </button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-[#ded7ca] bg-[#fcfbf8] px-3 py-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#637268]">
              Active
            </div>
            <div className="mt-1 font-serif text-xl font-bold text-[#102018]">
              {reminderSummary?.activeSubscribers ?? '—'}
            </div>
          </div>
          <div className="rounded-xl border border-[#ded7ca] bg-[#fcfbf8] px-3 py-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#637268]">
              Total
            </div>
            <div className="mt-1 font-serif text-xl font-bold text-[#102018]">
              {reminderSummary?.totalSubscribers ?? '—'}
            </div>
          </div>
        </div>

        <div className={`mt-3 rounded-2xl border px-3.5 py-3 ${
          reminderSummary?.isConfigured
            ? 'border-[#cfded4] bg-[#f7fbf8]'
            : 'border-[#ead9b7] bg-[#fffaf1]'
        }`}>
          <p className="mt-1 text-[12px] leading-5 text-[#637268]">
            {reminderSummary?.isConfigured
              ? `Using ${reminderSummary.fromEmail || 'your sender email'} and ${reminderSummary.siteUrl}.`
              : reminderSummary?.missingConfig?.length
                ? `Missing: ${reminderSummary.missingConfig.join(', ')}`
                : 'Loading reminder configuration.'}
          </p>
        </div>

        <div className="mt-3 space-y-2">
          <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-[#637268]">
            Test email
            <input
              type="email"
              value={testReminderEmail}
              onChange={event => setTestReminderEmail(event.target.value)}
              placeholder="you@example.com"
              className="rounded-xl border border-[#ded7ca] bg-[#fcfbf8] px-3 py-2 text-sm font-normal normal-case tracking-normal text-[#102018] outline-none transition focus:border-[#1f6448] focus:ring-2 focus:ring-[#1f6448]/15"
            />
          </label>
          <button
            type="button"
            onClick={() => void sendTestReminderEmail()}
            disabled={sendingTestReminder}
            className="rounded-full border border-[#1f6448] bg-[#1f6448] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#174c37] disabled:opacity-60"
          >
            {sendingTestReminder ? 'Sending...' : 'Send test email'}
          </button>
          {reminderStatusMessage && (
            <p className="text-sm text-[#637268]">{reminderStatusMessage}</p>
          )}
        </div>
      </section>
    ),
    no_resident_mode: (
      <section className="card rounded-2xl border border-[#e7e1d6] bg-white p-3.5 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
        <h2 className="font-serif text-xl font-bold">No resident mode</h2>

        <div className="mt-3 grid gap-2.5">
          <label className="grid gap-2 text-sm font-semibold text-[#637268]">
            Start date
            <input
              type="date"
              value={noResidentModeStartDate}
              onChange={event => setNoResidentModeStartDate(event.target.value)}
              className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
            />
          </label>

          <button
            type="button"
            onClick={() => void saveNoResidentModeSchedule(true)}
            disabled={savingNoResidentMode || !noResidentModeStartDate}
            className="rounded-full border border-[#1f6448] bg-[#1f6448] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#174c37] disabled:opacity-60"
          >
            {savingNoResidentMode
              ? 'Saving...'
              : noResidentMode
                ? 'Update no resident schedule'
                : 'Schedule no resident mode'}
          </button>

          <button
            type="button"
            onClick={() => void saveNoResidentModeSchedule(false)}
            disabled={savingNoResidentMode || !noResidentMode}
            className="rounded-full border border-[#ded7ca] bg-[#fbfaf7] px-4 py-2 text-sm font-semibold text-[#102018] transition hover:bg-white disabled:opacity-60"
          >
            Turn off
          </button>
        </div>
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
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-serif text-xl font-bold">Surveys</h2>
            <div className="rounded-full border border-[#ded7ca] bg-[#fbfaf7] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#637268]">
              Dedicated page
            </div>
          </div>
          <Link
            href="/admin/surveys"
            className="inline-flex h-10 items-center justify-center rounded-full border border-[#1f6448] bg-[#1f6448] px-4 text-sm font-semibold text-white transition hover:bg-[#174c37]"
          >
            Open survey manager
          </Link>
        </div>
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
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/admin/groups"
            className="rounded-lg bg-[#1f6448] px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-[#174c37]"
          >
            Open groups admin
          </Link>
          <Link
            href="/admin/groups-stats"
            className="rounded-lg border border-[#ded7ca] px-3 py-1.5 text-sm font-semibold text-[#102018] transition hover:bg-[#fbfaf7]"
          >
            View stats
          </Link>
        </div>
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
                      {browsedLevelOrder.filter(levelValue => browsedCases.some(item => item.level === levelValue)).length}/{browsedLevelOrder.length} ready
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2">
                    {browsedLevelOrder.map(levelValue => {
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

      <div className="mx-auto max-w-6xl px-3 py-4 sm:px-6 sm:py-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div>
            <h1 className="font-serif text-[30px] font-bold leading-none text-[#102018] sm:text-3xl">
              Admin Dashboard
            </h1>

            {incompleteDates.length > 0 && (
              <div className="mt-2.5 rounded-xl border border-[#ead9b7] bg-[#fffaf1] px-3 py-2 text-sm leading-5 text-[#8a5a2b]">
                Missing cases on {incompleteDates.map(item => `${item.date} (${item.ready}/${item.required})`).join(', ')}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={lockAdmin}
            className="self-start rounded-lg border border-[#ded7ca] px-3 py-1.5 text-sm font-semibold text-[#102018] transition hover:bg-white"
          >
            Lock
          </button>
        </div>

        <section className="night-surface mt-3 rounded-2xl border border-[#e7e1d6] bg-white p-3 shadow-[0_10px_24px_rgba(16,32,24,0.04)] sm:p-3.5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#637268]">
                Today overview
              </div>
            </div>

            <div className="rounded-full border border-[#ded7ca] bg-[#fbfaf7] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#637268]">
              {todaysLevelOrder.filter(levelValue => todaysCases.some(item => item.level === levelValue)).length}/{todaysLevelOrder.length} ready
            </div>
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-3">
            {todaysLevelOrder.map(levelValue => {
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
              {tomorrowsLevelOrder.filter(levelValue => tomorrowsCases.some(item => item.level === levelValue)).length}/{tomorrowsLevelOrder.length} ready
            </div>
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-3">
            {tomorrowsLevelOrder.map(levelValue => {
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
                  onChange={e => {
                    const nextLevel = e.target.value as Level
                    setLevel(nextLevel)
                    if (nextLevel === 'attending' && !category.trim()) {
                      setCategory('Surgical Anatomy')
                    }
                  }}
                  className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                >
                  <option value="med_student">Med Student</option>
                  {!isNoResidentModeActiveOn(caseDate) ? <option value="resident">Resident</option> : null}
                  <option value="attending">Anatomy (attending slot)</option>
                </select>
              </label>
              </div>

              <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                Category
                <input
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  placeholder={level === 'attending' ? 'Surgical Anatomy' : 'Wrist / nerve'}
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
                {duplicateAnswerMatches.length > 0 && (
                  <div className="rounded-lg border border-[#ead9b7] bg-[#fffaf1] px-3 py-2.5 text-xs font-normal text-[#8a5a2b]">
                    <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8a5a2b]">
                      Existing diagnosis match
                    </div>
                    <div className="mt-1 space-y-1">
                      {duplicateAnswerMatches.slice(0, 4).map(match => (
                        <p key={match.id}>
                          {match.case_date} · {formatLevel(match.level)}
                        </p>
                      ))}
                      {duplicateAnswerMatches.length > 4 && (
                        <p>Plus {duplicateAnswerMatches.length - 4} more saved cases.</p>
                      )}
                    </div>
                  </div>
                )}
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

              {level === 'attending' ? (
                <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                  Correct Choices
                  <input
                    value={anatomyCorrectChoices}
                    onChange={e => setAnatomyCorrectChoices(e.target.value)}
                    placeholder="A, B, C"
                    className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                  />
                </label>
              ) : null}

              <div className="rounded-xl border border-[#ebe5db] bg-[#fcfbf8] p-3">
                <button
                  type="button"
                  onClick={() => setImagesCollapsed(current => !current)}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#637268]">
                    Images
                  </div>
                  <div className="rounded-full border border-[#ded7ca] bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#637268]">
                    {imagesCollapsed ? 'Expand' : 'Collapse'}
                  </div>
                </button>

                {!imagesCollapsed && (
                  <div className="mt-3 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-2.5">
                    <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                      Image 1 URL
                      <input
                        value={imageUrl}
                        onChange={e => {
                          const nextValue = e.target.value
                          setImageUrl(nextValue)
                          if (nextValue && imageRevealClue === 'none') {
                            syncImageRevealFromClues(
                              [clue1, clue2, clue3, clue4, clue5, clue6],
                              { hasImage1: true }
                            )
                          }
                        }}
                        placeholder="Paste a hosted x-ray or image URL"
                        className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                      {level === 'attending' ? 'Image 1 Timing' : 'Image 1 Reveal'}
                      <select
                        value={imageRevealClue}
                        onChange={e => setImageRevealClue(e.target.value)}
                        className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                      >
                        {level === 'attending' ? (
                          <>
                            <option value="none">Show before answer</option>
                            <option value="after">Reveal after answer</option>
                          </>
                        ) : (
                          <>
                            <option value="none">Show immediately</option>
                            <option value="1">Reveal with Clue 1</option>
                            <option value="2">Reveal with Clue 2</option>
                            <option value="3">Reveal with Clue 3</option>
                            <option value="4">Reveal with Clue 4</option>
                            <option value="5">Reveal with Clue 5</option>
                            <option value="6">Reveal with Clue 6</option>
                          </>
                        )}
                      </select>
                    </label>
                    <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                      Image 1 Credit
                      <input
                        value={imageCredit}
                        onChange={e => setImageCredit(e.target.value)}
                        placeholder={DEFAULT_IMAGE_CREDIT_TEMPLATE}
                        className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                      />
                    </label>
                  </div>

                  <div className="grid gap-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div />
                      {imageUrl2 && (
                        <button
                          type="button"
                          onClick={() => {
                            setImageUrl2('')
                            setImageCredit2(DEFAULT_IMAGE_CREDIT_TEMPLATE)
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
                        onChange={e => {
                          const nextValue = e.target.value
                          setImageUrl2(nextValue)
                          if (nextValue && imageRevealClue2 === 'none') {
                            syncImageRevealFromClues(
                              [clue1, clue2, clue3, clue4, clue5, clue6],
                              { hasImage2: true }
                            )
                          }
                        }}
                        placeholder="Optional second hosted image URL"
                        className="min-w-0 flex-1 rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                      {level === 'attending' ? 'Image 2 Timing' : 'Image 2 Reveal'}
                      <select
                        value={imageRevealClue2}
                        onChange={e => setImageRevealClue2(e.target.value)}
                        className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                      >
                        {level === 'attending' ? (
                          <>
                            <option value="none">Show before answer</option>
                            <option value="after">Reveal after answer</option>
                          </>
                        ) : (
                          <>
                            <option value="none">Show immediately</option>
                            <option value="1">Reveal with Clue 1</option>
                            <option value="2">Reveal with Clue 2</option>
                            <option value="3">Reveal with Clue 3</option>
                            <option value="4">Reveal with Clue 4</option>
                            <option value="5">Reveal with Clue 5</option>
                            <option value="6">Reveal with Clue 6</option>
                          </>
                        )}
                      </select>
                    </label>
                    <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                      Image 2 Credit
                      <input
                        value={imageCredit2}
                        onChange={e => setImageCredit2(e.target.value)}
                        placeholder={DEFAULT_IMAGE_CREDIT_TEMPLATE}
                        className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                      />
                    </label>
                  </div>
                </div>

              {level === 'attending' && (
                <div className="rounded-xl border border-[#ebe5db] bg-[#fcfbf8] p-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-2.5">
                      <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                        Teaching Image 1 URL
                        <input
                          value={learningImageUrl}
                          onChange={e => setLearningImageUrl(e.target.value)}
                          placeholder="Optional hosted anatomy reference image"
                          className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                        />
                      </label>
                      <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                        Teaching Image 1 Credit
                        <input
                          value={learningImageCredit}
                          onChange={e => setLearningImageCredit(e.target.value)}
                          placeholder={DEFAULT_IMAGE_CREDIT_TEMPLATE}
                          className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                        />
                      </label>
                    </div>

                    <div className="grid gap-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div />
                        {learningImageUrl2 && (
                          <button
                            type="button"
                            onClick={() => {
                              setLearningImageUrl2('')
                              setLearningImageCredit2(DEFAULT_IMAGE_CREDIT_TEMPLATE)
                            }}
                            className="rounded-lg border border-[#ead9b7] px-2.5 py-1 text-[11px] font-semibold text-[#a24d24] transition hover:bg-[#fff8ef]"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                        Teaching Image 2 URL
                        <input
                          value={learningImageUrl2}
                          onChange={e => setLearningImageUrl2(e.target.value)}
                          placeholder="Optional second teaching image"
                          className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                        />
                      </label>
                      <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                        Teaching Image 2 Credit
                        <input
                          value={learningImageCredit2}
                          onChange={e => setLearningImageCredit2(e.target.value)}
                          placeholder={DEFAULT_IMAGE_CREDIT_TEMPLATE}
                          className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                        />
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {imageUrl && (
                <div className="rounded-lg border border-[#ded7ca] p-2.5">
                  <img
                    src={imageUrl}
                    alt="Uploaded case"
                    className="max-h-48 rounded-lg object-contain"
                  />
                  {normalizeCreditValue(imageCredit) && (
                    <p className="mt-1 text-[11px] text-[#8a948d]">{normalizeCreditValue(imageCredit)}</p>
                  )}
                  <button
                    onClick={() => {
                      setImageUrl('')
                      setImageCredit(DEFAULT_IMAGE_CREDIT_TEMPLATE)
                      setImageRevealClue('none')
                    }}
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
                  {normalizeCreditValue(imageCredit2) && (
                    <p className="mt-1 text-[11px] text-[#8a948d]">{normalizeCreditValue(imageCredit2)}</p>
                  )}
                  <button
                    onClick={() => {
                      setImageUrl2('')
                      setImageCredit2(DEFAULT_IMAGE_CREDIT_TEMPLATE)
                      setImageRevealClue2('none')
                    }}
                    className="mt-2 rounded-lg border border-[#ded7ca] px-3 py-1.5 text-sm font-semibold text-[#102018] transition hover:bg-white"
                  >
                    Remove second image
                  </button>
                </div>
              )}

              {level === 'attending' && learningImageUrl && (
                <div className="rounded-lg border border-[#ded7ca] p-2.5">
                  <img
                    src={learningImageUrl}
                    alt="Teaching image"
                    className="max-h-48 rounded-lg object-contain"
                  />
                  {normalizeCreditValue(learningImageCredit) && (
                    <p className="mt-1 text-[11px] text-[#8a948d]">{normalizeCreditValue(learningImageCredit)}</p>
                  )}
                  <button
                    onClick={() => {
                      setLearningImageUrl('')
                      setLearningImageCredit(DEFAULT_IMAGE_CREDIT_TEMPLATE)
                    }}
                    className="mt-2 rounded-lg border border-[#ded7ca] px-3 py-1.5 text-sm font-semibold text-[#102018] transition hover:bg-white"
                  >
                    Remove teaching image
                  </button>
                </div>
              )}

              {level === 'attending' && learningImageUrl2 && (
                <div className="rounded-lg border border-[#ded7ca] p-2.5">
                  <img
                    src={learningImageUrl2}
                    alt="Second teaching image"
                    className="max-h-48 rounded-lg object-contain"
                  />
                  {normalizeCreditValue(learningImageCredit2) && (
                    <p className="mt-1 text-[11px] text-[#8a948d]">{normalizeCreditValue(learningImageCredit2)}</p>
                  )}
                  <button
                    onClick={() => {
                      setLearningImageUrl2('')
                      setLearningImageCredit2(DEFAULT_IMAGE_CREDIT_TEMPLATE)
                    }}
                    className="mt-2 rounded-lg border border-[#ded7ca] px-3 py-1.5 text-sm font-semibold text-[#102018] transition hover:bg-white"
                  >
                    Remove second teaching image
                  </button>
                </div>
              )}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-[#ebe5db] bg-[#fcfbf8] p-3">
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                    {level === 'attending' ? 'A' : 'Clue 1'}
                    <textarea
                      value={clue1}
                      onChange={e => updateClueAt(0, e.target.value)}
                      onInput={autoGrowTextarea}
                      rows={1}
                      className="min-h-[46px] resize-none overflow-hidden rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                    />
                  </label>

                  <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                    {level === 'attending' ? 'B' : 'Clue 2'}
                    <textarea
                      value={clue2}
                      onChange={e => updateClueAt(1, e.target.value)}
                      onInput={autoGrowTextarea}
                      rows={1}
                      className="min-h-[46px] resize-none overflow-hidden rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                    />
                  </label>

                  <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                    {level === 'attending' ? 'C' : 'Clue 3'}
                    <textarea
                      value={clue3}
                      onChange={e => updateClueAt(2, e.target.value)}
                      onInput={autoGrowTextarea}
                      rows={1}
                      className="min-h-[46px] resize-none overflow-hidden rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                    />
                  </label>

                  <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                    {level === 'attending' ? 'D' : 'Clue 4'}
                    <textarea
                      value={clue4}
                      onChange={e => updateClueAt(3, e.target.value)}
                      onInput={autoGrowTextarea}
                      rows={1}
                      className="min-h-[46px] resize-none overflow-hidden rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                    />
                  </label>

                  <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                    {level === 'attending' ? 'E' : 'Clue 5'}
                    <textarea
                      value={clue5}
                      onChange={e => updateClueAt(4, e.target.value)}
                      placeholder="Optional"
                      onInput={autoGrowTextarea}
                      rows={1}
                      className="min-h-[46px] resize-none overflow-hidden rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                    />
                  </label>

                  <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                    {level === 'attending' ? 'F' : 'Clue 6'}
                    <textarea
                      value={clue6}
                      onChange={e => updateClueAt(5, e.target.value)}
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
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => wrapTeachingPointSelection('bold')}
                    className="rounded-lg border border-[#ded7ca] bg-white px-3 py-1.5 text-xs font-semibold text-[#102018] transition hover:bg-[#fbfaf7]"
                  >
                    Bold
                  </button>
                  <button
                    type="button"
                    onClick={() => wrapTeachingPointSelection('italic')}
                    className="rounded-lg border border-[#ded7ca] bg-white px-3 py-1.5 text-xs font-semibold text-[#102018] transition hover:bg-[#fbfaf7]"
                  >
                    Italic
                  </button>
                  <button
                    type="button"
                    onClick={() => wrapTeachingPointSelection('underline')}
                    className="rounded-lg border border-[#ded7ca] bg-white px-3 py-1.5 text-xs font-semibold text-[#102018] transition hover:bg-[#fbfaf7]"
                  >
                    Underline
                  </button>
                  <button
                    type="button"
                    onClick={insertTeachingPointLink}
                    className="rounded-lg border border-[#ded7ca] bg-white px-3 py-1.5 text-xs font-semibold text-[#102018] transition hover:bg-[#fbfaf7]"
                  >
                    Link
                  </button>
                </div>
                <textarea
                  ref={teachingPointRef}
                  value={teachingPoint}
                  onChange={e => setTeachingPoint(e.target.value)}
                  onKeyDown={handleTeachingPointKeyDown}
                  placeholder={`**<u>Who</u>**

**<u>Pathophys</u>**

**<u>Key Clues</u>**

**<u>Tx</u>**

**<u>Classic Pitfall</u>**`}
                  rows={7}
                  className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                />
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

              {(status || draftStatus) && (
                <div className="space-y-1">
                  {status ? <p className="text-sm text-[#637268]">{status}</p> : null}
                  {draftStatus ? <p className="text-xs text-[#8a948d]">{draftStatus}</p> : null}
                </div>
              )}

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
                    {level === 'attending' ? (
                      <>
                        <div className="rounded-xl border border-[#ded7ca] bg-white px-3 py-2.5">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#637268]">
                            Answer responses
                          </div>
                          <div className="mt-1 font-serif text-xl font-bold text-[#102018]">
                            {caseCommunityStats.anatomyResponseCount}
                          </div>
                        </div>
                        <div className="sm:col-span-2 rounded-xl border border-[#ded7ca] bg-white px-3 py-2.5">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#637268]">
                            Choice breakdown
                          </div>
                          {caseCommunityStats.anatomyChoiceBreakdown.length > 0 ? (
                            <div className="mt-2 space-y-1.5">
                              {caseCommunityStats.anatomyChoiceBreakdown.map(choice => (
                                <div
                                  key={`${choice.letter}-${choice.label}`}
                                  className="flex items-center justify-between gap-3 rounded-lg border border-[#ebe5db] bg-[#fcfbf8] px-3 py-2"
                                >
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-semibold text-[#102018]">
                                      {choice.letter}. {choice.label}
                                    </div>
                                  </div>
                                  <div className="shrink-0 text-right">
                                    <div className="font-serif text-lg font-bold text-[#102018]">
                                      {Math.round(choice.rate)}%
                                    </div>
                                    <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#637268]">
                                      {choice.count} pick{choice.count === 1 ? '' : 's'}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="mt-2 rounded-lg border border-dashed border-[#ded7ca] bg-[#fbfaf7] px-3 py-3 text-sm text-[#8a948d]">
                              Anatomy answer percentages will appear after people start selecting choices.
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
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
                      </>
                    )}
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
                  </div>
                  <div className="rounded-full border border-[#ded7ca] bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#637268]">
                    {caseDate} · {formatLevel(level)}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={openCasePreview}
                    className="rounded-full border border-[#1f6448] bg-[#1f6448] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#174c37]"
                  >
                    Open full-page preview
                  </button>
                  <div className="rounded-full border border-[#ded7ca] bg-white px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#637268]">
                    Uses your current draft
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
