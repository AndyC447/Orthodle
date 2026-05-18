'use client'
import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Header } from '@/components/Header'
import { PublicFooter } from '@/components/PublicFooter'
import { supabase } from '@/lib/supabase'
import {
  getSurveyLevelScopeLabel,
  normalizeSurveyOptions,
  SITE_SURVEY_STORAGE_PREFIX,
  type SiteSurveyRow,
  type SurveyLevelScope,
  type SurveyPlacement,
} from '@/lib/site-surveys'
import { fetchExcludedStatsSessionIds, filterExcludedSessionRows } from '@/lib/stats-exclusions'
import {
  getStatsSummary,
  getLatestUnfinishedRoundProgress,
  isAcceptedGuess,
  normalizeAnswer,
  ORTHO_DIAGNOSIS_BANK,
  getRoundProgress,
  getSessionId,
  isTrackingDisabledForThisBrowser,
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
  image_url_2: string | null
  image_credit_2: string | null
  image_reveal_clue_2: number | null
  clue_1: string | null
  clue_2: string | null
  clue_3: string | null
  clue_4: string | null
  clue_5: string | null
  clue_6: string | null
  teaching_point?: string | null
  learning_image_url?: string | null
  learning_image_credit?: string | null
  learning_image_url_2?: string | null
  learning_image_credit_2?: string | null
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
  mostCommonIncorrectGuess: string | null
  anatomyResponseCount: number
  anatomyChoiceBreakdown: Array<{
    letter: string
    label: string
    count: number
    rate: number
    isCorrect: boolean
  }>
}

type TeachingPointSection = {
  label: string
  body: string[]
}

type ExpandableImage = {
  url: string
  credit: string | null | undefined
  alt: string
}

const TEACHING_POINT_LABELS = new Map<string, string>([
  ['clinical context', 'Clinical Context'],
  ['who', 'Who'],
  ['pathophys', 'Pathophys'],
  ['key clues', 'Key Clues'],
  ['presentation', 'Presentation'],
  ['exam', 'Exam'],
  ['imaging', 'Imaging'],
  ['tx', 'Tx'],
  ['dont miss', "Don't Miss"],
  ['don’t miss', "Don't Miss"],
  ['classic pitfall', 'Classic Pitfall'],
  ['board pearl', 'Board Pearl'],
  ['orthodle insight', 'Orthodle Insight'],
  ['ddx', 'DDx'],
])

type HomepageAnnouncementRow = {
  id: string
  message: string
  start_date: string
  end_date: string | null
}

type HomepageSurveyRow = {
  id: string
  question: string
  option_1: string
  option_2: string
  option_3: string
  start_date: string
  end_date: string | null
}

type AnatomySurveyRow = {
  id: string
  question: string
  option_1: string
  option_2: string
  option_3: string
  start_date: string
  end_date: string | null
}

type PlayModeSettingsRow = {
  no_resident_mode: boolean
  no_resident_mode_start_date: string | null
}

type ActiveSurveyState = {
  survey: SiteSurveyRow | null
  submittedChoice: string | null
  isSubmitting: boolean
  status: string
}

const HOMEPAGE_ANNOUNCEMENT_DISMISS_KEY = 'orthodle_dismissed_homepage_announcement'
const HOMEPAGE_SURVEY_DISMISS_KEY = 'orthodle_dismissed_homepage_survey'
const TUTORIAL_DISMISS_KEY = 'orthodle_dismissed_intro_v1'
const RESUME_ROUND_DISMISS_KEY = 'orthodle_dismissed_resume_round'
const HOMEPAGE_SURVEY_STORAGE_PREFIX = 'orthodle_homepage_survey'
const ANATOMY_SURVEY_STORAGE_PREFIX = 'orthodle_anatomy_survey'
const FEEDBACK_TAG_OPTIONS = ['Too easy', 'Too hard', 'Unclear clue', 'Great case'] as const
const REACTION_STORAGE_PREFIX = 'orthodle_case_reactions'

const MAX_GUESSES = 6
const LAUNCH_DATE = '2026-04-27'
const SURGICAL_ANATOMY_LAUNCH_DATE = '2026-05-14'

const levels = [
  { key: 'med_student' as Level, label: 'Med Student' },
  { key: 'resident' as Level, label: 'Resident' },
  { key: 'attending' as Level, label: 'Anatomy' },
]

const baseHomeTabs = [
  { type: 'level' as const, key: 'med_student' as const, label: 'Med Student' },
  { type: 'level' as const, key: 'resident' as const, label: 'Resident' },
  { type: 'level' as const, key: 'attending' as const, label: 'Anatomy' },
  { type: 'link' as const, href: '/groups', label: 'Groups', subtitle: 'COMPETE' },
]

const confettiPieces = Array.from({ length: 28 }, (_, index) => ({
  id: index,
  left: 4 + ((index * 17) % 92),
  burstX: -180 + (index % 9) * 45,
  burstY: 70 + (index % 6) * 24,
  driftX: -80 + (index % 11) * 16,
  delay: (index % 10) * 0.025,
  duration: 1.38 + (index % 5) * 0.13,
  rotation: -120 + (index % 13) * 18,
  color: ['#1f7a4d', '#c76b3a', '#ead9b7', '#315f4d'][index % 4],
  size: index % 5 === 0 ? 8 : index % 3 === 0 ? 13 : 10,
  shape: index % 4 === 0 ? 'circle' : index % 5 === 0 ? 'diamond' : 'pill',
}))

const DEFAULT_LEVEL_TAGLINES: Record<Level, string[]> = {
  med_student: [''],
  resident: [''],
  attending: [''],
}

const GENERIC_DIAGNOSIS_TERMS = new Set([
  'fracture',
  'tear',
  'injury',
  'disease',
  'syndrome',
  'sprain',
  'strain',
  'rupture',
  'dislocation',
  'instability',
  'bursitis',
  'tendinopathy',
  'tendonitis',
  'tenosynovitis',
  'arthritis',
  'necrosis',
  'impingement',
  'radiculopathy',
  'compression',
  'herniation',
  'stenosis',
  'deformity',
  'lesion',
  'pain',
])

const PLAY_BOOTSTRAP_CACHE_KEY = 'orthodle_play_bootstrap_v1'
const PLAY_BOOTSTRAP_CACHE_TTL_MS = 1000 * 60 * 60 * 6
const ADMIN_CASE_PREVIEW_CACHE_KEY = 'orthodle_admin_case_preview_v1'
const ADMIN_CASE_PREVIEW_CACHE_TTL_MS = 1000 * 60 * 60 * 6

type PlayBootstrapCache = {
  savedAt: number
  answerOptions: string[]
  levelTaglines: Record<Level, string[]>
}

type AdminCasePreviewCache = {
  savedAt: number
  case: Case
}

function readPlayBootstrapCache() {
  if (typeof window === 'undefined') return null as PlayBootstrapCache | null

  try {
    const raw = window.sessionStorage.getItem(PLAY_BOOTSTRAP_CACHE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as PlayBootstrapCache
    if (!parsed?.savedAt || Date.now() - parsed.savedAt > PLAY_BOOTSTRAP_CACHE_TTL_MS) {
      window.sessionStorage.removeItem(PLAY_BOOTSTRAP_CACHE_KEY)
      return null
    }

    return parsed
  } catch {
    window.sessionStorage.removeItem(PLAY_BOOTSTRAP_CACHE_KEY)
    return null
  }
}

function writePlayBootstrapCache(cache: Omit<PlayBootstrapCache, 'savedAt'>) {
  if (typeof window === 'undefined') return

  window.sessionStorage.setItem(
    PLAY_BOOTSTRAP_CACHE_KEY,
    JSON.stringify({
      ...cache,
      savedAt: Date.now(),
    })
  )
}

function readAdminCasePreviewCache() {
  if (typeof window === 'undefined') return null as AdminCasePreviewCache | null

  try {
    const raw =
      window.localStorage.getItem(ADMIN_CASE_PREVIEW_CACHE_KEY) ||
      window.sessionStorage.getItem(ADMIN_CASE_PREVIEW_CACHE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as AdminCasePreviewCache
    if (!parsed?.savedAt || !parsed?.case || Date.now() - parsed.savedAt > ADMIN_CASE_PREVIEW_CACHE_TTL_MS) {
      window.localStorage.removeItem(ADMIN_CASE_PREVIEW_CACHE_KEY)
      window.sessionStorage.removeItem(ADMIN_CASE_PREVIEW_CACHE_KEY)
      return null
    }

    return parsed
  } catch {
    window.localStorage.removeItem(ADMIN_CASE_PREVIEW_CACHE_KEY)
    window.sessionStorage.removeItem(ADMIN_CASE_PREVIEW_CACHE_KEY)
    return null
  }
}

function isTooGenericSuggestionQuery(query: string) {
  const tokens = query.split(' ').filter(Boolean)
  if (tokens.length === 0) return true
  const isGenericLikeToken = (token: string) =>
    Array.from(GENERIC_DIAGNOSIS_TERMS).some(
      generic =>
        token === generic ||
        generic.startsWith(token) ||
        token.startsWith(generic)
    )

  if (tokens.length === 1 && isGenericLikeToken(tokens[0])) return true
  if (tokens.every(token => isGenericLikeToken(token))) return true
  return false
}

function isLocalhostBrowser() {
  if (typeof window === 'undefined') return false
  const host = window.location.hostname
  return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0'
}

function getBrowserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null
  } catch {
    return null
  }
}

function getBrowserTheme() {
  if (typeof document !== 'undefined') {
    const theme = document.documentElement.dataset.theme
    if (theme === 'light' || theme === 'dark') return theme
  }

  if (typeof window !== 'undefined') {
    const savedTheme = window.localStorage.getItem('orthodle_theme')
    if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme
    if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark'
  }

  return 'light'
}

function stripChoicePrefix(value: string) {
  return value.replace(/^[A-F][\).\:\-]\s*/i, '').trim()
}

function buildAnatomyChoiceBreakdown(
  choiceSource: Array<string | null | undefined>,
  guessRows: Array<{ session_id: string; guess_text?: string | null }>,
  acceptedAnswers: string[]
) {
  const choices = choiceSource
    .map(choice => (typeof choice === 'string' ? choice.trim() : ''))
    .filter(Boolean)
    .slice(0, 6)

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

  const normalizedChoices = choices.map(choice => normalizeAnswer(stripChoicePrefix(choice)))
  const normalizedAcceptedAnswers = new Set(
    acceptedAnswers.map(answer => normalizeAnswer(answer)).filter(Boolean)
  )
  const firstGuessBySession = new Map<string, string>()

  for (const row of guessRows) {
    if (!firstGuessBySession.has(row.session_id)) {
      const guessText = typeof row.guess_text === 'string' ? row.guess_text.trim() : ''
      firstGuessBySession.set(row.session_id, guessText)
    }
  }

  const counts = normalizedChoices.map(() => 0)
  let responseCount = 0

  for (const guessText of firstGuessBySession.values()) {
    const normalizedGuess = normalizeAnswer(stripChoicePrefix(guessText))
    if (!normalizedGuess) continue
    const matchIndex = normalizedChoices.findIndex(choice => choice === normalizedGuess)
    if (matchIndex === -1) continue
    counts[matchIndex] += 1
    responseCount += 1
  }

  return {
    responseCount,
    breakdown: choices.map((choice, index) => {
      const label = stripChoicePrefix(choice)
      return {
        letter: String.fromCharCode(65 + index),
        label,
        count: counts[index] || 0,
        rate: responseCount > 0 ? ((counts[index] || 0) / responseCount) * 100 : 0,
        isCorrect: normalizedAcceptedAnswers.has(normalizeAnswer(label)),
      }
    }),
  }
}

function isPostAnswerImageReveal(revealStep: number | null | undefined) {
  return revealStep === 0
}

function isSurgicalAnatomyDate(dateText: string) {
  return dateText >= SURGICAL_ANATOMY_LAUNCH_DATE
}

function canUseSurgicalAnatomyQuiz(dateText: string) {
  return isSurgicalAnatomyDate(dateText) || isLocalhostBrowser()
}

function getInitialLevelFromParams(value: string | null): Level {
  if (value === 'resident' || value === 'attending') return value
  return 'med_student'
}

function getInitialDateFromParams(value: string | null, fallback: string) {
  if (value && value >= LAUNCH_DATE && value <= fallback) return value
  return fallback
}

function getSiteSurveyDismissKey(survey: Pick<SiteSurveyRow, 'id' | 'question' | 'start_date' | 'options'>) {
  return `${SITE_SURVEY_STORAGE_PREFIX}:${survey.id}:${survey.start_date}:${survey.question}:${normalizeSurveyOptions(survey.options || []).join('|')}`
}

function getAnatomySurveyStorageKey(survey: Pick<AnatomySurveyRow, 'id' | 'question' | 'start_date' | 'option_1' | 'option_2' | 'option_3'>) {
  return `${ANATOMY_SURVEY_STORAGE_PREFIX}:${survey.id}:${survey.start_date}:${survey.question}:${[survey.option_1, survey.option_2, survey.option_3].map(option => option?.trim() || '').filter(Boolean).join('|')}`
}

function doesSurveyApplyToLevel(levelScope: SurveyLevelScope | null | undefined, level: Level) {
  return !levelScope || levelScope === 'all' || levelScope === level
}

function PlayPageContent() {
  const searchParams = useSearchParams()
  const caseParam = searchParams.get('case')
  const isAdminPreview = searchParams.get('preview') === '1'
  const findingsRef = useRef<HTMLDivElement | null>(null)
  const solvedCardRef = useRef<HTMLDivElement | null>(null)
  const inputSectionRef = useRef<HTMLDivElement | null>(null)
  const imageTouchStartY = useRef<number | null>(null)
  const imagePanStart = useRef<{ x: number; y: number } | null>(null)
  const imagePinchStart = useRef<number | null>(null)
  const imageScaleStart = useRef<number>(1)
  const today = todayISO()
  const initialLevel = getInitialLevelFromParams(searchParams.get('level'))
  const initialDate = getInitialDateFromParams(searchParams.get('date'), today)
  const [selectedLevel, setSelectedLevel] = useState<Level>(initialLevel)
  const [noResidentMode, setNoResidentMode] = useState(false)
  const [noResidentModeStartDate, setNoResidentModeStartDate] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState(initialDate)
  const [dailyCase, setDailyCase] = useState<Case | null>(null)
  const [guess, setGuess] = useState('')
  const [answerOptions, setAnswerOptions] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [isMobileInputFocused, setIsMobileInputFocused] = useState(false)
  const [guesses, setGuesses] = useState<Guess[]>([])
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [gameWon, setGameWon] = useState(false)
  const [gameOver, setGameOver] = useState(false)
  const [justCompletedRound, setJustCompletedRound] = useState(false)
  const [shakeInput, setShakeInput] = useState(false)
  const [pulseSuccess, setPulseSuccess] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)
  const [imageExpanded, setImageExpanded] = useState(false)
  const [expandedImageIndex, setExpandedImageIndex] = useState(0)
  const [expandedImages, setExpandedImages] = useState<ExpandableImage[]>([])
  const [imageHidden, setImageHidden] = useState(false)
  const [communityStats, setCommunityStats] = useState<CommunityCaseStats | null>(null)
  const [reminderEmail, setReminderEmail] = useState('')
  const [reminderStatus, setReminderStatus] = useState('')
  const [isSavingReminder, setIsSavingReminder] = useState(false)
  const [reactionStatus, setReactionStatus] = useState('')
  const [submittingReaction, setSubmittingReaction] = useState<string | null>(null)
  const [submittedReactionTags, setSubmittedReactionTags] = useState<string[]>([])
  const [feedbackText, setFeedbackText] = useState('')
  const [isSavingFeedback, setIsSavingFeedback] = useState(false)
  const [feedbackStatus, setFeedbackStatus] = useState('')
  const [imageScale, setImageScale] = useState(1)
  const [imageOffset, setImageOffset] = useState({ x: 0, y: 0 })
  const [isTransitioningLevel, setIsTransitioningLevel] = useState(false)
  const [levelTaglines, setLevelTaglines] = useState<Record<Level, string[]>>(DEFAULT_LEVEL_TAGLINES)
  const [homepageAnnouncement, setHomepageAnnouncement] = useState<HomepageAnnouncementRow | null>(null)
  const [dismissedHomepageAnnouncementKey, setDismissedHomepageAnnouncementKey] = useState<string | null>(null)
  const [dismissedResumeRoundToken, setDismissedResumeRoundToken] = useState<string | null>(null)
  const [homepageSurvey, setHomepageSurvey] = useState<HomepageSurveyRow | null>(null)
  const [dismissedHomepageSurveyKey, setDismissedHomepageSurveyKey] = useState<string | null>(null)
  const [submittedHomepageSurveyChoice, setSubmittedHomepageSurveyChoice] = useState<string | null>(null)
  const [isSubmittingHomepageSurvey, setIsSubmittingHomepageSurvey] = useState(false)
  const [homepageSurveyStatus, setHomepageSurveyStatus] = useState('')
  const [sharedHomepageSurvey, setSharedHomepageSurvey] = useState<ActiveSurveyState>({
    survey: null,
    submittedChoice: null,
    isSubmitting: false,
    status: '',
  })
  const [anatomySurvey, setAnatomySurvey] = useState<AnatomySurveyRow | null>(null)
  const [submittedAnatomySurveyChoice, setSubmittedAnatomySurveyChoice] = useState<string | null>(null)
  const [isSubmittingAnatomySurvey, setIsSubmittingAnatomySurvey] = useState(false)
  const [anatomySurveyStatus, setAnatomySurveyStatus] = useState('')
  const [sharedPostCaseSurvey, setSharedPostCaseSurvey] = useState<ActiveSurveyState>({
    survey: null,
    submittedChoice: null,
    isSubmitting: false,
    status: '',
  })
  const [showTutorial, setShowTutorial] = useState(false)
  const [resumeRound, setResumeRound] = useState<ReturnType<typeof getLatestUnfinishedRoundProgress>>(null)
  const [pendingResumeKey, setPendingResumeKey] = useState<string | null>(null)
  const [dailySummary, setDailySummary] = useState({
    date: today,
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

    if (dateParam && dateParam >= LAUNCH_DATE && dateParam <= today) {
      setSelectedDate(dateParam)
    }
  }, [searchParams, today])

  useEffect(() => {
    setDailySummary(getStatsSummary().today)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    setDismissedHomepageAnnouncementKey(
      window.localStorage.getItem(HOMEPAGE_ANNOUNCEMENT_DISMISS_KEY)
    )
    setDismissedResumeRoundToken(
      window.localStorage.getItem(RESUME_ROUND_DISMISS_KEY)
    )
    setDismissedHomepageSurveyKey(
      window.localStorage.getItem(HOMEPAGE_SURVEY_DISMISS_KEY)
    )
    setShowTutorial(!window.localStorage.getItem(TUTORIAL_DISMISS_KEY))
    setResumeRound(getLatestUnfinishedRoundProgress())
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !dailyCase) {
      setSubmittedReactionTags([])
      setReactionStatus('')
      setFeedbackStatus('')
      setFeedbackText('')
      return
    }

    const saved = window.localStorage.getItem(
      `${REACTION_STORAGE_PREFIX}:${dailyCase.id}`
    )

    if (!saved) {
      setSubmittedReactionTags([])
      return
    }

    try {
      const parsed = JSON.parse(saved) as string[]
      setSubmittedReactionTags(Array.isArray(parsed) ? parsed : [])
    } catch {
      setSubmittedReactionTags([])
    }
    setReactionStatus('')
    setFeedbackStatus('')
    setFeedbackText('')
  }, [dailyCase])

  useEffect(() => {
    if (typeof window === 'undefined' || !homepageSurvey?.id) {
      setSubmittedHomepageSurveyChoice(null)
      return
    }

    const saved = window.localStorage.getItem(
      `${HOMEPAGE_SURVEY_STORAGE_PREFIX}:${homepageSurvey.id}`
    )
    setSubmittedHomepageSurveyChoice(saved || null)
  }, [homepageSurvey])

  useEffect(() => {
    if (typeof window === 'undefined' || !sharedHomepageSurvey.survey?.id) {
      setSharedHomepageSurvey(prev => ({ ...prev, submittedChoice: null, status: '' }))
      return
    }

    const saved = window.localStorage.getItem(
      getSiteSurveyDismissKey(sharedHomepageSurvey.survey)
    )
    setSharedHomepageSurvey(prev => ({ ...prev, submittedChoice: saved || null, status: '' }))
  }, [sharedHomepageSurvey.survey?.id])

  useEffect(() => {
    if (typeof window === 'undefined' || !sharedPostCaseSurvey.survey?.id) {
      setSharedPostCaseSurvey(prev => ({ ...prev, submittedChoice: null, status: '' }))
      return
    }

    const saved = window.localStorage.getItem(
      getSiteSurveyDismissKey(sharedPostCaseSurvey.survey)
    )
    setSharedPostCaseSurvey(prev => ({ ...prev, submittedChoice: saved || null, status: '' }))
  }, [sharedPostCaseSurvey.survey?.id])

  useEffect(() => {
    let cancelled = false

    async function loadPlayModeSettings() {
      const { data } = await supabase
        .from('play_mode_settings')
        .select('no_resident_mode, no_resident_mode_start_date')
        .eq('id', 'default')
        .maybeSingle()

      if (cancelled) return
      const row = (data as PlayModeSettingsRow | null) || null
      setNoResidentMode(Boolean(row?.no_resident_mode))
      setNoResidentModeStartDate(row?.no_resident_mode_start_date || null)
    }

    void loadPlayModeSettings()

    return () => {
      cancelled = true
    }
  }, [])

  const noResidentModeActiveToday = noResidentMode && (!noResidentModeStartDate || noResidentModeStartDate <= todayISO())

  useEffect(() => {
    if (noResidentModeActiveToday && selectedLevel === 'resident') {
      setSelectedLevel('med_student')
    }
  }, [noResidentModeActiveToday, selectedLevel])

  useEffect(() => {
    let cancelled = false

    async function loadAnswerOptions() {
      const cached = readPlayBootstrapCache()

      if (cached) {
        setAnswerOptions(cached.answerOptions)
        setLevelTaglines(cached.levelTaglines)
        return
      }

      const [{ data: caseAnswers }, { data: customChoices }, { data: taglineRows }] = await Promise.all([
        supabase
          .from('cases')
          .select('answer')
          .range(0, 1999),
        supabase
          .from('diagnosis_choices')
          .select('label')
          .order('label', { ascending: true }),
        supabase
          .from('difficulty_taglines')
          .select('level, text, position, updated_at, id')
          .order('updated_at', { ascending: false })
          .order('id', { ascending: false }),
      ])
      if (cancelled) return

      const uniqueAnswers = Array.from(
        new Map(
          [
            ...ORTHO_DIAGNOSIS_BANK,
            ...((caseAnswers || []).map(item => item.answer?.trim()).filter(Boolean) as string[]),
            ...((customChoices || []).map(item => item.label?.trim()).filter(Boolean) as string[]),
          ]
            .filter(Boolean)
            .map(answer => [normalizeAnswer(answer as string), answer as string])
        ).values()
      ).sort((a, b) => a.localeCompare(b))

      setAnswerOptions(uniqueAnswers)

      const nextTaglines = {
        med_student: [...DEFAULT_LEVEL_TAGLINES.med_student],
        resident: [...DEFAULT_LEVEL_TAGLINES.resident],
        attending: [...DEFAULT_LEVEL_TAGLINES.attending],
      }

      if (taglineRows && taglineRows.length > 0) {
        for (const level of levels.map(item => item.key)) {
          const firstRow = (taglineRows as Array<{ level: Level; text: string }>).find(
            row => row.level === level && row.text?.trim()
          )
          if (firstRow?.text) {
            nextTaglines[level] = [firstRow.text.toUpperCase()]
          }
        }
      }

      const resolvedTaglines = {
        med_student:
          nextTaglines.med_student.length > 0
            ? nextTaglines.med_student
            : DEFAULT_LEVEL_TAGLINES.med_student,
        resident:
          nextTaglines.resident.length > 0
            ? nextTaglines.resident
            : DEFAULT_LEVEL_TAGLINES.resident,
        attending:
          nextTaglines.attending.length > 0
            ? nextTaglines.attending
            : DEFAULT_LEVEL_TAGLINES.attending,
      }

      setLevelTaglines(resolvedTaglines)
      writePlayBootstrapCache({
        answerOptions: uniqueAnswers,
        levelTaglines: resolvedTaglines,
      })
    }

    void loadAnswerOptions()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadHomepageAnnouncement() {
      const isLocalhost =
        typeof window !== 'undefined' &&
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')

      const { data } = await supabase
        .from('homepage_announcements')
        .select('id, message, start_date, end_date')
        .lte('start_date', today)
        .or(`end_date.is.null,end_date.gte.${today}`)
        .order('start_date', { ascending: false })
        .limit(1)

      if (cancelled) return

      const activeAnnouncement = (data as HomepageAnnouncementRow[] | null)?.[0] || null

      if (activeAnnouncement?.message?.trim()) {
        setHomepageAnnouncement({
          ...activeAnnouncement,
          message: activeAnnouncement.message.trim(),
        })
        return
      }

      if (!isLocalhost) {
        setHomepageAnnouncement(null)
        return
      }

      const { data: upcomingData } = await supabase
        .from('homepage_announcements')
        .select('id, message, start_date, end_date')
        .gte('start_date', today)
        .order('start_date', { ascending: true })
        .limit(1)

      if (cancelled) return

      const upcomingAnnouncement = (upcomingData as HomepageAnnouncementRow[] | null)?.[0] || null
      setHomepageAnnouncement(
        upcomingAnnouncement?.message?.trim()
          ? {
              ...upcomingAnnouncement,
              message: upcomingAnnouncement.message.trim(),
            }
          : null
      )
    }

    void loadHomepageAnnouncement()

    return () => {
      cancelled = true
    }
  }, [today])

  async function submitHomepageSurvey(choice: string) {
    if (!homepageSurvey?.id || submittedHomepageSurveyChoice || isSubmittingHomepageSurvey) return

    setIsSubmittingHomepageSurvey(true)
    setHomepageSurveyStatus('')
    const trackingDisabled = isTrackingDisabledForThisBrowser()

    try {
      if (!isLocalhostBrowser() && !trackingDisabled) {
        await supabase.from('homepage_survey_responses').insert({
          survey_id: homepageSurvey.id,
          response: choice,
          session_id: getSessionId() || null,
        })
      }

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(`${HOMEPAGE_SURVEY_STORAGE_PREFIX}:${homepageSurvey.id}`, choice)
      }
      setSubmittedHomepageSurveyChoice(choice)
      setHomepageSurveyStatus('Thanks for responding!')
      window.setTimeout(() => {
        dismissHomepageSurvey()
      }, 1900)
    } finally {
      setIsSubmittingHomepageSurvey(false)
    }
  }

  async function submitSharedHomepageSurvey(choice: string) {
    if (
      !sharedHomepageSurvey.survey?.id ||
      sharedHomepageSurvey.submittedChoice ||
      sharedHomepageSurvey.isSubmitting
    ) {
      return
    }

    setSharedHomepageSurvey(prev => ({ ...prev, isSubmitting: true, status: '' }))
    const trackingDisabled = isTrackingDisabledForThisBrowser()

    try {
      if (!isLocalhostBrowser() && !trackingDisabled) {
        await supabase.from('site_survey_responses').insert({
          survey_id: sharedHomepageSurvey.survey.id,
          response: choice,
          session_id: getSessionId() || null,
          placement: 'homepage_header',
        })
      }

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(getSiteSurveyDismissKey(sharedHomepageSurvey.survey), choice)
      }

      setSharedHomepageSurvey(prev => ({
        ...prev,
        submittedChoice: choice,
        isSubmitting: false,
        status: 'Thanks for responding!',
      }))
    } catch {
      setSharedHomepageSurvey(prev => ({
        ...prev,
        isSubmitting: false,
        status: 'Could not save that response.',
      }))
    }
  }

  async function submitAnatomySurvey(choice: string) {
    if (!anatomySurvey?.id || submittedAnatomySurveyChoice || isSubmittingAnatomySurvey) return

    setIsSubmittingAnatomySurvey(true)
    setAnatomySurveyStatus('')
    const trackingDisabled = isTrackingDisabledForThisBrowser()

    try {
      if (!isLocalhostBrowser() && !trackingDisabled) {
        await supabase.from('anatomy_case_survey_responses').insert({
          survey_id: anatomySurvey.id,
          response: choice,
          session_id: getSessionId() || null,
          case_id: dailyCase?.id || null,
          case_date: dailyCase?.case_date || selectedDate,
          level: dailyCase?.level || selectedLevel,
        })
      }

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(getAnatomySurveyStorageKey(anatomySurvey), choice)
      }

      setSubmittedAnatomySurveyChoice(choice)
      setAnatomySurveyStatus('Thanks for the feedback.')
    } finally {
      setIsSubmittingAnatomySurvey(false)
    }
  }

  async function submitSharedPostCaseSurvey(choice: string) {
    if (
      !sharedPostCaseSurvey.survey?.id ||
      sharedPostCaseSurvey.submittedChoice ||
      sharedPostCaseSurvey.isSubmitting
    ) {
      return
    }

    setSharedPostCaseSurvey(prev => ({ ...prev, isSubmitting: true, status: '' }))
    const trackingDisabled = isTrackingDisabledForThisBrowser()

    try {
      if (!isLocalhostBrowser() && !trackingDisabled) {
        await supabase.from('site_survey_responses').insert({
          survey_id: sharedPostCaseSurvey.survey.id,
          response: choice,
          session_id: getSessionId() || null,
          placement: 'after_case',
          case_id: dailyCase?.id || null,
          case_date: dailyCase?.case_date || selectedDate,
          level: dailyCase?.level || selectedLevel,
        })
      }

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(getSiteSurveyDismissKey(sharedPostCaseSurvey.survey), choice)
      }

      setSharedPostCaseSurvey(prev => ({
        ...prev,
        submittedChoice: choice,
        isSubmitting: false,
        status: 'Thanks for the feedback.',
      }))
    } catch {
      setSharedPostCaseSurvey(prev => ({
        ...prev,
        isSubmitting: false,
        status: 'Could not save that response.',
      }))
    }
  }

  useEffect(() => {
    let cancelled = false

    async function loadSharedHomepageSurvey() {
      const isLocalhost =
        typeof window !== 'undefined' &&
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')

      const { data, error } = await supabase
        .from('site_surveys')
        .select('id, question, options, placement, level_scope, start_date, end_date, created_at')
        .eq('placement', 'homepage_header')
        .lte('start_date', today)
        .or(`end_date.is.null,end_date.gte.${today}`)
        .order('start_date', { ascending: false })

      if (cancelled) return

      if (!error) {
        const activeSurvey = ((data as SiteSurveyRow[] | null) || []).find(
          item => item.question?.trim() && normalizeSurveyOptions(item.options || []).length >= 2
        ) || null

        if (activeSurvey) {
          setSharedHomepageSurvey(prev => ({
            ...prev,
            survey: { ...activeSurvey, options: normalizeSurveyOptions(activeSurvey.options || []) },
          }))
          return
        }
      }

      if (!isLocalhost) {
        setSharedHomepageSurvey(prev => ({ ...prev, survey: null }))
        return
      }

      const { data: upcomingData } = await supabase
        .from('site_surveys')
        .select('id, question, options, placement, level_scope, start_date, end_date, created_at')
        .eq('placement', 'homepage_header')
        .gte('start_date', today)
        .order('start_date', { ascending: true })
        .limit(1)

      if (cancelled) return

      const upcomingSurvey = ((upcomingData as SiteSurveyRow[] | null) || []).find(
        item => item.question?.trim() && normalizeSurveyOptions(item.options || []).length >= 2
      ) || null

      setSharedHomepageSurvey(prev => ({
        ...prev,
        survey: upcomingSurvey
          ? { ...upcomingSurvey, options: normalizeSurveyOptions(upcomingSurvey.options || []) }
          : null,
      }))
    }

    async function loadHomepageSurvey() {
      const isLocalhost =
        typeof window !== 'undefined' &&
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')

      const { data } = await supabase
        .from('homepage_surveys')
        .select('id, question, option_1, option_2, option_3, start_date, end_date')
        .lte('start_date', today)
        .or(`end_date.is.null,end_date.gte.${today}`)
        .order('start_date', { ascending: false })
        .limit(1)

      if (cancelled) return

      const activeSurvey = (data as HomepageSurveyRow[] | null)?.[0] || null
      if (activeSurvey?.question?.trim()) {
        setHomepageSurvey(activeSurvey)
        return
      }

      if (!isLocalhost) {
        setHomepageSurvey(null)
        return
      }

      const { data: upcomingData } = await supabase
        .from('homepage_surveys')
        .select('id, question, option_1, option_2, option_3, start_date, end_date')
        .gte('start_date', today)
        .order('start_date', { ascending: true })
        .limit(1)

      if (cancelled) return

      setHomepageSurvey((upcomingData as HomepageSurveyRow[] | null)?.[0] || null)
    }

    void loadSharedHomepageSurvey()
    void loadHomepageSurvey()

    return () => {
      cancelled = true
    }
  }, [today])

  useEffect(() => {
    let cancelled = false

    async function loadSharedPostCaseSurvey() {
      const isLocalhost =
        typeof window !== 'undefined' &&
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')

      const { data, error } = await supabase
        .from('site_surveys')
        .select('id, question, options, placement, level_scope, start_date, end_date, created_at')
        .eq('placement', 'after_case')
        .lte('start_date', today)
        .or(`end_date.is.null,end_date.gte.${today}`)
        .order('start_date', { ascending: false })

      if (cancelled) return

      if (!error) {
        const activeSurvey = ((data as SiteSurveyRow[] | null) || []).find(
          item =>
            item.question?.trim() &&
            normalizeSurveyOptions(item.options || []).length >= 2 &&
            doesSurveyApplyToLevel(item.level_scope, selectedLevel)
        ) || null

        if (activeSurvey) {
          setSharedPostCaseSurvey(prev => ({
            ...prev,
            survey: { ...activeSurvey, options: normalizeSurveyOptions(activeSurvey.options || []) },
          }))
          return
        }
      }

      if (!isLocalhost) {
        setSharedPostCaseSurvey(prev => ({ ...prev, survey: null }))
        return
      }

      const { data: upcomingData } = await supabase
        .from('site_surveys')
        .select('id, question, options, placement, level_scope, start_date, end_date, created_at')
        .eq('placement', 'after_case')
        .gte('start_date', today)
        .order('start_date', { ascending: true })

      if (cancelled) return

      const upcomingSurvey = ((upcomingData as SiteSurveyRow[] | null) || []).find(
        item =>
          item.question?.trim() &&
          normalizeSurveyOptions(item.options || []).length >= 2 &&
          doesSurveyApplyToLevel(item.level_scope, selectedLevel)
      ) || null

      setSharedPostCaseSurvey(prev => ({
        ...prev,
        survey: upcomingSurvey
          ? { ...upcomingSurvey, options: normalizeSurveyOptions(upcomingSurvey.options || []) }
          : null,
      }))
    }

    async function loadAnatomySurvey() {
      const isLocalhost =
        typeof window !== 'undefined' &&
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')

      const { data, error } = await supabase
        .from('anatomy_case_surveys')
        .select('id, question, option_1, option_2, option_3, start_date, end_date')
        .lte('start_date', today)
        .or(`end_date.is.null,end_date.gte.${today}`)
        .order('start_date', { ascending: false })
        .limit(1)

      if (cancelled) return

      if (error) {
        setAnatomySurvey(null)
        return
      }

      const activeSurvey = (data as AnatomySurveyRow[] | null)?.[0] || null
      if (activeSurvey?.question?.trim()) {
        setAnatomySurvey(activeSurvey)
        return
      }

      if (!isLocalhost) {
        setAnatomySurvey(null)
        return
      }

      const { data: upcomingData } = await supabase
        .from('anatomy_case_surveys')
        .select('id, question, option_1, option_2, option_3, start_date, end_date')
        .gte('start_date', today)
        .order('start_date', { ascending: true })
        .limit(1)

      if (cancelled) return

      setAnatomySurvey((upcomingData as AnatomySurveyRow[] | null)?.[0] || null)
    }

    void loadSharedPostCaseSurvey()
    void loadAnatomySurvey()

    return () => {
      cancelled = true
    }
  }, [today, selectedLevel, selectedDate, dailyCase?.id])

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

        let data: Case | null = null
        let error: { message?: string } | null = null
        const previewCase = isAdminPreview ? readAdminCasePreviewCache()?.case || null : null

        if (previewCase) {
          data = previewCase
        } else if (caseParam) {
          const result = await supabase
            .from('cases')
            .select('*')
            .eq('id', caseParam)
            .maybeSingle()

          data = (result.data as Case | null) || null
          error = result.error
        } else {
          const result = await supabase
            .from('cases')
            .select('*')
            .eq('case_date', selectedDate)
            .eq('level', selectedLevel)
            .maybeSingle()

          data = (result.data as Case | null) || null
          error = result.error
        }

        if (cancelled) return

        if (error || !data) {
          setMessage(`No ${formatLevel(selectedLevel)} case is available for ${formatArchiveDate(selectedDate)}.`)
          setDailyCase(null)
          return
        }

        if (data.case_date < LAUNCH_DATE) {
          setMessage(`No ${formatLevel(selectedLevel)} case is available for ${formatArchiveDate(selectedDate)}.`)
          setDailyCase(null)
          return
        }

        if (data.case_date !== selectedDate) {
          setSelectedDate(data.case_date)
        }

        if (data.level !== selectedLevel) {
          setSelectedLevel(data.level)
        }

        const loadedQuizChoices = [data.clue_1, data.clue_2, data.clue_3, data.clue_4, data.clue_5, data.clue_6].filter(
          (item): item is string => Boolean(item && item.trim())
        )
        const isAnatomyModeForLoadedCase =
          data.level === 'attending' && canUseSurgicalAnatomyQuiz(data.case_date)
        const useQuizMode = isAnatomyModeForLoadedCase && loadedQuizChoices.length >= 2
        const maxGuessesForLoadedCase = isAnatomyModeForLoadedCase ? 1 : MAX_GUESSES

        if (!previewCase && !isLocalhostBrowser() && !isTrackingDisabledForThisBrowser()) {
          void fetch('/api/visit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId,
              path: `/${data.level}/${data.case_date}`,
              browserTimezone: getBrowserTimezone(),
              browserLocale:
                (typeof navigator !== 'undefined' && (navigator.language || navigator.languages?.[0])) || null,
              browserTheme: getBrowserTheme(),
              doNotTrack: isTrackingDisabledForThisBrowser(),
            }),
          })
        }

        setDailyCase(data)

        const isArchiveCase = data.case_date !== today
        const savedProgress = getRoundProgress(data.case_date, data.level, isArchiveCase)
        setJustCompletedRound(false)

        if (previewCase) {
          setGuesses([])
          setGameWon(false)
          setGameOver(false)
          setMessage('')
          setCommunityStats(null)
          return
        }

        const [excludedSessionIds, { data: visitRows }, { data: guessRows }] = await Promise.all([
          fetchExcludedStatsSessionIds(),
          supabase.from('visits').select('session_id').eq('path', `/${data.level}/${data.case_date}`),
          supabase
            .from('guesses')
            .select('session_id, is_correct, created_at, guess_text')
            .eq('case_id', data.id)
            .order('created_at', { ascending: true }),
        ])

        if (cancelled) return

        const excludedSessionIdSet = new Set(excludedSessionIds)
        const publicVisitRows = filterExcludedSessionRows(visitRows, excludedSessionIdSet)
        const publicGuessRows = filterExcludedSessionRows(guessRows, excludedSessionIdSet)
        const viewerGuessRows = (guessRows || []).filter(row => row.session_id === sessionId)
        const serverGuesses = viewerGuessRows.map(row => ({
          text: row.guess_text || '',
          correct: Boolean(row.is_correct),
        }))
        const solvedIndex = viewerGuessRows.findIndex(row => Boolean(row.is_correct))
        const archiveStartsFresh = isArchiveCase
        const serverProgressAvailable = !archiveStartsFresh && serverGuesses.length > 0
        const shouldUseSavedProgress =
          !archiveStartsFresh &&
          Boolean(savedProgress && (savedProgress.caseId === data.id || savedProgress.key === pendingResumeKey)) &&
          (!serverProgressAvailable || (savedProgress?.guesses.length || 0) >= serverGuesses.length)

        if (shouldUseSavedProgress && savedProgress) {
          setGuesses(savedProgress.guesses)
          setGameWon(savedProgress.gameWon)
          setGameOver(savedProgress.gameOver)
          setMessage(savedProgress.message)
        } else if (serverProgressAvailable) {
          const solvedOnServer = solvedIndex >= 0
          const gameOverOnServer = solvedOnServer || serverGuesses.length >= maxGuessesForLoadedCase
          const serverMessage = solvedOnServer
            ? useQuizMode
              ? 'Correct — nice surgical anatomy pull.'
              : `Correct — solved in ${solvedIndex + 1} ${solvedIndex + 1 === 1 ? 'guess' : 'guesses'}.`
            : gameOverOnServer
              ? useQuizMode
                ? 'Incorrect.'
                : 'Out of guesses.'
              : `Not quite. ${maxGuessesForLoadedCase - serverGuesses.length} guesses remaining.`

          setGuesses(serverGuesses)
          setGameWon(solvedOnServer)
          setGameOver(gameOverOnServer)
          setMessage(serverMessage)
          saveRoundProgress({
            caseId: data.id,
            caseDate: data.case_date,
            level: data.level,
            isArchive: isArchiveCase,
            guesses: serverGuesses,
            gameWon: solvedOnServer,
            gameOver: gameOverOnServer,
            message: serverMessage,
          })
        } else {
          setGuesses([])
          setGameWon(false)
          setGameOver(false)
          setMessage('')
        }

        if (pendingResumeKey && savedProgress?.key === pendingResumeKey) {
          setPendingResumeKey(null)
        }

        const players = new Set<string>([
          ...publicVisitRows.map(item => item.session_id),
          ...publicGuessRows.map(item => item.session_id),
        ])

        const guessesBySession = new Map<
          string,
          Array<{ is_correct: boolean; created_at: string }>
        >()

        for (const guessRow of publicGuessRows) {
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
        const incorrectGuessCounts = new Map<string, { label: string; count: number }>()

        for (const sessionGuesses of guessesBySession.values()) {
          const solvedIndex = sessionGuesses.findIndex(item => item.is_correct)
          if (solvedIndex === -1) continue

          solvedPlayers += 1
          totalGuessesBeforeSolve += solvedIndex + 1

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

        const mostCommonIncorrectGuess =
          incorrectGuessCounts.size > 0
            ? [...incorrectGuessCounts.values()].sort((a, b) => {
                if (b.count !== a.count) return b.count - a.count
                return a.label.localeCompare(b.label)
              })[0].label
            : null

        const anatomyChoiceStats =
          data.level === 'attending' && canUseSurgicalAnatomyQuiz(data.case_date)
            ? buildAnatomyChoiceBreakdown(
                [data.clue_1, data.clue_2, data.clue_3, data.clue_4, data.clue_5, data.clue_6],
                publicGuessRows,
                [data.answer, ...(data.synonyms || [])]
              )
            : { responseCount: 0, breakdown: [] }

        setCommunityStats({
          solveRate: players.size > 0 ? (solvedPlayers / players.size) * 100 : null,
          averageGuessesPerPlayer:
            players.size > 0 ? publicGuessRows.length / players.size : null,
          averageGuessesToSolve:
            solvedPlayers > 0 ? totalGuessesBeforeSolve / solvedPlayers : null,
          firstTrySolveRate:
            solvedPlayers > 0 ? (firstTrySolves / solvedPlayers) * 100 : null,
          mostCommonIncorrectGuess,
          anatomyResponseCount: anatomyChoiceStats.responseCount,
          anatomyChoiceBreakdown: anatomyChoiceStats.breakdown,
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
  }, [caseParam, isAdminPreview, selectedLevel, selectedDate, today])

  function formatLevel(level: Level, dateText = selectedDate) {
    if (level === 'med_student') return 'Med Student'
    if (level === 'resident') return 'Resident'
    return isSurgicalAnatomyDate(dateText) ? 'Anatomy' : 'Attending'
  }

  function formatArchiveDate(dateText: string) {
    return new Date(`${dateText}T12:00:00`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const findings = useMemo(() => {
    if (!dailyCase) return []

    return [
      dailyCase.clue_1,
      dailyCase.clue_2,
      dailyCase.clue_3,
      dailyCase.clue_4,
      dailyCase.clue_5,
      dailyCase.clue_6,
    ].filter(
      (item): item is string => Boolean(item && item.trim())
    )
  }, [dailyCase])

  const surgicalAnatomyChoices = useMemo(
    () =>
      [dailyCase?.clue_1, dailyCase?.clue_2, dailyCase?.clue_3, dailyCase?.clue_4, dailyCase?.clue_5, dailyCase?.clue_6].filter(
        (item): item is string => Boolean(item && item.trim())
      ),
    [dailyCase]
  )

  const isSurgicalAnatomyMode =
    selectedLevel === 'attending' && canUseSurgicalAnatomyQuiz(dailyCase?.case_date || selectedDate)
  const hasValidSurgicalAnatomyChoices = surgicalAnatomyChoices.length >= 2
  const useSurgicalAnatomyQuiz = isSurgicalAnatomyMode && hasValidSurgicalAnatomyChoices
  const maxGuessesForCurrentCase = isSurgicalAnatomyMode ? 1 : MAX_GUESSES
  const selectedQuizGuess = useSurgicalAnatomyQuiz && guesses.length > 0 ? guesses[guesses.length - 1] : null
  const normalizedCorrectAnswers = useMemo(() => {
    const pool = [dailyCase?.answer || '', ...(dailyCase?.synonyms || [])]
    return new Set(pool.map(item => normalizeAnswer(item)).filter(Boolean))
  }, [dailyCase])
  const selectedQuizAnswerNormalized = selectedQuizGuess
    ? normalizeAnswer(stripChoicePrefix(selectedQuizGuess.text))
    : ''

  const roundComplete = gameWon || gameOver

  const unlockedFindings = roundComplete
    ? findings.length
    : Math.min(guesses.filter(g => !g.correct).length, findings.length)

  const visibleFindings = findings.slice(0, unlockedFindings)
  const imageRevealStep =
    dailyCase?.image_url && dailyCase?.image_reveal_clue !== null && dailyCase?.image_reveal_clue !== undefined
      ? dailyCase.image_reveal_clue
      : null
  const secondImageRevealStep =
    dailyCase?.image_url_2 &&
    dailyCase?.image_reveal_clue_2 !== null &&
    dailyCase?.image_reveal_clue_2 !== undefined
      ? dailyCase.image_reveal_clue_2
      : null
  const firstImageRevealed =
    Boolean(dailyCase?.image_url) &&
    (useSurgicalAnatomyQuiz
      ? (isPostAnswerImageReveal(imageRevealStep) ? roundComplete : true)
      : roundComplete || imageRevealStep === null || unlockedFindings >= imageRevealStep)
  const secondImageRevealed =
    Boolean(dailyCase?.image_url_2) &&
    (useSurgicalAnatomyQuiz
      ? (isPostAnswerImageReveal(secondImageRevealStep) ? roundComplete : true)
      : roundComplete || secondImageRevealStep === null || unlockedFindings >= secondImageRevealStep)
  const imageRevealed = firstImageRevealed || secondImageRevealed
  const visibleImages = [
    firstImageRevealed && dailyCase?.image_url
      ? { url: dailyCase.image_url, credit: dailyCase.image_credit, alt: 'Case image 1' }
      : null,
    secondImageRevealed && dailyCase?.image_url_2
      ? { url: dailyCase.image_url_2, credit: dailyCase.image_credit_2, alt: 'Case image 2' }
      : null,
  ].filter(Boolean) as ExpandableImage[]
  const currentExpandedImages = expandedImages.length > 0 ? expandedImages : visibleImages
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
      window.setTimeout(() => setShowConfetti(false), 1850)
    })
  }

  function resumeSavedRound() {
    if (!resumeRound) return
    setPendingResumeKey(resumeRound.key)
    setSelectedDate(resumeRound.caseDate)
    setSelectedLevel(resumeRound.level)
    setMessage(
      `Resumed your ${resumeRound.isArchive ? 'archive' : 'daily'} ${formatLevel(resumeRound.level)} case with ${resumeRound.guesses.length} guess${resumeRound.guesses.length === 1 ? '' : 'es'} saved.`
    )
  }

  function dismissResumeRound() {
    if (!resumeRound || typeof window === 'undefined') return
    const nextToken = `${resumeRound.key}:${resumeRound.updatedAt}`
    window.localStorage.setItem(RESUME_ROUND_DISMISS_KEY, nextToken)
    setDismissedResumeRoundToken(nextToken)
  }

  function resetExpandedImageView() {
    setImageScale(1)
    setImageOffset({ x: 0, y: 0 })
    imagePanStart.current = null
    imagePinchStart.current = null
    imageScaleStart.current = 1
  }

  function openExpandedImage(index = 0, images: ExpandableImage[] = visibleImages) {
    if (images.length === 0) return
    resetExpandedImageView()
    setExpandedImages(images)
    setExpandedImageIndex(index)
    setImageExpanded(true)
  }

  function closeExpandedImage() {
    setImageExpanded(false)
    setExpandedImageIndex(0)
    setExpandedImages([])
    resetExpandedImageView()
  }

  function buildShareText() {
    const score = gameWon ? `${guesses.length}/${maxGuessesForCurrentCase}` : `X/${maxGuessesForCurrentCase}`
    const boxes = Array.from({ length: maxGuessesForCurrentCase }, (_, index) => {
      const item = guesses[index]

      if (!item) return '⬜'
      return item.correct ? '🟩' : '🟧'
    }).join('')
    const prettyDate = formatArchiveDate(dailyCase?.case_date || selectedDate)
    const archiveLabel = (dailyCase?.case_date || selectedDate) === todayISO() ? '' : ' Archive'

    return [
      `ORTHODLE${archiveLabel.toUpperCase()} ${score}`,
      selectedTaglines[selectedLevel]
        ? `${formatLevel(selectedLevel).toUpperCase()} • ${selectedTaglines[selectedLevel]}`
        : formatLevel(selectedLevel).toUpperCase(),
      prettyDate,
      boxes,
      'orthodle.com',
    ].join('\n')
  }

  async function shareResult() {
    const shareText = buildShareText()

    if (navigator.share) {
      try {
        await navigator.share({
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

  async function subscribeToReminder() {
    const email = reminderEmail.trim()

    if (!email) {
      setReminderStatus('Enter an email to get the reminder.')
      return
    }

    setIsSavingReminder(true)
    setReminderStatus('')

    try {
      const response = await fetch('/api/reminders/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          timezone: getBrowserTimezone(),
          sourcePath: window.location.pathname,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        setReminderStatus(data.error || 'Could not save your reminder.')
        return
      }

      setReminderStatus(data.message || 'You’re signed up.')
      setReminderEmail('')
    } catch {
      setReminderStatus('Could not save your reminder.')
    } finally {
      setIsSavingReminder(false)
    }
  }

  async function submitQuickReaction(tag: string) {
    if (!dailyCase) return
    if (submittedReactionTags.includes(tag)) {
      setReactionStatus('You already sent that reaction for this case.')
      return
    }
    if (tag === 'Too easy' && submittedReactionTags.includes('Too hard')) {
      setReactionStatus('You already marked this case as too hard.')
      return
    }
    if (tag === 'Too hard' && submittedReactionTags.includes('Too easy')) {
      setReactionStatus('You already marked this case as too easy.')
      return
    }

    setSubmittingReaction(tag)
    setReactionStatus('')

    if (isLocalhostBrowser()) {
      const nextTags = [...submittedReactionTags, tag]
      setSubmittedReactionTags(nextTags)
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(
          `${REACTION_STORAGE_PREFIX}:${dailyCase.id}`,
          JSON.stringify(nextTags)
        )
      }
      setReactionStatus('Saved locally for testing only.')
      setSubmittingReaction(null)
      return
    }

    if (isTrackingDisabledForThisBrowser()) {
      const nextTags = [...submittedReactionTags, tag]
      setSubmittedReactionTags(nextTags)
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(
          `${REACTION_STORAGE_PREFIX}:${dailyCase.id}`,
          JSON.stringify(nextTags)
        )
      }
      setReactionStatus('Saved locally on this device only.')
      setSubmittingReaction(null)
      return
    }

    const { error } = await supabase.from('case_feedback').insert({
      case_id: dailyCase.id,
      case_date: dailyCase.case_date,
      level: dailyCase.level,
      answer: dailyCase.answer,
      feedback_text: '',
      feedback_tags: [tag],
      session_id: getSessionId() || null,
    })

    if (error) {
      setReactionStatus('Could not save reaction right now.')
      setSubmittingReaction(null)
      return
    }

    const nextTags = [...submittedReactionTags, tag]
    setSubmittedReactionTags(nextTags)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(
        `${REACTION_STORAGE_PREFIX}:${dailyCase.id}`,
        JSON.stringify(nextTags)
      )
    }
    setReactionStatus('Thanks for the feedback.')
    setSubmittingReaction(null)
  }

  async function submitTypedFeedback() {
    if (!dailyCase) return

    const trimmed = feedbackText.trim()

    if (!trimmed) {
      setFeedbackStatus('Add a note before sending.')
      return
    }

    setIsSavingFeedback(true)
    setFeedbackStatus('')

    if (isLocalhostBrowser()) {
      setFeedbackStatus('Saved locally for testing only.')
      setFeedbackText('')
      setIsSavingFeedback(false)
      return
    }

    if (isTrackingDisabledForThisBrowser()) {
      setFeedbackStatus('Saved locally on this device only.')
      setFeedbackText('')
      setIsSavingFeedback(false)
      return
    }

    const { error } = await supabase.from('case_feedback').insert({
      case_id: dailyCase.id,
      case_date: dailyCase.case_date,
      level: dailyCase.level,
      answer: dailyCase.answer,
      feedback_text: trimmed,
      feedback_tags: [],
      session_id: getSessionId() || null,
    })

    if (error) {
      setFeedbackStatus('Could not save feedback right now.')
      setIsSavingFeedback(false)
      return
    }

    setFeedbackText('')
    setFeedbackStatus('Thanks for the feedback.')
    setIsSavingFeedback(false)
  }

  function renderFormattedLine(line: string, keyPrefix = 'inline'): React.ReactNode[] {
    const matches = [
      { type: 'link' as const, match: line.match(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/) },
      { type: 'underline' as const, match: line.match(/<u>(.*?)<\/u>/) },
      { type: 'bold' as const, match: line.match(/\*\*(.+?)\*\*/) },
      { type: 'italic' as const, match: line.match(/\*(?!\*)(.+?)\*(?!\*)/) },
    ]
      .filter((entry): entry is { type: 'link' | 'underline' | 'bold' | 'italic'; match: RegExpMatchArray } => Boolean(entry.match))
      .sort((a, b) => (a.match.index ?? 0) - (b.match.index ?? 0))

    const firstMatch = matches[0]
    if (!firstMatch) {
      return [<span key={`${keyPrefix}-text`}>{line}</span>]
    }

    const matchIndex = firstMatch.match.index ?? 0
    const fullMatch = firstMatch.match[0]
    const innerText = firstMatch.match[1] ?? ''
    const linkHref = firstMatch.type === 'link' ? firstMatch.match[2] ?? '' : ''
    const before = line.slice(0, matchIndex)
    const after = line.slice(matchIndex + fullMatch.length)
    const nodes: React.ReactNode[] = []

    if (before) {
      nodes.push(...renderFormattedLine(before, `${keyPrefix}-before`))
    }

    const innerNodes = renderFormattedLine(innerText, `${keyPrefix}-${firstMatch.type}`)
    if (firstMatch.type === 'link') {
      nodes.push(
        <a
          key={`${keyPrefix}-link`}
          href={linkHref}
          target="_blank"
          rel="noreferrer noopener"
          className="font-semibold text-[#1f6ad8] underline decoration-[#1f6ad8]/50 underline-offset-2 transition hover:text-[#174c9c]"
        >
          {innerNodes}
        </a>
      )
    } else if (firstMatch.type === 'underline') {
      nodes.push(<u key={`${keyPrefix}-underline`}>{innerNodes}</u>)
    } else if (firstMatch.type === 'bold') {
      nodes.push(<strong key={`${keyPrefix}-bold`}>{innerNodes}</strong>)
    } else {
      nodes.push(<em key={`${keyPrefix}-italic`}>{innerNodes}</em>)
    }

    if (after) {
      nodes.push(...renderFormattedLine(after, `${keyPrefix}-after`))
    }

    return nodes
  }

  function parseTeachingPointSections(text: string): TeachingPointSection[] {
    const lines = text.split('\n')
    const sections: TeachingPointSection[] = []
    let currentSection: TeachingPointSection | null = null

    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line) {
        if (currentSection && currentSection.body[currentSection.body.length - 1] !== '') {
          currentSection.body.push('')
        }
        continue
      }

      const strippedLine = line
        .replace(/<\/?u>/g, '')
        .replace(/\*\*/g, '')
        .replace(/\*(?!\*)/g, '')

      const headingMatch = strippedLine.match(/^([A-Za-z][A-Za-z'’ /\-]+):\s*(.*)$/)
      if (headingMatch) {
        const colonIndex = line.indexOf(':')
        const rawLabel = colonIndex >= 0 ? line.slice(0, colonIndex).trim() : headingMatch[1].trim()
        const rest = colonIndex >= 0 ? line.slice(colonIndex + 1).trim() : headingMatch[2].trim()
        const normalizedLabel = headingMatch[1]
          .trim()
          .toLowerCase()
          .replace(/[’']/g, "'")
          .replace(/[^a-z' ]/g, '')
          .replace(/\s+/g, ' ')
        const canonicalLabel = TEACHING_POINT_LABELS.get(normalizedLabel)
        if (!canonicalLabel) {
          if (!currentSection) {
            currentSection = {
              label: 'Quick takeaway',
              body: [line],
            }
            sections.push(currentSection)
          } else {
            currentSection.body.push(line)
          }
          continue
        }
        const displayLabel = rawLabel.includes(headingMatch[1].trim())
          ? rawLabel.replace(headingMatch[1].trim(), canonicalLabel)
          : canonicalLabel
        currentSection = {
          label: displayLabel,
          body: rest ? [rest.trim()] : [],
        }
        sections.push(currentSection)
        continue
      }

      if (!currentSection) {
        currentSection = {
          label: 'Quick takeaway',
          body: [line],
        }
        sections.push(currentSection)
        continue
      }

      currentSection.body.push(line)
    }

    return sections.filter(section => section.body.some(line => line.trim()))
  }

  function getOrthodleInsightLines() {
    if (!communityStats) return []

    if (useSurgicalAnatomyQuiz) {
      if (communityStats.anatomyChoiceBreakdown.length === 0) return []
      return [
        'Answer distribution:',
        ...communityStats.anatomyChoiceBreakdown.map(
          choice => `${choice.letter}. ${choice.label}: **${Math.round(choice.rate)}%**`
        ),
      ]
    }

    const solveRate =
      communityStats.solveRate !== null ? `${Math.round(communityStats.solveRate)}%` : '—'
    const avgToSolve =
      communityStats.averageGuessesToSolve !== null
        ? communityStats.averageGuessesToSolve.toFixed(1)
        : '—'
    const firstTry =
      communityStats.firstTrySolveRate !== null
        ? `${Math.round(communityStats.firstTrySolveRate)}%`
        : '—'

    let difficultyRead = 'Mixed signal case'
    if (communityStats.solveRate !== null) {
      if (communityStats.solveRate >= 75) difficultyRead = 'Pattern-recognition heavy case'
      else if (communityStats.solveRate >= 50) difficultyRead = 'Moderate difficulty case'
      else difficultyRead = 'Tougher-than-usual case'
    }

    return [
      `Solve rate: **${solveRate}**`,
      `Avg to solve: **${avgToSolve}**`,
      `First-try solves: **${firstTry}**`,
      ...(communityStats.mostCommonIncorrectGuess
        ? [`Most common wrong guess: **${communityStats.mostCommonIncorrectGuess}**`]
        : []),
      `Orthodle read: **${difficultyRead}**`,
    ]
  }

  function renderTeachingPoint(text: string) {
    const sections = parseTeachingPointSections(text)
    const insightLines = getOrthodleInsightLines()
    const hasInsightSection = sections.some(
      section => section.label.toLowerCase() === 'orthodle insight'
    )
    const allSections =
      !hasInsightSection && insightLines.length > 0
        ? [...sections, { label: 'Orthodle Insight', body: insightLines }]
        : sections

    if (allSections.length === 0) {
      return (
        <p className="font-serif text-[15px] leading-6 tracking-[-0.01em] text-[#102018]">
          {renderFormattedLine(text)}
        </p>
      )
    }

    return (
      <div className="orthodle-teaching-card rounded-xl bg-[#fcfbf8] px-3 py-2.5">
        <div className="space-y-3">
          {allSections.map((section, sectionIndex) => (
            <div
              key={section.label}
              className={sectionIndex > 0 ? 'border-t border-[#ebe5db] pt-3' : ''}
            >
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#315f4d]">
                {renderFormattedLine(section.label, `label-${sectionIndex}`)}
              </div>
              <div className="mt-1.5 space-y-1.5">
                {section.body.map((line, index) =>
                  line ? (
                    <p
                      key={`${section.label}-${index}`}
                      className="font-serif text-[15px] leading-6 tracking-[-0.01em] text-[#102018]"
                    >
                      {renderFormattedLine(line)}
                    </p>
                  ) : (
                    <div key={`${section.label}-${index}`} className="h-1" />
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  function renderCasePrompt(text: string) {
    return text.split('\n').map((line, index) =>
      line.trim() ? (
        <p key={index} className="font-serif text-[15px] leading-[1.55] tracking-[-0.01em] text-[#102018] sm:text-[17px]">
          {line}
        </p>
      ) : (
        <div key={index} className="h-4" />
      )
    )
  }

  function renderAnatomyLearningImages(caseItem: Case) {
    if (!useSurgicalAnatomyQuiz) return null

    const learningImages = [
      caseItem.learning_image_url
        ? {
            url: caseItem.learning_image_url,
            credit: caseItem.learning_image_credit,
            alt: 'Anatomy teaching image 1',
          }
        : null,
      caseItem.learning_image_url_2
        ? {
            url: caseItem.learning_image_url_2,
            credit: caseItem.learning_image_credit_2,
            alt: 'Anatomy teaching image 2',
          }
        : null,
    ].filter(Boolean) as ExpandableImage[]

    if (learningImages.length === 0) return null

    return (
      <div className="orthodle-anatomy-teaching-shell rounded-xl border border-[#ebe5db] bg-[#fcfbf8] p-2.5 sm:p-3">
        <div className="mb-2 text-center text-[10px] font-bold uppercase tracking-[0.18em] text-[#315f4d]">
          Teaching Images
        </div>
        <div className={`grid gap-2 ${learningImages.length > 1 ? 'sm:grid-cols-2' : 'grid-cols-1'}`}>
          {learningImages.map((image, index) => (
            <div
              key={`${image.url}-${index}`}
              className="orthodle-anatomy-teaching-tile overflow-hidden rounded-xl border border-[#ded7ca] bg-white"
            >
                          <button
                            type="button"
                            onClick={() => openExpandedImage(index, learningImages)}
                            className="orthodle-anatomy-teaching-frame flex min-h-[170px] w-full items-center justify-center bg-[#f8f5ee] p-2 transition hover:bg-[#f4efe4]"
                          >
                            <img
                              src={image.url}
                              alt={image.alt}
                              className="max-h-[320px] w-full rounded-lg object-contain"
                            />
                          </button>
              {image.credit?.trim() ? (
                <p className="px-2.5 pb-2.5 pt-1.5 text-[11px] text-[#8a948d]">
                  {image.credit}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    )
  }

  function formatGuessDisplayText(value: string | undefined) {
    if (typeof value !== 'string') return '—'
    return value.trim().length > 0 ? value : 'blank'
  }

  const filteredAnswerOptions = useMemo(() => {
    const query = normalizeAnswer(guess)
    if (!query || query.length < 2 || isTooGenericSuggestionQuery(query)) return []

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

  async function submitGuess(submittedGuess?: string, displayGuess?: string) {
    if (!dailyCase || gameWon || gameOver) return

    const currentGuess = typeof submittedGuess === 'string' ? submittedGuess.trim() : guess.trim()
    const displayedGuess = typeof displayGuess === 'string' ? displayGuess.trim() : currentGuess
    const data = isAdminPreview
      ? (() => {
          const accepted = [dailyCase.answer, ...(dailyCase.synonyms || [])]
          const isAnatomyPreview = dailyCase.level === 'attending' && surgicalAnatomyChoices.length >= 2
          const correct = isAnatomyPreview
            ? accepted
                .map(answer => normalizeAnswer(answer))
                .filter(Boolean)
                .includes(normalizeAnswer(currentGuess))
            : isAcceptedGuess(currentGuess, accepted)
          return { correct, remaining: Math.max(0, maxGuessesForCurrentCase - (guesses.length + 1)) }
        })()
      : await (async () => {
          const sessionId = getSessionId()
          const res = await fetch('/api/guess', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              caseId: dailyCase.id,
              guess: currentGuess,
              sessionId,
              doNotTrack: isTrackingDisabledForThisBrowser(),
            }),
          })

          return res.json()
        })()
    const nextGuessCount = guesses.length + 1

    const nextGuesses = [...guesses, { text: displayedGuess, correct: data.correct }]

    setGuesses(nextGuesses)
    setGuess('')

    if (data.correct) {
      setGameWon(true)
      setJustCompletedRound(true)
      const nextMessage = useSurgicalAnatomyQuiz
        ? 'Correct — nice surgical anatomy pull.'
        : `Correct — solved in ${nextGuessCount} ${
            nextGuessCount === 1 ? 'guess' : 'guesses'
          }.`
      setMessage(nextMessage)
      if (!isAdminPreview) {
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
      }
      if (typeof window !== 'undefined' && window.innerWidth < 640) {
        triggerSuccessPulse()
      } else {
        triggerSuccessPulse()
        triggerConfetti()
      }
      return
    }

    triggerShake()

    if (nextGuessCount >= maxGuessesForCurrentCase) {
      setGameOver(true)
      setJustCompletedRound(true)
      const nextMessage = useSurgicalAnatomyQuiz ? 'Incorrect.' : 'Out of guesses.'
      setMessage(nextMessage)
      if (!isAdminPreview) {
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
      }
      return
    }

    const nextMessage = `Not quite. ${maxGuessesForCurrentCase - nextGuessCount} guesses remaining.`
    setMessage(nextMessage)
    if (!isAdminPreview) {
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
    if (!isMobileInputFocused) return

    const timeoutId = window.setTimeout(() => {
      inputSectionRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      })
    }, 120)

    return () => window.clearTimeout(timeoutId)
  }, [isMobileInputFocused])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleGoHome = () => {
      if (selectedDate === today && !caseParam) return
      setSelectedDate(today)
      setMessage('')
      setJustCompletedRound(false)
      setGuess('')
    }

    window.addEventListener('orthodle:go-home', handleGoHome)
    return () => window.removeEventListener('orthodle:go-home', handleGoHome)
  }, [caseParam, selectedDate, today])

  useEffect(() => {
    if (isAdminPreview) return
    if (typeof window === 'undefined') return
    if (!caseParam && selectedDate === today) return

    const params = new URLSearchParams()
    if (selectedLevel !== 'med_student') {
      params.set('level', selectedLevel)
    }
    const nextUrl = params.toString() ? `/?${params.toString()}` : '/'
    window.history.replaceState({}, '', nextUrl)
  }, [caseParam, isAdminPreview, selectedDate, selectedLevel, today])

  useEffect(() => {
    if (isAdminPreview) return
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
    setResumeRound(getLatestUnfinishedRoundProgress())
  }, [dailyCase, gameWon, guesses, isAdminPreview, roundComplete])

  useEffect(() => {
    if (typeof window === 'undefined') return
    setResumeRound(getLatestUnfinishedRoundProgress())
  }, [selectedDate, selectedLevel, dailyCase?.id, guesses.length, gameWon, gameOver])

  useEffect(() => {
    if (!roundComplete || !justCompletedRound) return
    if (typeof window === 'undefined' || window.innerWidth >= 640) return

    const timeoutId = window.setTimeout(() => {
      solvedCardRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })

      if (gameWon) {
        window.setTimeout(() => {
          triggerConfetti()
          triggerSuccessPulse()
        }, 520)
      }
    }, gameWon ? 500 : 280)

    return () => window.clearTimeout(timeoutId)
  }, [gameWon, justCompletedRound, roundComplete])

  const todayCompletedLevels = new Set(
    dailySummary.levels
      .filter(item => item.won || item.guessesUsed === 6)
      .map(item => item.level)
  ).size

  const homeTabs = useMemo(
    () =>
      noResidentModeActiveToday
        ? baseHomeTabs.filter(item => !(item.type === 'level' && item.key === 'resident'))
        : baseHomeTabs,
    [noResidentModeActiveToday]
  )
  const nextLevelMap = useMemo<Partial<Record<Level, Level>>>(
    () =>
      noResidentModeActiveToday
        ? {
            med_student: 'attending',
          }
        : {
            med_student: 'resident',
            resident: 'attending',
          },
    [noResidentModeActiveToday]
  )
  const requiredDailyLevels = noResidentModeActiveToday ? 2 : 3
  const todayComplete = todayCompletedLevels === requiredDailyLevels
  const onTodayCard = selectedDate === todayISO()
  const resumeRoundIsCurrent = Boolean(
    resumeRound &&
      resumeRound.caseDate === selectedDate &&
      resumeRound.level === selectedLevel &&
      resumeRound.isArchive === (selectedDate !== todayISO())
  )
  const resumeRoundDismissToken = resumeRound ? `${resumeRound.key}:${resumeRound.updatedAt}` : null
  const showResumeRound =
    Boolean(resumeRound) &&
    !resumeRoundIsCurrent &&
    resumeRoundDismissToken !== dismissedResumeRoundToken
  const nextLevel = nextLevelMap[selectedLevel]
  const statsSummary = useMemo(() => getStatsSummary(), [dailySummary])
  const selectedTaglines = useMemo(
    () =>
      ({
        med_student: levelTaglines.med_student[0] || DEFAULT_LEVEL_TAGLINES.med_student[0],
        resident: levelTaglines.resident[0] || DEFAULT_LEVEL_TAGLINES.resident[0],
        attending: levelTaglines.attending[0] || DEFAULT_LEVEL_TAGLINES.attending[0],
      }) as Record<Level, string>,
    [levelTaglines]
  )
  const levelStreak = statsSummary.levelStreaks[selectedLevel]?.current || 0
  const activeExpandedImage =
    currentExpandedImages[expandedImageIndex] || currentExpandedImages[0] || null
  const streakBadge =
    onTodayCard && statsSummary.currentStreak >= 2
      ? `${statsSummary.currentStreak}-DAY STREAK`
      : null
  const isFirstTrySolve = gameWon && guesses.length === 1
  const solvedHeadline = gameWon
    ? useSurgicalAnatomyQuiz
      ? isFirstTrySolve
        ? 'Anatomy ace'
        : 'Anatomy solved'
      : isFirstTrySolve
        ? 'First-try finish'
        : 'Case cracked'
    : 'Case review'
  const solvedEyebrow = gameWon
    ? useSurgicalAnatomyQuiz
      ? 'Teaching moment unlocked'
      : 'Diagnosis locked in'
    : 'Worth the replay'
  const solvedSubline = gameWon
    ? useSurgicalAnatomyQuiz
      ? isFirstTrySolve
        ? 'One click, one clean pull.'
        : `Locked in on choice ${guesses.length}.`
      : isFirstTrySolve
        ? 'Straight to the answer.'
        : `Solved in ${guesses.length} ${guesses.length === 1 ? 'guess' : 'guesses'}.`
    : 'Missed this one, but the takeaway below is worth the round.'
  const solvedHighlights = [
    {
      label: 'Result',
      value: gameWon ? (isFirstTrySolve ? 'First try' : 'Solved') : 'Missed',
      tone: gameWon ? 'text-[#1f6448]' : 'text-[#a24d24]',
    },
    {
      label: useSurgicalAnatomyQuiz ? 'Choice' : 'Guesses',
      value: gameWon ? String(guesses.length) : `${guesses.length}/${maxGuessesForCurrentCase}`,
      tone: 'text-[#102018]',
    },
    {
      label: onTodayCard ? 'Streak' : 'Date',
      value: onTodayCard ? `${Math.max(levelStreak, 0)}-day` : formatArchiveDate(selectedDate),
      tone: onTodayCard && levelStreak >= 1 ? 'text-[#a24d24]' : 'text-[#102018]',
    },
    {
      label: 'Crowd',
      value:
        communityStats?.solveRate !== null ? `${Math.round(communityStats.solveRate)}% solve` : 'No stats yet',
      tone: 'text-[#315f4d]',
    },
  ]
  const hasMobileInteraction =
    guesses.length > 0 ||
    guess.trim().length > 0 ||
    selectedLevel !== 'med_student' ||
    roundComplete
  const canAdvanceToNextLevel =
    Boolean(nextLevel) && onTodayCard && roundComplete && !caseParam && !imageExpanded

  useEffect(() => {
    if (!onTodayCard || !todayComplete || typeof window === 'undefined') return
    const celebrationKey = `orthodle_daily_complete_${today}`
    if (window.sessionStorage.getItem(celebrationKey)) return
    window.sessionStorage.setItem(celebrationKey, 'true')
    triggerConfetti()
    triggerSuccessPulse()
  }, [onTodayCard, todayComplete, today])

  function moveToNextLevel() {
    if (!nextLevel) return
    setIsTransitioningLevel(true)
    setSelectedLevel(nextLevel)
    setGuess('')
    setMessage('')
    setImageHidden(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
    window.setTimeout(() => setIsTransitioningLevel(false), 550)
  }

  const latestFindingIndex =
    !roundComplete && unlockedFindings > 0 ? visibleFindings.length - 1 : -1
  const homepageAnnouncementKey = homepageAnnouncement
    ? `${homepageAnnouncement.id}:${homepageAnnouncement.message}`
    : null
  const homepageSurveyKey = homepageSurvey
    ? `${homepageSurvey.id}:${homepageSurvey.question}`
    : null
  const sharedHomepageSurveyKey = sharedHomepageSurvey.survey
    ? `${sharedHomepageSurvey.survey.id}:${sharedHomepageSurvey.survey.question}`
    : null
  const showHomepageAnnouncement =
    onTodayCard &&
    Boolean(homepageAnnouncement) &&
    homepageAnnouncementKey !== dismissedHomepageAnnouncementKey
  const showSharedHomepageSurvey =
    onTodayCard &&
    Boolean(sharedHomepageSurvey.survey) &&
    sharedHomepageSurveyKey !== dismissedHomepageSurveyKey &&
    !sharedHomepageSurvey.submittedChoice
  const showHomepageSurvey =
    !showSharedHomepageSurvey &&
    onTodayCard &&
    Boolean(homepageSurvey) &&
    homepageSurveyKey !== dismissedHomepageSurveyKey &&
    !submittedHomepageSurveyChoice
  const anatomySurveyStorageKey = anatomySurvey ? getAnatomySurveyStorageKey(anatomySurvey) : null
  const shouldShowSharedPostCaseSurvey =
    roundComplete &&
    Boolean(sharedPostCaseSurvey.survey) &&
    !sharedPostCaseSurvey.submittedChoice &&
    doesSurveyApplyToLevel(sharedPostCaseSurvey.survey.level_scope, selectedLevel)
  const shouldShowAnatomySurvey =
    !shouldShowSharedPostCaseSurvey &&
    roundComplete &&
    useSurgicalAnatomyQuiz &&
    Boolean(anatomySurvey) &&
    !submittedAnatomySurveyChoice
  const topBannerCount =
    Number(showHomepageAnnouncement) +
    Number(showHomepageSurvey) +
    Number(showSharedHomepageSurvey) +
    Number(showResumeRound)

  function dismissHomepageAnnouncement() {
    if (!homepageAnnouncementKey || typeof window === 'undefined') return
    window.localStorage.setItem(HOMEPAGE_ANNOUNCEMENT_DISMISS_KEY, homepageAnnouncementKey)
    setDismissedHomepageAnnouncementKey(homepageAnnouncementKey)
  }

  function dismissHomepageSurvey() {
    if (typeof window === 'undefined') return
    const keyToDismiss = sharedHomepageSurveyKey || homepageSurveyKey
    if (!keyToDismiss) return
    window.localStorage.setItem(HOMEPAGE_SURVEY_DISMISS_KEY, keyToDismiss)
    setDismissedHomepageSurveyKey(keyToDismiss)
  }

  function dismissTutorial() {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(TUTORIAL_DISMISS_KEY, 'true')
    setShowTutorial(false)
  }

  useEffect(() => {
    if (typeof window === 'undefined' || !anatomySurveyStorageKey) {
      setSubmittedAnatomySurveyChoice(null)
      return
    }

    const savedChoice = window.localStorage.getItem(anatomySurveyStorageKey)
    setSubmittedAnatomySurveyChoice(savedChoice)
  }, [anatomySurveyStorageKey])

  return (
    <main className="app-surface min-h-screen">
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
          35% {
            transform: scale(1.04);
            box-shadow: 0 0 0 12px rgba(31, 122, 77, 0.08);
          }
          65% {
            transform: scale(0.995);
            box-shadow: 0 0 0 20px rgba(31, 122, 77, 0);
          }
          100% {
            transform: scale(1);
            box-shadow: 0 0 0 0 rgba(31, 122, 77, 0);
          }
        }

        @keyframes orthodle-confetti-burst {
          0% {
            opacity: 0;
            transform: translate3d(0, 0, 0) rotate(0deg) scale(0.7);
          }
          8% {
            opacity: 1;
          }
          25% {
            opacity: 1;
            transform: translate3d(var(--burst-x), calc(var(--burst-y) * -1), 0) rotate(calc(var(--rotation) * 0.45)) scale(1);
          }
          100% {
            opacity: 0;
            transform: translate3d(calc(var(--burst-x) + var(--drift-x)), 96vh, 0) rotate(calc(var(--rotation) * 2.2)) scale(0.92);
          }
        }

        @keyframes orthodle-answer-pop {
          0% {
            opacity: 0;
            transform: translateY(6px) scale(0.98);
          }
          60% {
            opacity: 1;
            transform: translateY(0) scale(1.02);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes orthodle-fade-up {
          0% {
            opacity: 0;
            transform: translateY(8px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes orthodle-soft-shimmer {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }

        .orthodle-shake {
          animation: orthodle-shake 0.42s ease-in-out;
        }

        .orthodle-reveal {
          animation: orthodle-reveal 0.32s ease-out both;
        }

        .orthodle-success-pulse {
          animation: orthodle-success-pulse 1.05s cubic-bezier(0.2, 0.8, 0.2, 1);
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
          animation-name: orthodle-confetti-burst;
          animation-timing-function: ease-out;
          animation-fill-mode: forwards;
          will-change: transform, opacity;
        }

        .orthodle-answer-pop {
          animation: orthodle-answer-pop 0.5s ease-out both;
        }

        .orthodle-fade-up {
          animation: orthodle-fade-up 0.32s ease-out both;
        }

        .orthodle-skeleton {
          background: linear-gradient(
            90deg,
            rgba(222, 215, 202, 0.45) 0%,
            rgba(247, 244, 238, 0.9) 50%,
            rgba(222, 215, 202, 0.45) 100%
          );
          background-size: 200% 100%;
          animation: orthodle-soft-shimmer 1.6s linear infinite;
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
                ['--burst-x' as string]: `${piece.burstX}px`,
                ['--burst-y' as string]: `${piece.burstY}px`,
                ['--drift-x' as string]: `${piece.driftX}px`,
                ['--rotation' as string]: `${piece.rotation}deg`,
                transform:
                  piece.shape === 'diamond'
                    ? `rotate(${piece.rotation}deg)`
                    : piece.shape === 'circle'
                      ? 'rotate(0deg)'
                      : `rotate(${piece.rotation}deg)`,
                width: `${piece.size}px`,
                height: piece.shape === 'circle' ? `${piece.size}px` : `${piece.size * 1.7}px`,
                borderRadius:
                  piece.shape === 'circle' ? '999px' : piece.shape === 'diamond' ? '3px' : '999px',
              }}
            />
          ))}
        </div>
      )}

      {showTutorial && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#102018]/60 px-4">
          <div className="w-full max-w-sm rounded-[24px] border border-[#e7e1d6] bg-white p-4 shadow-[0_18px_40px_rgba(16,32,24,0.18)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="mt-1.5 font-serif text-[25px] font-bold leading-tight tracking-[-0.03em] text-[#102018]">
                  How to play
                </h2>
              </div>
              <button
                type="button"
                onClick={dismissTutorial}
                aria-label="Close tutorial"
                className="rounded-full border border-[#ded7ca] bg-[#fbfaf7] px-2 py-1 text-[11px] font-semibold text-[#637268] transition hover:bg-white"
              >
                ×
              </button>
            </div>

            <div className="mt-3 space-y-2.5 text-[13px] leading-5.5 text-[#102018]">
              <p><strong>1.</strong> Read the case and narrow the diagnosis.</p>
              <p><strong>2.</strong> There are 3 new cases every day, each with increasing difficulty.</p>
              <p><strong>3.</strong> Wrong guesses unlock more clinical findings.</p>
              <p><strong>4.</strong> Imaging may appear later as part of the clues.</p>
              <p><strong>5.</strong> You get 6 guesses total for each case.</p>
            </div>

            <button
              type="button"
              onClick={dismissTutorial}
              className="mt-4 w-full rounded-xl bg-[#1f6448] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#174c37]"
            >
              Start playing
            </button>
          </div>
        </div>
      )}

      <section className={`mx-auto w-full max-w-[700px] px-4 text-center sm:px-0 sm:pt-6 ${hasMobileInteraction ? 'pt-1.5 pb-0 sm:pb-1' : 'pt-2 pb-0.5'}`}>
        {onTodayCard && todayComplete && (
          <div className="orthodle-panel-shell mt-3 w-full rounded-2xl border border-[#d8e5dd] bg-[#f8fbf9] px-3.5 py-2.5 text-center shadow-[0_10px_24px_rgba(16,32,24,0.08)] sm:px-5 sm:py-3.5">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#1f6448]">
              Daily card complete
            </div>
            <p className="mt-1.5 text-[11px] leading-4.5 text-[#637268] sm:text-[12px]">
              Fresh cases drop tomorrow. Keep the streak alive.
            </p>
            <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
              <div className="rounded-lg border border-[#cfded4] bg-white px-2 py-1">
                <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#637268]">
                  Solved
                </div>
                <div className="mt-0.5 font-serif text-[15px] font-bold text-[#1f6448]">
                  {dailySummary.wins}/3
                </div>
              </div>
              <div className="rounded-lg border border-[#ded7ca] bg-white px-2 py-1">
                <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#637268]">
                  Avg guesses
                </div>
                <div className="mt-0.5 font-serif text-[15px] font-bold text-[#102018]">
                  {dailySummary.averageGuesses !== null ? dailySummary.averageGuesses.toFixed(1) : '—'}
                </div>
              </div>
              <div className="rounded-lg border border-[#cfded4] bg-white px-2 py-1">
                <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#637268]">
                  Streak
                </div>
                <div className="mt-0.5 font-serif text-[15px] font-bold text-[#1f6448]">
                  {statsSummary.currentStreak}
                </div>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap justify-center gap-1.5">
              <Link
                href="/stats"
                className="rounded-full border border-[#cfded4] bg-white px-2.5 py-1 text-[9.5px] font-semibold text-[#1f6448] transition hover:bg-[#f7fbf8] sm:px-3.5 sm:py-1.5 sm:text-[11px]"
              >
                View stats
              </Link>
              <Link
                href="/archive"
                className="rounded-full border border-[#cfded4] bg-white px-2.5 py-1 text-[9.5px] font-semibold text-[#1f6448] transition hover:bg-[#f7fbf8] sm:px-3.5 sm:py-1.5 sm:text-[11px]"
              >
                Browse archive
              </Link>
            </div>
          </div>
        )}

        {showHomepageAnnouncement && homepageAnnouncement && (
          <div className="orthodle-fade-up mt-2 w-full rounded-2xl border border-[#ead9b7] bg-[#fffaf1] px-3 py-2 text-center shadow-[0_10px_24px_rgba(16,32,24,0.04)] sm:px-4 sm:py-2.5">
            <div className="flex items-start justify-between gap-3">
              <p className="flex-1 text-[11.5px] leading-4.5 text-[#102018] sm:text-[13px] sm:leading-5">
                {homepageAnnouncement.message}
              </p>
              <button
                type="button"
                onClick={dismissHomepageAnnouncement}
                aria-label="Dismiss message"
                className="shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-full border border-[#ead9b7] bg-white text-[13px] font-medium leading-none text-[#637268] transition hover:bg-[#fff8ef] hover:text-[#102018]"
              >
                <span className="-mt-px">×</span>
              </button>
            </div>
          </div>
        )}

        {showSharedHomepageSurvey && sharedHomepageSurvey.survey && (
          <div className="orthodle-fade-up mt-2 w-full rounded-2xl border border-[#ead9b7] bg-[#fffaf1] px-3 py-1.5 text-center shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
            <div className="mx-auto max-w-[560px]">
              <div className="text-center text-[8.5px] font-medium leading-[1.2] text-[#102018] sm:text-[12px]">
                {sharedHomepageSurvey.survey.question}
              </div>
              <div
                className={`mt-1.5 grid gap-1 ${
                  (sharedHomepageSurvey.survey.options || []).length > 3
                    ? 'grid-cols-2 sm:grid-cols-3'
                    : 'grid-cols-3'
                }`}
              >
                {(sharedHomepageSurvey.survey.options || []).map(option => {
                  const isSelected = sharedHomepageSurvey.submittedChoice === option
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => void submitSharedHomepageSurvey(option)}
                      disabled={Boolean(sharedHomepageSurvey.submittedChoice) || sharedHomepageSurvey.isSubmitting}
                      className={`min-w-0 rounded-lg border px-1 py-1 text-[6.5px] font-semibold leading-tight transition sm:px-2.5 sm:py-1.5 sm:text-[10px] ${
                        isSelected
                          ? 'border-[#cfded4] bg-[#eef7f2] text-[#1f6448]'
                          : 'border-[#ded7ca] bg-white text-[#102018] hover:bg-[#fbfaf7]'
                      } disabled:cursor-not-allowed disabled:opacity-80`}
                    >
                      {option}
                    </button>
                  )
                })}
              </div>
              {sharedHomepageSurvey.status && (
                <p className="mt-2 text-center text-[10px] font-medium text-[#1f6448] sm:text-[11px]">
                  {sharedHomepageSurvey.status}
                </p>
              )}
            </div>
          </div>
        )}

        {showHomepageSurvey && homepageSurvey && (
          <div className="orthodle-fade-up mt-2 w-full rounded-2xl border border-[#ead9b7] bg-[#fffaf1] px-3 py-1.5 text-center shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
            <div className="mx-auto max-w-[560px]">
              <div className="text-center text-[8.5px] font-medium leading-[1.2] text-[#102018] sm:text-[12px]">
                {homepageSurvey.question}
              </div>
              <div className="mt-1.5 grid grid-cols-3 gap-1">
                {[homepageSurvey.option_1, homepageSurvey.option_2, homepageSurvey.option_3].map(option => {
                  const isSelected = submittedHomepageSurveyChoice === option
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => void submitHomepageSurvey(option)}
                      disabled={Boolean(submittedHomepageSurveyChoice) || isSubmittingHomepageSurvey}
                      className={`min-w-0 rounded-lg border px-1 py-1 text-[6.5px] font-semibold leading-tight transition sm:px-2.5 sm:py-1.5 sm:text-[10px] ${
                        isSelected
                          ? 'border-[#cfded4] bg-[#eef7f2] text-[#1f6448]'
                          : 'border-[#ded7ca] bg-white text-[#102018] hover:bg-[#fbfaf7]'
                      } disabled:cursor-not-allowed disabled:opacity-80`}
                    >
                      {option}
                    </button>
                  )
                })}
              </div>
              {homepageSurveyStatus && (
                <p className="mt-2 text-center text-[10px] font-medium text-[#1f6448] sm:text-[11px]">
                  {homepageSurveyStatus}
                </p>
              )}
            </div>
          </div>
        )}

        {showResumeRound && resumeRound && (
          <div className="orthodle-fade-up mt-2 w-full rounded-2xl border border-[#cfded4] bg-[#f7fbf8] px-3 py-2.5 text-left shadow-[0_10px_24px_rgba(16,32,24,0.04)] sm:px-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#315f4d]">
                  Continue where you left off
                </div>
                <p className="mt-1 text-[11.5px] leading-4.5 text-[#355542] sm:text-[13px] sm:leading-5">
                  {formatLevel(resumeRound.level)} · {formatArchiveDate(resumeRound.caseDate)} · {resumeRound.guesses.length} saved guess{resumeRound.guesses.length === 1 ? '' : 'es'}
                </p>
              </div>
              <button
                type="button"
                onClick={dismissResumeRound}
                aria-label="Dismiss continue playing suggestion"
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#cfded4] bg-white text-sm font-semibold text-[#637268] transition hover:bg-[#f1f7f3] hover:text-[#102018]"
              >
                ×
              </button>
            </div>
            <div className="mt-2 flex justify-start sm:justify-end">
              <button
                type="button"
                onClick={resumeSavedRound}
                className="inline-flex h-9 items-center justify-center rounded-full border border-[#1f6448] bg-[#1f6448] px-3.5 text-[11px] font-semibold text-white transition hover:bg-[#174c37] sm:text-[12px]"
              >
                Resume case
              </button>
            </div>
          </div>
        )}

        <div className={`w-full rounded-[26px] bg-gradient-to-r from-[#1f6448] via-[#c76b3a] to-[#ead9b7] p-[1.75px] shadow-[0_8px_18px_rgba(16,32,24,0.05)] ${topBannerCount > 0 ? 'mt-2.5' : hasMobileInteraction ? 'mt-1.5' : 'mt-2'} mb-3`}>
          <div
            className="grid gap-1 rounded-[24px] bg-white p-1.5 sm:gap-1.5 sm:p-1.5"
            style={{ gridTemplateColumns: `repeat(${homeTabs.length}, minmax(0, 1fr))` }}
          >
            {homeTabs.map(item => {
              if (item.type === 'link') {
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex min-h-[58px] flex-col items-center justify-center rounded-[18px] border border-[#ebe3d7] bg-[#fffdf8] px-1.5 py-1.5 text-center text-[#102018] transition duration-200 hover:scale-[1.01] hover:bg-[#f7f5f0] sm:min-h-[58px] sm:px-2.5 sm:py-2"
                  >
                    <div className="font-serif text-[10px] font-bold leading-none sm:text-[12px]">
                      {item.label}
                    </div>
                    <div className="mt-1 text-[6px] font-semibold uppercase tracking-[0.14em] text-[#748178] sm:text-[8px] sm:tracking-[0.22em]">
                      {item.subtitle}
                    </div>
                  </Link>
                )
              }

              const active = selectedLevel === item.key

              return (
                <button
                  key={item.key}
                  onClick={() => setSelectedLevel(item.key)}
                  className={
                    active
                      ? 'min-h-[58px] rounded-[18px] border border-[#1f6448] bg-[#1f6448] px-1.5 py-1.5 text-center text-white shadow-sm transition duration-200 hover:scale-[1.01] sm:min-h-[58px] sm:px-2.5 sm:py-2'
                      : 'min-h-[58px] rounded-[18px] border border-[#ebe3d7] bg-[#fffdf8] px-1.5 py-1.5 text-center text-[#102018] transition duration-200 hover:scale-[1.01] hover:bg-[#f7f5f0] sm:min-h-[58px] sm:px-2.5 sm:py-2'
                  }
                >
                  <div className="font-serif text-[10px] font-bold leading-none sm:text-[12px]">
                    {item.label}
                  </div>

                  <div
                    className={
                      active
                        ? 'mt-1 text-[6px] font-semibold uppercase tracking-[0.14em] text-[#dbe7e0] sm:text-[8px] sm:tracking-[0.22em]'
                        : 'mt-1 text-[6px] font-semibold uppercase tracking-[0.14em] text-[#748178] sm:text-[8px] sm:tracking-[0.22em]'
                    }
                  >
                    {selectedTaglines[item.key]}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

      </section>

      <div className={`mx-auto w-full max-w-[700px] px-4 py-1 pb-3 sm:px-0 sm:pb-8 ${hasMobileInteraction ? 'pt-1.5' : 'pt-1'}`}>
        <section className="space-y-4">
          {!onTodayCard && (
            <div className="rounded-2xl border border-[#ead9b7] bg-[#fffaf1] px-3.5 py-3 shadow-[0_8px_18px_rgba(16,32,24,0.03)] sm:px-4">
              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#a24d24]">
                    Archive case
                  </div>
                  <p className="mt-1 text-[12px] leading-5 text-[#6d665d] sm:text-[13px]">
                    You’re viewing the {formatLevel(selectedLevel)} case from {formatArchiveDate(selectedDate)}.
                    Refresh the page or tap Orthodle to jump back to today.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDate(today)
                    setMessage('')
                    setJustCompletedRound(false)
                    setGuess('')
                  }}
                  className="inline-flex h-9 items-center justify-center rounded-full border border-[#1f6448] bg-white px-3.5 text-[11px] font-semibold text-[#1f6448] transition hover:bg-[#f7fbf8] sm:text-[12px]"
                >
                  Return to today
                </button>
              </div>
            </div>
          )}

          <div className={`orthodle-panel-shell rounded-2xl border border-[#ebe3d7] bg-white p-2.5 shadow-[0_8px_18px_rgba(16,32,24,0.04)] transition-all duration-300 sm:px-3.5 sm:py-4 ${isTransitioningLevel ? 'translate-y-1 opacity-85' : 'translate-y-0 opacity-100'}`}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#637268]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#c76b3a]" />
                  <span>{dailyCase?.category || formatLevel(selectedLevel)}</span>
                </div>
              </div>

              <div className="mt-1 sm:mt-2.5">
                {loading ? (
                  <div className="space-y-3 py-1">
                    <div className="orthodle-skeleton h-4 w-16 rounded-full" />
                    <div className="orthodle-skeleton h-8 w-full rounded-lg" />
                    <div className="orthodle-skeleton h-8 w-[92%] rounded-lg" />
                    <div className="orthodle-skeleton h-8 w-[88%] rounded-lg" />
                  </div>
                ) : dailyCase ? (
                  <div key={dailyCase.id} className="orthodle-fade-up space-y-0">
                    {renderCasePrompt(dailyCase.prompt)}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-[#ded7ca] bg-[#fbfaf7] px-4 py-4 text-center">
                    <p className="font-serif text-[14px] leading-[1.5] tracking-[-0.01em] text-[#102018] sm:text-[17px]">
                      No case available for this level today.
                    </p>
                    <p className="mt-1 text-[12px] text-[#637268]">
                      Try another difficulty or check back tomorrow.
                    </p>
                  </div>
                )}
              </div>

              {visibleImages.length > 0 && imageRevealed && (
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
                  <div className="orthodle-fade-up orthodle-imaging-shell night-soft-surface mt-3 rounded-xl border border-[#e2ddd3] bg-[#f8f6f1] p-2">
                  <div className="mb-2 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                      <div />
                      <div className="text-center text-[10px] font-semibold uppercase tracking-[0.22em] text-[#637268]">
                        Imaging
                      </div>

                      <div className="hidden items-center justify-end gap-1.5 sm:flex">
                        <button
                          onClick={() => setImageHidden(true)}
                          className="rounded-full border border-[#ded7ca] bg-white px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#102018] transition hover:bg-[#fbfaf7]"
                        >
                          Hide
                        </button>
                      </div>
                    </div>

                    <div className={`grid gap-2 ${visibleImages.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                      {visibleImages.map((image, index) => (
                        <div key={`${image.url}-${index}`}>
                          <button
                            onClick={() => openExpandedImage(index)}
                            className="night-surface orthodle-image-tile group flex w-full items-center justify-center overflow-hidden rounded-lg border border-[#d9d4ca] bg-white py-1.5"
                          >
                            <img
                              src={image.url}
                              alt={image.alt}
                              className="block max-h-[220px] max-w-full bg-white object-contain transition duration-300 group-hover:scale-[1.01] sm:max-h-[320px]"
                            />
                          </button>
                          {image.credit && (
                            <p className="mt-2 text-[10px] leading-4 text-[#8a948d]">
                              {image.credit}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              )}

              <div ref={findingsRef} className="mt-3 border-t border-dashed border-[#ded7ca] pt-2.5">
                {isSurgicalAnatomyMode ? (
                  <div className="orthodle-anatomy-quiz-shell rounded-[20px] border border-[#d9cfbf] bg-[linear-gradient(180deg,#fffdf7_0%,#fbf7ef_100%)] p-3 shadow-[0_10px_22px_rgba(16,32,24,0.04)] sm:p-4">
                    {hasValidSurgicalAnatomyChoices ? (
                      <>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {surgicalAnatomyChoices.map((choice, index) => {
                            const letter = String.fromCharCode(65 + index)
                            const normalizedChoice = normalizeAnswer(stripChoicePrefix(choice))
                            const isCorrectChoice = normalizedCorrectAnswers.has(normalizedChoice)
                            const isChosenChoice = selectedQuizAnswerNormalized === normalizedChoice
                            const choiceState = roundComplete
                              ? isCorrectChoice
                                ? 'correct'
                                : isChosenChoice
                                  ? 'incorrect'
                                  : 'idle'
                              : 'idle'

                            return (
                              <button
                                key={`${choice}-${index}`}
                                type="button"
                                disabled={roundComplete}
                                onClick={() => void submitGuess(stripChoicePrefix(choice), choice)}
                                className={`orthodle-anatomy-choice rounded-2xl border px-3 py-3 text-left transition ${
                                  choiceState === 'correct'
                                    ? 'orthodle-anatomy-choice-correct cursor-default border-[#1f7a4d] bg-[#edf8f1] text-[#123620] shadow-[0_10px_20px_rgba(31,122,77,0.12)]'
                                    : choiceState === 'incorrect'
                                      ? 'orthodle-anatomy-choice-incorrect cursor-default border-[#c76b3a] bg-[#fff1ea] text-[#4b2314] shadow-[0_10px_20px_rgba(199,107,58,0.12)]'
                                      : roundComplete
                                        ? 'orthodle-anatomy-choice-idle cursor-default border-[#ded7ca] bg-[#fbfaf7] text-[#102018]'
                                        : 'orthodle-anatomy-choice-idle border-[#ded7ca] bg-white text-[#102018] hover:border-[#1f6448] hover:bg-[#f7fbf8]'
                                }`}
                              >
                                <div className="flex items-start gap-3">
                                  <div
                                    className={`orthodle-anatomy-choice-badge mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold ${
                                      choiceState === 'correct'
                                        ? 'orthodle-anatomy-choice-badge-correct border-[#1f7a4d] bg-[#dff0e4] text-[#1f7a4d]'
                                        : choiceState === 'incorrect'
                                          ? 'orthodle-anatomy-choice-badge-incorrect border-[#c76b3a] bg-[#fde1d2] text-[#b95426]'
                                          : 'orthodle-anatomy-choice-badge-idle border-[#ead9b7] bg-[#fffaf1] text-[#a35d32]'
                                    }`}
                                  >
                                    {letter}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-serif text-[14px] leading-5 tracking-[-0.01em] sm:text-[15px]">
                                      {choice}
                                    </p>
                                  </div>
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      </>
                    ) : (
                      <div className="mt-3 rounded-2xl border border-dashed border-[#d9cfbf] bg-[#fbfaf7] px-4 py-4 text-center">
                        <p className="text-[12px] leading-5 text-[#6d766f]">
                          This anatomy case needs at least two saved answer choices before it can run as a quiz.
                        </p>
                      </div>
                    )}
                  </div>
                ) : visibleFindings.length > 0 ? (
                  <>
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
                      <div />
                      <div className="text-center text-[11px] font-bold uppercase tracking-[0.24em] text-[#315f4d]">
                        Clinical findings
                      </div>
                    </div>
                  <div className="mt-2 space-y-2">
                    {visibleFindings.map((finding, index) => (
                      <div
                        key={`${finding}-${index}`}
                        className={`${index === latestFindingIndex ? 'ring-2 ring-[#ead9b7] shadow-[0_8px_18px_rgba(199,107,58,0.08)]' : ''} orthodle-finding-card orthodle-reveal rounded-lg border border-[#ead9b7] bg-[#fffaf1] px-3 py-2 text-[#102018] sm:px-3.5`}
                      >
                        <div className="flex gap-3">
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c76b3a]" />
                          <p className="font-serif text-[13.5px] leading-5 tracking-[-0.01em] sm:text-[15px]">
                            {finding}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
                      <div />
                      <div className="text-center text-[11px] font-bold uppercase tracking-[0.24em] text-[#315f4d]">
                        Clinical findings
                      </div>
                    </div>
                    <div className="mt-2 rounded-lg border border-dashed border-[#ded7ca] bg-[#fbfaf7] px-3 py-3 text-center">
                      <p className="text-[12px] leading-5 text-[#8a948d]">
                        Incorrect guesses will reveal additional clinical findings and any delayed imaging clues.
                      </p>
                    </div>
                  </>
                )}
              </div>

              <div ref={inputSectionRef} className="mt-3 border-t border-[#ded7ca] pt-2.5">
                {!roundComplete && !isSurgicalAnatomyMode && (
                  <>
                    <div className="relative">
                      <div className={shakeInput ? 'orthodle-shake flex gap-2' : 'flex gap-2'}>
                        <input
                          value={guess}
                          onChange={e => {
                            setGuess(e.target.value)
                            setShowSuggestions(true)
                          }}
                          onFocus={() => {
                            setShowSuggestions(true)
                            setIsMobileInputFocused(true)
                          }}
                          onBlurCapture={() => setIsMobileInputFocused(false)}
                          onBlur={() => window.setTimeout(() => setShowSuggestions(false), 120)}
                          onKeyDown={e => e.key === 'Enter' && submitGuess()}
                          autoCapitalize="none"
                          autoCorrect="off"
                          autoComplete="off"
                          spellCheck={false}
                          enterKeyHint="done"
                          inputMode="text"
                          placeholder={!dailyCase ? 'No case available' : 'Type to narrow the diagnosis'}
                          disabled={!dailyCase}
                          className="min-h-[40px] flex-1 rounded-lg border border-[#ded7ca] bg-white px-3 py-2 text-[12.5px] text-[#102018] outline-none transition placeholder:text-[#9aa39c] focus:border-[#1f6448] focus:ring-2 focus:ring-[#1f6448]/20 disabled:cursor-not-allowed disabled:bg-[#f7f5f0] disabled:text-[#a0a7a2]"
                        />

                        <button
                          onClick={() => void submitGuess()}
                          disabled={!dailyCase}
                          className="min-h-[40px] rounded-lg bg-[#1f6448] px-3 py-2 text-[11px] font-bold text-white transition duration-200 hover:scale-[1.02] hover:bg-[#174c37] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
                        >
                          Guess
                        </button>
                      </div>

                      {renderSuggestionList(
                        'absolute inset-x-0 top-[calc(100%+8px)] z-30 max-h-64 overflow-y-auto rounded-xl border border-[#ded7ca] bg-white shadow-[0_12px_28px_rgba(16,32,24,0.08)]'
                      )}
                    </div>

                    {message && (
                      <p className="mt-2 text-[11.5px] leading-5 text-[#637268]">
                        {message}
                      </p>
                    )}
                  </>
                )}

                {!roundComplete && isSurgicalAnatomyMode && message && (
                  <p className="text-[11.5px] leading-5 text-[#637268]">{message}</p>
                )}

                {!roundComplete && canAdvanceToNextLevel && nextLevel && (
                  <button
                    type="button"
                    onClick={moveToNextLevel}
                    className="mt-3 w-full rounded-lg border border-[#cfded4] bg-[#f7fbf8] px-4 py-2 text-[11px] font-semibold text-[#1f6448] transition hover:bg-white"
                  >
                    Continue to the {formatLevel(nextLevel)} case
                  </button>
                )}
              </div>
          </div>

          {roundComplete && dailyCase && (
            <div
              ref={solvedCardRef}
              className={
                pulseSuccess
                  ? 'orthodle-panel-shell orthodle-answer-shell orthodle-success-pulse orthodle-win-glow night-surface overflow-hidden rounded-[26px] border border-[#d8e5dd] bg-white shadow-[0_18px_42px_rgba(16,32,24,0.07)]'
                  : 'orthodle-panel-shell orthodle-answer-shell night-surface overflow-hidden rounded-[26px] border border-[#e7e1d6] bg-white shadow-[0_14px_34px_rgba(16,32,24,0.06)]'
              }
            >
              <div className={`h-1.5 w-full ${gameWon ? 'bg-gradient-to-r from-[#1f6448] via-[#5a8b4e] to-[#ead9b7]' : 'bg-gradient-to-r from-[#c76b3a] via-[#d49b63] to-[#ead9b7]'}`} />
              <div className="px-3 py-3 sm:px-4 sm:py-4">
                <div className="text-center">
                  <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#637268]">
                    {solvedEyebrow}
                  </div>
                  <h2 className="mt-2 font-serif text-[28px] font-bold leading-none tracking-[-0.05em] text-[#102018] sm:text-[38px]">
                    {solvedHeadline}
                  </h2>
                  <p className="mt-2 text-[12px] leading-5 text-[#5f6d64] sm:text-[13px]">
                    {solvedSubline}
                  </p>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-4">
                  {solvedHighlights.map(item => (
                    <div
                      key={item.label}
                      className="rounded-2xl border border-[#e7e1d6] bg-[linear-gradient(180deg,#fffdf8_0%,#f8f5ee_100%)] px-3 py-2.5 text-center"
                    >
                      <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#7a867f]">
                        {item.label}
                      </div>
                      <div className={`mt-1 font-serif text-[19px] font-bold leading-none tracking-[-0.03em] ${item.tone}`}>
                        {item.value}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 text-center">
                  <h3 className="orthodle-answer-pop font-serif text-[24px] font-bold leading-tight tracking-[-0.04em] text-[#1f6448] sm:text-[30px]">
                    {dailyCase.answer}
                  </h3>
                  {onTodayCard && levelStreak >= 1 && (
                    <div className="mt-2 inline-flex items-center justify-center gap-1.5 rounded-full border border-[#ead9b7] bg-[#fff7ea] px-3 py-1 text-[10px] font-semibold text-[#a24d24]">
                      <span aria-hidden="true">🔥</span>
                      <span>
                        {levelStreak}-day {formatLevel(selectedLevel)} streak
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t border-dashed border-[#ded7ca] px-3 py-3 sm:px-4 sm:py-4">
                <div className="space-y-2">
                <div>
                  <div className="space-y-1">
                    {renderTeachingPoint(teachingPoint)}
                  </div>
                  {dailyCase.contributor_name && (
                    <div className="mt-3 text-center text-[11px] font-semibold text-[#315f4d]">
                      Contributed by {dailyCase.contributor_name}
                    </div>
                  )}
                </div>

                {renderAnatomyLearningImages(dailyCase)}

                {roundComplete && (
                  <div className="mx-auto mt-3 w-full max-w-[520px]">
                    <div className="grid gap-2 sm:grid-cols-2">
                      {canAdvanceToNextLevel && nextLevel ? (
                        <button
                          type="button"
                          onClick={moveToNextLevel}
                          className="rounded-xl border border-[#cfded4] bg-[#f7fbf8] px-4 py-2.5 text-[11px] font-semibold text-[#1f6448] transition hover:bg-white"
                        >
                          Try the {formatLevel(nextLevel)} case
                        </button>
                      ) : (
                        <Link
                          href="/archive"
                          className="rounded-xl border border-[#ded7ca] bg-white px-4 py-2.5 text-center text-[11px] font-semibold text-[#102018] transition hover:bg-[#fbfaf7]"
                        >
                          Browse archive
                        </Link>
                      )}
                      <Link
                        href="/stats"
                        className="rounded-xl border border-[#ded7ca] bg-white px-4 py-2.5 text-center text-[11px] font-semibold text-[#102018] transition hover:bg-[#fbfaf7]"
                      >
                        View your stats
                      </Link>
                      <button
                        type="button"
                        onClick={shareResult}
                        className="w-full rounded-xl border border-[#1f6448] bg-[#1f6448] px-4 py-2.5 text-[11px] font-semibold text-white transition hover:bg-[#174c37] sm:col-span-2"
                      >
                        Share the case
                      </button>
                    </div>
                  </div>
                )}

                <div className="night-soft-surface rounded-2xl border border-[#e7e1d6] bg-[#fbfaf7] p-2.5 sm:p-3">
                  <div className="night-label mb-1.5 text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-[#637268]">
                    How was the case?
                  </div>
                  <div className="mx-auto grid max-w-[260px] grid-cols-2 gap-1.5 sm:flex sm:max-w-none sm:flex-wrap sm:justify-center">
                    {FEEDBACK_TAG_OPTIONS.map(tag => {
                      const alreadySent = submittedReactionTags.includes(tag)
                      const isPositiveReaction = tag === 'Great case'
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => void submitQuickReaction(tag)}
                          disabled={
                            submittingReaction !== null ||
                            alreadySent ||
                            (tag === 'Too easy' && submittedReactionTags.includes('Too hard')) ||
                            (tag === 'Too hard' && submittedReactionTags.includes('Too easy'))
                          }
                          className={`w-full rounded-lg border px-2 py-1.5 text-[9.5px] font-semibold transition sm:w-auto ${
                            submittingReaction === tag
                              ? 'border-[#cfded4] bg-[#eef7f2] text-[#1f6448]'
                              : alreadySent
                                ? isPositiveReaction
                                  ? 'border-[#cfded4] bg-[#eef7f2] text-[#1f6448]'
                                  : 'border-[#ead9b7] bg-[#fff3e8] text-[#a24d24]'
                                : 'border-[#ded7ca] bg-white text-[#637268] hover:bg-[#fbfaf7]'
                          } disabled:cursor-not-allowed disabled:opacity-70`}
                        >
                          {submittingReaction === tag ? 'Saving...' : alreadySent ? 'Sent' : tag}
                        </button>
                      )
                    })}
                  </div>
                  {reactionStatus && (
                    <p className="mt-2 text-center text-[11.5px] leading-4 text-[#637268]">{reactionStatus}</p>
                  )}
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <input
                      type="text"
                      value={feedbackText}
                      onChange={e => setFeedbackText(e.target.value)}
                      placeholder="Share any feedback on the site here"
                      className="min-h-[38px] min-w-0 flex-1 rounded-lg border border-[#ded7ca] bg-white px-3 py-2 text-[12px] text-[#102018] outline-none transition placeholder:text-[10.5px] placeholder:text-[#9aa59b] focus:border-[#c9d8ce]"
                    />
                    <button
                      type="button"
                      onClick={() => void submitTypedFeedback()}
                      disabled={isSavingFeedback}
                      className="min-h-[38px] shrink-0 rounded-lg border border-[#ded7ca] bg-white px-4 py-2 text-[11px] font-semibold text-[#102018] transition hover:bg-[#f7f4ee] disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
                    >
                      {isSavingFeedback ? 'Sending...' : 'Send'}
                    </button>
                  </div>
                  {feedbackStatus && (
                    <p className="mt-2 text-center text-[11.5px] leading-4 text-[#637268]">{feedbackStatus}</p>
                  )}
                </div>

              </div>
              </div>
            </div>
          )}

          {!isSurgicalAnatomyMode && (
          <div className="orthodle-panel-shell hidden rounded-2xl border border-[#e7e1d6] bg-white p-4 shadow-[0_10px_24px_rgba(16,32,24,0.04)] sm:block">
            <div className="mb-3 flex justify-center text-[11px] font-bold uppercase tracking-[0.24em] text-[#102018]">
              <span>Your guesses</span>
            </div>

            <div className="space-y-1.5">
              {Array.from({ length: maxGuessesForCurrentCase }).map((_, i) => {
                const item = guesses[i]
                const isLatestCorrect = item?.correct && i === guesses.length - 1 && gameWon

                return (
                  <div
                    key={`desktop-inline-${i}`}
                    className={
                      item
                        ? item.correct
                          ? `${
                              isLatestCorrect ? 'orthodle-success-pulse' : ''
                            } orthodle-guess-correct flex min-h-[38px] items-center gap-2 rounded-lg border border-[#cfded4] bg-[#e8f3ed] px-3 py-1.5 text-[12px] font-semibold text-[#102018] transition duration-200 hover:-translate-y-0.5 hover:shadow-sm`
                          : 'orthodle-guess-wrong flex min-h-[38px] items-center gap-2 rounded-lg bg-[#fffaf1] px-3 py-1.5 text-[12px] font-semibold text-[#102018] transition duration-200 hover:-translate-y-0.5 hover:shadow-sm'
                        : 'orthodle-guess-empty flex min-h-[38px] items-center gap-2 rounded-lg border border-dashed border-[#ded7ca] bg-white px-3 py-1.5 text-[12px] text-[#9aa39c] transition duration-200 hover:bg-[#fbfaf7]'
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
                      {item ? formatGuessDisplayText(item.text) : '—'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
          )}
        </section>

        <aside className="space-y-3">
          {!roundComplete && !isSurgicalAnatomyMode && (
          <div className="orthodle-panel-shell rounded-2xl border border-[#ebe3d7] bg-white p-2 shadow-[0_8px_18px_rgba(16,32,24,0.04)] sm:hidden">
            <div className="mb-1.5 flex justify-center text-[10px] font-bold uppercase tracking-[0.22em] text-[#102018]">
              <span>Your guesses</span>
            </div>

            <div className="grid grid-cols-6 gap-1">
              {Array.from({ length: maxGuessesForCurrentCase }).map((_, i) => {
                const item = guesses[i]

                return (
                  <div
                    key={`mobile-${i}`}
                    className={
                      item
                        ? item.correct
                          ? 'orthodle-guess-correct flex min-h-[34px] flex-col items-center justify-center rounded-lg border border-[#d7e2dc] bg-[#eef7f2] px-1 py-1 text-[#102018]'
                          : 'orthodle-guess-wrong flex min-h-[34px] flex-col items-center justify-center rounded-lg bg-[#fffaf1] px-1 py-1 text-[#102018]'
                        : 'orthodle-guess-empty flex min-h-[34px] flex-col items-center justify-center rounded-lg border border-dashed border-[#e1d8cb] bg-white px-1 py-1 text-[#9aa39c]'
                    }
                  >
                    <span className="text-[8px] font-mono text-[#637268]">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="mt-0.5 text-[10px] font-semibold">
                      {item ? (item.correct ? '✓' : '×') : '•'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
          )}

        </aside>
      </div>

      <PublicFooter />

      {currentExpandedImages.length > 0 && imageExpanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#102018]/75 px-4 py-8"
          onClick={closeExpandedImage}
        >
          <div className="w-full max-w-5xl overflow-hidden rounded-[28px] border border-white/15 bg-[#fbfaf7] shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-[#d7d9dc] bg-white px-5 py-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#637268]">
                  Imaging
                </div>
                <div className="mt-1 text-[10px] text-[#8a948d]">
                  Pinch to zoom. Double tap to zoom. Swipe down to close.
                </div>
              </div>

              <div className="flex items-center gap-2">
                {currentExpandedImages.length > 1 && (
                  <div className="rounded-full border border-[#ded7ca] bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#637268]">
                    {expandedImageIndex + 1} / {currentExpandedImages.length}
                  </div>
                )}
                {imageScale > 1.02 && (
                  <button
                    onClick={resetExpandedImageView}
                    className="rounded-full border border-[#ded7ca] bg-[#fbfaf7] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#102018] transition hover:bg-white sm:px-3 sm:py-1.5 sm:text-[10px]"
                  >
                    Reset
                  </button>
                )}
                <button
                  onClick={closeExpandedImage}
                  className="rounded-full border border-[#ded7ca] bg-[#fbfaf7] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#102018] transition hover:bg-white sm:px-4 sm:py-2 sm:text-[11px] sm:tracking-[0.18em]"
                >
                  Minimize
                </button>
              </div>
            </div>

            <div
              className="bg-[#f7f4ee] p-5"
              onClick={e => e.stopPropagation()}
              onDoubleClick={() => {
                if (imageScale > 1.2) {
                  resetExpandedImageView()
                } else {
                  setImageScale(2.2)
                  setImageOffset({ x: 0, y: 0 })
                }
              }}
              onTouchStart={e => {
                imageTouchStartY.current = e.touches[0]?.clientY ?? null
                if (e.touches.length === 2) {
                  const [a, b] = [e.touches[0], e.touches[1]]
                  imagePinchStart.current = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
                  imageScaleStart.current = imageScale
                  imagePanStart.current = null
                } else if (e.touches.length === 1 && imageScale > 1) {
                  imagePanStart.current = {
                    x: e.touches[0].clientX - imageOffset.x,
                    y: e.touches[0].clientY - imageOffset.y,
                  }
                }
              }}
              onTouchMove={e => {
                if (e.touches.length === 2 && imagePinchStart.current) {
                  const [a, b] = [e.touches[0], e.touches[1]]
                  const nextDistance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
                  const nextScale = Math.min(3, Math.max(1, imageScaleStart.current * (nextDistance / imagePinchStart.current)))
                  setImageScale(nextScale)
                  if (nextScale <= 1.02) {
                    setImageOffset({ x: 0, y: 0 })
                  }
                  e.preventDefault()
                } else if (e.touches.length === 1 && imagePanStart.current && imageScale > 1) {
                  const nextX = e.touches[0].clientX - imagePanStart.current.x
                  const nextY = e.touches[0].clientY - imagePanStart.current.y
                  setImageOffset({ x: nextX, y: nextY })
                  e.preventDefault()
                }
              }}
              onTouchEnd={e => {
                const startY = imageTouchStartY.current
                const endY = e.changedTouches[0]?.clientY ?? null
                if (startY !== null && endY !== null && endY - startY > 70 && imageScale <= 1.05) {
                  closeExpandedImage()
                }
                if (e.touches.length < 2) imagePinchStart.current = null
                if (e.touches.length === 0) imagePanStart.current = null
                if (imageScale < 1.02) {
                  setImageScale(1)
                  setImageOffset({ x: 0, y: 0 })
                }
                imageTouchStartY.current = null
              }}
            >
              {activeExpandedImage && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    {currentExpandedImages.length > 1 ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            resetExpandedImageView()
                            setExpandedImageIndex(current =>
                              current === 0 ? currentExpandedImages.length - 1 : current - 1
                            )
                          }}
                          className="rounded-full border border-[#ded7ca] bg-white px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#102018] transition hover:bg-[#fbfaf7]"
                        >
                          Previous
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            resetExpandedImageView()
                            setExpandedImageIndex(current => (current + 1) % currentExpandedImages.length)
                          }}
                          className="rounded-full border border-[#ded7ca] bg-white px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#102018] transition hover:bg-[#fbfaf7]"
                        >
                          Next
                        </button>
                      </>
                    ) : (
                      <div />
                    )}
                  </div>

                  <div>
                    <img
                      src={activeExpandedImage.url}
                      alt={activeExpandedImage.alt}
                      className="mx-auto block max-h-[78vh] max-w-full rounded-2xl border border-[#d7d9dc] bg-white object-contain transition-transform"
                      style={{
                        transform: `translate(${imageOffset.x}px, ${imageOffset.y}px) scale(${imageScale})`,
                        transformOrigin: 'center center',
                        touchAction: 'none',
                      }}
                    />
                    {activeExpandedImage.credit && (
                      <p className="mt-3 text-center text-[10px] leading-4 text-[#8a948d]">
                        {activeExpandedImage.credit}
                      </p>
                    )}
                  </div>

                  {currentExpandedImages.length > 1 && (
                    <div className="flex flex-wrap justify-center gap-2">
                      {currentExpandedImages.map((image, index) => (
                        <button
                          key={`expanded-thumb-${image.url}-${index}`}
                          type="button"
                          onClick={() => {
                            resetExpandedImageView()
                            setExpandedImageIndex(index)
                          }}
                          className={`overflow-hidden rounded-xl border p-1 transition ${
                            index === expandedImageIndex
                              ? 'border-[#1f6448] bg-white shadow-[0_10px_22px_rgba(16,32,24,0.08)]'
                              : 'border-[#ded7ca] bg-white/80'
                          }`}
                        >
                          <img
                            src={image.url}
                            alt={image.alt}
                            className="h-14 w-14 rounded-lg object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                    </div>
                  )}
                </div>

                {shouldShowSharedPostCaseSurvey && sharedPostCaseSurvey.survey && (
                  <div className="night-soft-surface rounded-xl border border-[#ead9b7] bg-[#fffaf1] p-2.5 sm:p-3">
                    <div className="night-label mb-1.5 text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-[#637268]">
                      Quick survey
                    </div>
                    <div className="mx-auto max-w-[560px]">
                      <div className="text-center text-[12px] leading-5 text-[#102018] sm:text-[13px]">
                        {sharedPostCaseSurvey.survey.question}
                      </div>
                      {sharedPostCaseSurvey.survey.level_scope && sharedPostCaseSurvey.survey.level_scope !== 'all' && (
                        <p className="mt-1 text-center text-[9.5px] uppercase tracking-[0.16em] text-[#8a948d]">
                          {getSurveyLevelScopeLabel(sharedPostCaseSurvey.survey.level_scope)}
                        </p>
                      )}
                      <div
                        className={`mt-2 grid gap-1.5 ${
                          (sharedPostCaseSurvey.survey.options || []).length > 3
                            ? 'grid-cols-1 sm:grid-cols-2'
                            : 'grid-cols-1 sm:grid-cols-3'
                        }`}
                      >
                        {(sharedPostCaseSurvey.survey.options || []).map(option => {
                          const isSelected = sharedPostCaseSurvey.submittedChoice === option
                          return (
                            <button
                              key={option}
                              type="button"
                              onClick={() => void submitSharedPostCaseSurvey(option)}
                              disabled={Boolean(sharedPostCaseSurvey.submittedChoice) || sharedPostCaseSurvey.isSubmitting}
                              className={`min-w-0 rounded-lg border px-2 py-1.5 text-[10px] font-semibold leading-tight transition sm:px-2.5 sm:py-2 ${
                                isSelected
                                  ? 'border-[#cfded4] bg-[#eef7f2] text-[#1f6448]'
                                  : 'border-[#ded7ca] bg-white text-[#102018] hover:bg-[#fbfaf7]'
                              } disabled:cursor-not-allowed disabled:opacity-80`}
                            >
                              {option}
                            </button>
                          )
                        })}
                      </div>
                      {sharedPostCaseSurvey.status && (
                        <p className="mt-2 text-center text-[10px] font-medium text-[#1f6448] sm:text-[11px]">
                          {sharedPostCaseSurvey.status}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {shouldShowAnatomySurvey && anatomySurvey && (
                  <div className="night-soft-surface rounded-xl border border-[#ead9b7] bg-[#fffaf1] p-2.5 sm:p-3">
                    <div className="night-label mb-1.5 text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-[#637268]">
                      Anatomy survey
                    </div>
                    <div className="mx-auto max-w-[560px]">
                      <div className="text-center text-[12px] leading-5 text-[#102018] sm:text-[13px]">
                        {anatomySurvey.question}
                      </div>
                      <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                        {[anatomySurvey.option_1, anatomySurvey.option_2, anatomySurvey.option_3].map(option => {
                          const isSelected = submittedAnatomySurveyChoice === option
                          return (
                            <button
                              key={option}
                              type="button"
                              onClick={() => void submitAnatomySurvey(option)}
                              disabled={Boolean(submittedAnatomySurveyChoice) || isSubmittingAnatomySurvey}
                              className={`min-w-0 rounded-lg border px-2 py-1.5 text-[10px] font-semibold leading-tight transition sm:px-2.5 sm:py-2 ${
                                isSelected
                                  ? 'border-[#cfded4] bg-[#eef7f2] text-[#1f6448]'
                                  : 'border-[#ded7ca] bg-white text-[#102018] hover:bg-[#fbfaf7]'
                              } disabled:cursor-not-allowed disabled:opacity-80`}
                            >
                              {option}
                            </button>
                          )
                        })}
                      </div>
                      {anatomySurveyStatus && (
                        <p className="mt-2 text-center text-[10px] font-medium text-[#1f6448] sm:text-[11px]">
                          {anatomySurveyStatus}
                        </p>
                      )}
                    </div>
                  </div>
                )}
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
