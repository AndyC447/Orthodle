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
  getCaseBackupsForSlot,
  saveCaseBackup,
  shouldCreateCaseBackup,
  type CaseBackupEntry,
} from '@/lib/case-backups'
import {
  isAcceptedGuess,
  normalizeAnswer,
  ORTHO_DIAGNOSIS_BANK,
  readHiddenDiagnosisAnswers,
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
  image_findings: string | null
  clue_1: string | null
  clue_2: string | null
  clue_3: string | null
  clue_4: string | null
  clue_5: string | null
  clue_6: string | null
  teaching_point: string | null
  learning_image_url: string | null
  learning_image_credit: string | null
  learning_image_caption: string | null
  learning_image_url_2: string | null
  learning_image_credit_2: string | null
  learning_image_caption_2: string | null
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
  image_findings: string | null
  clue_1: string | null
  clue_2: string | null
  clue_3: string | null
  clue_4: string | null
  clue_5: string | null
  clue_6: string | null
  teaching_point: string | null
  learning_image_url: string | null
  learning_image_credit: string | null
  learning_image_caption: string | null
  learning_image_url_2: string | null
  learning_image_credit_2: string | null
  learning_image_caption_2: string | null
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
  todayCaseUsers: number
  todayCaseGuesses: number
  todayCaseCorrectGuesses: number
  todayArchiveUsers: number
  todayArchiveGuesses: number
  todayArchiveCorrectGuesses: number
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

type OverviewCaseQuickStat = {
  players: number
  solveRate: number | null
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
  | 'study_mode'
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
  no_anatomy_mode: boolean
  no_anatomy_mode_start_date: string | null
}

type ReminderSubscriberAdminRow = {
  id: string
  email: string
  active: boolean
  created_at: string
  updated_at: string
}

type ReminderAdminDashboardSummary = {
  activeSubscribers: number
  totalSubscribers: number
  subscribers: ReminderSubscriberAdminRow[]
}

type ReminderChangeItem = {
  id: string
  email: string
  kind: 'signup' | 'resubscribed' | 'unsubscribed'
  timestamp: string
}

type LinkMetadataResult = {
  title: string | null
  siteName: string | null
  author: string | null
  creditLine: string | null
}

function formatAdminRelativeTime(value: string) {
  const timestamp = new Date(value)
  if (Number.isNaN(timestamp.getTime())) return ''

  const diffMs = Date.now() - timestamp.getTime()
  const diffMinutes = Math.max(0, Math.round(diffMs / (1000 * 60)))

  if (diffMinutes < 1) return 'just now'
  if (diffMinutes < 60) return `${diffMinutes}m ago`

  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`

  const diffDays = Math.round(diffHours / 24)
  return `${diffDays}d ago`
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
const planningLevelOrder: Level[] = ['med_student']
const ADMIN_SIDEBAR_ORDER_STORAGE_KEY = 'orthodle_admin_sidebar_order_v1'
const ADMIN_COLLAPSED_SECTIONS_STORAGE_KEY = 'orthodle_admin_collapsed_sections_v1'
const ADMIN_DRAFT_STORAGE_KEY = 'orthodle_admin_case_draft_v1'
const DEFAULT_ADMIN_SIDEBAR_ORDER: AdminSidebarSectionId[] = [
  'case_stats',
  'email_reminders',
  'study_mode',
  'analytics',
  'homepage_notes',
  'surveys',
  'answer_choices',
  'feedback',
  'groups',
  'no_resident_mode',
  'cases_by_date',
]
const DEFAULT_IMAGE_CREDIT_TEMPLATE = 'Credit:'
const DEFAULT_TEACHING_POINT_TEMPLATE = `**<u>Clinical Pearl</u>**

**<u>Who</u>**

**<u>Pathophys</u>**

**<u>Key Clues</u>**

**<u>Tx</u>**

**<u>Classic Pitfall</u>**`

const LEGACY_DEFAULT_TEACHING_POINT_TEMPLATE = `**<u>Who</u>**

**<u>Pathophys</u>**

**<u>Key Clues</u>**

**<u>Tx</u>**

**<u>Classic Pitfall</u>**`

const DEFAULT_ANATOMY_TEACHING_POINT_TEMPLATE = `<u>**Explanation**</u>

**<u>Clinical Pearl</u>**

<u>**Why not the others?**</u>`

const LEGACY_ANATOMY_TEACHING_POINT_TEMPLATE = `<u>**Explanation**:</u>

**<u>Clinical Pearl:</u>**

<u>**Why not the others?**</u>`

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
  imageFindings: string
  learningImageUrl: string
  learningImageCredit: string
  learningImageCaption: string
  learningImageUrl2: string
  learningImageCredit2: string
  learningImageCaption2: string
  clue1: string
  clue2: string
  clue3: string
  clue4: string
  clue5: string
  clue6: string
  teachingPoint: string
  referenceLinks: string
  activeSubmissionId: string | null
  savedAt: string
}

type CasePreviewCache = {
  savedAt: number
  case: CaseRow
}

const ADMIN_CASE_PREVIEW_CACHE_KEY = 'orthodle_admin_case_preview_v1'

function getDefaultTeachingPointTemplate(level: Level) {
  return level === 'attending'
    ? DEFAULT_ANATOMY_TEACHING_POINT_TEMPLATE
    : DEFAULT_TEACHING_POINT_TEMPLATE
}

function shiftISODate(dateText: string, days: number) {
  const baseDate = new Date(`${dateText}T12:00:00`)
  baseDate.setDate(baseDate.getDate() + days)
  return baseDate.toISOString().slice(0, 10)
}

function getWeekStartISO(dateText: string) {
  const baseDate = new Date(`${dateText}T12:00:00`)
  baseDate.setDate(baseDate.getDate() - baseDate.getDay())
  return baseDate.toISOString().slice(0, 10)
}

function timestampToLocalISO(timestamp: string) {
  const date = new Date(timestamp)
  const timezoneOffsetMs = date.getTimezoneOffset() * 60 * 1000
  return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 10)
}

function extractFirstMarkdownLink(text: string | null | undefined) {
  if (!text) return null
  const match = text.match(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/i)
  if (!match) return null
  return {
    label: match[1] || 'Link to reference',
    url: match[2] || '',
    markdown: `[${match[1] || 'Link to reference'}](${match[2] || ''})`,
  }
}

function extractMarkdownLinks(text: string | null | undefined) {
  if (!text) return []

  const matches = Array.from(text.matchAll(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi))
  return matches
    .map(match => ({
      label: match[1] || 'Link to reference',
      url: match[2] || '',
      markdown: `[${match[1] || 'Link to reference'}](${match[2] || ''})`,
    }))
    .filter(item => item.url)
}

function isReferenceLinkLine(line: string) {
  const trimmed = line.trim()
  if (!trimmed) return false
  return /^\[[^\]]+\]\((https?:\/\/[^\s)]+)\)\s*$/i.test(trimmed)
}

function extractReferenceUrlFromLine(line: string) {
  const trimmed = line.trim()
  if (!trimmed) return null

  const markdownMatch = trimmed.match(/^\[[^\]]+\]\((https?:\/\/[^\s)]+)\)\s*$/i)
  if (markdownMatch?.[1]) return markdownMatch[1]

  if (/^https?:\/\/\S+$/i.test(trimmed)) return trimmed
  return null
}

function getDefaultReferenceLabel(url: string) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./i, '')
    return hostname || 'Link to reference'
  } catch {
    return 'Link to reference'
  }
}

function normalizeReferenceLinkLine(line: string) {
  const trimmed = line.trim()
  if (!trimmed) return null
  if (isReferenceLinkLine(trimmed)) return trimmed

  const url = extractReferenceUrlFromLine(trimmed)
  if (!url) return null
  return `[${getDefaultReferenceLabel(url)}](${url})`
}

function getReferenceLineParts(line: string) {
  const trimmed = line.trim()
  if (!trimmed) return null

  const markdownMatch = trimmed.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)\s*$/i)
  if (markdownMatch?.[1] && markdownMatch?.[2]) {
    return {
      label: markdownMatch[1].trim(),
      url: markdownMatch[2],
      isMarkdown: true,
    }
  }

  if (/^https?:\/\/\S+$/i.test(trimmed)) {
    return {
      label: null,
      url: trimmed,
      isMarkdown: false,
    }
  }

  return null
}

function shouldReplaceReferenceLabel(label: string | null, url: string) {
  if (!label) return true

  const trimmed = label.trim()
  if (!trimmed) return true

  const genericLabels = new Set([
    'Link to reference',
    'Reference',
    'Source',
  ])

  if (genericLabels.has(trimmed)) return true

  return trimmed.toLowerCase() === getDefaultReferenceLabel(url).toLowerCase()
}

function splitTeachingPointAndReferences(value: string | null | undefined) {
  if (!value) {
    return { teachingPoint: '', referenceLinks: '' }
  }

  const lines = value.split('\n')
  const teachingLines: string[] = []
  const referenceLines: string[] = []

  for (const line of lines) {
    const normalizedReferenceLine = normalizeReferenceLinkLine(line)
    if (normalizedReferenceLine) {
      referenceLines.push(normalizedReferenceLine)
    } else {
      teachingLines.push(line)
    }
  }

  return {
    teachingPoint: teachingLines.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    referenceLinks: referenceLines.join('\n'),
  }
}

function mergeTeachingPointAndReferences(teachingPoint: string, referenceLinks: string) {
  const trimmedTeachingPoint = teachingPoint.trim()
  const cleanedReferenceLines = referenceLinks
    .split('\n')
    .map(normalizeReferenceLinkLine)
    .filter((line): line is string => Boolean(line))
  const trimmedReferenceLinks = cleanedReferenceLines.join('\n')

  if (trimmedTeachingPoint && trimmedReferenceLinks) {
    return `${trimmedTeachingPoint}\n\n${trimmedReferenceLinks}`
  }

  return trimmedTeachingPoint || trimmedReferenceLinks
}

function renderInlineRichText(line: string, keyPrefix = 'inline'): ReactNode[] {
  const matches = [
    { type: 'underline' as const, match: line.match(/<u>(.*?)<\/u>/) },
    { type: 'bold' as const, match: line.match(/\*\*(.+?)\*\*/) },
    { type: 'italic' as const, match: line.match(/\*(?!\*)(.+?)\*(?!\*)/) },
  ]
    .filter(
      (entry): entry is { type: 'underline' | 'bold' | 'italic'; match: RegExpMatchArray } =>
        Boolean(entry.match)
    )
    .sort((a, b) => (a.match.index ?? 0) - (b.match.index ?? 0))

  const firstMatch = matches[0]
  if (!firstMatch) {
    return [<span key={`${keyPrefix}-text`}>{line}</span>]
  }

  const matchIndex = firstMatch.match.index ?? 0
  const fullMatch = firstMatch.match[0]
  const innerText = firstMatch.match[1] ?? ''
  const before = line.slice(0, matchIndex)
  const after = line.slice(matchIndex + fullMatch.length)
  const nodes: ReactNode[] = []

  if (before) {
    nodes.push(...renderInlineRichText(before, `${keyPrefix}-before`))
  }

  const innerNodes = renderInlineRichText(innerText, `${keyPrefix}-${firstMatch.type}`)
  if (firstMatch.type === 'underline') {
    nodes.push(<u key={`${keyPrefix}-underline`}>{innerNodes}</u>)
  } else if (firstMatch.type === 'bold') {
    nodes.push(<strong key={`${keyPrefix}-bold`}>{innerNodes}</strong>)
  } else {
    nodes.push(<em key={`${keyPrefix}-italic`}>{innerNodes}</em>)
  }

  if (after) {
    nodes.push(...renderInlineRichText(after, `${keyPrefix}-after`))
  }

  return nodes
}

function renderRichTextWithBreaks(text: string, keyPrefix = 'inline-breaks') {
  const lines = text.split('\n')
  const nodes: ReactNode[] = []

  lines.forEach((line, index) => {
    if (index > 0) {
      nodes.push(<br key={`${keyPrefix}-break-${index}`} />)
    }
    nodes.push(...renderInlineRichText(line, `${keyPrefix}-line-${index}`))
  })

  return nodes
}

function isMissingTeachingImageCaptionColumnError(message: string | undefined) {
  if (!message) return false
  return /Could not find the 'learning_image_caption(?:_2)?' column of 'cases' in the schema cache/i.test(
    message
  )
}

const ANALYTICS_PAGE_SIZE = 1000
const ADMIN_ANALYTICS_CACHE_KEY = 'orthodle_admin_analytics_cache_v1'
const ADMIN_ANALYTICS_CACHE_TTL_MS = 1000 * 60 * 5
const EMAIL_REMINDERS_SEEN_AT_KEY = 'orthodle_seen_email_reminders_at'
const CALENDAR_WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function AdminPage() {
  const clueTextareaRefs = useRef<Array<HTMLTextAreaElement | null>>([])
  const previousLevelRef = useRef<Level>('med_student')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [authReady, setAuthReady] = useState(false)
  const [caseDate, setCaseDate] = useState(shiftISODate(today, 1))
  const [level, setLevel] = useState<Level>('med_student')
  const [contributorName, setContributorName] = useState('')
  const [category, setCategory] = useState('')
  const [showCategorySuggestions, setShowCategorySuggestions] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [answer, setAnswer] = useState('')
  const [synonyms, setSynonyms] = useState('')
  const [anatomyCorrectChoices, setAnatomyCorrectChoices] = useState('')
  const anatomyAutoCorrectChoicesRef = useRef('')
  const [imageUrl, setImageUrl] = useState('')
  const [imageCredit, setImageCredit] = useState(DEFAULT_IMAGE_CREDIT_TEMPLATE)
  const [imageRevealClue, setImageRevealClue] = useState('none')
  const [imageUrl2, setImageUrl2] = useState('')
  const [imageCredit2, setImageCredit2] = useState(DEFAULT_IMAGE_CREDIT_TEMPLATE)
  const [imageRevealClue2, setImageRevealClue2] = useState('none')
  const [imageFindings, setImageFindings] = useState('')
  const [learningImageUrl, setLearningImageUrl] = useState('')
  const [learningImageCredit, setLearningImageCredit] = useState(DEFAULT_IMAGE_CREDIT_TEMPLATE)
  const [learningImageCaption, setLearningImageCaption] = useState('')
  const [learningImageUrl2, setLearningImageUrl2] = useState('')
  const [learningImageCredit2, setLearningImageCredit2] = useState(DEFAULT_IMAGE_CREDIT_TEMPLATE)
  const [learningImageCaption2, setLearningImageCaption2] = useState('')
  const [showCaseImage2Fields, setShowCaseImage2Fields] = useState(false)
  const [showTeachingImage2Fields, setShowTeachingImage2Fields] = useState(false)
  const [imagesCollapsed, setImagesCollapsed] = useState(true)
  const [clue1, setClue1] = useState('')
  const [clue2, setClue2] = useState('')
  const [clue3, setClue3] = useState('')
  const [clue4, setClue4] = useState('')
  const [clue5, setClue5] = useState('')
  const [clue6, setClue6] = useState('')
  const [teachingPoint, setTeachingPoint] = useState(DEFAULT_TEACHING_POINT_TEMPLATE)
  const [referenceLinks, setReferenceLinks] = useState('')
  const [status, setStatus] = useState('')
  const [draftStatus, setDraftStatus] = useState('')
  const [slotBackups, setSlotBackups] = useState<CaseBackupEntry[]>([])
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
  const [overviewCaseQuickStats, setOverviewCaseQuickStats] = useState<Record<string, OverviewCaseQuickStat>>({})
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
  const [emailReminderSummary, setEmailReminderSummary] = useState<ReminderAdminDashboardSummary | null>(null)
  const [seenEmailRemindersAt, setSeenEmailRemindersAt] = useState<string | null>(null)
  const [playModeSettingsReady, setPlayModeSettingsReady] = useState(false)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [analyticsLoaded, setAnalyticsLoaded] = useState(false)
  const [noResidentMode, setNoResidentMode] = useState(false)
  const [noResidentModeStartDate, setNoResidentModeStartDate] = useState(shiftISODate(today, 1))
  const [noAnatomyMode, setNoAnatomyMode] = useState(false)
  const [noAnatomyModeStartDate, setNoAnatomyModeStartDate] = useState(shiftISODate(today, 1))
  const [savingHomeDisplaySettings, setSavingHomeDisplaySettings] = useState(false)
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
  const [showComposerChecklist, setShowComposerChecklist] = useState(false)
  const [showComposerCaseStats, setShowComposerCaseStats] = useState(false)
  const [showAnalytics, setShowAnalytics] = useState(true)
  const [showCasesByDate, setShowCasesByDate] = useState(true)
  const [browseDate, setBrowseDate] = useState('')
  const [overviewDate, setOverviewDate] = useState(shiftISODate(today, 1))
  const [overviewCalendarMonth, setOverviewCalendarMonth] = useState(
    getWeekStartISO(shiftISODate(today, 1))
  )
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
  const hiddenSidebarSectionIds = useMemo<AdminSidebarSectionId[]>(
    () => ['button_subtitles', 'submissions'],
    []
  )

  useEffect(() => {
    const savedUnlock = window.sessionStorage.getItem('orthodle_admin_unlocked')
    setIsUnlocked(savedUnlock === 'true')
    setAuthReady(true)
    setSeenEmailRemindersAt(window.localStorage.getItem(EMAIL_REMINDERS_SEEN_AT_KEY))
  }, [])

  function refreshSlotBackups(nextDate = caseDate, nextLevel = level) {
    setSlotBackups(getCaseBackupsForSlot(nextDate, nextLevel).slice(0, 6))
  }

  useEffect(() => {
    if (!authReady || !isUnlocked) return
    refreshSlotBackups(caseDate, level)
  }, [authReady, caseDate, isUnlocked, level])

  function isNoResidentModeActiveOn(dateText: string) {
    if (!noResidentMode) return false
    const effectiveStartDate = noResidentModeStartDate || today
    return dateText >= effectiveStartDate
  }

  function isNoAnatomyModeActiveOn(dateText: string) {
    if (!noAnatomyMode) return false
    const effectiveStartDate = noAnatomyModeStartDate || today
    return dateText >= effectiveStartDate
  }

  useEffect(() => {
    if (isNoResidentModeActiveOn(caseDate) && level === 'resident') {
      setLevel('med_student')
    }
  }, [caseDate, level, noResidentMode, noResidentModeStartDate])

  useEffect(() => {
    const nextWeekStart = getWeekStartISO(overviewDate)
    setOverviewCalendarMonth(current => (current === nextWeekStart ? current : nextWeekStart))
  }, [overviewDate])

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
    loadDiagnosisChoices()
    loadSubmissionSummary()
    loadFeedbackSummary()
    loadEmailReminderSummary()
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
          setShowCaseImage2Fields(Boolean(draft.imageUrl2))
          setImageFindings(draft.imageFindings || '')
          setLearningImageUrl(draft.learningImageUrl || '')
          setLearningImageCredit(draft.learningImageCredit || DEFAULT_IMAGE_CREDIT_TEMPLATE)
          setLearningImageCaption(draft.learningImageCaption || '')
          setLearningImageUrl2(draft.learningImageUrl2 || '')
          setLearningImageCredit2(draft.learningImageCredit2 || DEFAULT_IMAGE_CREDIT_TEMPLATE)
          setLearningImageCaption2(draft.learningImageCaption2 || '')
          setShowTeachingImage2Fields(Boolean(draft.learningImageUrl2))
          setClue1(draft.clue1 || '')
          setClue2(draft.clue2 || '')
          setClue3(draft.clue3 || '')
          setClue4(draft.clue4 || '')
          setClue5(draft.clue5 || '')
          setClue6(draft.clue6 || '')
          {
            const parsedTeaching = splitTeachingPointAndReferences(
              draft.teachingPoint || getDefaultTeachingPointTemplate(draft.level || 'med_student')
            )
            setTeachingPoint(
              parsedTeaching.teachingPoint ||
                getDefaultTeachingPointTemplate(draft.level || 'med_student')
            )
            setReferenceLinks(draft.referenceLinks || parsedTeaching.referenceLinks)
          }
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
    const previousLevel = previousLevelRef.current
    if (previousLevel === level) return

    const previousDefault = getDefaultTeachingPointTemplate(previousLevel).trim()
    const currentTeachingPoint = teachingPoint.trim()

    if (
      !currentTeachingPoint ||
      currentTeachingPoint === previousDefault ||
      currentTeachingPoint === LEGACY_DEFAULT_TEACHING_POINT_TEMPLATE.trim() ||
      currentTeachingPoint === DEFAULT_TEACHING_POINT_TEMPLATE.trim() ||
      currentTeachingPoint === DEFAULT_ANATOMY_TEACHING_POINT_TEMPLATE.trim() ||
      currentTeachingPoint === LEGACY_ANATOMY_TEACHING_POINT_TEMPLATE.trim()
    ) {
      setTeachingPoint(getDefaultTeachingPointTemplate(level))
    }

    previousLevelRef.current = level
  }, [level, teachingPoint])

  useEffect(() => {
    if (!isUnlocked || typeof window === 'undefined') return

    try {
      const rawCache = window.sessionStorage.getItem(ADMIN_ANALYTICS_CACHE_KEY)
      if (!rawCache) return

      const parsed = JSON.parse(rawCache) as {
        savedAt: number
        analytics: AnalyticsRow[]
        analyticsSummary: AnalyticsSummary | null
        levelAnalytics: LevelAnalytics[]
        casePerformance: CasePerformance[]
        audienceSummary: AudienceSummary
      }

      if (!parsed?.savedAt || Date.now() - parsed.savedAt > ADMIN_ANALYTICS_CACHE_TTL_MS) {
        window.sessionStorage.removeItem(ADMIN_ANALYTICS_CACHE_KEY)
        return
      }

      setAnalytics(parsed.analytics || [])
      setAnalyticsSummary(parsed.analyticsSummary || null)
      setLevelAnalytics(parsed.levelAnalytics || [])
      setCasePerformance(parsed.casePerformance || [])
      setAudienceSummary(
        parsed.audienceSummary || {
          topRegions: [],
          topTimezones: [],
        }
      )
      setAnalyticsLoaded(Boolean(parsed.analyticsSummary))
    } catch {
      window.sessionStorage.removeItem(ADMIN_ANALYTICS_CACHE_KEY)
    }
  }, [isUnlocked])

  useEffect(() => {
    if (!isUnlocked || !showAnalytics || analyticsLoading || analyticsLoaded) return

    const timeoutId = window.setTimeout(() => {
      void loadAnalytics()
    }, 150)

    return () => window.clearTimeout(timeoutId)
  }, [analyticsLoaded, analyticsLoading, isUnlocked, showAnalytics])

  useEffect(() => {
    if (!isUnlocked) return

    const intervalId = window.setInterval(() => {
      void loadEmailReminderSummary()
    }, 60000)

    return () => window.clearInterval(intervalId)
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
        imageFindings.trim() ||
        learningImageUrl.trim() ||
        normalizeCreditValue(learningImageCredit) ||
        learningImageCaption.trim() ||
        learningImageUrl2.trim() ||
        normalizeCreditValue(learningImageCredit2) ||
        learningImageCaption2.trim() ||
        clue1.trim() ||
        clue2.trim() ||
        clue3.trim() ||
        clue4.trim() ||
        clue5.trim() ||
        clue6.trim() ||
        teachingPoint.trim() !== DEFAULT_TEACHING_POINT_TEMPLATE.trim() ||
        referenceLinks.trim() ||
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
      imageFindings,
      learningImageUrl,
      learningImageCredit,
      learningImageCaption,
      learningImageUrl2,
      learningImageCredit2,
      learningImageCaption2,
      clue1,
      clue2,
      clue3,
      clue4,
      clue5,
      clue6,
      teachingPoint,
      referenceLinks,
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
    imageFindings,
    learningImageUrl,
    learningImageCredit,
    learningImageCaption,
    learningImageUrl2,
    learningImageCredit2,
    learningImageCaption2,
    clue1,
    clue2,
    clue3,
    clue4,
    clue5,
    clue6,
    teachingPoint,
    referenceLinks,
    activeSubmissionId,
  ])

  const recentEmailReminderChanges = useMemo<ReminderChangeItem[]>(() => {
    const subscribers = emailReminderSummary?.subscribers || []

    return subscribers
      .flatMap<ReminderChangeItem>(row => {
        const createdAtMs = new Date(row.created_at).getTime()
        const updatedAtMs = new Date(row.updated_at).getTime()
        const wasUpdatedLater = Number.isFinite(createdAtMs) &&
          Number.isFinite(updatedAtMs) &&
          updatedAtMs - createdAtMs > 60 * 1000

        if (!row.active && wasUpdatedLater) {
          return [{
            id: `${row.id}-unsubscribed`,
            email: row.email,
            kind: 'unsubscribed' as const,
            timestamp: row.updated_at,
          }]
        }

        if (row.active && wasUpdatedLater) {
          return [{
            id: `${row.id}-resubscribed`,
            email: row.email,
            kind: 'resubscribed' as const,
            timestamp: row.updated_at,
          }]
        }

        return [{
          id: `${row.id}-signup`,
          email: row.email,
          kind: 'signup' as const,
          timestamp: row.created_at,
        }]
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 4)
  }, [emailReminderSummary])

  const latestEmailReminderChangeAt = recentEmailReminderChanges[0]?.timestamp || null
  const unseenEmailReminderCount = useMemo(() => {
    if (!seenEmailRemindersAt) return recentEmailReminderChanges.length

    const seenAtMs = new Date(seenEmailRemindersAt).getTime()
    if (Number.isNaN(seenAtMs)) return recentEmailReminderChanges.length

    return recentEmailReminderChanges.filter(item => {
      const itemMs = new Date(item.timestamp).getTime()
      return Number.isFinite(itemMs) && itemMs > seenAtMs
    }).length
  }, [recentEmailReminderChanges, seenEmailRemindersAt])

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
    element.style.height = 'auto'
    element.style.height = `${Math.max(element.scrollHeight, element.clientHeight, 46)}px`
  }

  useEffect(() => {
    for (const textarea of clueTextareaRefs.current) {
      if (!textarea) continue
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.max(textarea.scrollHeight, textarea.clientHeight, 46)}px`
    }
  }, [clue1, clue2, clue3, clue4, clue5, clue6, level])

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

  const todaysLevelOrder = useMemo<Level[]>(() => planningLevelOrder, [])

  const overviewCases = useMemo(
    () => groupedCases.find(group => group.date === overviewDate)?.items || [],
    [groupedCases, overviewDate]
  )

  useEffect(() => {
    if (!isUnlocked) return

    const visibleCaseIds = Array.from(
      new Set(
        [...todaysCases, ...overviewCases]
          .map(item => item.id)
          .filter(Boolean)
      )
    )

    if (visibleCaseIds.length === 0) {
      setOverviewCaseQuickStats({})
      return
    }

    let cancelled = false

    async function loadOverviewCaseQuickStats() {
      const excludedSessionIdSet = new Set(await fetchExcludedStatsSessionIds())
      const { data, error } = await supabase
        .from('guesses')
        .select('case_id, session_id, is_correct')
        .in('case_id', visibleCaseIds)

      if (cancelled) return
      if (error) return

      const publicGuessRows = filterExcludedSessionRows(data || [], excludedSessionIdSet)
      const perCase = new Map<string, { players: Set<string>; solvedPlayers: Set<string> }>()

      for (const row of publicGuessRows) {
        if (!row.case_id) continue

        const existing = perCase.get(row.case_id) || {
          players: new Set<string>(),
          solvedPlayers: new Set<string>(),
        }

        existing.players.add(row.session_id)
        if (row.is_correct) {
          existing.solvedPlayers.add(row.session_id)
        }
        perCase.set(row.case_id, existing)
      }

      const nextStats = visibleCaseIds.reduce<Record<string, OverviewCaseQuickStat>>((acc, caseId) => {
        const stats = perCase.get(caseId)
        const players = stats?.players.size || 0
        const solvedPlayers = stats?.solvedPlayers.size || 0

        acc[caseId] = {
          players,
          solveRate: players > 0 ? (solvedPlayers / players) * 100 : null,
        }
        return acc
      }, {})

      setOverviewCaseQuickStats(nextStats)
    }

    void loadOverviewCaseQuickStats()

    return () => {
      cancelled = true
    }
  }, [isUnlocked, overviewCases, todaysCases])

  const overviewLevelOrder = useMemo<Level[]>(() => planningLevelOrder, [])
  const readinessByDate = useMemo(() => {
    const map = new Map<
      string,
      { ready: number; required: number; isComplete: boolean; isPartial: boolean }
    >()

    for (const group of groupedCases) {
      const requiredLevels = planningLevelOrder
      const ready = requiredLevels.filter(levelValue =>
        group.items.some(item => item.level === levelValue)
      ).length
      const required = requiredLevels.length

      map.set(group.date, {
        ready,
        required,
        isComplete: ready >= required,
        isPartial: ready > 0 && ready < required,
      })
    }

    return map
  }, [groupedCases, noResidentMode, noResidentModeStartDate])
  const overviewCalendarDays = useMemo(() => {
    const windowStart = new Date(`${overviewCalendarMonth}T12:00:00`)

    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(windowStart)
      day.setDate(windowStart.getDate() + index)
      const isoDate = day.toISOString().slice(0, 10)
      const requiredLevels = planningLevelOrder
      const readiness = readinessByDate.get(isoDate) || {
        ready: 0,
        required: requiredLevels.length,
        isComplete: false,
        isPartial: false,
      }

      return {
        isoDate,
        dayNumber: day.getDate(),
        isCurrentMonth: true,
        isSelected: isoDate === overviewDate,
        readiness,
      }
    })
  }, [overviewCalendarMonth, overviewDate, readinessByDate])
  const previewClues = useMemo(
    () => [clue1, clue2, clue3, clue4, clue5, clue6].map(item => item.trim()).filter(Boolean),
    [clue1, clue2, clue3, clue4, clue5, clue6]
  )
  const anatomyChoiceItemsForComposer = useMemo(
    () => getAnatomyChoiceItems([clue1, clue2, clue3, clue4, clue5, clue6]),
    [clue1, clue2, clue3, clue4, clue5, clue6]
  )
  const derivedAnatomyCorrectChoicesForComposer = useMemo(
    () =>
      getCorrectAnatomyChoiceLetters(
        [clue1, clue2, clue3, clue4, clue5, clue6],
        answer,
        extractPlainSynonyms(
          synonyms
            .split(',')
            .map(item => item.trim())
            .filter(Boolean)
        )
      ).join(', '),
    [answer, clue1, clue2, clue3, clue4, clue5, clue6, synonyms]
  )
  const normalizedAnatomyCorrectChoices = useMemo(
    () => parseChoiceLetterList(anatomyCorrectChoices),
    [anatomyCorrectChoices]
  )

  useEffect(() => {
    if (level !== 'attending') {
      anatomyAutoCorrectChoicesRef.current = ''
      return
    }

    setAnatomyCorrectChoices(current => {
      const trimmedCurrent = current.trim()
      const previousAutoValue = anatomyAutoCorrectChoicesRef.current

      if (derivedAnatomyCorrectChoicesForComposer) {
        anatomyAutoCorrectChoicesRef.current = derivedAnatomyCorrectChoicesForComposer
        if (trimmedCurrent === derivedAnatomyCorrectChoicesForComposer) return current
        return derivedAnatomyCorrectChoicesForComposer
      }

      if (trimmedCurrent === previousAutoValue) {
        anatomyAutoCorrectChoicesRef.current = ''
        return ''
      }

      anatomyAutoCorrectChoicesRef.current = ''
      return current
    })
  }, [derivedAnatomyCorrectChoicesForComposer, level])

  const duplicateAnswerMatches = useMemo(() => {
    const normalizedAnswer = normalizeAnswer(answer)
    if (!answer.trim() || !normalizedAnswer) return []

    return cases.filter(item => {
      if (!item.answer?.trim()) return false
      if (normalizeAnswer(item.answer) !== normalizedAnswer) return false
      return !(item.case_date === caseDate && item.level === level)
    })
  }, [answer, caseDate, cases, level])

  const copyableImageSourceCases = useMemo(
    () =>
      cases
        .filter(item => {
          if (item.case_date !== caseDate || item.level === level) return false
          return Boolean(
            item.image_url ||
              item.image_url_2 ||
              item.image_findings ||
              extractMarkdownLinks(item.teaching_point).length > 0
          )
        })
        .sort((a, b) => levelOrder.indexOf(a.level) - levelOrder.indexOf(b.level)),
    [caseDate, cases, level]
  )

  const filteredCategorySuggestions = useMemo(() => {
    const counts = new Map<string, { label: string; count: number }>()

    for (const item of cases) {
      const label = item.category?.trim()
      if (!label) continue
      const key = label.toLowerCase()
      const existing = counts.get(key)
      if (existing) {
        existing.count += 1
      } else {
        counts.set(key, { label, count: 1 })
      }
    }

    if (level === 'attending' && !counts.has('surgical anatomy')) {
      counts.set('surgical anatomy', { label: 'Surgical Anatomy', count: 0 })
    }

    const query = category.trim().toLowerCase()

    return Array.from(counts.values())
      .filter(item => !query || item.label.toLowerCase().includes(query))
      .sort((a, b) => {
        const aStarts = query ? a.label.toLowerCase().startsWith(query) : false
        const bStarts = query ? b.label.toLowerCase().startsWith(query) : false
        if (aStarts !== bStarts) return aStarts ? -1 : 1
        if (b.count !== a.count) return b.count - a.count
        return a.label.localeCompare(b.label)
      })
      .slice(0, 8)
  }, [cases, category, level])

  const composerGuardrails = useMemo(() => {
    const issues: string[] = []
    const answerPool = new Set<string>()
    const hiddenAnswers = readHiddenDiagnosisAnswers()

    for (const label of ORTHO_DIAGNOSIS_BANK) {
      const normalized = normalizeAnswer(label)
      if (!hiddenAnswers.has(normalized)) {
        answerPool.add(normalized)
      }
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
          required: planningLevelOrder.length,
          ready: planningLevelOrder.filter(levelValue =>
            group.items.some(item => item.level === levelValue)
          ).length,
        }))
        .filter(group => group.ready < group.required)
        ,
    [groupedCases]
  )

  const caseChecklistItems = useMemo(() => {
    const items = [
      {
        label: 'Publish date',
        ready: Boolean(caseDate),
      },
      {
        label: 'Category',
        ready: Boolean(category.trim()),
      },
      {
        label: 'Case prompt',
        ready: Boolean(prompt.trim()),
      },
      {
        label: 'Answer',
        ready: Boolean(answer.trim()),
      },
      {
        label: 'Teaching point',
        ready: Boolean(teachingPoint.trim()),
      },
      {
        label: 'At least 1 clue',
        ready: previewClues.length > 0,
      },
      {
        label: 'Image credits',
        ready:
          (!imageUrl.trim() || Boolean(imageCredit.trim())) &&
          (!imageUrl2.trim() || Boolean(imageCredit2.trim())),
        note:
          imageUrl.trim() || imageUrl2.trim()
            ? 'Add credit for each attached case image.'
            : undefined,
      },
      {
        label: 'Teaching image credits',
        ready:
          (!learningImageUrl.trim() || Boolean(learningImageCredit.trim())) &&
          (!learningImageUrl2.trim() || Boolean(learningImageCredit2.trim())),
        note:
          learningImageUrl.trim() || learningImageUrl2.trim()
            ? 'Add credit for each teaching image.'
            : undefined,
      },
    ]

    if (level === 'attending') {
      items.push({
        label: 'Answer choices',
        ready: anatomyChoiceItemsForComposer.length >= 2,
        note: 'Use at least two anatomy answer choices.',
      })
      items.push({
        label: 'Correct choices',
        ready:
          normalizedAnatomyCorrectChoices.length > 0 &&
          normalizedAnatomyCorrectChoices.every(letter =>
            anatomyChoiceItemsForComposer.some(item => item.letter === letter)
          ),
        note: 'Pick valid correct letters like A, B, C.',
      })
    }

    return items
  }, [
    anatomyChoiceItemsForComposer,
    answer,
    caseDate,
    category,
    imageCredit,
    imageCredit2,
    imageUrl,
    imageUrl2,
    learningImageCredit,
    learningImageCredit2,
    learningImageUrl,
    learningImageUrl2,
    level,
    normalizedAnatomyCorrectChoices,
    previewClues.length,
    prompt,
    teachingPoint,
  ])

  const readyChecklistCount = caseChecklistItems.filter(item => item.ready).length
  const composerGuardrailCount = composerGuardrails.length

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

    const storedTeachingPoint = mergeTeachingPointAndReferences(teachingPoint, referenceLinks)

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
      image_findings: imageFindings.trim() || null,
      clue_1: clue1.trim() || null,
      clue_2: clue2.trim() || null,
      clue_3: clue3.trim() || null,
      clue_4: clue4.trim() || null,
      clue_5: clue5.trim() || null,
      clue_6: clue6.trim() || null,
      teaching_point: storedTeachingPoint || null,
      learning_image_url: learningImageUrl.trim() || null,
      learning_image_credit: normalizeCreditValue(learningImageCredit),
      learning_image_caption: learningImageCaption.trim() || null,
      learning_image_url_2: learningImageUrl2.trim() || null,
      learning_image_credit_2: normalizeCreditValue(learningImageCredit2),
      learning_image_caption_2: learningImageCaption2.trim() || null,
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

  function shouldAutofillCredit(value: string) {
    return !normalizeCreditValue(value)
  }

  async function fetchLinkMetadata(url: string) {
    const response = await fetch(`/api/link-metadata?url=${encodeURIComponent(url)}`, {
      cache: 'no-store',
    })
    const data = (await response.json().catch(() => null)) as LinkMetadataResult | { error?: string } | null
    if (!response.ok || !data || !('creditLine' in data || 'error' in data)) {
      return null
    }
    if ('error' in data) return null
    return data as LinkMetadataResult
  }

  async function maybeFillCreditFromUrl(
    url: string,
    currentCredit: string,
    setCredit: (value: string) => void,
    statusLabel: string
  ) {
    const trimmedUrl = url.trim()
    if (!/^https?:\/\//i.test(trimmedUrl) || !shouldAutofillCredit(currentCredit)) return null

    const metadata = await fetchLinkMetadata(trimmedUrl)
    if (metadata?.creditLine) {
      setCredit(metadata.creditLine)
      setStatus(
        metadata.author
          ? `${statusLabel} credit filled from ${metadata.author}${metadata.siteName ? ` · ${metadata.siteName}` : ''}.`
          : `${statusLabel} credit filled from ${metadata.siteName || 'the link'}.`
      )
    }
    return metadata
  }

  async function hydrateReferenceLinks(value: string) {
    const lines = value
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)

    if (lines.length === 0) return ''

    const nextLines = await Promise.all(
      lines.map(async line => {
        const parts = getReferenceLineParts(line)
        if (!parts) return line

        const metadata = await fetchLinkMetadata(parts.url)
        const preferredLabel =
          metadata?.siteName?.trim() ||
          metadata?.title?.trim() ||
          getDefaultReferenceLabel(parts.url)

        if (parts.isMarkdown && !shouldReplaceReferenceLabel(parts.label, parts.url)) {
          return line
        }

        return `[${preferredLabel}](${parts.url})`
      })
    )

    return nextLines.join('\n')
  }

  function applyMetadataCreditToEmptyImageFields(metadata: LinkMetadataResult) {
    if (!metadata.creditLine) return 0

    let appliedCount = 0

    if (imageUrl.trim() && shouldAutofillCredit(imageCredit)) {
      setImageCredit(metadata.creditLine)
      appliedCount += 1
    }

    if (imageUrl2.trim() && shouldAutofillCredit(imageCredit2)) {
      setImageCredit2(metadata.creditLine)
      appliedCount += 1
    }

    if (learningImageUrl.trim() && shouldAutofillCredit(learningImageCredit)) {
      setLearningImageCredit(metadata.creditLine)
      appliedCount += 1
    }

    if (learningImageUrl2.trim() && shouldAutofillCredit(learningImageCredit2)) {
      setLearningImageCredit2(metadata.creditLine)
      appliedCount += 1
    }

    return appliedCount
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

  function wrapRichTextSelection(
    textarea: HTMLTextAreaElement | null,
    value: string,
    onChange: (nextValue: string) => void,
    format: 'bold' | 'italic' | 'underline'
  ) {
    if (!textarea) return

    const markers =
      format === 'bold'
        ? { open: '**', close: '**' }
        : format === 'italic'
          ? { open: '*', close: '*' }
          : { open: '<u>', close: '</u>' }
    const selectionStart = textarea.selectionStart
    const selectionEnd = textarea.selectionEnd
    const selectedText = value.slice(selectionStart, selectionEnd)
    const wrapped = `${markers.open}${selectedText || 'text'}${markers.close}`
    const nextValue = value.slice(0, selectionStart) + wrapped + value.slice(selectionEnd)

    onChange(nextValue)

    requestAnimationFrame(() => {
      textarea.focus()
      const start = selectionStart + markers.open.length
      const end = start + (selectedText || 'text').length
      textarea.setSelectionRange(start, end)
    })
  }

  function normalizeImageRevealValueForEditor(value: number | null | undefined) {
    if (value === 0) return 'after'
    if (value && value >= 1 && value <= 6) return String(value)
    return 'none'
  }

  function toggleTextareaBullets(
    textarea: HTMLTextAreaElement | null,
    value: string,
    onChange: (nextValue: string) => void
  ) {
    if (!textarea) return

    const selectionStart = textarea.selectionStart
    const selectionEnd = textarea.selectionEnd
    const startOfFirstLine = value.lastIndexOf('\n', Math.max(0, selectionStart - 1)) + 1
    const endOfLastLineIndex = value.indexOf('\n', selectionEnd)
    const endOfLastLine = endOfLastLineIndex === -1 ? value.length : endOfLastLineIndex
    const selectedBlock = value.slice(startOfFirstLine, endOfLastLine)
    const lines = selectedBlock.split('\n')

    const shouldRemoveBullets = lines.every(line => !line.trim() || /^[-*•]\s+/.test(line.trim()))
    const nextBlock = lines
      .map(line => {
        if (!line.trim()) return line
        return shouldRemoveBullets
          ? line.replace(/^(\s*)[-*•]\s+/, '$1')
          : `${line.replace(/^(\s*)/, '$1')}`.replace(/^(\s*)/, '$1- ')
      })
      .join('\n')

    const nextValue = value.slice(0, startOfFirstLine) + nextBlock + value.slice(endOfLastLine)

    onChange(nextValue)

    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(startOfFirstLine, startOfFirstLine + nextBlock.length)
    })
  }

  function handleRichTextareaKeyDown(
    event: React.KeyboardEvent<HTMLTextAreaElement>,
    value: string,
    onChange: (nextValue: string) => void
  ) {
    if (!(event.metaKey || event.ctrlKey)) return

    const key = event.key.toLowerCase()
    if (key === 'b') {
      event.preventDefault()
      wrapRichTextSelection(event.currentTarget, value, onChange, 'bold')
    }

    if (key === 'i') {
      event.preventDefault()
      wrapRichTextSelection(event.currentTarget, value, onChange, 'italic')
    }

    if (key === 'u') {
      event.preventDefault()
      wrapRichTextSelection(event.currentTarget, value, onChange, 'underline')
    }

    if (event.shiftKey && (event.code === 'Digit7' || event.code === 'Digit8')) {
      event.preventDefault()
      toggleTextareaBullets(event.currentTarget, value, onChange)
    }
  }

  function formatCopySourceLevel(levelValue: Level) {
    if (levelValue === 'med_student') return 'Daily Case'
    if (levelValue === 'resident') return 'Resident'
    return 'Anatomy Quiz'
  }

  function upsertReferenceLinkLine(currentValue: string, markdownLink: string) {
    const trimmedLink = markdownLink.trim()
    if (!isReferenceLinkLine(trimmedLink)) return currentValue

    const existingLines = currentValue
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)

    if (existingLines.some(line => normalizeAnswer(line) === normalizeAnswer(trimmedLink))) {
      return currentValue
    }

    return existingLines.length > 0
      ? `${existingLines.join('\n')}\n${trimmedLink}`
      : trimmedLink
  }

  function copyImageBundleFromCase(sourceCase: CaseRow) {
    const sourceLinks = extractMarkdownLinks(sourceCase.teaching_point)

    setImageUrl(sourceCase.image_url || '')
    setImageCredit(sourceCase.image_credit || DEFAULT_IMAGE_CREDIT_TEMPLATE)
    setImageUrl2(sourceCase.image_url_2 || '')
    setImageCredit2(sourceCase.image_credit_2 || DEFAULT_IMAGE_CREDIT_TEMPLATE)
    setShowCaseImage2Fields(Boolean(sourceCase.image_url_2))
    setImageFindings(sourceCase.image_findings || '')

    if (sourceLinks.length > 0) {
      setReferenceLinks(currentValue => {
        let nextValue = currentValue
        for (const sourceLink of sourceLinks) {
          nextValue = upsertReferenceLinkLine(nextValue, sourceLink.markdown)
        }
        return nextValue
      })
    }

    const copiedParts = [
      sourceCase.image_url || sourceCase.image_url_2 ? 'image' : null,
      sourceCase.image_findings ? 'image findings' : null,
      sourceLinks.length > 0 ? `reference link${sourceLinks.length === 1 ? '' : 's'}` : null,
    ].filter(Boolean)

    setStatus(
      `Copied ${copiedParts.join(', ') || 'image details'} from ${formatCopySourceLevel(sourceCase.level)} on ${sourceCase.case_date}.`
    )
  }

  function nextMissingLevelForDate(dateText: string): Level | null {
    const items = groupedCases.find(group => group.date === dateText)?.items || []
    const requiredLevels = planningLevelOrder
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

  function selectOverviewDate(nextDate: string) {
    setOverviewDate(nextDate)
    setCaseDate(nextDate)
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
    setShowCaseImage2Fields(false)
    setImageFindings('')
    setLearningImageUrl('')
    setLearningImageCredit(DEFAULT_IMAGE_CREDIT_TEMPLATE)
    setLearningImageCaption('')
    setLearningImageUrl2('')
    setLearningImageCredit2(DEFAULT_IMAGE_CREDIT_TEMPLATE)
    setLearningImageCaption2('')
    setShowTeachingImage2Fields(false)
    setClue1('')
    setClue2('')
    setClue3('')
    setClue4('')
    setClue5('')
    setClue6('')
    setTeachingPoint(getDefaultTeachingPointTemplate(nextLevel))
    setReferenceLinks('')
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
    setShowCaseImage2Fields(false)
    setImageFindings('')
    setLearningImageUrl('')
    setLearningImageCredit(DEFAULT_IMAGE_CREDIT_TEMPLATE)
    setLearningImageCaption('')
    setLearningImageUrl2('')
    setLearningImageCredit2(DEFAULT_IMAGE_CREDIT_TEMPLATE)
    setLearningImageCaption2('')
    setShowTeachingImage2Fields(false)
    setClue1('')
    setClue2('')
    setClue3('')
    setClue4('')
    setClue5('')
    setClue6('')
    setTeachingPoint(getDefaultTeachingPointTemplate('med_student'))
    setReferenceLinks('')
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
    setShowCaseImage2Fields(Boolean(c.image_url_2))
    setImageFindings(c.image_findings || '')
    setLearningImageUrl(c.learning_image_url || '')
    setLearningImageCredit(c.learning_image_credit || DEFAULT_IMAGE_CREDIT_TEMPLATE)
    setLearningImageCaption(c.learning_image_caption || '')
    setLearningImageUrl2(c.learning_image_url_2 || '')
    setLearningImageCredit2(c.learning_image_credit_2 || DEFAULT_IMAGE_CREDIT_TEMPLATE)
    setLearningImageCaption2(c.learning_image_caption_2 || '')
    setShowTeachingImage2Fields(Boolean(c.learning_image_url_2))
    setClue1(c.clue_1 || '')
    setClue2(c.clue_2 || '')
    setClue3(c.clue_3 || '')
    setClue4(c.clue_4 || '')
    setClue5(c.clue_5 || '')
    setClue6(c.clue_6 || '')
    {
      const parsedTeaching = splitTeachingPointAndReferences(
        c.teaching_point || getDefaultTeachingPointTemplate(c.level)
      )
      setTeachingPoint(parsedTeaching.teachingPoint || getDefaultTeachingPointTemplate(c.level))
      setReferenceLinks(parsedTeaching.referenceLinks)
    }
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
    setShowCaseImage2Fields(Boolean(submission.image_url_2))
    setImageFindings(submission.image_findings || '')
    setLearningImageUrl(submission.learning_image_url || '')
    setLearningImageCredit(submission.learning_image_credit || DEFAULT_IMAGE_CREDIT_TEMPLATE)
    setLearningImageCaption(submission.learning_image_caption || '')
    setLearningImageUrl2(submission.learning_image_url_2 || '')
    setLearningImageCredit2(submission.learning_image_credit_2 || DEFAULT_IMAGE_CREDIT_TEMPLATE)
    setLearningImageCaption2(submission.learning_image_caption_2 || '')
    setShowTeachingImage2Fields(Boolean(submission.learning_image_url_2))
    setClue1(submission.clue_1 || '')
    setClue2(submission.clue_2 || '')
    setClue3(submission.clue_3 || '')
    setClue4(submission.clue_4 || '')
    setClue5(submission.clue_5 || '')
    setClue6(submission.clue_6 || '')
    {
      const parsedTeaching = splitTeachingPointAndReferences(
        submission.teaching_point || getDefaultTeachingPointTemplate(submission.level)
      )
      setTeachingPoint(
        parsedTeaching.teachingPoint || getDefaultTeachingPointTemplate(submission.level)
      )
      setReferenceLinks(parsedTeaching.referenceLinks)
    }
    setActiveSubmissionId(submission.id)
    setShowComposer(true)
    setStatus(
      `Editing submission from ${submission.contributor_name || 'Anonymous contributor'}`
    )
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function restoreCaseBackup(backup: CaseBackupEntry) {
    const snapshot = backup.case
    editCase({
      id: snapshot.id || `backup-${backup.backupId}`,
      case_date: snapshot.case_date,
      level: snapshot.level,
      contributor_name: snapshot.contributor_name || null,
      category: snapshot.category || '',
      prompt: snapshot.prompt || '',
      answer: snapshot.answer || '',
      synonyms: snapshot.synonyms || null,
      image_url: snapshot.image_url || null,
      image_credit: snapshot.image_credit || null,
      image_reveal_clue: snapshot.image_reveal_clue ?? null,
      image_url_2: snapshot.image_url_2 || null,
      image_credit_2: snapshot.image_credit_2 || null,
      image_reveal_clue_2: snapshot.image_reveal_clue_2 ?? null,
      image_findings: snapshot.image_findings || null,
      clue_1: snapshot.clue_1 || null,
      clue_2: snapshot.clue_2 || null,
      clue_3: snapshot.clue_3 || null,
      clue_4: snapshot.clue_4 || null,
      clue_5: snapshot.clue_5 || null,
      clue_6: snapshot.clue_6 || null,
      teaching_point: snapshot.teaching_point || null,
      learning_image_url: snapshot.learning_image_url || null,
      learning_image_credit: snapshot.learning_image_credit || null,
      learning_image_caption: snapshot.learning_image_caption || null,
      learning_image_url_2: snapshot.learning_image_url_2 || null,
      learning_image_credit_2: snapshot.learning_image_credit_2 || null,
      learning_image_caption_2: snapshot.learning_image_caption_2 || null,
    })
    setStatus(
      `Backup restored from ${new Date(backup.capturedAt).toLocaleString()}. Save the case to publish this version.`
    )
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
    setAnalyticsLoading(true)
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
        setAnalyticsLoading(false)
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
        setAnalyticsLoading(false)
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
    const todayCaseSessions = new Set<string>()
    const todayArchiveSessions = new Set<string>()
    let todayCaseGuesses = 0
    let todayCaseCorrectGuesses = 0
    let todayArchiveGuesses = 0
    let todayArchiveCorrectGuesses = 0
    for (const guess of guesses) {
      const caseDate = guess.cases?.case_date
      const guessDate = timestampToLocalISO(guess.created_at)
      const caseLevel = guess.cases?.level

      if (guessDate === today && caseDate === today && caseLevel === 'med_student') {
        todayCaseSessions.add(guess.session_id)
        todayCaseGuesses += 1
        if (guess.is_correct) todayCaseCorrectGuesses += 1
      }

      if (guessDate === today && caseDate && caseDate < today) {
        todayArchiveSessions.add(guess.session_id)
        todayArchiveGuesses += 1
        if (guess.is_correct) todayArchiveCorrectGuesses += 1
      }

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

    const nextAnalytics = Object.values(byDate)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 14)

    const nextAnalyticsSummary = {
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
      todayCaseUsers: todayCaseSessions.size,
      todayCaseGuesses,
      todayCaseCorrectGuesses,
      todayArchiveUsers: todayArchiveSessions.size,
      todayArchiveGuesses,
      todayArchiveCorrectGuesses,
    }

    const nextLevelAnalytics = levelOrder.map(levelValue => levelTotals[levelValue])
    const nextCasePerformance = Array.from(caseTotals.values())
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

    const nextAudienceSummary = {
      topRegions: Array.from(regionCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([label, count]) => ({ label, count })),
      topTimezones: Array.from(timezoneCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([label, count]) => ({ label, count })),
    }

    setAnalytics(nextAnalytics)
    setAnalyticsSummary(nextAnalyticsSummary)
    setLevelAnalytics(nextLevelAnalytics)
    setCasePerformance(nextCasePerformance)
    setAudienceSummary(nextAudienceSummary)
    setAnalyticsLoaded(true)
    setAnalyticsLoading(false)

    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(
        ADMIN_ANALYTICS_CACHE_KEY,
        JSON.stringify({
          savedAt: Date.now(),
          analytics: nextAnalytics,
          analyticsSummary: nextAnalyticsSummary,
          levelAnalytics: nextLevelAnalytics,
          casePerformance: nextCasePerformance,
          audienceSummary: nextAudienceSummary,
        })
      )
    }
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

  async function loadEmailReminderSummary() {
    try {
      const response = await fetch('/api/reminders/admin', { cache: 'no-store' })
      const data = await response.json().catch(() => null)

      if (!response.ok || !data) return

      setEmailReminderSummary({
        activeSubscribers: data.activeSubscribers || 0,
        totalSubscribers: data.totalSubscribers || 0,
        subscribers: Array.isArray(data.subscribers) ? data.subscribers : [],
      })
    } catch {
      // Keep the dashboard quiet if reminder activity cannot be loaded.
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
    try {
      const { data, error } = await supabase
        .from('play_mode_settings')
        .select('no_resident_mode, no_resident_mode_start_date, no_anatomy_mode, no_anatomy_mode_start_date')
        .eq('id', 'default')
        .maybeSingle()

      if (
        error &&
        (error.message.includes('no_anatomy_mode') ||
          error.message.includes('no_anatomy_mode_start_date'))
      ) {
        const fallback = await supabase
          .from('play_mode_settings')
          .select('no_resident_mode, no_resident_mode_start_date')
          .eq('id', 'default')
          .maybeSingle()

        const fallbackRow = (fallback.data as Partial<PlayModeSettingsRow> | null) || null
        setNoResidentMode(Boolean(fallbackRow?.no_resident_mode))
        setNoResidentModeStartDate(fallbackRow?.no_resident_mode_start_date || shiftISODate(today, 1))
        setNoAnatomyMode(false)
        setNoAnatomyModeStartDate(shiftISODate(today, 1))
        return
      }

      const row = (data as PlayModeSettingsRow | null) || null
      setNoResidentMode(Boolean(row?.no_resident_mode))
      setNoResidentModeStartDate(row?.no_resident_mode_start_date || shiftISODate(today, 1))
      setNoAnatomyMode(Boolean(row?.no_anatomy_mode))
      setNoAnatomyModeStartDate(row?.no_anatomy_mode_start_date || shiftISODate(today, 1))
    } finally {
      setPlayModeSettingsReady(true)
    }
  }

  async function saveHomeDisplaySettings(
    nextSettings: Partial<PlayModeSettingsRow>,
    successMessage: string
  ) {
    setSavingHomeDisplaySettings(true)

    const nextResidentMode = nextSettings.no_resident_mode ?? noResidentMode
    const nextResidentStartDate =
      nextResidentMode
        ? nextSettings.no_resident_mode_start_date ?? noResidentModeStartDate
        : null
    const nextAnatomyMode = nextSettings.no_anatomy_mode ?? noAnatomyMode
    const nextAnatomyStartDate =
      nextAnatomyMode
        ? nextSettings.no_anatomy_mode_start_date ?? noAnatomyModeStartDate
        : null

    const fullPayload = {
      id: 'default',
      no_resident_mode: nextResidentMode,
      no_resident_mode_start_date: nextResidentStartDate,
      no_anatomy_mode: nextAnatomyMode,
      no_anatomy_mode_start_date: nextAnatomyStartDate,
      updated_at: new Date().toISOString(),
    }

    let { error } = await supabase.from('play_mode_settings').upsert(fullPayload, {
      onConflict: 'id',
    })

    if (
      error &&
      (error.message.includes('no_anatomy_mode') ||
        error.message.includes('no_anatomy_mode_start_date')) &&
      nextSettings.no_anatomy_mode === undefined &&
      nextSettings.no_anatomy_mode_start_date === undefined
    ) {
      const fallbackResult = await supabase.from('play_mode_settings').upsert(
        {
          id: 'default',
          no_resident_mode: nextResidentMode,
          no_resident_mode_start_date: nextResidentStartDate,
          updated_at: fullPayload.updated_at,
        },
        { onConflict: 'id' }
      )
      error = fallbackResult.error
    }

    if (error) {
      setStatus(
        error.message.includes('relation') || error.message.includes('does not exist')
          ? 'Home display settings are not set up yet. Run the SQL once, then try again.'
          : error.message.includes('no_anatomy_mode') || error.message.includes('no_anatomy_mode_start_date')
            ? 'Run the new home display SQL once to schedule the anatomy quiz on or off.'
            : `Could not save home display settings: ${error.message}`
      )
      setSavingHomeDisplaySettings(false)
      return
    }

    setNoResidentMode(Boolean(nextResidentMode))
    setNoResidentModeStartDate(nextResidentStartDate || shiftISODate(today, 1))
    setNoAnatomyMode(Boolean(nextAnatomyMode))
    setNoAnatomyModeStartDate(nextAnatomyStartDate || shiftISODate(today, 1))

    if (
      nextResidentMode &&
      level === 'resident' &&
      caseDate >= (nextResidentStartDate || today)
    ) {
      setLevel('med_student')
    }
    if (
      nextAnatomyMode &&
      level === 'attending' &&
      caseDate >= (nextAnatomyStartDate || today)
    ) {
      setLevel('med_student')
    }

    setStatus(successMessage)
    setSavingHomeDisplaySettings(false)
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

    const { data: guessRows, error: guessError } = await supabase
      .from('guesses')
      .select('session_id, is_correct, created_at, guess_text')
      .eq('case_id', matchingCase.id)
      .order('created_at', { ascending: true })

    if (guessError) {
      setStatus(`Could not load case stats: ${guessError.message}`)
      setCaseCommunityStats(null)
      return
    }

    const publicGuessRows = filterExcludedSessionRows(guessRows || [], excludedSessionIdSet)
    const players = new Set<string>(publicGuessRows.map(item => item.session_id))

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
    const acceptedGuesses = [matchingCase.answer, ...(matchingCase.synonyms || [])]

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
      if (isAcceptedGuess(rawGuess, acceptedGuesses)) continue

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

  async function deleteCurrentSlot() {
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
  }

  async function saveCase() {
    if (!caseDate || !level || !category || !prompt || !answer) {
      setStatus('Please fill out date, level, category, prompt, and answer.')
      return
    }

    const { data: existingCase, error: existingCaseError } = await supabase
      .from('cases')
      .select('*')
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
    const storedTeachingPoint = mergeTeachingPointAndReferences(teachingPoint, referenceLinks)

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

    const casePayload = {
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
      image_findings: imageFindings.trim() || null,
      learning_image_url: learningImageUrl || null,
      learning_image_credit: savedLearningImageCredit,
      learning_image_caption: learningImageCaption.trim() || null,
      learning_image_url_2: learningImageUrl2 || null,
      learning_image_credit_2: savedLearningImageCredit2,
      learning_image_caption_2: learningImageCaption2.trim() || null,
      clue_1: clue1 || null,
      clue_2: clue2 || null,
      clue_3: clue3 || null,
      clue_4: clue4 || null,
      clue_5: clue5 || null,
      clue_6: clue6 || null,
      teaching_point: storedTeachingPoint || null,
    }

    const createdBackup =
      existingCase && shouldCreateCaseBackup(existingCase as CaseRow, casePayload)
        ? saveCaseBackup(existingCase as CaseRow, 'admin')
        : null

    let { error } = await supabase.from('cases').upsert(casePayload, {
      onConflict: 'case_date,level',
    })

    let savedWithoutCaptionColumns = false

    if (error && isMissingTeachingImageCaptionColumnError(error.message)) {
      const casePayloadWithoutCaptions = { ...casePayload }
      delete casePayloadWithoutCaptions.learning_image_caption
      delete casePayloadWithoutCaptions.learning_image_caption_2

      const retryResult = await supabase.from('cases').upsert(casePayloadWithoutCaptions, {
        onConflict: 'case_date,level',
      })

      error = retryResult.error
      savedWithoutCaptionColumns = !retryResult.error
    }

    if (error) {
      setStatus(`Error saving case: ${error.message}`)
      return
    }

    setStatus(
      savedWithoutCaptionColumns
        ? `Case saved for ${caseDate} · ${level}.${createdBackup ? ' Previous version backed up automatically.' : ''} Teaching image captions need the database update before they can be stored.`
        : `Case saved for ${caseDate} · ${level}.${createdBackup ? ' Previous version backed up automatically.' : ''}`
    )
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
    refreshSlotBackups(caseDate, level)
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
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/email-reminders"
            onClick={() => {
              if (latestEmailReminderChangeAt) {
                window.localStorage.setItem(
                  EMAIL_REMINDERS_SEEN_AT_KEY,
                  latestEmailReminderChangeAt
                )
                setSeenEmailRemindersAt(latestEmailReminderChangeAt)
              }
            }}
            className="font-serif text-xl font-bold transition hover:text-[#1f6448]"
          >
            Email Reminders
          </Link>
          {unseenEmailReminderCount > 0 && (
            <div className="rounded-full bg-[#fff1e8] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#a24d24]">
              {unseenEmailReminderCount}
            </div>
          )}
        </div>
      </section>
    ),
    study_mode: (
      <section className="card rounded-2xl border border-[#e7e1d6] bg-white p-3.5 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
        <Link href="/study" className="font-serif text-xl font-bold transition hover:text-[#1f6448]">
          Study Mode
        </Link>
      </section>
    ),
    no_resident_mode: (
      <section className="card rounded-2xl border border-[#e7e1d6] bg-white p-3.5 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
        <h2 className="font-serif text-xl font-bold">Home case display</h2>

        <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-[#7a857c]">
          Control what shows in the home rail
        </div>

        <div className="mt-3 grid gap-3">
          <div className="rounded-xl border border-[#e7e1d6] bg-[#fcfbf8] p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-[#102018]">Resident case</div>
                <div className="mt-0.5 text-[12px] leading-5 text-[#637268]">
                  Hide the resident slot from the home page starting on a specific day.
                </div>
              </div>
              <div className="rounded-full border border-[#ded7ca] bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#637268]">
                {noResidentMode ? 'Hidden' : 'Visible'}
              </div>
            </div>

            <div className="mt-3 grid gap-2">
              <label className="grid gap-1.5 text-sm font-semibold text-[#637268]">
                Hide starting
                <input
                  type="date"
                  value={noResidentModeStartDate}
                  onChange={event => setNoResidentModeStartDate(event.target.value)}
                  className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                />
              </label>

              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() =>
                    void saveHomeDisplaySettings(
                      {
                        no_resident_mode: true,
                        no_resident_mode_start_date: noResidentModeStartDate,
                      },
                      `Resident case will be hidden on the home page starting ${noResidentModeStartDate || shiftISODate(today, 1)}.`
                    )
                  }
                  disabled={savingHomeDisplaySettings || !noResidentModeStartDate}
                  className="rounded-lg border border-[#1f6448] bg-[#1f6448] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#174c37] disabled:opacity-60 sm:flex-1"
                >
                  {savingHomeDisplaySettings && !noResidentMode ? 'Saving...' : noResidentMode ? 'Update hide date' : 'Hide on home'}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    void saveHomeDisplaySettings(
                      {
                        no_resident_mode: false,
                        no_resident_mode_start_date: null,
                      },
                      'Resident case restored on the home page.'
                    )
                  }
                  disabled={savingHomeDisplaySettings || !noResidentMode}
                  className="rounded-lg border border-[#ded7ca] bg-white px-3 py-2 text-sm font-semibold text-[#102018] transition hover:bg-[#fbfaf7] disabled:opacity-60 sm:flex-1"
                >
                  Show
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[#e7e1d6] bg-[#fcfbf8] p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-[#102018]">Anatomy quiz</div>
                <div className="mt-0.5 text-[12px] leading-5 text-[#637268]">
                  When hidden, the home rail swaps Anatomy Quiz for Archives.
                </div>
              </div>
              <div className="rounded-full border border-[#ded7ca] bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#637268]">
                {noAnatomyMode ? 'Hidden' : 'Visible'}
              </div>
            </div>

            <div className="mt-3 grid gap-2">
              <label className="grid gap-1.5 text-sm font-semibold text-[#637268]">
                Hide starting
                <input
                  type="date"
                  value={noAnatomyModeStartDate}
                  onChange={event => setNoAnatomyModeStartDate(event.target.value)}
                  className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                />
              </label>

              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() =>
                    void saveHomeDisplaySettings(
                      {
                        no_anatomy_mode: true,
                        no_anatomy_mode_start_date: noAnatomyModeStartDate,
                      },
                      `Anatomy quiz will be hidden on the home page starting ${noAnatomyModeStartDate || shiftISODate(today, 1)}.`
                    )
                  }
                  disabled={savingHomeDisplaySettings || !noAnatomyModeStartDate}
                  className="rounded-lg border border-[#1f6448] bg-[#1f6448] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#174c37] disabled:opacity-60 sm:flex-1"
                >
                  {savingHomeDisplaySettings && !noAnatomyMode ? 'Saving...' : noAnatomyMode ? 'Update hide date' : 'Hide on home'}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    void saveHomeDisplaySettings(
                      {
                        no_anatomy_mode: false,
                        no_anatomy_mode_start_date: null,
                      },
                      'Anatomy quiz restored on the home page.'
                    )
                  }
                  disabled={savingHomeDisplaySettings || !noAnatomyMode}
                  className="rounded-lg border border-[#ded7ca] bg-white px-3 py-2 text-sm font-semibold text-[#102018] transition hover:bg-[#fbfaf7] disabled:opacity-60 sm:flex-1"
                >
                  Show
                </button>
              </div>
            </div>
          </div>
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
            onKeyDown={event => handleRichTextareaKeyDown(event, announcementMessage, setAnnouncementMessage)}
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
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="rounded-xl bg-[#fbfaf7] px-3 py-2.5 shadow-[inset_0_0_0_1px_rgba(222,215,202,0.65)]">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#637268]">
                      Total users
                    </div>
                    <div className="mt-1 font-serif text-xl font-bold text-[#102018]">
                      {analyticsSummary.totalUniqueUsers}
                    </div>
                  </div>

                  <div className="rounded-xl bg-[#fbfaf7] px-3 py-2.5 shadow-[inset_0_0_0_1px_rgba(222,215,202,0.65)]">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#637268]">
                      Combined daily users
                    </div>
                    <div className="mt-1 font-serif text-xl font-bold text-[#102018]">
                      {analyticsSummary.cumulativeDailyUsers}
                    </div>
                  </div>

                  <div className="rounded-xl bg-[#fbfaf7] px-3 py-2.5 shadow-[inset_0_0_0_1px_rgba(222,215,202,0.65)]">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#637268]">
                      Total guesses
                    </div>
                    <div className="mt-1 font-serif text-xl font-bold text-[#102018]">
                      {analyticsSummary.totalGuesses}
                    </div>
                  </div>

                  <div className="rounded-xl bg-[#fbfaf7] px-3 py-2.5 shadow-[inset_0_0_0_1px_rgba(222,215,202,0.65)]">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#637268]">
                      Guess accuracy
                    </div>
                    <div className="mt-1 font-serif text-xl font-bold text-[#102018]">
                      {formatPercent(analyticsSummary.guessAccuracy)}
                    </div>
                  </div>

                  <div className="rounded-xl bg-[#fbfaf7] px-3 py-2.5 shadow-[inset_0_0_0_1px_rgba(222,215,202,0.65)]">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#637268]">
                      Avg guesses / user
                    </div>
                    <div className="mt-1 font-serif text-xl font-bold text-[#102018]">
                      {analyticsSummary.averageGuessesPerUser.toFixed(1)}
                    </div>
                  </div>

                  <div className="rounded-xl bg-[#fbfaf7] px-3 py-2.5 shadow-[inset_0_0_0_1px_rgba(222,215,202,0.65)]">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#637268]">
                      Archive plays
                    </div>
                    <div className="mt-1 font-serif text-xl font-bold text-[#102018]">
                      {analyticsSummary.archivePlays}
                    </div>
                  </div>

                </div>

                <div className="rounded-xl bg-[#fcfbf8] px-3 py-3 shadow-[inset_0_0_0_1px_rgba(231,225,214,0.85)]">
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
                    <div className="mt-3 space-y-2.5">
                      <div className="rounded-lg bg-white px-3 py-2 text-[11px] text-[#637268] shadow-[inset_0_0_0_1px_rgba(236,228,215,0.9)]">
                        <span className="font-semibold text-[#102018]">{analyticsSummary.todayUsers}</span> sitewide users
                        {' · '}
                        <span className="font-semibold text-[#102018]">{analyticsSummary.todayNewUsers}</span> new
                        {' · '}
                        <span className="font-semibold text-[#102018]">{analyticsSummary.todayReturningUsers}</span> returning
                      </div>

                      <div className="space-y-2">
                        <div className="rounded-lg bg-white px-3 py-2.5 shadow-[inset_0_0_0_1px_rgba(230,223,210,0.9)]">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#637268]">
                            Today&apos;s case
                          </div>
                          <div className="mt-2 grid grid-cols-3 gap-0 text-center">
                            <div className="px-1">
                              <div className="font-serif text-[22px] font-bold leading-none text-[#102018]">
                                {analyticsSummary.todayCaseUsers}
                              </div>
                              <div className="mt-1 text-[8px] font-medium uppercase tracking-[0.08em] text-[#637268]">
                                Users
                              </div>
                            </div>
                            <div className="border-x border-[#eee7da] px-1">
                              <div className="font-serif text-[22px] font-bold leading-none text-[#102018]">
                                {analyticsSummary.todayCaseGuesses}
                              </div>
                              <div className="mt-1 text-[8px] font-medium uppercase tracking-[0.08em] text-[#637268]">
                                Guesses
                              </div>
                            </div>
                            <div className="px-1">
                              <div className="font-serif text-[22px] font-bold leading-none text-[#102018]">
                                {analyticsSummary.todayCaseCorrectGuesses}
                              </div>
                              <div className="mt-1 text-[8px] font-medium uppercase tracking-[0.08em] text-[#637268]">
                                Correct
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-lg bg-white px-3 py-2.5 shadow-[inset_0_0_0_1px_rgba(230,223,210,0.9)]">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#637268]">
                            Archive activity
                          </div>
                          <div className="mt-2 grid grid-cols-3 gap-0 text-center">
                            <div className="px-1">
                              <div className="font-serif text-[22px] font-bold leading-none text-[#102018]">
                                {analyticsSummary.todayArchiveUsers}
                              </div>
                              <div className="mt-1 text-[8px] font-medium uppercase tracking-[0.08em] text-[#637268]">
                                Users
                              </div>
                            </div>
                            <div className="border-x border-[#eee7da] px-1">
                              <div className="font-serif text-[22px] font-bold leading-none text-[#102018]">
                                {analyticsSummary.todayArchiveGuesses}
                              </div>
                              <div className="mt-1 text-[8px] font-medium uppercase tracking-[0.08em] text-[#637268]">
                                Guesses
                              </div>
                            </div>
                            <div className="px-1">
                              <div className="font-serif text-[22px] font-bold leading-none text-[#102018]">
                                {analyticsSummary.todayArchiveCorrectGuesses}
                              </div>
                              <div className="mt-1 text-[8px] font-medium uppercase tracking-[0.08em] text-[#637268]">
                                Correct
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : analyticsLoading ? (
              <div className="rounded-xl border border-[#ded7ca] bg-[#fbfaf7] px-4 py-4 text-sm text-[#637268]">
                Loading analytics…
              </div>
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
                            ) : (
                              <button
                                type="button"
                                onClick={() => startCaseFor(browseDate, levelValue)}
                                className="rounded-lg border border-[#ded7ca] px-3 py-1.5 text-sm font-semibold text-[#102018] transition hover:bg-white"
                              >
                                Add
                              </button>
                            )}
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

  function renderOverviewSection({
    title,
    dateText,
    cases,
    levelOrderForSection,
    showDatePicker = false,
  }: {
    title: string
    dateText: string
    cases: CaseRow[]
    levelOrderForSection: Level[]
    showDatePicker?: boolean
  }) {
    const calendarStart = new Date(`${overviewCalendarMonth}T12:00:00`)
    const calendarEnd = new Date(calendarStart)
    calendarEnd.setDate(calendarStart.getDate() + 6)
    const overviewMonthLabel = `${calendarStart.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })} - ${calendarEnd.toLocaleDateString('en-US', {
      month: calendarStart.getMonth() === calendarEnd.getMonth() ? undefined : 'short',
      day: 'numeric',
    })}`
    return (
      <section className="night-surface rounded-2xl border border-[#e7e1d6] bg-white p-3 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#637268]">
              {title}
            </div>
          </div>
        </div>

          <div className={showDatePicker ? 'mt-2.5 grid gap-2.5 xl:grid-cols-[minmax(0,1fr)_228px]' : 'mt-2.5'}>
          <div className={`grid gap-2 ${levelOrderForSection.length > 1 ? 'md:grid-cols-2' : ''}`}>
            {levelOrderForSection.map(levelValue => {
              const item = cases.find(entry => entry.level === levelValue)
              const quickStats = item ? overviewCaseQuickStats[item.id] : null

              return (
                <div
                  key={`${dateText}-${levelValue}`}
                  className={
                    item
                      ? 'rounded-xl border border-[#cfded4] bg-[#f7fbf8] px-3 py-2.5'
                      : 'rounded-xl border border-dashed border-[#ded7ca] bg-[#fcfbf8] px-3 py-2.5'
                  }
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#637268]">
                        {levelValue === 'med_student' ? 'Cases' : formatLevel(levelValue)}
                      </div>
                      {item ? (
                        <button
                          type="button"
                          onClick={() => editCase(item)}
                          className="shrink-0 rounded-md border border-[#ded7ca] px-2.5 py-1 text-[12px] font-semibold leading-none text-[#102018] transition hover:bg-white"
                        >
                          Edit
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startCaseFor(dateText, levelValue)}
                          className="shrink-0 rounded-md border border-[#ded7ca] px-2.5 py-1 text-[12px] font-semibold leading-none text-[#102018] transition hover:bg-white"
                        >
                          Add
                        </button>
                      )}
                    </div>
                    <div className="mt-1">
                      <div className="mt-1 font-semibold text-[#102018]">
                        {item ? item.answer : 'Not scheduled'}
                      </div>
                      <div className="mt-0.5 text-sm text-[#637268]">
                        {item
                          ? quickStats
                            ? `${item.category} · ${
                                quickStats.solveRate !== null
                                  ? `${Math.round(quickStats.solveRate)}% correct`
                                  : 'No solves'
                              } · ${quickStats.players} interacted`
                            : item.category
                          : 'Open slot'}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {showDatePicker ? (
            <div className="rounded-xl border border-[#e7e1d6] bg-[#fcfbf8] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => selectOverviewDate(shiftISODate(overviewDate, -7))}
                  className="rounded-lg border border-[#ded7ca] bg-white px-2.5 py-1 text-[12px] font-semibold text-[#637268] transition hover:bg-[#fbfaf7]"
                  aria-label="Previous week"
                >
                  {'<'}
                </button>
                <div className="text-center text-[11px] font-bold uppercase tracking-[0.2em] text-[#637268]">
                  {overviewMonthLabel}
                </div>
                <button
                  type="button"
                  onClick={() => selectOverviewDate(shiftISODate(overviewDate, 7))}
                  className="rounded-lg border border-[#ded7ca] bg-white px-2.5 py-1 text-[12px] font-semibold text-[#637268] transition hover:bg-[#fbfaf7]"
                  aria-label="Next week"
                >
                  {'>'}
                </button>
              </div>

              <div className="mt-2.5 grid grid-cols-7 gap-1">
                {CALENDAR_WEEKDAY_LABELS.map(label => (
                  <div
                    key={label}
                    className="pb-0.5 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-[#8b8a84]"
                  >
                    {label}
                  </div>
                ))}

                {overviewCalendarDays.map(day => {
                  const isComplete = Boolean(day.readiness?.isComplete)
                  const isIncomplete = !isComplete
                  const cellTone = day.isSelected
                    ? isComplete
                      ? 'border-[#8dbaa0] bg-[#e0f0e4] text-[#1f6448] shadow-[0_8px_18px_rgba(31,100,72,0.14)]'
                      : 'border-[#d59a5f] bg-[#ffe4c8] text-[#8e4d1d] shadow-[0_8px_18px_rgba(162,77,36,0.16)]'
                    : isComplete
                      ? 'border-[#d0e4d5] bg-[#eef7f0] text-[#2c6b4d]'
                      : isIncomplete
                        ? 'border-[#eed0af] bg-[#fff3e5] text-[#a0602f]'
                        : 'border-[#ece6dc] bg-white text-[#637268]'

                  return (
                    <button
                      key={day.isoDate}
                      type="button"
                      onClick={() => selectOverviewDate(day.isoDate)}
                      className={`flex aspect-square min-h-[30px] items-center justify-center rounded-lg border text-sm font-semibold transition hover:-translate-y-[1px] hover:bg-white ${cellTone}`}
                    >
                      {day.dayNumber}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>
      </section>
    )
  }

  return (
    <main className="app-surface min-h-screen">
      <Header />

      <div className="mx-auto max-w-6xl px-3 py-3 sm:px-6 sm:py-4">
        {playModeSettingsReady && (
          <div className="grid gap-3 xl:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] xl:items-start">
            {renderOverviewSection({
              title: 'Today overview',
              dateText: today,
              cases: todaysCases,
              levelOrderForSection: todaysLevelOrder,
            })}
            {renderOverviewSection({
              title: `${formatShortDate(overviewDate)} overview`,
              dateText: overviewDate,
              cases: overviewCases,
              levelOrderForSection: overviewLevelOrder,
              showDatePicker: true,
            })}
          </div>
        )}

        {incompleteDates.length > 0 && (
          <div className="mt-2 rounded-xl border border-[#ead9b7] bg-[#fffaf1] px-3 py-2 text-[12px] leading-5 text-[#8a5a2b]">
            Missing daily cases on {incompleteDates.map(item => `${item.date} (${item.ready}/${item.required})`).join(', ')}
          </div>
        )}

        <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_320px]">
          <div className="space-y-3">
          <section className="card rounded-2xl border border-[#e7e1d6] bg-white p-3.5 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
            <div className="flex items-center justify-between gap-4">
              <h2 className="font-serif text-xl font-bold">
                Create / Schedule Case
              </h2>

              <div className="flex items-center gap-2">
                <Link
                  href="/admin/studio"
                  className="rounded-lg border border-[#ded7ca] px-3 py-1.5 text-sm font-semibold text-[#102018] transition hover:bg-white"
                >
                  Case Studio
                </Link>
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
              <div className="rounded-xl bg-[#fcfbf8] px-3 py-2.5 ring-1 ring-inset ring-[#ebe5db]/65">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="rounded-lg border border-[#ded7ca] bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#637268]">
                    {caseDate} · {formatLevel(level)}
                  </div>
                  <div className="rounded-lg border border-[#d8e5dd] bg-[#f7fbf8] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#355542]">
                    {readyChecklistCount}/{caseChecklistItems.length} ready
                  </div>
                  {composerGuardrailCount > 0 ? (
                    <div className="rounded-lg border border-[#ead9b7] bg-[#fffaf1] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8a5a2b]">
                      {composerGuardrailCount} guardrail{composerGuardrailCount === 1 ? '' : 's'}
                    </div>
                  ) : null}
                  {activeSubmissionId ? (
                    <div className="rounded-lg border border-[#ded7ca] bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#637268]">
                      Submission draft
                    </div>
                  ) : null}
                </div>
                {(status || draftStatus) ? (
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-[#7b847e]">
                    {status ? <p>{status}</p> : null}
                    {draftStatus ? <p>{draftStatus}</p> : null}
                  </div>
                ) : null}
              </div>

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
                  <option value="attending">Anatomy (optional)</option>
                </select>
              </label>
              </div>

              <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                Category
                <div className="relative">
                  <input
                    value={category}
                    onChange={e => {
                      setCategory(e.target.value)
                      setShowCategorySuggestions(true)
                    }}
                    onFocus={() => setShowCategorySuggestions(true)}
                    onBlur={() => {
                      window.setTimeout(() => setShowCategorySuggestions(false), 120)
                    }}
                    placeholder={level === 'attending' ? 'Surgical Anatomy' : 'Wrist / nerve'}
                    className="w-full rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                  />
                  {showCategorySuggestions && filteredCategorySuggestions.length > 0 ? (
                    <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 overflow-hidden rounded-xl border border-[#ded7ca] bg-white shadow-[0_16px_28px_rgba(16,32,24,0.08)]">
                      {filteredCategorySuggestions.map(item => (
                        <button
                          key={item.label}
                          type="button"
                          onMouseDown={event => {
                            event.preventDefault()
                            setCategory(item.label)
                            setShowCategorySuggestions(false)
                          }}
                          className="flex w-full items-center justify-between gap-3 border-b border-[#f1ece2] px-3 py-2 text-left text-sm text-[#102018] transition hover:bg-[#fbfaf7] last:border-b-0"
                        >
                          <span>{item.label}</span>
                          {item.count > 0 ? (
                            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8a948d]">
                              {item.count} used
                            </span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </label>

              <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                <span>Case Prompt</span>
                <textarea
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  onKeyDown={event => handleRichTextareaKeyDown(event, prompt, setPrompt)}
                  placeholder="Write the case stem..."
                  rows={4}
                  className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                />
              </label>

              <div className={`grid gap-2.5 ${level === 'attending' ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
                <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                  Answer
                  <input
                    value={answer}
                    onChange={e => setAnswer(e.target.value)}
                    placeholder="Carpal tunnel syndrome"
                    className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                  />
                  {duplicateAnswerMatches.length > 0 && (
                    <div className="rounded-lg bg-[#fffaf1] px-3 py-2.5 text-xs font-normal text-[#8a5a2b] ring-1 ring-inset ring-[#ead9b7]/75">
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
              </div>

              <div className="rounded-xl bg-[#fcfbf8] px-3 py-3 ring-1 ring-inset ring-[#ebe5db]/65">
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

                {copyableImageSourceCases.length > 0 ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {copyableImageSourceCases.map(sourceCase => (
                      <button
                        key={sourceCase.id}
                        type="button"
                        onClick={() => copyImageBundleFromCase(sourceCase)}
                        className="rounded-lg border border-[#ded7ca] bg-white px-3 py-1.5 text-xs font-semibold text-[#102018] transition hover:bg-[#fbfaf7]"
                      >
                        Copy image bundle from {formatCopySourceLevel(sourceCase.level)}
                      </button>
                    ))}
                  </div>
                ) : null}

                {!imagesCollapsed && (
                  <div className="mt-3 space-y-4">
                <div className="grid gap-3">
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
                        onBlur={() =>
                          void maybeFillCreditFromUrl(
                            imageUrl,
                            imageCredit,
                            setImageCredit,
                            'Image 1'
                          )
                        }
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

                  {showCaseImage2Fields ? (
                    <div className="grid gap-2.5 rounded-xl bg-white/55 px-3 py-3 ring-1 ring-inset ring-[#ebe5db]/55">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#637268]">
                          Second case image
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setImageUrl2('')
                            setImageCredit2(DEFAULT_IMAGE_CREDIT_TEMPLATE)
                            setImageRevealClue2('none')
                            setShowCaseImage2Fields(false)
                          }}
                          className="rounded-lg border border-[#ead9b7] px-2.5 py-1 text-[11px] font-semibold text-[#a24d24] transition hover:bg-[#fff8ef]"
                        >
                          Remove
                        </button>
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
                          onBlur={() =>
                            void maybeFillCreditFromUrl(
                              imageUrl2,
                              imageCredit2,
                              setImageCredit2,
                              'Image 2'
                            )
                          }
                          placeholder="Optional second hosted image URL"
                          className="min-w-0 flex-1 rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                        />
                      </label>
                      <div className="grid gap-2.5 sm:grid-cols-2">
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
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowCaseImage2Fields(true)}
                      className="self-start rounded-lg border border-[#ded7ca] bg-white px-3 py-2 text-sm font-semibold text-[#102018] transition hover:bg-[#fbfaf7]"
                    >
                      Add second case image
                    </button>
                  )}
                </div>

                <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                  Image Findings
                  <textarea
                    value={imageFindings}
                    onChange={e => setImageFindings(e.target.value)}
                    onKeyDown={event => handleRichTextareaKeyDown(event, imageFindings, setImageFindings)}
                    placeholder="Optional solved-only imaging explanation shown beneath the case image credit."
                    rows={4}
                    className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                  />
                </label>

              <div className="rounded-xl bg-white/55 px-3 py-3 ring-1 ring-inset ring-[#ebe5db]/55">
                  <div className="grid gap-3">
                    <div className="grid gap-2.5">
                      <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                        Teaching Image 1 URL
                        <input
                          value={learningImageUrl}
                          onChange={e => setLearningImageUrl(e.target.value)}
                          onBlur={() =>
                            void maybeFillCreditFromUrl(
                              learningImageUrl,
                              learningImageCredit,
                              setLearningImageCredit,
                              'Teaching image 1'
                            )
                          }
                          placeholder="Optional hosted teaching image"
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
                      <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                        Teaching Image 1 Caption
                        <textarea
                          value={learningImageCaption}
                          onChange={e => setLearningImageCaption(e.target.value)}
                          onKeyDown={event => handleRichTextareaKeyDown(event, learningImageCaption, setLearningImageCaption)}
                          placeholder="Optional caption shown under the teaching image."
                          rows={3}
                          className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                        />
                      </label>
                    </div>

                    {showTeachingImage2Fields ? (
                      <div className="grid gap-2.5 rounded-xl bg-white/55 px-3 py-3 ring-1 ring-inset ring-[#ebe5db]/55">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#637268]">
                            Second teaching image
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setLearningImageUrl2('')
                              setLearningImageCredit2(DEFAULT_IMAGE_CREDIT_TEMPLATE)
                              setLearningImageCaption2('')
                              setShowTeachingImage2Fields(false)
                            }}
                            className="rounded-lg border border-[#ead9b7] px-2.5 py-1 text-[11px] font-semibold text-[#a24d24] transition hover:bg-[#fff8ef]"
                          >
                            Remove
                          </button>
                        </div>
                        <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                          Teaching Image 2 URL
                          <input
                            value={learningImageUrl2}
                            onChange={e => setLearningImageUrl2(e.target.value)}
                            onBlur={() =>
                              void maybeFillCreditFromUrl(
                                learningImageUrl2,
                                learningImageCredit2,
                                setLearningImageCredit2,
                                'Teaching image 2'
                              )
                            }
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
                        <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                          Teaching Image 2 Caption
                          <textarea
                            value={learningImageCaption2}
                            onChange={e => setLearningImageCaption2(e.target.value)}
                            onKeyDown={event => handleRichTextareaKeyDown(event, learningImageCaption2, setLearningImageCaption2)}
                            placeholder="Optional caption shown under the second teaching image."
                            rows={3}
                            className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                          />
                        </label>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowTeachingImage2Fields(true)}
                        className="self-start rounded-lg border border-[#ded7ca] bg-white px-3 py-2 text-sm font-semibold text-[#102018] transition hover:bg-[#fbfaf7]"
                      >
                        Add second teaching image
                      </button>
                    )}
                  </div>
                </div>

              {imageUrl && (
                <div className="rounded-lg bg-white px-2.5 py-2.5 ring-1 ring-inset ring-[#ded7ca]/70">
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
                    className="mt-2 rounded-lg border border-[#ded7ca] px-3 py-1.5 text-sm font-semibold text-[#102018] transition hover:bg-[#fbfaf7]"
                  >
                    Remove image
                  </button>
                </div>
              )}

              {imageUrl2 && (
                <div className="rounded-lg bg-white px-2.5 py-2.5 ring-1 ring-inset ring-[#ded7ca]/70">
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
                    className="mt-2 rounded-lg border border-[#ded7ca] px-3 py-1.5 text-sm font-semibold text-[#102018] transition hover:bg-[#fbfaf7]"
                  >
                    Remove second image
                  </button>
                </div>
              )}

              {learningImageUrl && (
                <div className="rounded-lg bg-white px-2.5 py-2.5 ring-1 ring-inset ring-[#ded7ca]/70">
                  <img
                    src={learningImageUrl}
                    alt="Teaching image"
                    className="max-h-48 rounded-lg object-contain"
                  />
                  {(learningImageCaption.trim() || normalizeCreditValue(learningImageCredit)) ? (
                    <div className="mt-2 border-t border-[#efe7db] pt-2">
                      {learningImageCaption.trim() ? (
                        <p className="text-sm leading-5 text-[#4d5d55]">
                          {renderRichTextWithBreaks(learningImageCaption.trim(), 'admin-teaching-caption-1')}
                        </p>
                      ) : null}
                      {normalizeCreditValue(learningImageCredit) && (
                        <p className={`${learningImageCaption.trim() ? 'mt-1' : ''} text-[11px] leading-5 text-[#8a948d]`}>
                          {normalizeCreditValue(learningImageCredit)}
                        </p>
                      )}
                    </div>
                  ) : null}
                  <button
                    onClick={() => {
                      setLearningImageUrl('')
                      setLearningImageCredit(DEFAULT_IMAGE_CREDIT_TEMPLATE)
                      setLearningImageCaption('')
                    }}
                    className="mt-2 rounded-lg border border-[#ded7ca] px-3 py-1.5 text-sm font-semibold text-[#102018] transition hover:bg-[#fbfaf7]"
                  >
                    Remove teaching image
                  </button>
                </div>
              )}

              {learningImageUrl2 && (
                <div className="rounded-lg bg-white px-2.5 py-2.5 ring-1 ring-inset ring-[#ded7ca]/70">
                  <img
                    src={learningImageUrl2}
                    alt="Second teaching image"
                    className="max-h-48 rounded-lg object-contain"
                  />
                  {(learningImageCaption2.trim() || normalizeCreditValue(learningImageCredit2)) ? (
                    <div className="mt-2 border-t border-[#efe7db] pt-2">
                      {learningImageCaption2.trim() ? (
                        <p className="text-sm leading-5 text-[#4d5d55]">
                          {renderRichTextWithBreaks(learningImageCaption2.trim(), 'admin-teaching-caption-2')}
                        </p>
                      ) : null}
                      {normalizeCreditValue(learningImageCredit2) && (
                        <p className={`${learningImageCaption2.trim() ? 'mt-1' : ''} text-[11px] leading-5 text-[#8a948d]`}>
                          {normalizeCreditValue(learningImageCredit2)}
                        </p>
                      )}
                    </div>
                  ) : null}
                  <button
                    onClick={() => {
                      setLearningImageUrl2('')
                      setLearningImageCredit2(DEFAULT_IMAGE_CREDIT_TEMPLATE)
                      setLearningImageCaption2('')
                    }}
                    className="mt-2 rounded-lg border border-[#ded7ca] px-3 py-1.5 text-sm font-semibold text-[#102018] transition hover:bg-[#fbfaf7]"
                  >
                    Remove second teaching image
                  </button>
                </div>
              )}
                  </div>
                )}
              </div>

              <div className="rounded-xl bg-[#fcfbf8] px-3 py-3 ring-1 ring-inset ring-[#ebe5db]/65">
                <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#637268]">
                  {level === 'attending' ? 'Answer choices' : 'Clinical clues'}
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                    {level === 'attending' ? 'A' : 'Clue 1'}
                    <textarea
                      ref={element => {
                        clueTextareaRefs.current[0] = element
                      }}
                      value={clue1}
                      onChange={e => updateClueAt(0, e.target.value)}
                      onKeyDown={event => handleRichTextareaKeyDown(event, clue1, nextValue => updateClueAt(0, nextValue))}
                      onInput={autoGrowTextarea}
                      rows={1}
                      className="min-h-[46px] resize-y overflow-hidden rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                    />
                  </label>

                  <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                    {level === 'attending' ? 'B' : 'Clue 2'}
                    <textarea
                      ref={element => {
                        clueTextareaRefs.current[1] = element
                      }}
                      value={clue2}
                      onChange={e => updateClueAt(1, e.target.value)}
                      onKeyDown={event => handleRichTextareaKeyDown(event, clue2, nextValue => updateClueAt(1, nextValue))}
                      onInput={autoGrowTextarea}
                      rows={1}
                      className="min-h-[46px] resize-y overflow-hidden rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                    />
                  </label>

                  <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                    {level === 'attending' ? 'C' : 'Clue 3'}
                    <textarea
                      ref={element => {
                        clueTextareaRefs.current[2] = element
                      }}
                      value={clue3}
                      onChange={e => updateClueAt(2, e.target.value)}
                      onKeyDown={event => handleRichTextareaKeyDown(event, clue3, nextValue => updateClueAt(2, nextValue))}
                      onInput={autoGrowTextarea}
                      rows={1}
                      className="min-h-[46px] resize-y overflow-hidden rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                    />
                  </label>

                  <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                    {level === 'attending' ? 'D' : 'Clue 4'}
                    <textarea
                      ref={element => {
                        clueTextareaRefs.current[3] = element
                      }}
                      value={clue4}
                      onChange={e => updateClueAt(3, e.target.value)}
                      onKeyDown={event => handleRichTextareaKeyDown(event, clue4, nextValue => updateClueAt(3, nextValue))}
                      onInput={autoGrowTextarea}
                      rows={1}
                      className="min-h-[46px] resize-y overflow-hidden rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                    />
                  </label>

                  <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                    {level === 'attending' ? 'E' : 'Clue 5'}
                    <textarea
                      ref={element => {
                        clueTextareaRefs.current[4] = element
                      }}
                      value={clue5}
                      onChange={e => updateClueAt(4, e.target.value)}
                      placeholder="Optional"
                      onKeyDown={event => handleRichTextareaKeyDown(event, clue5, nextValue => updateClueAt(4, nextValue))}
                      onInput={autoGrowTextarea}
                      rows={1}
                      className="min-h-[46px] resize-y overflow-hidden rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                    />
                  </label>

                  <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                    {level === 'attending' ? 'F' : 'Clue 6'}
                    <textarea
                      ref={element => {
                        clueTextareaRefs.current[5] = element
                      }}
                      value={clue6}
                      onChange={e => updateClueAt(5, e.target.value)}
                      placeholder="Optional"
                      onKeyDown={event => handleRichTextareaKeyDown(event, clue6, nextValue => updateClueAt(5, nextValue))}
                      onInput={autoGrowTextarea}
                      rows={1}
                      className="min-h-[46px] resize-y overflow-hidden rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                    />
                  </label>
                </div>
              </div>

              <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                Teaching Point
                <textarea
                  value={teachingPoint}
                  onChange={e => setTeachingPoint(e.target.value)}
                  onKeyDown={event => handleRichTextareaKeyDown(event, teachingPoint, setTeachingPoint)}
                  placeholder={`**<u>Who</u>**

**<u>Pathophys</u>**

**<u>Key Clues</u>**

- clue one
- clue two

**<u>Tx</u>**

**<u>Classic Pitfall</u>**`}
                  rows={10}
                  className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                />
                <div className="text-[12px] font-medium leading-5 text-[#7a857c]">
                  Shortcuts: Cmd/Ctrl + B bold, Cmd/Ctrl + I italic, Cmd/Ctrl + U underline,
                  Cmd/Ctrl + Shift + 7 or 8 bullets. You can apply these everywhere in the
                  case now.
                </div>
              </label>

              <label className="grid gap-2 text-sm font-semibold text-[#637268]">
                References
                <textarea
                  value={referenceLinks}
                  onChange={e => setReferenceLinks(e.target.value)}
                  onBlur={async () => {
                    const normalized = await hydrateReferenceLinks(referenceLinks)
                    if (normalized !== referenceLinks) {
                      setReferenceLinks(normalized)
                    }
                  }}
                  onKeyDown={event => handleRichTextareaKeyDown(event, referenceLinks, setReferenceLinks)}
                  placeholder={`[Link to reference](https://example.com)\n[Link to EM Cases](https://example.com)`}
                  rows={3}
                  className="rounded-lg border border-[#ded7ca] px-3 py-2.5 text-sm text-[#102018]"
                />
              </label>

              <div className="rounded-2xl border border-[#ebe5db] bg-[#fcfbf8] p-3">
                <button
                  type="button"
                  onClick={() => setShowComposerChecklist(current => !current)}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#637268]">
                      Checklist
                    </div>
                    <div className="mt-1 text-sm text-[#637268]">
                      {readyChecklistCount}/{caseChecklistItems.length} ready
                      {composerGuardrailCount > 0 ? ` · ${composerGuardrailCount} guardrail${composerGuardrailCount === 1 ? '' : 's'}` : ''}
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#ded7ca] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#637268]">
                    {showComposerChecklist ? 'Hide' : 'Show'}
                  </div>
                </button>

                {showComposerChecklist ? (
                  <div className="mt-3 space-y-3">
                    {composerGuardrails.length > 0 ? (
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
                    ) : null}

                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {caseChecklistItems.map(item => (
                        <div
                          key={item.label}
                          className={`rounded-lg px-3 py-2 text-sm ${
                            item.ready
                              ? 'bg-white text-[#355542] shadow-[inset_0_0_0_1px_#d8e5dd]'
                              : 'bg-white text-[#7a6452] shadow-[inset_0_0_0_1px_#ead9b7]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-semibold">{item.label}</span>
                            <span className={`text-[11px] font-semibold ${item.ready ? 'text-[#1f6448]' : 'text-[#a24d24]'}`}>
                              {item.ready ? 'Ready' : 'Needs work'}
                            </span>
                          </div>
                          {!item.ready && item.note ? (
                            <p className="mt-1 text-[11px] leading-4 text-[#8a948d]">{item.note}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="rounded-2xl border border-[#ebe5db] bg-[#fcfbf8] p-3">
                <button
                  type="button"
                  onClick={() => setShowComposerCaseStats(current => !current)}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#637268]">
                      Case stats
                    </div>
                    <div className="mt-1 text-sm text-[#637268]">
                      {caseCommunityStats
                        ? `${caseCommunityStats.players} players · ${
                            caseCommunityStats.solveRate !== null
                              ? formatPercent(caseCommunityStats.solveRate)
                              : '—'
                          } solve rate`
                        : 'No saved case stats yet'}
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#ded7ca] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#637268]">
                    {showComposerCaseStats ? 'Hide' : 'Show'}
                  </div>
                </button>

                {showComposerCaseStats ? (
                  caseCommunityStats ? (
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
                  )
                ) : null}
              </div>

              {slotBackups.length > 0 ? (
                <div className="rounded-2xl border border-[#ebe5db] bg-[#fcfbf8] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#637268]">
                        Recent backups
                      </div>
                      <div className="mt-1 text-sm text-[#637268]">
                        Saved automatically before a slot gets replaced.
                      </div>
                    </div>
                    <div className="rounded-lg border border-[#ded7ca] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#637268]">
                      {slotBackups.length} saved
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    {slotBackups.map(backup => (
                      <div
                        key={backup.backupId}
                        className="flex flex-col gap-2 rounded-xl border border-[#ded7ca] bg-white px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-[#102018]">
                            {backup.case.answer || 'Untitled case'}
                          </div>
                          <div className="mt-1 text-[11px] text-[#7b847e]">
                            {new Date(backup.capturedAt).toLocaleString()} · {backup.source === 'studio' ? 'Studio' : 'Builder'}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => restoreCaseBackup(backup)}
                          className="rounded-lg border border-[#ded7ca] bg-[#fffaf1] px-3 py-1.5 text-[12px] font-semibold text-[#102018] transition hover:bg-[#fff4e8]"
                        >
                          Restore into builder
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="sticky bottom-3 z-10 rounded-2xl border border-[#e7e1d6] bg-[rgba(252,251,248,0.94)] px-3 py-3 shadow-[0_14px_32px_rgba(16,32,24,0.08)] backdrop-blur">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-[12px] text-[#7b847e]">
                    {status || draftStatus || 'Ready to save, preview, or replace this slot.'}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={openCasePreview}
                      className="rounded-lg border border-[#ded7ca] bg-white px-3 py-2 text-sm font-semibold text-[#102018] transition hover:bg-[#fbfaf7]"
                    >
                      Preview
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteCurrentSlot()}
                      className="rounded-lg border border-[#ead9b7] bg-[#fffaf1] px-3 py-2 text-sm font-semibold text-[#a24d24] transition hover:bg-[#fff4e8]"
                    >
                      Delete slot
                    </button>
                    <button
                      onClick={saveCase}
                      className="rounded-lg bg-[#1f6448] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#174c37]"
                    >
                      Save / Update Case
                    </button>
                  </div>
                </div>
              </div>
            </div>
            )}
          </section>
          </div>

          <aside className="flex flex-col gap-3">
            {sidebarSectionOrder
              .filter(sectionId => !hiddenSidebarSectionIds.includes(sectionId))
              .map(sectionId => (
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
