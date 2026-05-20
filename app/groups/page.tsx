'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bell, BookOpen, Download, Flame, Info, Pencil, Share2, Star, Target, TrendingUp, UserPlus, X, Zap } from 'lucide-react'
import { GroupIconMark } from '@/components/GroupIconMark'
import { PublicFooter } from '@/components/PublicFooter'
import {
  DEFAULT_GROUP_SCORING_SETTINGS,
  normalizeGroupScoringSettings,
  type GroupScoringSettings,
} from '@/lib/group-scoring'
import { DEFAULT_MEMBER_ICON, getIconsForSection, GROUP_ICON_SECTIONS } from '@/lib/group-icons'
import { normalizeSurveyOptions, SITE_SURVEY_STORAGE_PREFIX, type SiteSurveyRow } from '@/lib/site-surveys'
import { supabase } from '@/lib/supabase'
import {
  clearAccountSession,
  getAccountSession,
  getAnonymousSessionId,
  getSessionId,
  setAccountSession,
  type AccountSession,
} from '@/lib/utils'

type GroupRow = {
  id: string
  name: string
  icon: string | null
  join_code: string
  creator_session_id: string
  created_at: string
}

type GroupMemberRow = {
  id: string
  group_id: string
  session_id: string
  display_name: string
  icon: string | null
  created_at: string
}

type GuessRow = {
  session_id: string
  case_id: string | null
  is_correct: boolean | null
  created_at: string
}

type CaseRow = {
  id: string
  case_date: string
  level: 'med_student' | 'resident' | 'attending'
  answer: string
  category: string | null
}

type MemberStats = {
  member: GroupMemberRow
  score: number
  solves: number
  avgGuesses: number | null
  longestStreak: number
  currentStreak: number
  firstTrySolves: number
  totalGuesses: number
  correctGuesses: number
  attendingSolves: number
  categorySolves: Record<string, number>
  hasClutchSolve: boolean
  nightShiftSolves: number
  solvedDates: string[]
}

type GroupAggregate = {
  group: GroupRow
  members: GroupMemberRow[]
  memberStats: MemberStats[]
  score: number
  avgAccuracy: number | null
  avgGuesses: number | null
  longestStreak: number
  currentStreak: number
  totalSolves: number
  totalFirstTrySolves: number
  totalAttendingSolves: number
  activeTodayCount: number
  solvedDates: string[]
}

type DisplayGroup = {
  id: string
  name: string
  icon: string | null
  members: number
  score: number
  avgAccuracy: number | null
  longestStreak: number
}

type GroupsTab = 'home' | 'my-group' | 'profile'

function normalizeGroupsTab(value: string | null): GroupsTab {
  if (value === 'my-group' || value === 'profile') return value
  return 'home'
}

type LocalProfile = {
  displayName: string
  icon: string
}

type LeaderboardWindow = 'week' | 'all-time'

type ActivityFeedItem = {
  id: string
  icon: 'solve' | 'mvp' | 'streak' | 'rank' | 'announcement' | 'info'
  title: string
  detail: string
  createdAt: string
}

type GroupNotificationItem = {
  id: string
  icon: ActivityFeedItem['icon']
  title: string
  detail: string
}

type WeeklyChallenge = {
  title: string
  detail: string
  progress: number
  goal: number
  reward: string
}

type WeeklyRecap = {
  title: string
  detail: string
  accent: string
}

type GroupAnnouncementRow = {
  id: string
  message: string
  start_date: string
  end_date: string | null
  created_at: string
}

type GroupWeeklyHonorRow = {
  id: string
  week_start: string
  week_end: string | null
  group_id: string | null
  group_name: string
  group_icon: string | null
  mvp_session_id: string | null
  mvp_display_name: string | null
  mvp_icon: string | null
  created_at: string
}

type GroupJoinRequestRow = {
  id: string
  group_id: string | null
  group_name: string
  requester_session_id: string
  requester_display_name: string
  requester_icon: string | null
  contact_text: string | null
  note: string | null
  status: string
  created_at: string
  handled_at: string | null
}

type GroupHeaderSurveyState = {
  survey: SiteSurveyRow | null
  submittedChoice: string | null
  isSubmitting: boolean
  status: string
}

type GroupScoringSettingsRow = {
  solve_points: number
  first_try_points: number
  streak_points: number
  efficiency_baseline: number
  efficiency_points_per_guess: number
  teamwork_bonus_per_member: number
  teamwork_bonus_max: number
}

const SELECTED_GROUP_STORAGE_KEY = 'orthodle_selected_group'
const GROUPS_EXPLAINER_STORAGE_KEY = 'orthodle_groups_explainer_seen'
const LOCAL_PROFILE_STORAGE_KEY = 'orthodle_groups_profile'
const GROUP_ANNOUNCEMENT_DISMISS_KEY = 'orthodle_dismissed_group_announcement'
const GROUP_NOTIFICATIONS_SEEN_KEY = 'orthodle_groups_notifications_seen_v1'
const GROUP_DISMISSED_MESSAGES_KEY = 'orthodle_groups_dismissed_messages_v1'

function getGroupSurveyStorageKey(surveyId: string) {
  return `${SITE_SURVEY_STORAGE_PREFIX}:${surveyId}`
}

function normalizeJoinCode(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12)
}

function makeRandomJoinCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

function membershipKey(groupId: string) {
  return `orthodle_group_member:${groupId}`
}

function storeMemberProfile(groupId: string, displayName: string, icon: string | null) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(
    membershipKey(groupId),
    JSON.stringify({ displayName, icon: icon || DEFAULT_MEMBER_ICON })
  )
}

function readLocalProfile(): LocalProfile {
  if (typeof window === 'undefined') {
    return { displayName: '', icon: DEFAULT_MEMBER_ICON }
  }

  try {
    const savedProfile = window.localStorage.getItem(LOCAL_PROFILE_STORAGE_KEY)
    if (!savedProfile) return { displayName: '', icon: DEFAULT_MEMBER_ICON }

    const parsed = JSON.parse(savedProfile) as Partial<LocalProfile>
    return {
      displayName: typeof parsed.displayName === 'string' ? parsed.displayName : '',
      icon: typeof parsed.icon === 'string' && parsed.icon ? parsed.icon : DEFAULT_MEMBER_ICON,
    }
  } catch {
    return { displayName: '', icon: DEFAULT_MEMBER_ICON }
  }
}

function storeLocalProfile(profile: LocalProfile) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(LOCAL_PROFILE_STORAGE_KEY, JSON.stringify(profile))
}

function buildInviteLink(joinCode: string) {
  if (typeof window === 'undefined') return `https://orthodle.com/groups?code=${joinCode}`
  return `${window.location.origin}/groups?code=${joinCode}`
}

function buildInviteMessage(group: GroupRow) {
  const link = buildInviteLink(group.join_code)
  return [`Join my Orthodle group: ${group.name}`, link].join('\n')
}

function IconMark({
  value,
  fallback,
  className = '',
}: {
  value: string | null | undefined
  fallback: string
  className?: string
}) {
  const displayValue = value || fallback
  return <GroupIconMark value={displayValue} fallback={fallback} className={className} />
}

function getCurrentWeekRange() {
  const now = new Date()
  const day = now.getDay()
  const daysFromMonday = day === 0 ? 6 : day - 1
  const start = new Date(now)
  start.setDate(now.getDate() - daysFromMonday)
  start.setHours(0, 0, 0, 0)

  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  end.setHours(23, 59, 59, 999)

  const sameMonth = start.getMonth() === end.getMonth()
  const startLabel = start.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
  const endLabel = end.toLocaleDateString('en-US', {
    month: sameMonth ? undefined : 'short',
    day: 'numeric',
  })

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    startMs: start.getTime(),
    endMs: end.getTime(),
    label: `Week of ${startLabel} - ${endLabel}`,
  }
}

function getShiftedWeekRange(weeksOffset: number) {
  const now = new Date()
  now.setDate(now.getDate() + weeksOffset * 7)
  const day = now.getDay()
  const daysFromMonday = day === 0 ? 6 : day - 1
  const start = new Date(now)
  start.setDate(now.getDate() - daysFromMonday)
  start.setHours(0, 0, 0, 0)

  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  end.setHours(23, 59, 59, 999)

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    startDate: getLocalIsoDate(start.toISOString()),
    endDate: getLocalIsoDate(end.toISOString()),
    label: formatWeekRangeLabel(getLocalIsoDate(start.toISOString()), getLocalIsoDate(end.toISOString())),
  }
}

function formatWeekRangeLabel(weekStart: string, weekEnd?: string | null) {
  const start = new Date(`${weekStart}T12:00:00`)
  const end = weekEnd ? new Date(`${weekEnd}T12:00:00`) : new Date(start)
  const sameMonth = start.getMonth() === end.getMonth()
  const startLabel = start.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
  const endLabel = end.toLocaleDateString('en-US', {
    month: sameMonth ? undefined : 'short',
    day: 'numeric',
  })

  return `Week of ${startLabel} - ${endLabel}`
}

function isMissingRelationError(error: { code?: string; message?: string } | null) {
  if (!error) return false
  return error.code === '42P01' || error.message?.toLowerCase().includes('does not exist') || false
}

function computeLongestRun(sortedDates: string[]) {
  if (sortedDates.length === 0) return 0

  let longest = 1
  let current = 1

  for (let index = 1; index < sortedDates.length; index += 1) {
    const previous = new Date(`${sortedDates[index - 1]}T12:00:00`)
    const currentDate = new Date(`${sortedDates[index]}T12:00:00`)
    const diffDays = Math.round((currentDate.getTime() - previous.getTime()) / 86400000)

    if (diffDays === 1) {
      current += 1
      longest = Math.max(longest, current)
    } else if (diffDays > 1) {
      current = 1
    }
  }

  return longest
}

function groupMonogram(name: string) {
  return name
    .split(/[\s&-]+/)
    .filter(Boolean)
    .slice(0, 3)
    .map(word => word[0]?.toUpperCase() || '')
    .join('')
}

function GroupCrest({
  group,
  size = 'md',
}: {
  group: Pick<GroupRow, 'name' | 'icon'>
  size?: 'xs' | 'sm' | 'md' | 'lg'
}) {
  const dimensions =
    size === 'lg'
      ? 'h-[82px] w-[82px] text-[40px]'
      : size === 'xs'
        ? 'h-9 w-9 text-[20px]'
      : size === 'sm'
        ? 'h-11 w-11 text-[24px]'
        : 'h-14 w-14 text-[29px]'

  return (
    <div
      className={`orthodle-group-crest relative flex shrink-0 items-center justify-center rounded-full border border-[#d8cfbf] bg-[#fbf7ef] shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_8px_18px_rgba(16,32,24,0.1)] ${dimensions}`}
      aria-hidden="true"
    >
      <IconMark
        value={group.icon}
        fallback={groupMonogram(group.name)}
        className="orthodle-group-crest-mark"
      />
    </div>
  )
}

function MemberAvatar({
  member,
  size = 'md',
  crowned = false,
}: {
  member: Pick<GroupMemberRow, 'display_name' | 'icon'>
  size?: 'sm' | 'md'
  crowned?: boolean
}) {
  const dimensions = size === 'sm' ? 'h-8 w-8 text-[16px]' : 'h-10 w-10 text-[20px]'

  return (
    <div className="relative shrink-0">
      <div
        className={`orthodle-member-avatar flex items-center justify-center rounded-full border border-[#e0d7c8] bg-[#fbf7ef] font-bold text-[#2d7651] ${dimensions}`}
        aria-hidden="true"
      >
        <IconMark value={member.icon} fallback={member.display_name.slice(0, 1).toUpperCase()} />
      </div>
      {crowned ? (
        <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#fff6df] text-[11px] shadow-[0_6px_12px_rgba(16,32,24,0.14)] sm:h-[18px] sm:w-[18px] sm:text-[12px]">
          👑
        </span>
      ) : null}
    </div>
  )
}

function IconPicker({
  label,
  selectedIcon,
  isOpen,
  disabled = false,
  onToggle,
  onSelect,
  ariaLabelPrefix,
}: {
  label: string
  selectedIcon: string | null
  isOpen: boolean
  disabled?: boolean
  onToggle: () => void
  onSelect: (icon: string) => void
  ariaLabelPrefix: string
}) {
  const currentIcon = selectedIcon || DEFAULT_MEMBER_ICON

  return (
    <div className="min-w-0">
      <div className="space-y-1.5">
        <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#637268]">
          {label}
        </div>
        <button
          type="button"
          onClick={onToggle}
          disabled={disabled}
          aria-expanded={isOpen}
          className="inline-flex h-8 items-center gap-2 rounded-full border border-[#e0d8ca] bg-white px-2 text-[11px] font-semibold text-[#102018] transition hover:-translate-y-0.5 hover:bg-[#fcfbf8] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="orthodle-member-avatar flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border border-[#e0d7c8] text-[14px]">
            <IconMark value={currentIcon} fallback={DEFAULT_MEMBER_ICON} />
          </span>
          {isOpen ? 'Hide' : 'Change'}
        </button>
      </div>
      {isOpen ? (
        <div className="orthodle-icon-scroll mt-2 max-h-[16.5rem] overflow-y-auto rounded-2xl border border-[#e6dfd3] bg-[#fcfbf8] p-2.5 pr-1.5">
          <div className="pr-1">
            <IconSectionGrid
              selectedIcon={currentIcon}
              onSelect={onSelect}
              disabled={disabled}
              ariaLabelPrefix={ariaLabelPrefix}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}

function IconSectionGrid({
  selectedIcon,
  onSelect,
  disabled = false,
  ariaLabelPrefix,
  tone = 'light',
}: {
  selectedIcon: string
  onSelect: (icon: string) => void
  disabled?: boolean
  ariaLabelPrefix: string
  tone?: 'light' | 'dark'
}) {
  return (
    <div className="space-y-2.5">
      {GROUP_ICON_SECTIONS.map(section => (
        <div key={section.id}>
          <div
            className={`mb-1.5 text-[9px] font-bold uppercase tracking-[0.16em] ${
              tone === 'dark' ? 'text-[#dfece5]' : 'text-[#637268]'
            }`}
          >
            {section.label}
          </div>
          <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-7">
            {getIconsForSection(section.id).map(icon => (
              <button
                key={icon.value}
                type="button"
                disabled={disabled}
                onClick={() => onSelect(icon.value)}
                className={`flex h-10 w-full items-center justify-center rounded-xl border text-[21px] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 ${
                  tone === 'dark'
                    ? selectedIcon === icon.value
                      ? 'border-[#efbf48] bg-white/16'
                      : 'border-white/15 bg-white/6'
                    : selectedIcon === icon.value
                      ? 'border-[#2d7651] bg-[linear-gradient(145deg,#eef7f1,#ffffff)]'
                      : 'border-[#e6dfd3] bg-white'
                }`}
                aria-label={`${ariaLabelPrefix} ${icon.label}`}
              >
                {icon.value}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function rankCircleClass(rank: number) {
  if (rank === 1) return 'bg-[#e7b83f] text-white'
  if (rank === 2) return 'bg-[#c9ced2] text-white'
  if (rank === 3) return 'bg-[#b8753d] text-white'
  return 'bg-[#e6dfd3] text-[#637268]'
}

function getCategoryCount(stats: MemberStats | null, keywords: string[]) {
  if (!stats) return 0

  return Object.entries(stats.categorySolves).reduce((total, [category, count]) => {
    const normalizedCategory = category.toLowerCase()
    return keywords.some(keyword => normalizedCategory.includes(keyword)) ? total + count : total
  }, 0)
}

function buildTrophyCase({
  stats,
  isGroupMvp,
  selectedGroupRank,
}: {
  stats: MemberStats | null
  isGroupMvp: boolean
  selectedGroupRank: number | null
}) {
  const solves = stats?.solves || 0
  const accuracy =
    stats && stats.totalGuesses > 0 ? (stats.correctGuesses / stats.totalGuesses) * 100 : 0

  return [
    {
      title: 'Group MVP',
      description: 'Earned MVP in your group',
      icon: '🏆',
      earned: isGroupMvp,
    },
    {
      title: '7-Day Streak',
      description: 'Solved correctly 7 days in a row',
      icon: '🛡️',
      earned: (stats?.longestStreak || 0) >= 7,
    },
    {
      title: '100 Solves',
      description: 'Solve 100 cases',
      icon: '⭐',
      earned: solves >= 100,
    },
    {
      title: 'First Try Master',
      description: 'Solve 50 cases on the first try',
      icon: '🧭',
      earned: (stats?.firstTrySolves || 0) >= 50,
    },
    {
      title: 'Attending Slayer',
      description: 'Solve 10 attending difficulty cases',
      icon: '👑',
      earned: (stats?.attendingSolves || 0) >= 10,
    },
    {
      title: 'Ortho Beginner',
      description: 'Complete your first case',
      icon: '🦴',
      earned: solves >= 1,
    },
    {
      title: 'Hot Streak',
      description: 'Correctly solve 5 cases in a row',
      icon: '🔥',
      earned: (stats?.longestStreak || 0) >= 5,
    },
    {
      title: 'Speed Demon',
      description: 'Solve a case in under 30 seconds',
      icon: '⚡',
      earned: false,
    },
    {
      title: 'Clutch Solver',
      description: 'Solve a case with clue 4 or less',
      icon: '🎯',
      earned: Boolean(stats?.hasClutchSolve),
    },
    {
      title: 'Consistent',
      description: 'Maintain 70%+ accuracy for 7 guesses',
      icon: '🔒',
      earned: (stats?.totalGuesses || 0) >= 7 && accuracy >= 70,
    },
    {
      title: 'Top 3 Finish',
      description: 'Your group finishes in the top 3',
      icon: '🏅',
      earned: Boolean(selectedGroupRank && selectedGroupRank <= 3),
    },
    {
      title: 'Anatomy Ace',
      description: 'Solve 20 anatomy cases',
      icon: '🧬',
      earned: getCategoryCount(stats, ['anatomy']) >= 20,
    },
    {
      title: 'Trauma Champ',
      description: 'Solve 20 trauma cases',
      icon: '🏥',
      earned: getCategoryCount(stats, ['trauma']) >= 20,
    },
    {
      title: 'Hand Specialist',
      description: 'Solve 15 hand cases',
      icon: '🖐️',
      earned: getCategoryCount(stats, ['hand', 'wrist']) >= 15,
    },
    {
      title: 'Spine Whisperer',
      description: 'Solve 15 spine cases',
      icon: '🦴',
      earned: getCategoryCount(stats, ['spine', 'cervical', 'lumbar']) >= 15,
    },
    {
      title: 'Joint Expert',
      description: 'Solve 20 joint cases',
      icon: '🦵',
      earned: getCategoryCount(stats, ['joint', 'knee', 'hip', 'shoulder', 'ankle', 'elbow']) >= 20,
    },
    {
      title: 'Night Shift Demon',
      description: 'Solve 10 cases between 12AM - 6AM',
      icon: '🌙',
      earned: (stats?.nightShiftSolves || 0) >= 10,
    },
    {
      title: 'Perfectionist',
      description: 'Achieve 100% accuracy in a week',
      icon: '💎',
      earned: (stats?.totalGuesses || 0) >= 3 && accuracy === 100,
    },
  ]
}

function GroupsTopBanner({
  activeTab,
  onTabChange,
  onOpenHowItWorks,
  onOpenUpdates,
  unreadNotificationCount,
}: {
  activeTab: GroupsTab
  onTabChange: (tab: GroupsTab) => void
  onOpenHowItWorks: () => void
  onOpenUpdates: () => void
  unreadNotificationCount: number
}) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const tabs: Array<{ id: GroupsTab; label: string }> = [
    { id: 'home', label: 'Home' },
    { id: 'my-group', label: 'My Group' },
    { id: 'profile', label: 'Profile' },
  ]

  useEffect(() => {
    const savedTheme =
      (window.localStorage.getItem('orthodle_theme') as 'light' | 'dark' | null) || 'light'
    setTheme(savedTheme)
    document.documentElement.dataset.theme = savedTheme
  }, [])

  function toggleTheme() {
    const nextTheme = theme === 'dark' ? 'light' : 'dark'
    setTheme(nextTheme)
    document.documentElement.dataset.theme = nextTheme
    window.localStorage.setItem('orthodle_theme', nextTheme)
  }

  const navItemClass =
    'flex min-w-0 h-8 items-center justify-center rounded-[16px] border border-transparent px-1.5 text-center text-[11px] font-extrabold tracking-[-0.01em] leading-none no-underline whitespace-nowrap transition focus:outline-none focus-visible:ring-1 focus-visible:ring-[#2d7651] sm:px-2 sm:text-[11.5px]'
  const inactiveNavItemClass =
    theme === 'dark'
      ? `${navItemClass} border-[#2f3b35] bg-[#1a241f] text-[#ecf1eb] hover:bg-[#202b25]`
      : `${navItemClass} bg-[#fffdf8] text-[#102018] hover:bg-[#f7f5f0]`

  return (
    <header className="border-b border-[#e5dfd3] bg-[#f7f4ee]">
      <div className="mx-auto hidden max-w-[760px] items-center gap-4 px-4 py-2 sm:flex sm:px-5">
        <Link href="/" className="font-serif text-xl font-semibold text-[#102018]">
          <span className="flex items-center gap-2">
            <span className="text-lg text-[#c96b37]">●</span>
            Orthodle
          </span>
        </Link>

        <nav className="flex flex-1 justify-center">
          <div className="w-full max-w-[390px] rounded-[24px] bg-gradient-to-r from-[#1f6448] via-[#c76b3a] to-[#ead9b7] p-[1.5px] shadow-[0_6px_14px_rgba(16,32,24,0.045)]">
            <div className="grid grid-cols-4 gap-1 rounded-[22px] bg-white p-1">
              <Link
                href="/"
                className={inactiveNavItemClass}
              >
                Cases
              </Link>
              {tabs.map(tab => {
                const active = activeTab === tab.id

                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => onTabChange(tab.id)}
                    className={`${
                      active
                        ? `${navItemClass} border border-[#1f6448] bg-[#1f6448] text-white shadow-sm`
                        : inactiveNavItemClass
                    }`}
                  >
                    {tab.label}
                  </button>
                )
              })}
            </div>
          </div>
        </nav>

        <button
          type="button"
          onClick={onOpenHowItWorks}
          aria-label="How it works"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#e6dfd3] bg-white text-[#102018] transition hover:bg-[#fbfaf7] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#9ad0b3]"
        >
          <Info size={16} strokeWidth={2.2} />
        </button>

        <button
          type="button"
          onClick={onOpenUpdates}
          aria-label="Updates"
          className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#e6dfd3] bg-white text-[#102018] transition hover:bg-[#fbfaf7] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#9ad0b3]"
        >
          <Bell size={16} strokeWidth={2.2} />
          {unreadNotificationCount > 0 ? (
            <span className="absolute -right-1 -top-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-[#1f6448] px-1.5 text-[10px] font-bold text-white">
              {unreadNotificationCount}
            </span>
          ) : null}
        </button>

        <button
          type="button"
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to night mode'}
          onClick={toggleTheme}
          className={`group flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#9ad0b3] ${
            theme === 'dark'
              ? 'border-[#33453c] bg-[#18241f] text-[#f4efe6] hover:bg-[#1d2a24]'
              : 'border-[#ded7ca] bg-white text-[#102018] hover:bg-[#fbfaf7]'
          }`}
        >
          <span className="relative flex h-5 w-5 items-center justify-center overflow-hidden">
            <span
              className={`absolute text-[15px] leading-none transition-all duration-300 ${
                theme === 'dark'
                  ? 'translate-y-0 scale-100 opacity-100'
                  : '-translate-y-5 scale-75 opacity-0'
              }`}
            >
              ☀
            </span>
            <span
              className={`absolute text-[15px] leading-none transition-all duration-300 ${
                theme === 'dark'
                  ? 'translate-y-5 scale-75 opacity-0'
                  : 'translate-y-0 scale-100 opacity-100'
              }`}
            >
              ☾
            </span>
          </span>
        </button>
      </div>

      <div className="mx-auto max-w-[760px] px-4 py-2 sm:hidden sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="font-serif text-xl font-semibold text-[#102018]">
            <span className="flex items-center gap-2">
              <span className="text-lg text-[#c96b37]">●</span>
              Orthodle
            </span>
          </Link>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenHowItWorks}
              aria-label="How it works"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#e6dfd3] bg-white text-[#102018] transition hover:bg-[#fbfaf7]"
            >
              <Info size={16} strokeWidth={2.2} />
            </button>
            <button
              type="button"
              onClick={onOpenUpdates}
              aria-label="Updates"
              className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#e6dfd3] bg-white text-[#102018] transition hover:bg-[#fbfaf7]"
            >
              <Bell size={16} strokeWidth={2.2} />
              {unreadNotificationCount > 0 ? (
                <span className="absolute -right-1 -top-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-[#1f6448] px-1.5 text-[10px] font-bold text-white">
                  {unreadNotificationCount}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to night mode'}
              onClick={toggleTheme}
              className={`group flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition ${
                theme === 'dark'
                  ? 'border-[#33453c] bg-[#18241f] text-[#f4efe6] hover:bg-[#1d2a24]'
                  : 'border-[#ded7ca] bg-white text-[#102018] hover:bg-[#fbfaf7]'
              }`}
            >
              <span className="relative flex h-5 w-5 items-center justify-center overflow-hidden">
                <span
                  className={`absolute text-[15px] leading-none transition-all duration-300 ${
                    theme === 'dark'
                      ? 'translate-y-0 scale-100 opacity-100'
                      : '-translate-y-5 scale-75 opacity-0'
                  }`}
                >
                  ☀
                </span>
                <span
                  className={`absolute text-[15px] leading-none transition-all duration-300 ${
                    theme === 'dark'
                      ? 'translate-y-5 scale-75 opacity-0'
                      : 'translate-y-0 scale-100 opacity-100'
                  }`}
                >
                  ☾
                </span>
              </span>
            </button>
          </div>
        </div>

        <nav className="mt-2 flex justify-center">
          <div className="w-full max-w-[430px] rounded-[26px] bg-gradient-to-r from-[#1f6448] via-[#c76b3a] to-[#ead9b7] p-[1.5px] shadow-[0_6px_14px_rgba(16,32,24,0.045)]">
            <div className="grid grid-cols-4 gap-1 rounded-[24px] bg-white p-1">
              <Link
                href="/"
                className={inactiveNavItemClass}
              >
                Cases
              </Link>
              {tabs.map(tab => {
                const active = activeTab === tab.id

                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => onTabChange(tab.id)}
                    className={`${
                      active
                        ? `${navItemClass} border border-[#1f6448] bg-[#1f6448] text-white shadow-sm`
                        : inactiveNavItemClass
                    }`}
                  >
                    {tab.label}
                  </button>
                )
              })}
            </div>
          </div>
        </nav>
      </div>
    </header>
  )
}

function TrophyCase({
  trophies,
}: {
  trophies: Array<{
    title: string
    description: string
    icon: string
    earned: boolean
  }>
}) {
  const [selectedTrophy, setSelectedTrophy] = useState<{
    title: string
    description: string
    icon: string
    earned: boolean
  } | null>(null)
  const earnedCount = trophies.filter(trophy => trophy.earned).length

  return (
    <>
      <section className="mt-3 rounded-[20px] border border-[#e7e1d6] bg-white p-3 text-left shadow-[0_10px_26px_rgba(16,32,24,0.04)] sm:p-4">
        <div className="flex items-start justify-between gap-2.5 sm:gap-3">
          <div>
            <h2 className="font-serif text-[21px] font-bold tracking-[-0.05em] text-[#102018] sm:text-[23px]">
              <span className="mr-1.5 text-[19px]">🏆</span>
              Trophy Case
            </h2>
            <p className="mt-0.5 text-[11px] text-[#637268] sm:text-xs">
              Tap any trophy to see how it is earned.
            </p>
          </div>
          <div className="shrink-0 rounded-full border border-[#e6dfd3] bg-[#fcfbf8] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-[#637268] sm:px-2.5">
            {earnedCount}/{trophies.length}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {trophies.map(trophy => (
            <button
              key={trophy.title}
              type="button"
              onClick={() => setSelectedTrophy(trophy)}
              className={`flex min-h-[122px] flex-col rounded-[14px] border px-2 py-2.5 text-center transition hover:-translate-y-0.5 sm:min-h-[138px] sm:px-2.5 ${
                trophy.earned
                  ? 'border-[#ead9b7] bg-[radial-gradient(circle_at_50%_0%,rgba(231,184,63,0.16),transparent_42%),#fffdf8] shadow-[0_8px_18px_rgba(16,32,24,0.04)]'
                  : 'border-[#ece6db] bg-[#fcfbf8] opacity-55'
              }`}
            >
              <div
                className={`mx-auto flex h-10 w-10 items-center justify-center rounded-full border text-[24px] sm:h-12 sm:w-12 sm:text-[28px] ${
                  trophy.earned
                    ? 'border-[#ead9b7] bg-[#fff4df] shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]'
                    : 'border-[#e6dfd3] bg-white grayscale'
                }`}
                aria-hidden="true"
              >
                {trophy.icon}
              </div>
              <div className="mt-1.5 min-h-[2.7rem] break-words font-serif text-[11px] font-bold leading-tight text-[#102018] sm:min-h-[3rem] sm:text-[12px]">
                {trophy.title}
              </div>
              <div className="mt-auto pt-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#637268]">
                Details
              </div>
            </button>
          ))}
        </div>
      </section>

      {selectedTrophy ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b130fcc] px-3 py-6 backdrop-blur-sm">
          <div className="w-full max-w-[360px] rounded-[24px] border border-[#e6dfd3] bg-white p-4 shadow-[0_24px_70px_rgba(16,32,24,0.22)] sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#637268]">
                  Trophy
                </div>
                <div className="mt-1 font-serif text-[24px] font-bold tracking-[-0.04em] text-[#102018]">
                  {selectedTrophy.title}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTrophy(null)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#e0d8ca] bg-white text-[#637268] transition hover:bg-[#fcfbf8]"
                aria-label="Close trophy details"
              >
                <X size={15} />
              </button>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <div className={`flex h-14 w-14 items-center justify-center rounded-full border text-[30px] ${
                selectedTrophy.earned
                  ? 'border-[#ead9b7] bg-[#fff4df]'
                  : 'border-[#e6dfd3] bg-[#fcfbf8] grayscale'
              }`}>
                {selectedTrophy.icon}
              </div>
              <div>
                <div className={`text-[11px] font-bold uppercase tracking-[0.16em] ${
                  selectedTrophy.earned ? 'text-[#2d7651]' : 'text-[#8b938d]'
                }`}>
                  {selectedTrophy.earned ? 'Unlocked' : 'Locked'}
                </div>
                <p className="mt-1 text-sm leading-6 text-[#536158]">
                  {selectedTrophy.description}
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

function formatScore(value: number) {
  return value.toLocaleString('en-US')
}

function formatMemberCount(count: number) {
  return `${count} member${count === 1 ? '' : 's'}`
}

function getXpForStats(stats: MemberStats | null) {
  if (!stats) return 0

  const efficiencyBonus =
    stats.avgGuesses !== null ? Math.max(0, Math.round((7 - stats.avgGuesses) * 8)) : 0

  return (
    stats.correctGuesses * 12 +
    stats.solves * 30 +
    stats.firstTrySolves * 18 +
    stats.longestStreak * 14 +
    stats.attendingSolves * 20 +
    efficiencyBonus
  )
}

function getLevelFromXp(xp: number) {
  let level = 1
  let spentXp = 0
  let nextRequirement = 120

  while (xp >= spentXp + nextRequirement) {
    spentXp += nextRequirement
    level += 1
    nextRequirement = 120 + (level - 1) * 28
  }

  return {
    level,
    currentXp: xp - spentXp,
    nextXp: nextRequirement,
  }
}

function getLevelTitle(level: number) {
  if (level >= 32) return 'Program Legend'
  if (level >= 24) return 'Chief Resident'
  if (level >= 18) return 'Senior Resident'
  if (level >= 12) return 'Consult Crusher'
  if (level >= 7) return 'Junior Resident'
  if (level >= 3) return 'Ortho Apprentice'
  return 'Ortho Beginner'
}

function getGroupTagline(rank: number | null) {
  if (rank === 1) return 'Leading the pack.'
  if (rank && rank <= 3) return 'Consult first. Panic later.'
  return 'Stacking solves one case at a time.'
}

function formatRelativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.max(1, Math.round(diffMs / 60000))

  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days === 1) return 'Yesterday'
  return `${days}d ago`
}

function getLocalIsoDate(isoLike?: string) {
  const date = isoLike ? new Date(isoLike) : new Date()
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getCurrentRun(sortedDates: string[]) {
  if (sortedDates.length === 0) return 0

  let current = 1
  for (let index = sortedDates.length - 1; index > 0; index -= 1) {
    const currentDate = new Date(`${sortedDates[index]}T12:00:00`)
    const previousDate = new Date(`${sortedDates[index - 1]}T12:00:00`)
    const diffDays = Math.round(
      (currentDate.getTime() - previousDate.getTime()) / (1000 * 60 * 60 * 24)
    )
    if (diffDays === 1) current += 1
    else break
  }

  return current
}

function buildWeeklyChallenge(groupAggregate: GroupAggregate | null): WeeklyChallenge | null {
  if (!groupAggregate) return null

  if (groupAggregate.totalFirstTrySolves < 6) {
    return {
      title: 'First-Try Friday',
      detail: 'Stack first-try solves as a team this week.',
      progress: groupAggregate.totalFirstTrySolves,
      goal: 6,
      reward: 'Bonus momentum for sharp pattern recognition.',
    }
  }

  if (groupAggregate.activeTodayCount < Math.min(3, Math.max(1, groupAggregate.members.length))) {
    return {
      title: 'Daily Check-In',
      detail: 'Get more teammates to solve today’s case.',
      progress: groupAggregate.activeTodayCount,
      goal: Math.min(3, Math.max(1, groupAggregate.members.length)),
      reward: 'Keep the group streak alive.',
    }
  }

  return {
    title: 'Consult Climb',
    detail: 'Push your weekly score by solving efficiently.',
    progress: groupAggregate.score,
    goal: groupAggregate.score + 12,
    reward: 'Enough to realistically gain ground this week.',
  }
}

function buildWeeklyRecap(
  groupAggregate: GroupAggregate | null,
  rank: number | null,
  totalGroups: number,
  mvpName?: string
): WeeklyRecap | null {
  if (!groupAggregate) return null

  if (rank === 1) {
    return {
      title: 'Holding first place',
      detail: mvpName
        ? `${mvpName} is pacing the team while the group protects the lead.`
        : 'Your group is setting the pace this week.',
      accent: 'Leader',
    }
  }

  if (rank && rank <= 3) {
    return {
      title: 'Podium push',
      detail: `You’re sitting #${rank} of ${totalGroups} groups with room to climb.`,
      accent: 'Podium',
    }
  }

  return {
    title: 'Still in striking distance',
    detail: 'A few efficient solves can change the board quickly.',
    accent: 'Chasing',
  }
}

function getActivityIcon(item: ActivityFeedItem['icon']) {
  if (item === 'announcement') return '📣'
  if (item === 'info') return '💡'
  if (item === 'solve') return '🏆'
  if (item === 'mvp') return '👑'
  if (item === 'streak') return '🔥'
  return '📈'
}

function formatCaseLevelLabel(level: CaseRow['level']) {
  if (level === 'med_student') return 'med student'
  if (level === 'resident') return 'resident'
  return 'attending'
}

function calculateMemberScore(
  solves: number,
  firstTrySolves: number,
  longestStreak: number,
  avgGuesses: number | null,
  settings: GroupScoringSettings
) {
  const efficiencyBonus =
    avgGuesses !== null
      ? Math.max(0, settings.efficiencyBaseline - avgGuesses) * settings.efficiencyPointsPerGuess
      : 0
  return Math.round(
    solves * settings.solvePoints +
      firstTrySolves * settings.firstTryPoints +
      longestStreak * settings.streakPoints +
      efficiencyBonus
  )
}

function calculateGroupTeamworkBonus(activeMemberCount: number, settings: GroupScoringSettings) {
  if (activeMemberCount <= 1) return 0
  return Math.min(
    settings.teamworkBonusMax,
    (activeMemberCount - 1) * settings.teamworkBonusPerMember
  )
}

function getLocalDateFromTimestamp(value: string | null | undefined) {
  if (!value) return ''
  const date = new Date(value)
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function buildGroupAggregatesFromRows(
  groups: GroupRow[],
  members: GroupMemberRow[],
  guessRows: GuessRow[],
  caseLookup: Record<string, CaseRow>,
  settings: GroupScoringSettings
) {
  return groups
    .map(group => {
      const groupMembers = members.filter(member => member.group_id === group.id)
      const memberStats = groupMembers.map(member =>
        buildMemberStats(member, guessRows, caseLookup, settings)
      )

      const totalCorrectGuesses = memberStats.reduce((sum, entry) => sum + entry.correctGuesses, 0)
      const totalGuessCount = memberStats.reduce((sum, entry) => sum + entry.totalGuesses, 0)
      const avgAccuracy =
        totalGuessCount > 0 ? (totalCorrectGuesses / totalGuessCount) * 100 : null
      const avgGuessEntries = memberStats.filter(entry => entry.avgGuesses !== null)
      const avgGuesses =
        avgGuessEntries.length > 0
          ? avgGuessEntries.reduce((sum, entry) => sum + (entry.avgGuesses || 0), 0) /
            avgGuessEntries.length
          : null
      const longestStreak = memberStats.reduce(
        (max, entry) => Math.max(max, entry.longestStreak),
        0
      )
      const allSolvedDates = Array.from(
        new Set(memberStats.flatMap(entry => entry.solvedDates))
      ).sort()
      const currentStreak = getCurrentRun(allSolvedDates)
      const totalSolves = memberStats.reduce((sum, entry) => sum + entry.solves, 0)
      const totalFirstTrySolves = memberStats.reduce((sum, entry) => sum + entry.firstTrySolves, 0)
      const totalAttendingSolves = memberStats.reduce((sum, entry) => sum + entry.attendingSolves, 0)
      const activeMemberStats = memberStats.filter(entry => entry.totalGuesses > 0)
      const totalMemberScore = activeMemberStats.reduce((sum, entry) => sum + entry.score, 0)
      const teamworkBonus = calculateGroupTeamworkBonus(activeMemberStats.length, settings)
      const score =
        activeMemberStats.length > 0
          ? Math.round(totalMemberScore / activeMemberStats.length) + teamworkBonus
          : 0
      const todayKey = getLocalIsoDate()
      const activeTodayCount = memberStats.filter(entry => entry.solvedDates.includes(todayKey)).length

      return {
        group,
        members: groupMembers,
        memberStats: memberStats.sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score
          if (b.longestStreak !== a.longestStreak) return b.longestStreak - a.longestStreak
          if (b.solves !== a.solves) return b.solves - a.solves
          if ((a.avgGuesses ?? Infinity) !== (b.avgGuesses ?? Infinity)) {
            return (a.avgGuesses ?? Infinity) - (b.avgGuesses ?? Infinity)
          }
          return b.firstTrySolves - a.firstTrySolves
        }),
        score,
        avgAccuracy,
        avgGuesses,
        longestStreak,
        currentStreak,
        totalSolves,
        totalFirstTrySolves,
        totalAttendingSolves,
        activeTodayCount,
        solvedDates: allSolvedDates,
      }
    })
    .sort((a, b) => b.score - a.score)
}

function buildMemberStats(
  member: GroupMemberRow,
  guessRows: GuessRow[],
  caseLookup: Record<string, CaseRow>,
  settings: GroupScoringSettings
): MemberStats {
  const memberGuesses = guessRows.filter(row => row.session_id === member.session_id && row.case_id)
  const guessesByCase = new Map<string, GuessRow[]>()

  for (const guess of memberGuesses) {
    if (!guess.case_id) continue
    if (!guessesByCase.has(guess.case_id)) {
      guessesByCase.set(guess.case_id, [])
    }
    guessesByCase.get(guess.case_id)!.push(guess)
  }

  let solves = 0
  let firstTrySolves = 0
  let totalGuessesToSolve = 0
  let totalGuesses = 0
  let correctGuesses = 0
  let attendingSolves = 0
  let hasClutchSolve = false
  let nightShiftSolves = 0
  const solvedDates: string[] = []
  const categorySolves: Record<string, number> = {}

  for (const [caseId, rows] of guessesByCase.entries()) {
    const caseInfo = caseLookup[caseId]
    totalGuesses += rows.length
    correctGuesses += rows.filter(row => row.is_correct).length
    const firstCorrectIndex = rows.findIndex(row => row.is_correct)
    if (firstCorrectIndex === -1) continue
    solves += 1
    totalGuessesToSolve += firstCorrectIndex + 1
    if (firstCorrectIndex === 0) {
      firstTrySolves += 1
    }
    if (firstCorrectIndex + 1 <= 4) {
      hasClutchSolve = true
    }
    if (caseInfo?.level === 'attending') {
      attendingSolves += 1
    }
    if (caseInfo?.category) {
      categorySolves[caseInfo.category] = (categorySolves[caseInfo.category] || 0) + 1
    }
    const correctGuess = rows[firstCorrectIndex]
    if (correctGuess?.created_at) {
      const solvedHour = new Date(correctGuess.created_at).getHours()
      if (solvedHour >= 0 && solvedHour < 6) {
        nightShiftSolves += 1
      }
    }
    const solvedDate = caseInfo?.case_date || getLocalDateFromTimestamp(correctGuess?.created_at)
    if (solvedDate) {
      solvedDates.push(solvedDate)
    }
  }

  const uniqueSortedDates = Array.from(new Set(solvedDates)).sort()

  const avgGuesses = solves > 0 ? totalGuessesToSolve / solves : null
  const longestStreak = computeLongestRun(uniqueSortedDates)
  const currentStreak = getCurrentRun(uniqueSortedDates)
  const score = calculateMemberScore(solves, firstTrySolves, longestStreak, avgGuesses, settings)

  return {
    member,
    score,
    solves,
    avgGuesses,
    longestStreak,
    currentStreak,
    firstTrySolves,
    totalGuesses,
    correctGuesses,
    attendingSolves,
    categorySolves,
    hasClutchSolve,
    nightShiftSolves,
    solvedDates: uniqueSortedDates,
  }
}

export default function GroupsPage() {
  const today = useMemo(() => getLocalIsoDate(), [])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [activeGroupsTab, setActiveGroupsTab] = useState<GroupsTab>('home')
  const [groups, setGroups] = useState<GroupRow[]>([])
  const [members, setMembers] = useState<GroupMemberRow[]>([])
  const [guessRows, setGuessRows] = useState<GuessRow[]>([])
  const [groupScoringSettings, setGroupScoringSettings] = useState<GroupScoringSettings>(
    DEFAULT_GROUP_SCORING_SETTINGS
  )
  const [groupWeeklyHonors, setGroupWeeklyHonors] = useState<GroupWeeklyHonorRow[]>([])
  const [weeklyHonorsEnabled, setWeeklyHonorsEnabled] = useState(true)
  const [weeklyServerAggregates, setWeeklyServerAggregates] = useState<GroupAggregate[] | null>(null)
  const [allTimeServerAggregates, setAllTimeServerAggregates] = useState<GroupAggregate[] | null>(null)
  const [caseLookup, setCaseLookup] = useState<Record<string, CaseRow>>({})
  const [groupAnnouncement, setGroupAnnouncement] = useState<GroupAnnouncementRow | null>(null)
  const [groupHeaderSurvey, setGroupHeaderSurvey] = useState<GroupHeaderSurveyState>({
    survey: null,
    submittedChoice: null,
    isSubmitting: false,
    status: '',
  })
  const [dismissedGroupAnnouncementKey, setDismissedGroupAnnouncementKey] = useState('')
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [createName, setCreateName] = useState('')
  const [createCode, setCreateCode] = useState('')
  const [createIcon, setCreateIcon] = useState<string>(DEFAULT_MEMBER_ICON)
  const [createMemberIcon, setCreateMemberIcon] = useState<string>(DEFAULT_MEMBER_ICON)
  const [createDisplayName, setCreateDisplayName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [joinDisplayName, setJoinDisplayName] = useState('')
  const [joinMemberIcon, setJoinMemberIcon] = useState<string>(DEFAULT_MEMBER_ICON)
  const [leaderboardWindow, setLeaderboardWindow] = useState<LeaderboardWindow>('week')
  const [creating, setCreating] = useState(false)
  const [joining, setJoining] = useState(false)
  const [savingGroupName, setSavingGroupName] = useState(false)
  const [savingGroupIcon, setSavingGroupIcon] = useState(false)
  const [savingDisplayName, setSavingDisplayName] = useState(false)
  const [savingMemberIcon, setSavingMemberIcon] = useState(false)
  const [copiedCode, setCopiedCode] = useState('')
  const [leavingGroup, setLeavingGroup] = useState(false)
  const [urlJoinCode, setUrlJoinCode] = useState('')
  const [leaderboardSearch, setLeaderboardSearch] = useState('')
  const [showJoinPanel, setShowJoinPanel] = useState(false)
  const [groupActionMode, setGroupActionMode] = useState<'join' | 'create' | 'request'>('join')
  const [yourGroupOpen, setYourGroupOpen] = useState(false)
  const [memberPreviewOpen, setMemberPreviewOpen] = useState(false)
  const [showSelectedGroupIconPicker, setShowSelectedGroupIconPicker] = useState(false)
  const [showSelectedMemberIconPicker, setShowSelectedMemberIconPicker] = useState(false)
  const [showJoinMemberIconPicker, setShowJoinMemberIconPicker] = useState(false)
  const [showRequestMemberIconPicker, setShowRequestMemberIconPicker] = useState(false)
  const [showCreateGroupIconPicker, setShowCreateGroupIconPicker] = useState(false)
  const [showCreateMemberIconPicker, setShowCreateMemberIconPicker] = useState(false)
  const [showGroupsExplainer, setShowGroupsExplainer] = useState(false)
  const [showLeaderboardScoringGuide, setShowLeaderboardScoringGuide] = useState(false)
  const [showNotificationsPanel, setShowNotificationsPanel] = useState(false)
  const [showProfileStatGuide, setShowProfileStatGuide] = useState(false)
  const [seenNotificationIds, setSeenNotificationIds] = useState<string[]>([])
  const [dismissedMessages, setDismissedMessages] = useState<string[]>([])
  const [editGroupName, setEditGroupName] = useState('')
  const [editDisplayName, setEditDisplayName] = useState('')
  const [requestGroupId, setRequestGroupId] = useState('')
  const [requestDisplayName, setRequestDisplayName] = useState('')
  const [requestContact, setRequestContact] = useState('')
  const [requestNote, setRequestNote] = useState('')
  const [requestMemberIcon, setRequestMemberIcon] = useState(DEFAULT_MEMBER_ICON)
  const [requestingInvite, setRequestingInvite] = useState(false)
  const [editMemberIcon, setEditMemberIcon] = useState<string>(DEFAULT_MEMBER_ICON)
  const [localProfile, setLocalProfile] = useState<LocalProfile>({
    displayName: '',
    icon: DEFAULT_MEMBER_ICON,
  })
  const [accountSession, setAccountSessionState] = useState<AccountSession | null>(null)
  const [accountRepairKey, setAccountRepairKey] = useState('')
  const [identityVersion, setIdentityVersion] = useState(0)
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('signup')
  const [authUsername, setAuthUsername] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authSubmitting, setAuthSubmitting] = useState(false)
  const [backupStatus, setBackupStatus] = useState('')
  const [backingUp, setBackingUp] = useState(false)
  const [isEditingProfileName, setIsEditingProfileName] = useState(false)
  const [selectedMemberStats, setSelectedMemberStats] = useState<MemberStats | null>(null)
  const [removingMemberId, setRemovingMemberId] = useState('')
  const sessionId = useMemo(() => getSessionId(), [identityVersion])
  const router = useRouter()

  useEffect(() => {
    if (typeof window === 'undefined') return
    const nextTab = normalizeGroupsTab(new URLSearchParams(window.location.search).get('tab'))
    setActiveGroupsTab(current => (current === nextTab ? current : nextTab))
    try {
      const savedSeen = window.localStorage.getItem(GROUP_NOTIFICATIONS_SEEN_KEY)
      if (savedSeen) {
        const parsed = JSON.parse(savedSeen) as string[]
        if (Array.isArray(parsed)) {
          setSeenNotificationIds(parsed)
        }
      }
    } catch {
      window.localStorage.removeItem(GROUP_NOTIFICATIONS_SEEN_KEY)
    }

    try {
      const savedDismissedMessages = window.localStorage.getItem(GROUP_DISMISSED_MESSAGES_KEY)
      if (savedDismissedMessages) {
        const parsed = JSON.parse(savedDismissedMessages) as string[]
        if (Array.isArray(parsed)) {
          setDismissedMessages(parsed)
        }
      }
    } catch {
      window.localStorage.removeItem(GROUP_DISMISSED_MESSAGES_KEY)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const currentUrlTab = normalizeGroupsTab(params.get('tab'))
    if (currentUrlTab === activeGroupsTab) return

    if (activeGroupsTab === 'home') {
      params.delete('tab')
    } else {
      params.set('tab', activeGroupsTab)
    }

    const nextQuery = params.toString()
    const nextUrl = nextQuery
      ? `${window.location.pathname}?${nextQuery}`
      : window.location.pathname
    window.history.replaceState({}, '', nextUrl)
  }, [activeGroupsTab])

  const groupAnnouncementKey = groupAnnouncement
    ? `${groupAnnouncement.id}:${groupAnnouncement.start_date}:${groupAnnouncement.end_date || ''}`
    : ''

  async function loadGroupAnnouncement() {
    const { data } = await supabase
      .from('group_announcements')
      .select('id, message, start_date, end_date, created_at')
      .lte('start_date', today)
      .or(`end_date.is.null,end_date.gte.${today}`)
      .order('start_date', { ascending: false })
      .limit(1)

    const activeAnnouncement = (data as GroupAnnouncementRow[] | null)?.[0] || null
    setGroupAnnouncement(activeAnnouncement?.message?.trim() ? activeAnnouncement : null)
  }

  async function loadGroupHeaderSurvey() {
    const isLocalhost =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')

    const { data, error } = await supabase
      .from('site_surveys')
      .select('id, question, options, placement, level_scope, start_date, end_date, created_at')
      .eq('placement', 'group_header')
      .lte('start_date', today)
      .or(`end_date.is.null,end_date.gte.${today}`)
      .order('start_date', { ascending: false })

    if (!error) {
      const activeSurvey = ((data as SiteSurveyRow[] | null) || []).find(
        item => item.question?.trim() && normalizeSurveyOptions(item.options || []).length >= 2
      ) || null

      if (activeSurvey) {
        setGroupHeaderSurvey(prev => ({
          ...prev,
          survey: { ...activeSurvey, options: normalizeSurveyOptions(activeSurvey.options || []) },
        }))
        return
      }
    }

    if (!isLocalhost) {
      setGroupHeaderSurvey(prev => ({ ...prev, survey: null }))
      return
    }

    const { data: upcomingData } = await supabase
      .from('site_surveys')
      .select('id, question, options, placement, level_scope, start_date, end_date, created_at')
      .eq('placement', 'group_header')
      .gte('start_date', today)
      .order('start_date', { ascending: true })
      .limit(1)

    const upcomingSurvey = ((upcomingData as SiteSurveyRow[] | null) || []).find(
      item => item.question?.trim() && normalizeSurveyOptions(item.options || []).length >= 2
    ) || null

    setGroupHeaderSurvey(prev => ({
      ...prev,
      survey: upcomingSurvey
        ? { ...upcomingSurvey, options: normalizeSurveyOptions(upcomingSurvey.options || []) }
        : null,
    }))
  }

  async function loadWeeklyHonors() {
    const { data, error } = await supabase
      .from('group_weekly_honors')
      .select('*')
      .order('week_start', { ascending: false })
      .limit(52)

    if (error) {
      if (isMissingRelationError(error)) {
        setWeeklyHonorsEnabled(false)
        setGroupWeeklyHonors([])
        return
      }
      return
    }

    setWeeklyHonorsEnabled(true)
    setGroupWeeklyHonors((data || []) as GroupWeeklyHonorRow[])
  }

  async function loadGroupScoringSettings() {
    const { data } = await supabase
      .from('group_scoring_settings')
      .select(
        'solve_points, first_try_points, streak_points, efficiency_baseline, efficiency_points_per_guess, teamwork_bonus_per_member, teamwork_bonus_max'
      )
      .eq('id', 'default')
      .maybeSingle()

    const row = (data as GroupScoringSettingsRow | null) || null
    setGroupScoringSettings(
      normalizeGroupScoringSettings(
        row
          ? {
              solvePoints: row.solve_points,
              firstTryPoints: row.first_try_points,
              streakPoints: row.streak_points,
              efficiencyBaseline: row.efficiency_baseline,
              efficiencyPointsPerGuess: row.efficiency_points_per_guess,
              teamworkBonusPerMember: row.teamwork_bonus_per_member,
              teamworkBonusMax: row.teamwork_bonus_max,
            }
          : DEFAULT_GROUP_SCORING_SETTINGS
      )
    )
  }

  async function syncCompletedWeeklyHonor() {
    if (!weeklyHonorsEnabled) return

    const previousWeekRange = getShiftedWeekRange(-1)
    if (groupWeeklyHonors.some(row => row.week_start === previousWeekRange.startDate)) return

    const params = new URLSearchParams({
      window: 'week',
      startIso: previousWeekRange.startIso,
      endIso: previousWeekRange.endIso,
    })

    const response = await fetch(`/api/groups/leaderboard?${params.toString()}`, {
      cache: 'no-store',
    })
    const payload = await response.json().catch(() => ({}))

    if (!response.ok) return

    const aggregates = Array.isArray(payload.aggregates) ? (payload.aggregates as GroupAggregate[]) : []
    const winningGroup = aggregates[0]
    const winningMvp = winningGroup?.memberStats[0]

    if (!winningGroup || !winningMvp) return

    const { data, error } = await supabase
      .from('group_weekly_honors')
      .upsert(
        {
          week_start: previousWeekRange.startDate,
          week_end: previousWeekRange.endDate,
          group_id: winningGroup.group.id,
          group_name: winningGroup.group.name,
          group_icon: winningGroup.group.icon || null,
          mvp_session_id: winningMvp.member.session_id,
          mvp_display_name: winningMvp.member.display_name,
          mvp_icon: winningMvp.member.icon || null,
        },
        { onConflict: 'week_start' }
      )
      .select('*')
      .single()

    if (error) {
      if (isMissingRelationError(error)) {
        setWeeklyHonorsEnabled(false)
      }
      return
    }

    const syncedRow = data as GroupWeeklyHonorRow
    setGroupWeeklyHonors(previous => {
      const nextRows = previous.filter(row => row.week_start !== syncedRow.week_start)
      return [syncedRow, ...nextRows].sort((a, b) => b.week_start.localeCompare(a.week_start))
    })
  }

  async function submitGroupHeaderSurvey(choice: string) {
    if (!groupHeaderSurvey.survey?.id || groupHeaderSurvey.submittedChoice || groupHeaderSurvey.isSubmitting) {
      return
    }

    setGroupHeaderSurvey(prev => ({ ...prev, isSubmitting: true, status: '' }))

    try {
      await supabase.from('site_survey_responses').insert({
        survey_id: groupHeaderSurvey.survey.id,
        response: choice,
        session_id: getSessionId() || null,
        placement: 'group_header',
      })

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(getGroupSurveyStorageKey(groupHeaderSurvey.survey.id), choice)
      }

      setGroupHeaderSurvey(prev => ({
        ...prev,
        submittedChoice: choice,
        isSubmitting: false,
        status: 'Thanks for responding!',
      }))
    } catch {
      setGroupHeaderSurvey(prev => ({
        ...prev,
        isSubmitting: false,
        status: 'Could not save that response.',
      }))
    }
  }

  async function loadServerLeaderboardData(windowMode: LeaderboardWindow, force = false) {
    if (windowMode === 'all-time' && allTimeServerAggregates !== null && !force) return
    if (windowMode === 'week' && weeklyServerAggregates !== null && !force) return

    const params = new URLSearchParams({ window: windowMode })
    if (windowMode === 'week') {
      params.set('startIso', weekRange.startIso)
      params.set('endIso', weekRange.endIso)
    }

    const response = await fetch(`/api/groups/leaderboard?${params.toString()}`, {
      cache: 'no-store',
    })
    const payload = await response.json().catch(() => ({}))

    if (!response.ok) {
      throw new Error(payload.error || 'Could not load the group leaderboard right now.')
    }

    const aggregates = Array.isArray(payload.aggregates) ? (payload.aggregates as GroupAggregate[]) : []
    if (windowMode === 'week') {
      setWeeklyServerAggregates(aggregates)
    } else {
      setAllTimeServerAggregates(aggregates)
    }
  }

  async function fetchAllGroupGuessRows(memberSessionIds: string[]) {
    const pageSize = 1000
    const rows: GuessRow[] = []
    let from = 0

    while (true) {
      const to = from + pageSize - 1
      const { data, error } = await supabase
        .from('guesses')
        .select('session_id, case_id, is_correct, created_at')
        .in('session_id', memberSessionIds)
        .order('created_at', { ascending: true })
        .range(from, to)

      if (error) {
        throw error
      }

      const batch = (data || []) as GuessRow[]
      rows.push(...batch)

      if (batch.length < pageSize) {
        break
      }

      from += pageSize
    }

    return rows
  }

  async function loadGroupsData() {
    const { data: groupData, error: groupError } = await supabase
      .from('groups')
      .select('*')
      .order('created_at', { ascending: false })

    if (groupError) {
      setMessage(groupError.message)
      setLoading(false)
      return
    }

    const allGroups = (groupData || []) as GroupRow[]
    setGroups(allGroups)

    const { data: memberData, error: memberError } = await supabase
      .from('group_members')
      .select('*')
      .order('created_at', { ascending: true })

    if (memberError) {
      setMessage(memberError.message)
      setLoading(false)
      return
    }

    const allMembers = (memberData || []) as GroupMemberRow[]
    setMembers(allMembers)

    const memberSessionIds = Array.from(new Set(allMembers.map(member => member.session_id)))

    if (memberSessionIds.length === 0) {
      setGuessRows([])
      setCaseLookup({})
      setLoading(false)
      return
    }

    let allGuesses: GuessRow[] = []

    try {
      allGuesses = await fetchAllGroupGuessRows(memberSessionIds)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load group guesses.')
      setLoading(false)
      return
    }

    setGuessRows(allGuesses)

    const caseIds = Array.from(
      new Set(allGuesses.map(row => row.case_id).filter((value): value is string => Boolean(value)))
    )

    if (caseIds.length === 0) {
      setCaseLookup({})
      setLoading(false)
      return
    }

    const { data: caseData, error: caseError } = await supabase
      .from('cases')
      .select('id, case_date, level, answer, category')
      .in('id', caseIds)

    if (caseError) {
      setMessage(caseError.message)
      setLoading(false)
      return
    }

    const nextLookup: Record<string, CaseRow> = {}
    for (const row of (caseData || []) as CaseRow[]) {
      nextLookup[row.id] = row
    }

    setCaseLookup(nextLookup)
    setLoading(false)
  }

  useEffect(() => {
    void loadGroupsData()
    void loadGroupAnnouncement()
    void loadGroupHeaderSurvey()
    void loadGroupScoringSettings()
    void loadWeeklyHonors()
    void loadServerLeaderboardData('week', true)
  }, [sessionId, today])

  useEffect(() => {
    if (!weeklyHonorsEnabled) return
    void syncCompletedWeeklyHonor()
  }, [groupWeeklyHonors, weeklyHonorsEnabled])

  useEffect(() => {
    if (typeof window === 'undefined' || !groupHeaderSurvey.survey?.id) {
      setGroupHeaderSurvey(prev => ({ ...prev, submittedChoice: null, status: '' }))
      return
    }

    const savedChoice = window.localStorage.getItem(
      getGroupSurveyStorageKey(groupHeaderSurvey.survey.id)
    )
    setGroupHeaderSurvey(prev => ({ ...prev, submittedChoice: savedChoice || null, status: '' }))
  }, [groupHeaderSurvey.survey?.id])

  useEffect(() => {
    const refresh = () => {
      void loadGroupsData()
      void loadWeeklyHonors()
      void loadServerLeaderboardData('week', true)
      if (allTimeServerAggregates !== null) {
        void loadServerLeaderboardData('all-time', true)
      }
    }
    const channel = supabase
      .channel('groups-live-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'groups' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'guesses' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_weekly_honors' }, refresh)
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [allTimeServerAggregates])

  useEffect(() => {
    if (leaderboardWindow === 'all-time') {
      void loadServerLeaderboardData('all-time')
    }
  }, [leaderboardWindow])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const codeFromUrl = normalizeJoinCode(new URLSearchParams(window.location.search).get('code') || '')
    const requestGroupFromUrl = new URLSearchParams(window.location.search).get('request') || ''
    setUrlJoinCode(codeFromUrl)
    if (codeFromUrl) {
      setJoinCode(codeFromUrl)
      setGroupActionMode('join')
      setShowJoinPanel(true)
    }
    if (requestGroupFromUrl) {
      setRequestGroupId(requestGroupFromUrl)
      setGroupActionMode('request')
      setShowJoinPanel(true)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!window.localStorage.getItem(GROUPS_EXPLAINER_STORAGE_KEY)) {
      setShowGroupsExplainer(true)
    }
    setDismissedGroupAnnouncementKey(
      window.localStorage.getItem(GROUP_ANNOUNCEMENT_DISMISS_KEY) || ''
    )
  }, [])

  useEffect(() => {
    const savedProfile = readLocalProfile()
    const savedAccountSession = getAccountSession()

    setAccountSessionState(savedAccountSession)
    setLocalProfile(savedProfile)
    setEditDisplayName(savedAccountSession?.displayName || savedProfile.displayName)
    setEditMemberIcon(savedAccountSession?.profileIcon || savedProfile.icon)
    setJoinDisplayName(savedAccountSession?.displayName || savedProfile.displayName)
    setCreateDisplayName(savedAccountSession?.displayName || savedProfile.displayName)
    setRequestDisplayName(savedAccountSession?.displayName || savedProfile.displayName)
    setJoinMemberIcon(savedAccountSession?.profileIcon || savedProfile.icon)
    setCreateMemberIcon(savedAccountSession?.profileIcon || savedProfile.icon)
    setRequestMemberIcon(savedAccountSession?.profileIcon || savedProfile.icon)
    setAuthUsername(savedAccountSession?.username || '')
  }, [])

  useEffect(() => {
    void repairLinkedAccountIfNeeded()
  }, [accountSession?.accountId])

  useEffect(() => {
    const knownUserMemberships = members.filter(
      member =>
        member.session_id === sessionId && groups.some(group => group.id === member.group_id)
    )

    const matchingGroup = urlJoinCode
      ? groups.find(group => group.join_code === urlJoinCode)
      : undefined
    const userGroupIds = new Set(knownUserMemberships.map(member => member.group_id))
    const storedGroupId =
      typeof window !== 'undefined' ? window.localStorage.getItem(SELECTED_GROUP_STORAGE_KEY) : ''

    const nextSelected =
      (matchingGroup && userGroupIds.has(matchingGroup.id) ? matchingGroup.id : '') ||
      (selectedGroupId && groups.some(group => group.id === selectedGroupId) ? selectedGroupId : '') ||
      (storedGroupId && groups.some(group => group.id === storedGroupId) ? storedGroupId : '') ||
      knownUserMemberships[0]?.group_id ||
      ''

    if (nextSelected !== selectedGroupId) {
      setSelectedGroupId(nextSelected)
    }
  }, [groups, members, selectedGroupId, sessionId, urlJoinCode])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (selectedGroupId) {
      window.localStorage.setItem(SELECTED_GROUP_STORAGE_KEY, selectedGroupId)
    } else {
      window.localStorage.removeItem(SELECTED_GROUP_STORAGE_KEY)
    }
  }, [selectedGroupId])

  useEffect(() => {
    if (!selectedGroupId) {
      setYourGroupOpen(false)
    }
    setMemberPreviewOpen(false)
    setShowSelectedGroupIconPicker(false)
    setShowSelectedMemberIconPicker(false)
  }, [selectedGroupId])

  useEffect(() => {
    setShowJoinMemberIconPicker(false)
    setShowRequestMemberIconPicker(false)
    setShowCreateGroupIconPicker(false)
    setShowCreateMemberIconPicker(false)
  }, [groupActionMode, showJoinPanel])

  const selectedGroup = groups.find(group => group.id === selectedGroupId) || null
  const selectedMembers = useMemo(
    () => members.filter(member => member.group_id === selectedGroupId),
    [members, selectedGroupId]
  )
  const normalizedJoinCode = normalizeJoinCode(joinCode)
  const joinTargetGroup = normalizedJoinCode
    ? groups.find(group => group.join_code === normalizedJoinCode) || null
    : null
  const alreadyInJoinTarget = joinTargetGroup
    ? members.some(member => member.group_id === joinTargetGroup.id && member.session_id === sessionId)
    : false
  const requestTargetGroup = requestGroupId
    ? groups.find(group => group.id === requestGroupId) || null
    : null
  const weekRange = useMemo(() => getCurrentWeekRange(), [])
  const visibleGuessRows = useMemo(
    () =>
      guessRows.filter(
        row => {
          const createdAtMs = new Date(row.created_at).getTime()
          return createdAtMs >= weekRange.startMs && createdAtMs <= weekRange.endMs
        }
      ),
    [guessRows, weekRange.endMs, weekRange.startMs]
  )
  const allTimeGuessRows = useMemo(
    () => guessRows.filter(row => Boolean(row.case_id)),
    [guessRows]
  )
  const viewerAllTimeGuessRows = useMemo(
    () => guessRows.filter(row => Boolean(row.case_id)),
    [guessRows]
  )

  const computedWeekGroupAggregates = useMemo<GroupAggregate[]>(() => {
    return buildGroupAggregatesFromRows(groups, members, visibleGuessRows, caseLookup, groupScoringSettings)
  }, [caseLookup, groupScoringSettings, groups, members, visibleGuessRows])

  const computedAllTimeGroupAggregates = useMemo<GroupAggregate[]>(() => {
    return buildGroupAggregatesFromRows(groups, members, allTimeGuessRows, caseLookup, groupScoringSettings)
  }, [allTimeGuessRows, caseLookup, groupScoringSettings, groups, members])

  const groupAggregates = weeklyServerAggregates ?? computedWeekGroupAggregates
  const allTimeGroupAggregates = allTimeServerAggregates ?? computedAllTimeGroupAggregates

  const activeGroupAggregates =
    leaderboardWindow === 'week' ? groupAggregates : allTimeGroupAggregates

  const selectedGroupAggregate =
    activeGroupAggregates.find(entry => entry.group.id === selectedGroupId) || null
  const selectedMemberPreviewRows =
    selectedGroupAggregate && (memberPreviewOpen || selectedGroupAggregate.memberStats.length <= 3)
      ? selectedGroupAggregate.memberStats
      : selectedGroupAggregate?.memberStats.slice(0, 3) || []
  const selectedGroupRank = selectedGroupAggregate
    ? activeGroupAggregates.findIndex(entry => entry.group.id === selectedGroupAggregate.group.id) + 1
    : null
  const viewerMembership = members.find(member => member.session_id === sessionId) || null
  const viewerGroup = viewerMembership
    ? groups.find(group => group.id === viewerMembership.group_id) || null
    : null

  useEffect(() => {
    if (activeGroupsTab !== 'my-group') return

    if (viewerGroup?.id) {
      setSelectedGroupId(current => current || viewerGroup.id)
      setShowJoinPanel(false)
      return
    }

    setSelectedGroupId('')
    setGroupActionMode('join')
    setShowJoinPanel(true)
  }, [activeGroupsTab, viewerGroup?.id])

  const viewerGroupAggregate = viewerMembership
    ? groupAggregates.find(entry => entry.group.id === viewerMembership.group_id) || null
    : null
  const myMembership = selectedMembers.find(member => member.session_id === sessionId) || null
  const isViewingOwnGroup = Boolean(viewerGroup?.id && selectedGroup?.id && viewerGroup.id === selectedGroup.id)
  const myMemberStats =
    selectedGroupAggregate?.memberStats.find(entry => entry.member.session_id === sessionId) || null
  const viewerMemberStats =
    viewerMembership
      ? buildMemberStats(viewerMembership, viewerAllTimeGuessRows, caseLookup, groupScoringSettings)
      : null
  const viewerGroupRank = viewerGroupAggregate
    ? groupAggregates.findIndex(entry => entry.group.id === viewerGroupAggregate.group.id) + 1
    : null
  const profileDisplayName =
    viewerMembership?.display_name ||
    accountSession?.displayName ||
    localProfile.displayName ||
    'Orthodle player'
  const profileIcon =
    viewerMembership?.icon || accountSession?.profileIcon || localProfile.icon || DEFAULT_MEMBER_ICON
  const profileXp = getXpForStats(viewerMemberStats || null)
  const profileLevel = getLevelFromXp(profileXp)
  const profileLevelTitle = getLevelTitle(profileLevel.level)
  const nextProfileTitle = getLevelTitle(profileLevel.level + 1)
  const canChangeSelectedGroupIcon = Boolean(myMembership && isViewingOwnGroup)
  const canEditSelectedGroup = Boolean(selectedGroup?.creator_session_id === sessionId && isViewingOwnGroup)
  const groupOfWeekAggregate = groupAggregates[0] || null
  const previousWeekRange = useMemo(() => getShiftedWeekRange(-1), [])
  const mvpEntry = groupOfWeekAggregate?.memberStats[0]
    ? {
        stats: groupOfWeekAggregate.memberStats[0],
        group: groupOfWeekAggregate.group,
      }
    : null
  const latestCompletedHonor =
    groupWeeklyHonors.find(row => row.week_start === previousWeekRange.startDate) || null
  const currentGroupTitleCount = groupOfWeekAggregate
    ? groupWeeklyHonors.filter(row => row.group_id === groupOfWeekAggregate.group.id).length
    : 0
  const currentMvpWinCount = mvpEntry
    ? groupWeeklyHonors.filter(row => row.mvp_session_id === mvpEntry.stats.member.session_id).length
    : 0
  const selectedGroupBannerHistory = selectedGroup
    ? groupWeeklyHonors.filter(row => row.group_id === selectedGroup.id)
    : []
  const selectedGroupTitleCount = selectedGroupBannerHistory.length
  const selectedMemberMvpWinCount =
    selectedMemberStats?.member.session_id
      ? groupWeeklyHonors.filter(row => row.mvp_session_id === selectedMemberStats.member.session_id).length
      : 0
  const selectedGroupMvpHistory = useMemo(() => {
    if (!selectedGroup) return []

    const winners = new Map<
      string,
      { sessionId: string; name: string; icon: string | null; wins: number }
    >()

    for (const honor of groupWeeklyHonors) {
      if (honor.group_id !== selectedGroup.id || !honor.mvp_session_id || !honor.mvp_display_name) continue
      const existing = winners.get(honor.mvp_session_id)
      if (existing) {
        existing.wins += 1
      } else {
        winners.set(honor.mvp_session_id, {
          sessionId: honor.mvp_session_id,
          name: honor.mvp_display_name,
          icon: honor.mvp_icon,
          wins: 1,
        })
      }
    }

    return [...winners.values()].sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins
      return a.name.localeCompare(b.name)
    })
  }, [groupWeeklyHonors, selectedGroup])
  const trophyCaseItems = useMemo(
    () =>
      buildTrophyCase({
        stats: viewerMemberStats || null,
        isGroupMvp: mvpEntry?.stats.member.session_id === sessionId,
        selectedGroupRank: viewerGroupRank,
      }),
    [mvpEntry?.stats.member.session_id, sessionId, viewerGroupRank, viewerMemberStats]
  )
  const selectedMemberTrophies = useMemo(
    () =>
      selectedMemberStats
        ? buildTrophyCase({
            stats: selectedMemberStats,
            isGroupMvp: mvpEntry?.stats.member.session_id === selectedMemberStats.member.session_id,
            selectedGroupRank,
          })
        : [],
    [mvpEntry?.stats.member.session_id, selectedGroupRank, selectedMemberStats]
  )
  const selectedWeeklyGroupAggregate =
    groupAggregates.find(entry => entry.group.id === selectedGroupId) || null
  const selectedWeeklyGroupRank = selectedWeeklyGroupAggregate
    ? groupAggregates.findIndex(entry => entry.group.id === selectedWeeklyGroupAggregate.group.id) + 1
    : null
  const viewerGroupChallenge = buildWeeklyChallenge(viewerGroupAggregate)
  const viewerGroupRecap = buildWeeklyRecap(
    viewerGroupAggregate,
    viewerGroupRank,
    groupAggregates.length,
    viewerGroupAggregate?.memberStats[0]?.member.display_name
  )
  const viewerGroupMomentum = (() => {
    if (!viewerGroupAggregate || !viewerGroupRank) return null
    if (viewerGroupRank === 1) {
      const secondPlace = groupAggregates[1]
      if (!secondPlace) return 'You own the top spot.'
      return `${Math.max(0, viewerGroupAggregate.score - secondPlace.score)} pts ahead of #2`
    }

    const groupAhead = groupAggregates[viewerGroupRank - 2]
    if (!groupAhead) return null
    return `${Math.max(0, groupAhead.score - viewerGroupAggregate.score)} pts behind #${viewerGroupRank - 1}`
  })()
  const viewerGroupTodaySolvers =
    viewerGroupAggregate?.memberStats
      .filter(entry => entry.solvedDates.includes(today))
      .map(entry => entry.member.display_name) || []
  const solvedCaseIdsByViewer = useMemo(() => {
    return new Set(
      allTimeGuessRows
        .filter(row => row.session_id === sessionId && row.case_id && row.is_correct)
        .map(row => row.case_id as string)
    )
  }, [allTimeGuessRows, sessionId])
  const selectedGroupChallenge = buildWeeklyChallenge(selectedWeeklyGroupAggregate)
  const isViewerCurrentMvp = Boolean(
    mvpEntry?.stats.member.session_id && mvpEntry.stats.member.session_id === sessionId
  )
  const isSelectedMemberCurrentMvp = Boolean(
    mvpEntry?.stats.member.session_id &&
      selectedMemberStats?.member.session_id &&
      mvpEntry.stats.member.session_id === selectedMemberStats.member.session_id
  )

  const selectedGroupRecap = buildWeeklyRecap(
    selectedWeeklyGroupAggregate,
    selectedWeeklyGroupRank,
    groupAggregates.length,
    selectedWeeklyGroupAggregate?.memberStats[0]?.member.display_name
  )
  const selectedGroupMomentum = (() => {
    if (!selectedWeeklyGroupAggregate || !selectedWeeklyGroupRank) return null
    if (selectedWeeklyGroupRank === 1) {
      const secondPlace = groupAggregates[1]
      if (!secondPlace) return 'You own the top spot.'
      const lead = Math.max(0, selectedWeeklyGroupAggregate.score - secondPlace.score)
      return `${lead} pts ahead of #2`
    }

    const groupAhead = groupAggregates[selectedWeeklyGroupRank - 2]
    if (!groupAhead) return null
    const deficit = Math.max(0, groupAhead.score - selectedWeeklyGroupAggregate.score)
    return `${deficit} pts behind #${selectedWeeklyGroupRank - 1}`
  })()
  const groupActivityFeed = useMemo<ActivityFeedItem[]>(() => {
    if (!selectedGroupAggregate || !selectedGroup) return []

    const items: ActivityFeedItem[] = []
    const memberLookup = new Map(
      selectedGroupAggregate.members.map(member => [member.session_id, member] as const)
    )
    const groupSessionIds = new Set(selectedGroupAggregate.members.map(member => member.session_id))
    const guessesBySolveKey = new Map<string, GuessRow[]>()

    for (const row of visibleGuessRows) {
      if (!row.case_id || !groupSessionIds.has(row.session_id)) continue
      const key = `${row.session_id}:${row.case_id}`
      if (!guessesBySolveKey.has(key)) {
        guessesBySolveKey.set(key, [])
      }
      guessesBySolveKey.get(key)!.push(row)
    }

    for (const [key, rows] of guessesBySolveKey.entries()) {
      const firstCorrectIndex = rows.findIndex(row => row.is_correct)
      if (firstCorrectIndex === -1) continue

      const [sessionIdForSolve, caseId] = key.split(':')
      const member = memberLookup.get(sessionIdForSolve)
      const caseInfo = caseLookup[caseId]
      const solvedAt = rows[firstCorrectIndex]?.created_at

      if (!member || !caseInfo || !solvedAt) continue

      const canSeeAnswer = solvedCaseIdsByViewer.has(caseId)
      const solveLabel = canSeeAnswer
        ? caseInfo.answer
        : `${formatCaseLevelLabel(caseInfo.level)} case`

      items.push({
        id: `solve-${key}`,
        icon: 'solve',
        title: `${member.display_name} solved`,
        detail: `${solveLabel} in ${firstCorrectIndex + 1} guess${firstCorrectIndex === 0 ? '' : 'es'}`,
        createdAt: solvedAt,
      })
    }

    const nowIso = new Date().toISOString()

    if (selectedGroupRank && selectedGroupRank <= 3) {
      items.push({
        id: `rank-${selectedGroup.id}`,
        icon: 'rank',
        title: `${selectedGroup.name} is on the podium`,
        detail: `Currently ranked #${selectedGroupRank} this week`,
        createdAt: nowIso,
      })
    }

    if (selectedGroupAggregate.longestStreak >= 2) {
      items.push({
        id: `streak-${selectedGroup.id}`,
        icon: 'streak',
        title: `${selectedGroup.name} is heating up`,
        detail: `${selectedGroup.name} is on a ${selectedGroupAggregate.longestStreak}-day streak`,
        createdAt: nowIso,
      })
    }

    if (mvpEntry && mvpEntry.group.id === selectedGroup.id) {
      items.push({
        id: `mvp-${selectedGroup.id}`,
        icon: 'mvp',
        title: `New MVP: ${mvpEntry.stats.member.display_name}`,
        detail: `${mvpEntry.stats.member.display_name} is leading the group this week`,
        createdAt: nowIso,
      })
    }

    if (selectedGroupAggregate.activeTodayCount >= 2) {
      items.push({
        id: `checkin-${selectedGroup.id}`,
        icon: 'streak',
        title: `${selectedGroupAggregate.activeTodayCount} members checked in today`,
        detail: 'Daily activity is keeping the group warm.',
        createdAt: nowIso,
      })
    }

    if (selectedGroupRank && selectedGroupRank > 1) {
      const groupAhead = activeGroupAggregates[selectedGroupRank - 2]
      if (groupAhead) {
        const deficit = Math.max(0, groupAhead.score - selectedGroupAggregate.score)
        items.push({
          id: `gap-${selectedGroup.id}`,
          icon: 'rank',
          title: `${deficit} pts behind ${groupAhead.group.name}`,
          detail: `A small run flips you from #${selectedGroupRank} to #${selectedGroupRank - 1}`,
          createdAt: nowIso,
        })
      }
    }

    return items
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5)
  }, [activeGroupAggregates, caseLookup, mvpEntry, selectedGroup, selectedGroupAggregate, selectedGroupRank, solvedCaseIdsByViewer, visibleGuessRows])

  const groupNotifications = useMemo<GroupNotificationItem[]>(() => {
    const items: GroupNotificationItem[] = []

    if (groupAnnouncement && groupAnnouncementKey !== dismissedGroupAnnouncementKey) {
      items.push({
        id: `announcement:${groupAnnouncement.id}`,
        icon: 'announcement',
        title: 'New groups announcement',
        detail: groupAnnouncement.message,
      })
    }

    if (viewerGroup && viewerGroupAggregate) {
      items.push({
        id: `viewer-rank:${viewerGroup.id}:${leaderboardWindow}`,
        icon: 'rank',
        title: viewerGroupRank === 1 ? 'Your group is leading' : 'Your group race update',
        detail: viewerGroupMomentum || 'Every solve can move the board.',
      })

      if (viewerGroupAggregate.currentStreak > 0) {
        items.push({
          id: `viewer-streak:${viewerGroup.id}:${viewerGroupAggregate.currentStreak}`,
          icon: 'streak',
          title: `${viewerGroup.name} is on a streak`,
          detail: `${viewerGroupAggregate.currentStreak}-day group streak with ${viewerGroupAggregate.activeTodayCount} active today.`,
        })
      }

      if (viewerGroupTodaySolvers.length > 0) {
        items.push({
          id: `viewer-activity:${viewerGroup.id}:${today}:${viewerGroupTodaySolvers.join('|')}`,
          icon: 'solve',
          title: 'Your group checked in today',
          detail: viewerGroupTodaySolvers.join(' · '),
        })
      }
    }

    if (mvpEntry) {
      items.push({
        id: `mvp:${mvpEntry.group.id}:${mvpEntry.stats.member.session_id}:${leaderboardWindow}`,
        icon: 'mvp',
        title: `${mvpEntry.stats.member.display_name} is this week’s MVP`,
        detail: `${formatScore(mvpEntry.stats.score)} pts for ${mvpEntry.group.name}.`,
      })
    }

    if (groupActivityFeed.length > 0) {
      const firstLiveItem = groupActivityFeed[0]
      items.push({
        id: `feed:${firstLiveItem.id}`,
        icon: firstLiveItem.icon,
        title: firstLiveItem.title,
        detail: firstLiveItem.detail,
      })
    }

    return items
  }, [
    dismissedGroupAnnouncementKey,
    groupActivityFeed,
    groupAnnouncement,
    groupAnnouncementKey,
    leaderboardWindow,
    mvpEntry,
    today,
    viewerGroup,
    viewerGroupAggregate,
    viewerGroupMomentum,
    viewerGroupRank,
    viewerGroupTodaySolvers,
  ])

  const unreadNotificationCount = groupNotifications.filter(
    item => !seenNotificationIds.includes(item.id)
  ).length

  useEffect(() => {
    setEditGroupName(selectedGroup?.name || '')
  }, [selectedGroup?.id, selectedGroup?.name])

  useEffect(() => {
    setEditDisplayName(viewerMembership?.display_name || localProfile.displayName || '')
    setEditMemberIcon(viewerMembership?.icon || localProfile.icon || DEFAULT_MEMBER_ICON)
  }, [
    localProfile.displayName,
    localProfile.icon,
    viewerMembership?.display_name,
    viewerMembership?.icon,
    viewerMembership?.id,
  ])

  useEffect(() => {
    setIsEditingProfileName(false)
  }, [selectedGroupId, viewerMembership?.id])

  useEffect(() => {
    if (joinTargetGroup && alreadyInJoinTarget) {
      const existingMembership = members.find(
        member => member.group_id === joinTargetGroup.id && member.session_id === sessionId
      )
      setJoinDisplayName(existingMembership?.display_name || joinDisplayName)
      setJoinMemberIcon(existingMembership?.icon || DEFAULT_MEMBER_ICON)
    }
  }, [alreadyInJoinTarget, joinTargetGroup?.id, members, sessionId])

  const displayLeaderboard: DisplayGroup[] =
    activeGroupAggregates.length > 0
      ? activeGroupAggregates.map(entry => ({
          id: entry.group.id,
          name: entry.group.name,
          icon: entry.group.icon,
          members: entry.members.length,
          score: entry.score,
          avgAccuracy: entry.avgAccuracy,
          longestStreak: entry.longestStreak,
        }))
      : []
  const leaderboardEntries = useMemo(() => {
    const query = leaderboardSearch.trim().toLowerCase()
    if (!query) return displayLeaderboard

    return displayLeaderboard.filter(group => {
      const aggregate = activeGroupAggregates.find(entry => entry.group.id === group.id)
      const haystack = [
        group.name,
        ...((aggregate?.memberStats || []).map(entry => entry.member.display_name)),
      ]
        .join(' ')
        .toLowerCase()

      return haystack.includes(query)
    })
  }, [activeGroupAggregates, displayLeaderboard, leaderboardSearch])

  function openGroupInspection(groupId: string) {
    setSelectedMemberStats(null)
    setSelectedGroupId(groupId)
    setYourGroupOpen(true)
    setActiveGroupsTab('my-group')
  }

  function openMvpInspection() {
    if (!mvpEntry) return
    setSelectedGroupId(mvpEntry.group.id)
    setYourGroupOpen(true)
    setSelectedMemberStats(mvpEntry.stats)
  }

  async function syncProfileToAccount(nextDisplayName: string, nextIcon: string | null) {
    if (!accountSession?.accountId) return null

    const response = await fetch('/api/account/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountId: accountSession.accountId,
        displayName: nextDisplayName,
        profileIcon: nextIcon,
      }),
    })

    const payload = await response.json().catch(() => ({}))

    if (!response.ok) {
      throw new Error(payload.error || 'Could not sync your profile right now.')
    }

    const nextSession = payload.account as AccountSession
    setAccountSession(nextSession)
    setAccountSessionState(nextSession)
    return nextSession
  }

  async function repairLinkedAccountIfNeeded() {
    if (!accountSession?.accountId) return

    const anonymousSessionId = getAnonymousSessionId()
    const repairKey = `${accountSession.accountId}:${anonymousSessionId}`

    if (!anonymousSessionId || anonymousSessionId === accountSession.accountId) {
      setAccountRepairKey(repairKey)
      return
    }

    if (accountRepairKey === repairKey) return

    const response = await fetch('/api/account/repair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountId: accountSession.accountId,
        anonymousSessionId,
      }),
    })

    if (response.ok) {
      setAccountRepairKey(repairKey)
      await loadGroupsData()
    }
  }

  async function submitAccountAuth() {
    const username = authUsername.trim()
    const password = authPassword

    if (!username || !password) {
      setMessage('Add a username and password first.')
      return
    }

    setAuthSubmitting(true)
    setMessage('')

    const displayName = editDisplayName.trim() || localProfile.displayName || username
    const profileIcon = editMemberIcon || localProfile.icon || DEFAULT_MEMBER_ICON

    const response = await fetch('/api/account/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: authMode,
        username,
        password,
        displayName,
        profileIcon,
        anonymousSessionId: getAnonymousSessionId(),
      }),
    })

    const payload = await response.json().catch(() => ({}))

    if (!response.ok) {
      setAuthSubmitting(false)
      setMessage(payload.error || 'Could not sign you in.')
      return
    }

    const nextSession = payload.account as AccountSession
    setAccountSession(nextSession)
    setAccountSessionState(nextSession)
    setLocalProfile({
      displayName: nextSession.displayName,
      icon: nextSession.profileIcon || DEFAULT_MEMBER_ICON,
    })
    storeLocalProfile({
      displayName: nextSession.displayName,
      icon: nextSession.profileIcon || DEFAULT_MEMBER_ICON,
    })
    setEditDisplayName(nextSession.displayName)
    setEditMemberIcon(nextSession.profileIcon || DEFAULT_MEMBER_ICON)
    setJoinDisplayName(nextSession.displayName)
    setCreateDisplayName(nextSession.displayName)
    setJoinMemberIcon(nextSession.profileIcon || DEFAULT_MEMBER_ICON)
    setCreateMemberIcon(nextSession.profileIcon || DEFAULT_MEMBER_ICON)
    setAuthPassword('')
    setIdentityVersion(version => version + 1)
    setAuthSubmitting(false)
    setMessage(
      authMode === 'signup'
        ? 'Account created. Your progress is now tied to this login.'
        : 'Signed in. Your progress is now synced to this account.'
    )
  }

  function logoutAccount() {
    clearAccountSession()
    setAccountSessionState(null)
    setAuthPassword('')
    setAuthUsername('')
    setIdentityVersion(version => version + 1)
    setMessage('Signed out. This browser is back on its local profile.')
  }

  async function downloadProgressBackup() {
    if (typeof window === 'undefined') return

    setBackingUp(true)
    setBackupStatus('')

    try {
      const localStorageSnapshot: Record<string, string> = {}

      for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index)
        if (!key || !key.startsWith('orthodle')) continue
        const value = window.localStorage.getItem(key)
        if (value !== null) {
          localStorageSnapshot[key] = value
        }
      }

      const params = new URLSearchParams({
        sessionId,
      })

      if (accountSession?.accountId) {
        params.set('accountId', accountSession.accountId)
      }

      let serverBackup: Record<string, unknown> | null = null
      let usedServerData = false

      try {
        const response = await fetch(`/api/account/backup?${params.toString()}`, {
          cache: 'no-store',
        })
        const payload = await response.json().catch(() => ({}))

        if (response.ok) {
          serverBackup = payload
          usedServerData = true
        }
      } catch {
        serverBackup = null
      }

      const backupPayload = {
        exportedAt: new Date().toISOString(),
        source: 'orthodle-progress-backup',
        identity: {
          accountSession,
          currentSessionId: sessionId,
          anonymousSessionId: getAnonymousSessionId() || null,
        },
        browserData: {
          localStorage: localStorageSnapshot,
        },
        serverBackup,
      }

      const fileDate = new Date().toISOString().slice(0, 10)
      const blob = new Blob([JSON.stringify(backupPayload, null, 2)], {
        type: 'application/json',
      })
      const url = window.URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `orthodle-backup-${fileDate}.json`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.URL.revokeObjectURL(url)

      setBackupStatus(
        usedServerData
          ? 'Backup downloaded with your browser progress and saved account data.'
          : 'Backup downloaded with your browser progress. Server data could not be included right now.'
      )
    } catch {
      setBackupStatus('Could not build your backup right now.')
    } finally {
      setBackingUp(false)
    }
  }

  function dismissGroupAnnouncement() {
    if (!groupAnnouncementKey || typeof window === 'undefined') return
    window.localStorage.setItem(GROUP_ANNOUNCEMENT_DISMISS_KEY, groupAnnouncementKey)
    setDismissedGroupAnnouncementKey(groupAnnouncementKey)
  }

  async function createGroup() {
    const name = createName.trim()
    const displayName = (createDisplayName || joinDisplayName).trim()
    const requestedCode = normalizeJoinCode(createCode.trim())
    const finalCode = requestedCode || makeRandomJoinCode()

    if (!name || !displayName) {
      setMessage('Add a group name and your display name first.')
      return
    }

    if (viewerMembership) {
      setMessage('Leave your current group first, then create a new one.')
      return
    }

    setCreating(true)
    setMessage('')

    const { data: existingCode } = await supabase
      .from('groups')
      .select('id')
      .eq('join_code', finalCode)
      .maybeSingle()

    if (existingCode) {
      setCreating(false)
      setMessage('That invite code is already taken. Try another one.')
      return
    }

    let { data: groupData, error: groupError } = await supabase
      .from('groups')
      .insert({
        name,
        icon: createIcon,
        join_code: finalCode,
        creator_session_id: sessionId,
      })
      .select()
      .single()

    if (groupError?.message.includes('icon')) {
      const fallbackResult = await supabase
        .from('groups')
        .insert({
          name,
          join_code: finalCode,
          creator_session_id: sessionId,
        })
        .select()
        .single()

      groupData = fallbackResult.data
      groupError = fallbackResult.error
    }

    if (groupError || !groupData) {
      setCreating(false)
      setMessage(
        groupError?.message.includes('icon')
          ? 'Run the group icon migration once, then try again.'
          : groupError?.message || 'Could not create the group.'
      )
      return
    }

    let { error: memberError } = await supabase.from('group_members').insert({
      group_id: groupData.id,
      session_id: sessionId,
      display_name: displayName,
      icon: createMemberIcon,
    })

    if (memberError?.message.includes('icon')) {
      const fallbackResult = await supabase.from('group_members').insert({
        group_id: groupData.id,
        session_id: sessionId,
        display_name: displayName,
      })
      memberError = fallbackResult.error
    }

    if (memberError) {
      setCreating(false)
      setMessage(memberError.message)
      return
    }

    if (typeof window !== 'undefined') {
      storeMemberProfile(groupData.id, displayName, createMemberIcon)
      storeLocalProfile({ displayName, icon: createMemberIcon })
    }
    setLocalProfile({ displayName, icon: createMemberIcon })
    if (accountSession?.accountId) {
      try {
        await syncProfileToAccount(displayName, createMemberIcon)
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Group created, but your profile did not sync.')
      }
    }

    setCreateName('')
    setCreateCode('')
    setCreateIcon(DEFAULT_MEMBER_ICON)
    setCreateMemberIcon(DEFAULT_MEMBER_ICON)
    setCreateDisplayName('')
    setJoinDisplayName('')
    setJoinCode('')
    setShowJoinPanel(false)
    setCreating(false)
    setMessage(`Created ${groupData.name}. Group code: ${groupData.join_code}`)
    await loadGroupsData()
    setSelectedGroupId(groupData.id)
    setYourGroupOpen(true)
    router.push(`/groups/${groupData.id}`)
  }

  async function joinGroup() {
    const normalizedCode = normalizeJoinCode(joinCode)
    const displayName = joinDisplayName.trim()

    if (!normalizedCode || !displayName) {
      setMessage('Add the group code and your display name first.')
      return
    }

    setJoining(true)
    setMessage('')

    const targetGroup = groups.find(group => group.join_code === normalizedCode)

    if (!targetGroup) {
      setJoining(false)
      setMessage('That group code does not exist.')
      return
    }

    if (viewerMembership && viewerMembership.group_id !== targetGroup.id) {
      setJoining(false)
      setMessage('Leave your current group first, then join a new one.')
      return
    }

    const existingMembership = members.find(
      member => member.group_id === targetGroup.id && member.session_id === sessionId
    )

    if (existingMembership) {
      let { error } = await supabase
        .from('group_members')
        .update({ display_name: displayName, icon: joinMemberIcon })
        .eq('id', existingMembership.id)

      if (error?.message.includes('icon')) {
        const fallbackResult = await supabase
          .from('group_members')
          .update({ display_name: displayName })
          .eq('id', existingMembership.id)
        error = fallbackResult.error
      }

      if (error) {
        setJoining(false)
        setMessage(error.message)
        return
      }
    } else {
      let { error } = await supabase.from('group_members').insert({
        group_id: targetGroup.id,
        session_id: sessionId,
        display_name: displayName,
        icon: joinMemberIcon,
      })

      if (error?.message.includes('icon')) {
        const fallbackResult = await supabase.from('group_members').insert({
          group_id: targetGroup.id,
          session_id: sessionId,
          display_name: displayName,
        })
        error = fallbackResult.error
      }

      if (error) {
        setJoining(false)
        setMessage(error.message)
        return
      }
    }

    if (typeof window !== 'undefined') {
      storeMemberProfile(targetGroup.id, displayName, joinMemberIcon)
      storeLocalProfile({ displayName, icon: joinMemberIcon })
    }
    setLocalProfile({ displayName, icon: joinMemberIcon })
    if (accountSession?.accountId) {
      try {
        await syncProfileToAccount(displayName, joinMemberIcon)
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Joined the group, but your profile did not sync.')
      }
    }

    setJoinDisplayName('')
    setJoinMemberIcon(DEFAULT_MEMBER_ICON)
    setJoinCode('')
    setShowJoinPanel(false)
    setJoining(false)
    setMessage(existingMembership ? `Updated your name in ${targetGroup.name}.` : `Joined ${targetGroup.name}.`)
    await loadGroupsData()
    setSelectedGroupId(targetGroup.id)
    setYourGroupOpen(true)
    router.push(`/groups/${targetGroup.id}`)
  }

  async function requestInviteToGroup() {
    const targetGroup = groups.find(group => group.id === requestGroupId) || null
    const displayName = requestDisplayName.trim()
    const contactText = requestContact.trim()
    const noteText = requestNote.trim()

    if (!targetGroup || !displayName) {
      setMessage('Choose a group and add your display name first.')
      return
    }

    if (members.some(member => member.group_id === targetGroup.id && member.session_id === sessionId)) {
      setMessage(`You are already in ${targetGroup.name}.`)
      return
    }

    setRequestingInvite(true)
    setMessage('')

    const { data: existingRequest, error: existingRequestError } = await supabase
      .from('group_join_requests')
      .select('id')
      .eq('group_id', targetGroup.id)
      .eq('requester_session_id', sessionId)
      .eq('status', 'open')
      .maybeSingle()

    if (existingRequestError && !existingRequestError.message.toLowerCase().includes('does not exist')) {
      setRequestingInvite(false)
      setMessage(existingRequestError.message)
      return
    }

    if (existingRequest) {
      setRequestingInvite(false)
      setMessage(`You already requested an invite to ${targetGroup.name}.`)
      return
    }

    const { error } = await supabase.from('group_join_requests').insert({
      group_id: targetGroup.id,
      group_name: targetGroup.name,
      requester_session_id: sessionId,
      requester_display_name: displayName,
      requester_icon: requestMemberIcon,
      contact_text: contactText || null,
      note: noteText || null,
      status: 'open',
    })

    if (error) {
      setRequestingInvite(false)
      setMessage(
        error.message.toLowerCase().includes('does not exist')
          ? 'Invite requests are not set up yet. Run the groups request SQL, then try again.'
          : error.message
      )
      return
    }

    if (typeof window !== 'undefined') {
      storeLocalProfile({ displayName, icon: requestMemberIcon })
    }
    setLocalProfile({ displayName, icon: requestMemberIcon })
    setRequestDisplayName('')
    setRequestContact('')
    setRequestNote('')
    setRequestMemberIcon(DEFAULT_MEMBER_ICON)
    setShowJoinPanel(false)
    setRequestingInvite(false)
    setMessage(`Invite request sent for ${targetGroup.name}.`)
  }

  async function updateSelectedGroupName() {
    const nextName = editGroupName.trim()

    if (!selectedGroup || !canEditSelectedGroup || !nextName) {
      setMessage('Only the group leader can rename this group.')
      return
    }

    setSavingGroupName(true)
    setMessage('')

    const { data: updatedGroup, error } = await supabase
      .from('groups')
      .update({ name: nextName })
      .eq('id', selectedGroup.id)
      .select('id, name, icon, join_code, creator_session_id, created_at')
      .maybeSingle()

    if (error) {
      setSavingGroupName(false)
      setMessage(
        error.message.includes('permission') || error.message.includes('policy')
          ? 'Group updates need the Supabase migration to be run once.'
          : error.message
      )
      return
    }

    if (!updatedGroup) {
      setSavingGroupName(false)
      setMessage('Group name did not save. Run the Supabase group migration once, then try again.')
      return
    }

    setGroups(prev =>
      prev.map(group => (group.id === selectedGroup.id ? (updatedGroup as GroupRow) : group))
    )
    setSavingGroupName(false)
    setMessage('Group name updated.')
  }

  async function updateSelectedGroupIcon(nextIcon: string) {
    if (!selectedGroup || !canChangeSelectedGroupIcon) {
      setMessage('Only the group creator can change this icon.')
      return
    }

    setSavingGroupIcon(true)
    setMessage('')

    const { error } = await supabase
      .from('groups')
      .update({ icon: nextIcon })
      .eq('id', selectedGroup.id)

    if (error) {
      setSavingGroupIcon(false)
      setMessage(
        error.message.includes('icon')
          ? 'Icon updates need the group icon database migration to be run once.'
          : error.message
      )
      return
    }

    setGroups(prev =>
      prev.map(group => (group.id === selectedGroup.id ? { ...group, icon: nextIcon } : group))
    )
    setSavingGroupIcon(false)
  }

  async function updateMyDisplayName() {
    const nextName = editDisplayName.trim()

    if (!nextName) {
      setMessage('Add a display name first.')
      return
    }

    setSavingDisplayName(true)
    setMessage('')

    if (!viewerMembership) {
      const nextProfile = {
        displayName: nextName,
        icon: editMemberIcon || localProfile.icon || DEFAULT_MEMBER_ICON,
      }
      if (accountSession?.accountId) {
        try {
          const syncedSession = await syncProfileToAccount(nextName, nextProfile.icon)
          if (syncedSession) {
            setEditDisplayName(syncedSession.displayName)
          }
        } catch (error) {
          setSavingDisplayName(false)
          setMessage(error instanceof Error ? error.message : 'Could not update your profile.')
          return
        }
      }
      setLocalProfile(nextProfile)
      storeLocalProfile(nextProfile)
      setJoinDisplayName(nextName)
      setCreateDisplayName(nextName)
      setSavingDisplayName(false)
      setMessage('Profile updated.')
      return
    }

    const { error } = await supabase
      .from('group_members')
      .update({ display_name: nextName })
      .eq('id', viewerMembership.id)
      .eq('session_id', sessionId)

    if (error) {
      setSavingDisplayName(false)
      setMessage(error.message)
      return
    }

    setMembers(prev =>
      prev.map(member =>
        member.id === viewerMembership.id ? { ...member, display_name: nextName } : member
      )
    )

    if (viewerGroup) {
      storeMemberProfile(viewerGroup.id, nextName, viewerMembership.icon)
    }

    const nextProfile = {
      displayName: nextName,
      icon: viewerMembership.icon || localProfile.icon || DEFAULT_MEMBER_ICON,
    }
    if (accountSession?.accountId) {
      try {
        await syncProfileToAccount(nextName, nextProfile.icon)
      } catch (error) {
        setSavingDisplayName(false)
        setMessage(error instanceof Error ? error.message : 'Could not update your profile.')
        return
      }
    }
    setLocalProfile(nextProfile)
    storeLocalProfile(nextProfile)
    setJoinDisplayName(nextName)
    setCreateDisplayName(nextName)
    setSavingDisplayName(false)
    setMessage('Display name updated.')
  }

  async function updateMyMemberIcon(nextIcon: string) {
    setSavingMemberIcon(true)
    setMessage('')

    if (!viewerMembership) {
      const nextProfile = {
        displayName: editDisplayName.trim() || localProfile.displayName,
        icon: nextIcon,
      }
      if (accountSession?.accountId) {
        try {
          const syncedSession = await syncProfileToAccount(nextProfile.displayName, nextIcon)
          if (syncedSession) {
            setEditDisplayName(syncedSession.displayName)
          }
        } catch (error) {
          setSavingMemberIcon(false)
          setMessage(error instanceof Error ? error.message : 'Could not update your profile.')
          return
        }
      }
      setLocalProfile(nextProfile)
      storeLocalProfile(nextProfile)
      setEditMemberIcon(nextIcon)
      setJoinMemberIcon(nextIcon)
      setCreateMemberIcon(nextIcon)
      setSavingMemberIcon(false)
      return
    }

    const { error } = await supabase
      .from('group_members')
      .update({ icon: nextIcon })
      .eq('id', viewerMembership.id)
      .eq('session_id', sessionId)

    if (error) {
      setSavingMemberIcon(false)
      setMessage(
        error.message.includes('icon')
          ? 'Run the member icon SQL once, then try again.'
          : error.message
      )
      return
    }

    setMembers(prev =>
      prev.map(member =>
        member.id === viewerMembership.id ? { ...member, icon: nextIcon } : member
      )
    )

    if (viewerGroup) {
      storeMemberProfile(viewerGroup.id, viewerMembership.display_name, nextIcon)
    }

    const nextProfile = {
      displayName: viewerMembership.display_name || localProfile.displayName,
      icon: nextIcon,
    }
    if (accountSession?.accountId) {
      try {
        await syncProfileToAccount(nextProfile.displayName, nextIcon)
      } catch (error) {
        setSavingMemberIcon(false)
        setMessage(error instanceof Error ? error.message : 'Could not update your profile.')
        return
      }
    }
    setLocalProfile(nextProfile)
    storeLocalProfile(nextProfile)
    setJoinMemberIcon(nextIcon)
    setCreateMemberIcon(nextIcon)
    setEditMemberIcon(nextIcon)
    setSavingMemberIcon(false)
  }

  async function commitProfileNameEdit() {
    const nextName = editDisplayName.trim()
    if (!nextName) {
      setEditDisplayName(profileDisplayName)
      setIsEditingProfileName(false)
      return
    }

    if (nextName === profileDisplayName) {
      setIsEditingProfileName(false)
      return
    }

    await updateMyDisplayName()
    setIsEditingProfileName(false)
  }

  async function removeMemberFromGroup(member: GroupMemberRow) {
    if (!selectedGroup || !canEditSelectedGroup) {
      setMessage('Only the group leader can remove players.')
      return
    }

    if (member.session_id === sessionId) {
      setMessage('The group leader cannot remove themselves here.')
      return
    }

    const confirmed = window.confirm(`Remove ${member.display_name} from ${selectedGroup.name}?`)
    if (!confirmed) return

    setRemovingMemberId(member.id)
    setMessage('')

    const response = await fetch('/api/groups/remove-member', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        groupId: selectedGroup.id,
        memberId: member.id,
        leaderSessionId: sessionId,
      }),
    })

    const payload = await response.json().catch(() => ({}))

    if (!response.ok) {
      setRemovingMemberId('')
      setMessage(payload.error || 'Could not remove that player.')
      return
    }

    setMembers(prev => prev.filter(entry => entry.id !== member.id))
    setRemovingMemberId('')
    setMessage(`${member.display_name} removed from ${selectedGroup.name}.`)
  }

  async function leaveCurrentGroup() {
    if (!viewerMembership || !viewerGroup) {
      setMessage('You are not in a group right now.')
      return
    }

    const isCreator = viewerGroup.creator_session_id === sessionId
    const memberCount = members.filter(member => member.group_id === viewerGroup.id).length
    const confirmationMessage = isCreator
      ? memberCount <= 1
        ? `Leave ${viewerGroup.name}? Since you are the only member, the group will be deleted.`
        : `Leave ${viewerGroup.name}? Group ownership will transfer to the next member.`
      : `Leave ${viewerGroup.name}? You can join another group afterward.`

    const confirmed = window.confirm(confirmationMessage)
    if (!confirmed) return

    setLeavingGroup(true)
    setMessage('')

    const response = await fetch('/api/groups/leave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        groupId: viewerGroup.id,
        sessionId,
      }),
    })

    const payload = await response.json().catch(() => ({}))

    if (!response.ok) {
      setLeavingGroup(false)
      setMessage(payload.error || 'Could not leave the group.')
      return
    }

    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(membershipKey(viewerGroup.id))
    }

    setSelectedGroupId('')
    setYourGroupOpen(false)
    setShowSelectedGroupIconPicker(false)
    setShowSelectedMemberIconPicker(false)
    setSelectedMemberStats(null)
    setLeavingGroup(false)
    setMessage(
      payload.deletedGroup
        ? `${viewerGroup.name} was removed after you left.`
        : `You left ${viewerGroup.name}.`
    )
    await loadGroupsData()
  }

  async function submitGroupForm() {
    if (groupActionMode === 'join') {
      await joinGroup()
      return
    }

    if (groupActionMode === 'request') {
      await requestInviteToGroup()
      return
    }

    await createGroup()
  }

  async function shareInviteLink(group: GroupRow) {
    const link = buildInviteLink(group.join_code)
    const shareText = buildInviteMessage(group)

    if (navigator.share) {
      try {
        await navigator.share({
          title: `Orthodle group invite: ${group.name}`,
          text: shareText,
          url: link,
        })
        setCopiedCode(group.id)
        window.setTimeout(() => setCopiedCode(''), 1800)
        return
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }
      }
    }

    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(shareText)
        setCopiedCode(group.id)
        setMessage('Text invite copied.')
      } catch {
        setMessage(`Group code: ${group.join_code}`)
      }
    } else {
      setMessage(`Group code: ${group.join_code}`)
    }
    window.setTimeout(() => setCopiedCode(''), 1800)
  }

  function dismissTopMessage() {
    if (!message || typeof window === 'undefined') {
      setMessage('')
      return
    }

    const nextDismissedMessages = Array.from(new Set([...dismissedMessages, message]))
    setDismissedMessages(nextDismissedMessages)
    window.localStorage.setItem(
      GROUP_DISMISSED_MESSAGES_KEY,
      JSON.stringify(nextDismissedMessages)
    )
    setMessage('')
  }

  function openNotificationsPanel() {
    setShowNotificationsPanel(true)
    if (typeof window === 'undefined' || groupNotifications.length === 0) return

    const nextSeenIds = Array.from(new Set([...seenNotificationIds, ...groupNotifications.map(item => item.id)]))
    setSeenNotificationIds(nextSeenIds)
    window.localStorage.setItem(GROUP_NOTIFICATIONS_SEEN_KEY, JSON.stringify(nextSeenIds))
  }

  return (
    <main className="app-surface min-h-screen">
      <GroupsTopBanner
        activeTab={activeGroupsTab}
        onOpenHowItWorks={() => setShowGroupsExplainer(true)}
        onOpenUpdates={openNotificationsPanel}
        unreadNotificationCount={unreadNotificationCount}
        onTabChange={tab => {
          if (tab === 'my-group') {
            if (viewerGroup?.id) {
              setSelectedGroupId(viewerGroup.id)
              setActiveGroupsTab('my-group')
              setShowJoinPanel(false)
              setMessage('')
              return
            }

            setSelectedGroupId('')
            setActiveGroupsTab('my-group')
            setGroupActionMode('join')
            setShowJoinPanel(true)
            setMessage('Join or create a group to unlock your private leaderboard.')
            return
          }

          setActiveGroupsTab(tab)
          setShowJoinPanel(false)
        }}
      />

      {groupAnnouncement && groupAnnouncementKey !== dismissedGroupAnnouncementKey ? (
        <section className="mx-auto max-w-[760px] px-4 pt-3 sm:px-5">
          <div className="rounded-2xl border border-[#ead9b7] bg-[#fffaf1] px-4 py-3 text-[13px] leading-5 text-[#102018] shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#637268]">
                  Groups announcement
                </div>
                <div className="mt-1.5">{groupAnnouncement.message}</div>
              </div>
              <button
                type="button"
                onClick={dismissGroupAnnouncement}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#e2d5bb] bg-white/70 text-[#637268] transition hover:bg-white"
                aria-label="Dismiss groups announcement"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {showGroupsExplainer ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0b130fcc] px-3 py-0 backdrop-blur-sm sm:items-center sm:py-6">
          <div className="w-full max-w-[420px] rounded-t-[24px] border border-[#e6dfd3] bg-white p-4 shadow-[0_24px_70px_rgba(16,32,24,0.22)] sm:rounded-[24px] sm:p-5">
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-[#ddd5c9] sm:hidden" />
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#637268]">
                  Groups
                </div>
                <h2 className="mt-1 font-serif text-[25px] font-semibold tracking-[-0.04em] text-[#102018]">
                  Compete with friends
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  window.localStorage.setItem(GROUPS_EXPLAINER_STORAGE_KEY, 'true')
                  setShowGroupsExplainer(false)
                }}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#e6dfd3] text-[#637268] transition hover:-translate-y-0.5 hover:bg-[#fcfbf8]"
                aria-label="Close groups explanation"
              >
                <X size={15} strokeWidth={2} />
              </button>
            </div>
            <div className="mt-4 space-y-2 text-[13px] leading-5 text-[#536158]">
              <p>Create a group for your class, residency, rotation, or friends.</p>
              <p>Your group gets its own leaderboard, member rankings, activity feed, and weekly score race.</p>
              <p>Simple scoring: 10 points per solve, plus small bonuses for first try, streaks, and efficient guesses.</p>
              <p>Group score is based on member averages, so bigger groups do not get an automatic advantage.</p>
              <p>Share your invite link so teammates can join in one tap.</p>
              <p>Leaderboards reset Sunday at 11:59pm PST.</p>
            </div>
            <button
              type="button"
              onClick={() => {
                window.localStorage.setItem(GROUPS_EXPLAINER_STORAGE_KEY, 'true')
                setShowGroupsExplainer(false)
              }}
              className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-full border border-[#2d7651] bg-[#2d7651] text-[13px] font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#255e42]"
            >
              Got it
            </button>
          </div>
        </div>
      ) : null}

      {showLeaderboardScoringGuide ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0b130fcc] px-3 py-0 backdrop-blur-sm sm:items-center sm:py-6">
          <div className="w-full max-w-[430px] rounded-t-[24px] border border-[#e6dfd3] bg-white p-4 shadow-[0_24px_70px_rgba(16,32,24,0.22)] sm:rounded-[24px] sm:p-5">
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-[#ddd5c9] sm:hidden" />
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#637268]">
                  This week
                </div>
                <h2 className="mt-1 font-serif text-[25px] font-semibold tracking-[-0.04em] text-[#102018]">
                  How group scoring works
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowLeaderboardScoringGuide(false)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#e6dfd3] text-[#637268] transition hover:-translate-y-0.5 hover:bg-[#fcfbf8]"
                aria-label="Close scoring guide"
              >
                <X size={15} strokeWidth={2} />
              </button>
            </div>
            <div className="mt-4 space-y-3 text-[13px] leading-5 text-[#536158]">
              <p>Each member builds a personal score, then the group leaderboard uses the team average plus a teamwork bonus for active members.</p>
              <div className="rounded-[18px] border border-[#ece6db] bg-[#fcfbf8] p-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#637268]">
                  Points per member
                </div>
                <div className="mt-2 space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <span>Each solved case</span>
                    <span className="font-semibold text-[#102018]">+{groupScoringSettings.solvePoints}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>First-try solve bonus</span>
                    <span className="font-semibold text-[#102018]">+{groupScoringSettings.firstTryPoints}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Daily streak bonus</span>
                    <span className="font-semibold text-[#102018]">+{groupScoringSettings.streakPoints}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Efficiency bonus per guess under {groupScoringSettings.efficiencyBaseline}</span>
                    <span className="font-semibold text-[#102018]">+{groupScoringSettings.efficiencyPointsPerGuess}</span>
                  </div>
                </div>
              </div>
              <div className="rounded-[18px] border border-[#ece6db] bg-[#fcfbf8] p-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#637268]">
                  Teamwork boost
                </div>
                <p className="mt-2">
                  After member scores are averaged, the group gets an activity boost of{' '}
                  <span className="font-semibold text-[#102018]">
                    +{groupScoringSettings.teamworkBonusPerMember}
                  </span>{' '}
                  for each active member, capped at{' '}
                  <span className="font-semibold text-[#102018]">
                    +{groupScoringSettings.teamworkBonusMax}
                  </span>.
                </p>
              </div>
              <p>The goal is to reward both strong individual solving and consistent team participation.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowLeaderboardScoringGuide(false)}
              className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-full border border-[#2d7651] bg-[#2d7651] text-[13px] font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#255e42]"
            >
              Got it
            </button>
          </div>
        </div>
      ) : null}

      <section className="mx-auto max-w-[760px] px-2.5 py-2.5 sm:px-5 sm:py-5">
        {message && !dismissedMessages.includes(message) ? (
          <div className="mb-3 rounded-2xl border border-[#e7e1d6] bg-white px-3 py-2.5 text-[13px] text-[#355542] shadow-[0_10px_24px_rgba(16,32,24,0.04)] sm:mb-4 sm:px-4 sm:py-3 sm:text-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">{message}</div>
              <button
                type="button"
                onClick={dismissTopMessage}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#e6dfd3] bg-[#fbfaf7] text-[#637268] transition hover:bg-white"
                aria-label="Dismiss message"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        ) : null}

        {groupHeaderSurvey.survey && !groupHeaderSurvey.submittedChoice ? (
          <div className="mb-3 rounded-2xl border border-[#ead9b7] bg-[#fffaf1] px-3 py-3 text-center shadow-[0_10px_24px_rgba(16,32,24,0.04)] sm:mb-4 sm:px-4">
            <div className="mx-auto max-w-[620px]">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#637268]">
                Groups survey
              </div>
              <p className="mt-1.5 text-[12px] leading-5 text-[#102018] sm:text-[13px]">
                {groupHeaderSurvey.survey.question}
              </p>
              <div
                className={`mt-3 grid gap-2 ${
                  (groupHeaderSurvey.survey.options || []).length > 3 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-3'
                }`}
              >
                {(groupHeaderSurvey.survey.options || []).map(option => {
                  const isSelected = groupHeaderSurvey.submittedChoice === option
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => void submitGroupHeaderSurvey(option)}
                      disabled={Boolean(groupHeaderSurvey.submittedChoice) || groupHeaderSurvey.isSubmitting}
                      className={`rounded-xl border px-3 py-2 text-[11px] font-semibold transition ${
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
              {groupHeaderSurvey.status ? (
                <p className="mt-2 text-[11px] font-medium text-[#1f6448]">{groupHeaderSurvey.status}</p>
              ) : null}
            </div>
          </div>
        ) : null}

        {latestCompletedHonor ? (
          <section className="mb-3 overflow-hidden rounded-[22px] border border-[#e2b670] bg-[radial-gradient(circle,rgba(255,240,214,0.16)_1.4px,transparent_1.4px),linear-gradient(145deg,#d47b2a,#b95f1f_52%,#8f4316)] [background-position:0_0,0_0] [background-size:28px_28px,auto] px-3 py-3 text-white shadow-[0_18px_38px_rgba(143,67,22,0.28)] sm:mb-4 sm:px-4 sm:py-4">
            <div className="flex flex-col items-center justify-center gap-2 text-center">
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#fff1c9]">
                  Winners banner
                </div>
                <div className="mt-1 font-serif text-[22px] font-bold tracking-[-0.05em] sm:text-[26px]">
                  {latestCompletedHonor.group_name}
                </div>
                <div className="mt-1 text-[12px] text-[#fff0df]">
                  Group of the Week · {formatWeekRangeLabel(latestCompletedHonor.week_start, latestCompletedHonor.week_end)}
                </div>
              </div>
              <div className="flex items-center justify-center gap-2 text-[12px] text-[#fff6ea]">
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#fff1c9]">
                  MVP
                </span>
                <span className="text-[18px] leading-none">{latestCompletedHonor.mvp_icon || '🏆'}</span>
                <span className="font-semibold text-white">
                  {latestCompletedHonor.mvp_display_name || 'No MVP recorded'}
                </span>
              </div>
            </div>
          </section>
        ) : null}

        <div className="mb-3 hidden flex-wrap items-center justify-end gap-2 sm:mb-4 sm:hidden">
          <button
            type="button"
            onClick={() => setShowGroupsExplainer(true)}
            aria-label="How it works"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#e6dfd3] bg-white text-[#102018] transition hover:bg-[#fbfaf7]"
          >
            <Info size={14} strokeWidth={2.2} />
          </button>
          <button
            type="button"
            onClick={openNotificationsPanel}
            aria-label="Updates"
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#e6dfd3] bg-white text-[#102018] transition hover:bg-[#fbfaf7]"
          >
            <Bell size={14} strokeWidth={2.2} />
            {unreadNotificationCount > 0 ? (
              <span className="absolute -right-1 -top-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-[#1f6448] px-1.5 text-[10px] font-bold text-white">
                {unreadNotificationCount}
              </span>
            ) : null}
          </button>
        </div>

        {loading ? (
          <section className="rounded-[20px] border border-[#e7e1d6] bg-white p-4 text-center shadow-[0_14px_34px_rgba(16,32,24,0.05)]">
            <div className="mx-auto h-2 w-24 rounded-full bg-[#e8e1d6]" />
            <div className="mx-auto mt-3 h-2 w-36 rounded-full bg-[#f1ece3]" />
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-[#637268]">
              Loading groups
            </p>
          </section>
        ) : activeGroupsTab === 'home' ? (
          <div className="space-y-2.5 sm:space-y-3.5">
            <div className="grid grid-cols-1 gap-2.5 sm:gap-4 lg:grid-cols-[0.92fr_1.55fr]">
              <button
                type="button"
                onClick={() => groupOfWeekAggregate && openGroupInspection(groupOfWeekAggregate.group.id)}
                disabled={!groupOfWeekAggregate}
                className="relative overflow-hidden rounded-[18px] bg-[radial-gradient(circle_at_50%_22%,rgba(255,214,89,0.22),transparent_28%),linear-gradient(145deg,#0b4d36,#042f22)] p-3 text-center text-white shadow-[0_12px_28px_rgba(4,47,34,0.18)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_34px_rgba(4,47,34,0.22)] disabled:cursor-default sm:rounded-[20px] sm:p-4"
              >
                <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle,#e9b93f_1.5px,transparent_1.5px)] [background-size:34px_34px]" />
                <div className="relative">
                  <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#f0c247]">
                    Group of the week
                  </div>
                  <div className="mx-auto mt-2.5 flex h-14 w-14 items-center justify-center rounded-full border-2 border-[#f0c247] bg-[#ffffff12] text-[32px] shadow-[0_10px_22px_rgba(0,0,0,0.14)] sm:mt-3 sm:h-24 sm:w-24 sm:text-[52px]">
                    🏆
                  </div>
                  <h2 className="mt-2.5 font-serif text-[20px] font-bold tracking-[-0.05em] sm:mt-3 sm:text-[24px]">
                    {groupOfWeekAggregate?.group.name || 'No champion yet'}
                  </h2>
                  <p className="mt-1 text-[11px] text-[#e4efe9]">{weekRange.label}</p>
                  {currentGroupTitleCount > 0 ? (
                    <div className="mt-2 inline-flex rounded-full border border-[#f0c247]/45 bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#f7df95]">
                      {currentGroupTitleCount} title{currentGroupTitleCount === 1 ? '' : 's'} won
                    </div>
                  ) : null}
                  <div className="mx-auto mt-3 flex max-w-[138px] items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/8 px-2 py-1.5 sm:max-w-[160px] sm:py-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-xl bg-[#ffffff12] text-sm">
                      ↗
                    </span>
                    <div className="text-left">
                      <div className="font-serif text-base font-bold leading-none sm:text-lg">
                        {formatScore(groupOfWeekAggregate?.score || 0)}
                      </div>
                      <div className="text-[8px] font-bold uppercase tracking-[0.16em] text-[#d7e6de] sm:text-[9px]">
                        team score
                      </div>
                    </div>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={openMvpInspection}
                disabled={!mvpEntry}
                className="orthodle-mvp-card relative overflow-hidden rounded-[18px] border border-[#d9c9a6] bg-[radial-gradient(circle_at_16%_18%,rgba(240,194,71,0.22),transparent_22%),radial-gradient(circle_at_84%_16%,rgba(255,255,255,0.18),transparent_18%),radial-gradient(circle_at_52%_78%,rgba(45,118,81,0.09),transparent_26%),linear-gradient(145deg,#fffaf0,#f5fbf5_46%,#fff7eb)] p-3 text-left shadow-[0_16px_34px_rgba(16,32,24,0.08)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_42px_rgba(16,32,24,0.12)] disabled:cursor-default sm:rounded-[20px] sm:p-4"
              >
                <div className="absolute inset-0 opacity-45 [background-image:radial-gradient(circle,rgba(214,154,40,0.16)_1.2px,transparent_1.2px)] [background-size:30px_30px]" />
                <div className="absolute bottom-5 right-5 h-16 w-16 rounded-full bg-[radial-gradient(circle,rgba(45,118,81,0.14),transparent_72%)] blur-xl sm:h-24 sm:w-24" />
                <div className="text-center text-[9px] font-bold uppercase tracking-[0.18em] text-[#d69a28]">
                  MVP player
                </div>
                {mvpEntry ? (
                  <div className="relative mt-2.5 grid gap-2 md:grid-cols-[1fr_1px_1fr] md:items-center">
                    <div className="text-center">
                      <div className="orthodle-mvp-avatar relative mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-[#e4b64b] bg-[#fbf7ef] shadow-[0_12px_26px_rgba(16,32,24,0.08)] sm:h-24 sm:w-24">
                        <div className="absolute -top-4 text-[23px] sm:-top-5 sm:text-[28px]">👑</div>
                        <IconMark
                          value={mvpEntry.stats.member.icon}
                          fallback={mvpEntry.stats.member.display_name.slice(0, 1).toUpperCase()}
                          className="text-[34px] sm:text-[48px]"
                        />
                      </div>
                      <h2 className="mt-2 font-serif text-[18px] font-bold tracking-[-0.05em] text-[#102018] sm:mt-2.5 sm:text-[22px]">
                        {mvpEntry.stats.member.display_name}
                      </h2>
                      <p className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.14em] text-[#637268] sm:text-[10px]">
                        {mvpEntry.group.name}
                      </p>
                      {currentMvpWinCount > 0 ? (
                        <div className="mt-2 inline-flex rounded-full border border-[#edd39b] bg-[#fff7df] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#7d5a12]">
                          {currentMvpWinCount} MVP win{currentMvpWinCount === 1 ? '' : 's'}
                        </div>
                      ) : null}
                    </div>

                    <div className="orthodle-mvp-divider hidden h-full bg-[#ece6db] md:block" />

                    <div className="grid grid-cols-2 gap-2 md:block md:space-y-2">
                      {[
                        {
                          Icon: Star,
                          value: formatScore(mvpEntry.stats.score),
                          label: 'Pts',
                        },
                        {
                          Icon: Target,
                          value:
                            mvpEntry.stats.totalGuesses > 0
                              ? `${Math.round((mvpEntry.stats.correctGuesses / mvpEntry.stats.totalGuesses) * 100)}%`
                              : '—',
                          label: 'Accuracy',
                        },
                        {
                          Icon: Zap,
                          value: mvpEntry.stats.firstTrySolves,
                          label: 'First try solves',
                        },
                        {
                          Icon: Flame,
                          value: mvpEntry.stats.longestStreak,
                          label: 'Day streak',
                        },
                      ].map(item => {
                        const StatIcon = item.Icon

                        return (
                          <div key={item.label} className="orthodle-mvp-stat flex items-center gap-2 rounded-[16px] border border-[#eadfca] bg-white/76 px-2.5 py-2 backdrop-blur-sm md:border-[#efe4cf] md:bg-white/58 md:px-2.5 md:py-2">
                            <div className="orthodle-mvp-stat-icon flex h-8 w-8 items-center justify-center rounded-full border border-[#d9eadf] bg-[linear-gradient(145deg,#edf8f1,#fffaf1)] text-[#1f6448] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] sm:h-9 sm:w-9">
                              <StatIcon size={15} strokeWidth={2.2} />
                            </div>
                            <div>
                              <div className="font-serif text-[16px] font-bold leading-none text-[#102018] sm:text-[20px]">
                                {item.value}
                              </div>
                              <div className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.12em] text-[#637268] sm:text-[9px]">
                                {item.label}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-dashed border-[#e6dfd3] bg-[#fcfbf8] px-3 py-6 text-center text-xs text-[#637268]">
                    No MVP yet. First correct solves this week will crown one.
                  </div>
                )}
              </button>
            </div>

            {!viewerGroup ? (
              <section className="rounded-[20px] border border-[#e7e1d6] bg-white p-3 shadow-[0_14px_34px_rgba(16,32,24,0.05)] sm:p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#102018]">
                      Start your group
                    </div>
                    <div className="mt-1 max-w-[470px] text-[12px] leading-5 text-[#637268]">
                      Join a residency, class, or friend group to unlock member rankings, invite links, and your private team board.
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        setGroupActionMode('join')
                        setShowJoinPanel(true)
                      }}
                      className="rounded-full border border-[#e6dfd3] bg-[#fcfbf8] px-3 py-1.5 text-[11px] font-semibold text-[#102018] transition hover:bg-white"
                    >
                      Join with code
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setGroupActionMode('create')
                        setShowJoinPanel(true)
                      }}
                      className="rounded-full border border-[#2d7651] bg-[#2d7651] px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-[#255e42]"
                    >
                      Create group
                    </button>
                  </div>
                </div>
              </section>
            ) : null}

            <section className="rounded-[20px] border border-[#e7e1d6] bg-white p-3 shadow-[0_14px_34px_rgba(16,32,24,0.05)] sm:p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#102018]">
                  Leaderboard
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                        setLeaderboardWindow(current => (current === 'week' ? 'all-time' : 'week'))
                      }
                      className="rounded-full border border-[#e6dfd3] px-3 py-1.5 text-xs font-semibold text-[#102018] transition hover:bg-[#fbfaf7]"
                    >
                      {leaderboardWindow === 'week' ? 'This week' : 'All time'}⌄
                    </button>
                  <button
                    type="button"
                    onClick={() => setShowLeaderboardScoringGuide(true)}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-[#e6dfd3] text-[#637268] transition hover:bg-[#fbfaf7]"
                    aria-label="Show leaderboard scoring guide"
                  >
                    <Info size={14} />
                  </button>
                </div>
              </div>

              <div className="mt-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <input
                  value={leaderboardSearch}
                  onChange={event => setLeaderboardSearch(event.target.value)}
                  placeholder="Search groups or members"
                  className="w-full rounded-[12px] border border-[#dfd8cb] bg-[#fcfbf8] px-3 py-2 text-[12px] text-[#102018] outline-none transition placeholder:text-[#8b938d] focus:border-[#2d7651] sm:max-w-[270px]"
                />
                <div className="text-[10px] text-[#637268] sm:text-[11px]">
                  {leaderboardEntries.length} {leaderboardEntries.length === 1 ? 'group' : 'groups'}
                </div>
              </div>

              <div className="mt-3 space-y-2">
                {loading ? (
                  Array.from({ length: 5 }).map((_, index) => (
                    <div key={index} className="h-[58px] rounded-2xl bg-[#fcfbf8]" />
                  ))
                ) : leaderboardEntries.length > 0 ? (
                  leaderboardEntries.map((group, index) => {
                    const rank = index + 1
                    return (
                      <button
                        key={group.id}
                        type="button"
                        onClick={() => {
                          setSelectedGroupId(group.id)
                          setActiveGroupsTab('my-group')
                        }}
                        className={`grid w-full grid-cols-[30px_34px_minmax(0,1fr)] items-center gap-2 rounded-2xl border px-2.5 py-2 text-left transition hover:-translate-y-0.5 sm:grid-cols-[42px_46px_minmax(0,1fr)_86px_86px_76px] sm:gap-2.5 sm:px-3.5 ${
                          rank === 1 ? 'border-[#e7b83f] bg-[#fffdf8]' : 'border-[#ece6db] bg-white'
                        }`}
                      >
                        <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${rankCircleClass(rank)}`}>
                          {rank}
                        </div>
                        <GroupCrest group={group} size="xs" />
                        <div className="min-w-0">
                          <div className="line-clamp-2 pr-1 font-serif text-[14px] font-bold leading-tight text-[#102018] sm:truncate sm:text-[17px]">
                            {group.name}
                          </div>
                          <div className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.12em] text-[#637268]">
                            {formatMemberCount(group.members)}
                          </div>
                        </div>
                        <div className="col-span-2 col-start-2 mt-1 flex items-center justify-between border-t border-[#f1ece2] pt-1.5 sm:col-span-1 sm:col-start-auto sm:mt-0 sm:block sm:border-t-0 sm:pt-0 sm:text-right">
                          <div className="text-[8px] font-bold uppercase tracking-[0.12em] text-[#637268] sm:hidden">
                            team score
                          </div>
                          <div className="font-serif text-[17px] font-bold leading-none text-[#102018] sm:text-[21px]">
                            {formatScore(group.score)}
                          </div>
                          <div className="mt-0.5 hidden text-[8px] font-bold uppercase tracking-[0.12em] text-[#637268] sm:block">
                            team score
                          </div>
                        </div>
                        <div className="hidden text-center sm:block">
                          <div className="font-serif text-[19px] font-bold leading-none text-[#102018] sm:text-[21px]">
                            {group.avgAccuracy !== null ? `${Math.round(group.avgAccuracy)}%` : '—'}
                          </div>
                          <div className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.12em] text-[#637268]">
                            accuracy
                          </div>
                        </div>
                        <div className="hidden text-center sm:block">
                          <div className="font-serif text-[19px] font-bold leading-none text-[#102018] sm:text-[21px]">
                            {group.longestStreak}
                          </div>
                          <div className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.12em] text-[#637268]">
                            day streak
                          </div>
                        </div>
                      </button>
                    )
                  })
                ) : (
                  <div className="rounded-2xl border border-dashed border-[#e6dfd3] bg-[#fcfbf8] px-4 py-8 text-center text-sm text-[#637268]">
                    {leaderboardSearch.trim()
                      ? 'No groups match that search yet.'
                      : 'No groups yet. Create one and take the crown.'}
                  </div>
                )}
              </div>
            </section>
          </div>
        ) : null}

        {!loading && activeGroupsTab === 'my-group' ? (
          <div className="space-y-3.5 sm:space-y-4">
            {selectedGroup && selectedGroupAggregate ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setActiveGroupsTab('home')
                    setShowSelectedGroupIconPicker(false)
                    setSelectedMemberStats(null)
                  }}
                  className="inline-flex h-9 items-center gap-2 self-start rounded-full border border-[#e6dfd3] bg-white px-3.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[#355542] transition hover:-translate-y-0.5 hover:bg-[#fbfaf7]"
                >
                  <span aria-hidden="true">←</span>
                  Back to groups
                </button>
                <section className="overflow-hidden rounded-[24px] border border-[#d9c9a6] bg-[radial-gradient(circle_at_12%_18%,rgba(255,214,89,0.14),transparent_26%),radial-gradient(circle_at_88%_14%,rgba(255,255,255,0.08),transparent_22%),linear-gradient(145deg,#0e5a3f,#063928)] p-3 text-white shadow-[0_18px_38px_rgba(6,57,40,0.24)] sm:p-5">
                  <div className="flex flex-col gap-3 sm:gap-4">
                    <div className="flex flex-col gap-3.5 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex min-w-0 items-start gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            if (!canChangeSelectedGroupIcon) return
                            setShowSelectedGroupIconPicker(prev => !prev)
                          }}
                          className={`${canChangeSelectedGroupIcon ? 'transition hover:-translate-y-0.5' : ''}`}
                          aria-label={canChangeSelectedGroupIcon ? 'Change group icon' : 'Group icon'}
                        >
                          <div className="relative rounded-full border-2 border-[#efbf48] p-1">
                            <div className="flex h-20 w-20 items-center justify-center sm:h-28 sm:w-28">
                              <GroupCrest group={selectedGroup} size="lg" />
                            </div>
                            {canChangeSelectedGroupIcon ? (
                              <span className="absolute bottom-1 right-1 flex h-7 w-7 items-center justify-center rounded-full border border-[#d8cfbf] bg-white text-[#0e5a3f] shadow-[0_8px_18px_rgba(16,32,24,0.16)] sm:h-8 sm:w-8">
                                <Pencil size={13} strokeWidth={2.2} />
                              </span>
                            ) : null}
                          </div>
                        </button>
                        <div className="min-w-0 flex-1 pt-0.5">
                          <h1 className="break-words font-serif text-[21px] font-bold leading-[1.02] tracking-[-0.05em] text-white sm:text-[31px] sm:leading-none">
                            {selectedGroup.name}
                          </h1>
                          <p className="mt-0.5 text-[13px] text-[#e3efe8] sm:mt-1 sm:text-sm">
                            {formatMemberCount(selectedGroupAggregate.members.length)}
                          </p>
                          <p className="mt-1.5 max-w-[16rem] text-[12px] font-medium leading-[1.35] text-[#f6efe0] sm:mt-2 sm:max-w-none sm:text-sm">
                            "{getGroupTagline(selectedGroupRank)}"
                          </p>
                        </div>
                      </div>

                    <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:self-auto">
                      <button
                        type="button"
                        onClick={() =>
                          setLeaderboardWindow(current => (current === 'week' ? 'all-time' : 'week'))
                        }
                          className="inline-flex h-9 min-w-0 items-center justify-center rounded-full border border-[#e7d4a7]/50 bg-white/8 px-3 text-[11px] font-bold text-white transition hover:bg-white/12 sm:h-10 sm:flex-none sm:px-4 sm:text-xs"
                        >
                          {leaderboardWindow === 'week' ? 'This week' : 'All time'}⌄
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowLeaderboardScoringGuide(true)}
                        className="inline-flex h-9 items-center justify-center rounded-full border border-[#e7d4a7]/50 bg-white/8 text-white transition hover:bg-white/12 sm:h-10 sm:w-10"
                        aria-label="Show leaderboard scoring guide"
                      >
                        <Info size={14} />
                      </button>
                    {isViewingOwnGroup ? (
                      <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
                        <button
                          type="button"
                          onClick={() => void shareInviteLink(selectedGroup)}
                          className="inline-flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-full border border-[#e7d4a7]/50 bg-white/8 px-3 text-[11px] font-bold text-white transition hover:bg-white/12 sm:h-10 sm:flex-none sm:gap-2 sm:px-4 sm:text-xs"
                        >
                          <Share2 size={13} strokeWidth={2} />
                          {copiedCode === selectedGroup.id ? 'Copied' : 'Invite'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void leaveCurrentGroup()}
                          disabled={leavingGroup}
                          className="inline-flex h-9 min-w-0 items-center justify-center rounded-full border border-[#f2d4c2]/70 bg-white/10 px-3 text-[11px] font-bold text-[#fff2ea] transition hover:bg-white/16 disabled:cursor-not-allowed disabled:opacity-60 sm:h-10 sm:flex-none sm:px-4 sm:text-xs"
                        >
                          {leavingGroup ? 'Leaving...' : 'Leave'}
                        </button>
                      </div>
                    ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setRequestGroupId(selectedGroup.id)
                            setGroupActionMode('request')
                            setShowJoinPanel(true)
                          }}
                          className="inline-flex h-9 min-w-0 items-center justify-center rounded-full border border-[#e7d4a7]/50 bg-white/8 px-3 text-[11px] font-bold text-white transition hover:bg-white/12 sm:h-10 sm:flex-none sm:px-4 sm:text-xs"
                        >
                          Request invite
                        </button>
                      )}
                    </div>
                    </div>
                  </div>

                  {showSelectedGroupIconPicker && canChangeSelectedGroupIcon ? (
                    <div className="orthodle-icon-scroll mt-3 max-h-[16rem] overflow-y-auto rounded-2xl border border-white/12 bg-white/8 p-2.5 pb-3 sm:mt-4 sm:max-h-52">
                      <IconSectionGrid
                        selectedIcon={selectedGroup.icon || DEFAULT_MEMBER_ICON}
                        onSelect={icon => {
                          void updateSelectedGroupIcon(icon)
                          setShowSelectedGroupIconPicker(false)
                        }}
                        disabled={savingGroupIcon}
                        ariaLabelPrefix="Use group icon"
                        tone="dark"
                      />
                    </div>
                  ) : null}

                  <div className="mt-3 grid grid-cols-3 divide-x divide-white/18 border-t border-white/14 pt-3 text-center sm:mt-5 sm:pt-4">
                    <div className="px-2">
                      <div className="font-serif text-[20px] font-bold leading-none text-white sm:text-[24px]">
                        #{selectedGroupRank || '—'}
                      </div>
                      <div className="mt-1 text-[7px] font-bold uppercase tracking-[0.1em] text-[#dfece5] sm:text-[9px] sm:tracking-[0.14em]">
                        of {activeGroupAggregates.length} groups
                      </div>
                    </div>
                    <div className="px-2">
                      <div className="font-serif text-[20px] font-bold leading-none text-white sm:text-[24px]">
                        {formatScore(selectedGroupAggregate.score)}
                      </div>
                      <div className="mt-1 text-[7px] font-bold uppercase tracking-[0.1em] text-[#dfece5] sm:text-[9px] sm:tracking-[0.14em]">
                        pts {leaderboardWindow === 'week' ? 'this week' : 'all time'}
                      </div>
                    </div>
                    <div className="px-2">
                      <div className="font-serif text-[20px] font-bold leading-none text-white sm:text-[24px]">
                        {selectedGroupAggregate.longestStreak}
                      </div>
                      <div className="mt-1 text-[7px] font-bold uppercase tracking-[0.1em] text-[#dfece5] sm:text-[9px] sm:tracking-[0.14em]">
                        day streak
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 rounded-[16px] border border-white/12 bg-white/6 px-3 py-2.5">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#dfece5]">
                        Weekly momentum
                      </div>
                      <div className="text-[11px] font-semibold text-white sm:text-[12px]">
                        {selectedGroupMomentum || 'Keep stacking solves.'}
                      </div>
                    </div>
                    <div className="mt-1 text-[11px] text-[#dbe8e1] sm:text-[12px]">
                      {selectedWeeklyGroupAggregate?.currentStreak || 0}-day group streak ·{' '}
                      {selectedWeeklyGroupAggregate?.activeTodayCount || 0} active today
                    </div>
                  </div>
                </section>

                {weeklyHonorsEnabled ? (
                  <section className="rounded-[20px] border border-[#e7e1d6] bg-white p-3 shadow-[0_14px_34px_rgba(16,32,24,0.05)] sm:p-4">
                    <div className="grid gap-2.5 lg:grid-cols-[1.1fr_0.9fr]">
                      <div className="rounded-[18px] border border-[#eadfca] bg-[linear-gradient(135deg,#fffaf0,#fcfbf8)] px-3 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#d69a28]">
                              MVP spotlight
                            </div>
                            <div className="mt-1 font-serif text-[18px] font-bold tracking-[-0.03em] text-[#102018]">
                              MVP winners in {selectedGroup.name}
                            </div>
                          </div>
                          <div className="rounded-full border border-[#edd39b] bg-[#fff7df] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#7d5a12]">
                            {selectedGroupMvpHistory.length} winner{selectedGroupMvpHistory.length === 1 ? '' : 's'}
                          </div>
                        </div>

                        {selectedGroupMvpHistory.length > 0 ? (
                          <div className="mt-3 grid gap-2">
                            {selectedGroupMvpHistory.map(winner => (
                              <div
                                key={winner.sessionId}
                                className="flex items-center justify-between gap-3 rounded-[16px] border border-[#ece6db] bg-white px-3 py-2.5"
                              >
                                <div className="min-w-0 font-semibold text-[#102018]">
                                  {winner.name}
                                </div>
                                <div className="shrink-0 text-[16px]">
                                  {'🏆'.repeat(Math.min(winner.wins, 6))}
                                  {winner.wins > 6 ? ` +${winner.wins - 6}` : ''}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-3 rounded-[16px] border border-dashed border-[#ece6db] bg-[#fcfbf8] px-3 py-3 text-[12px] text-[#637268]">
                            No MVP history yet for this group.
                          </div>
                        )}
                      </div>

                      <div className="rounded-[18px] border border-[#dfe9e2] bg-[linear-gradient(135deg,#f7fbf8,#fffdf8)] px-3 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#2d7651]">
                              Banner collection
                            </div>
                            <div className="mt-1 font-serif text-[18px] font-bold tracking-[-0.03em] text-[#102018]">
                              {selectedGroupTitleCount} group title{selectedGroupTitleCount === 1 ? '' : 's'}
                            </div>
                          </div>
                          <div className="rounded-full border border-[#dfe9e2] bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#2d7651]">
                            Legacy
                          </div>
                        </div>

                        {selectedGroupBannerHistory.length > 0 ? (
                          <div className="mt-3 grid gap-2">
                            {selectedGroupBannerHistory.slice(0, 4).map((banner, index) => (
                              <div
                                key={banner.id}
                                className="rounded-[16px] border border-[#dfe9e2] bg-[linear-gradient(90deg,rgba(45,118,81,0.08),rgba(231,184,63,0.12))] px-3 py-2.5"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#2d7651]">
                                      Title #{selectedGroupTitleCount - index}
                                    </div>
                                    <div className="mt-0.5 truncate font-semibold text-[#102018]">
                                      {formatWeekRangeLabel(banner.week_start, banner.week_end)}
                                    </div>
                                  </div>
                                  <div className="text-[26px] leading-none">{banner.group_icon || selectedGroup.icon || '🏆'}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-3 rounded-[16px] border border-dashed border-[#dfe9e2] bg-white px-3 py-3 text-[12px] text-[#637268]">
                            Win Group of the Week to unlock your first banner.
                          </div>
                        )}
                      </div>
                    </div>
                  </section>
                ) : null}

                {isViewingOwnGroup && viewerGroup && viewerGroupAggregate ? (
                  <section className="rounded-[20px] border border-[#e7e1d6] bg-white p-3 shadow-[0_14px_34px_rgba(16,32,24,0.05)] sm:p-4">
                    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#102018]">
                          Your group this week
                        </div>
                        <div className="mt-1 font-serif text-[18px] font-bold tracking-[-0.03em] text-[#102018] sm:text-[20px]">
                          {viewerGroup.name}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                        <button
                          type="button"
                          onClick={() => void shareInviteLink(viewerGroup)}
                          className="rounded-full border border-[#d9eadf] bg-[#eef8f2] px-3 py-1.5 text-[11px] font-semibold text-[#1f6448] transition hover:bg-white"
                        >
                          {copiedCode === viewerGroup.id ? 'Invite copied' : 'Invite teammates'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveGroupsTab('profile')}
                          className="rounded-full border border-[#e6dfd3] bg-[#fcfbf8] px-3 py-1.5 text-[11px] font-semibold text-[#102018] transition hover:bg-white"
                        >
                          Open profile
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
                      <div className="rounded-[16px] border border-[#ece6db] bg-[#fcfbf8] px-3 py-3">
                        <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#637268]">
                          Group streak
                        </div>
                        <div className="mt-1 font-serif text-[24px] font-semibold leading-none text-[#102018]">
                          {viewerGroupAggregate.currentStreak}
                        </div>
                        <div className="mt-1 text-[11px] text-[#2d7651]">
                          {viewerGroupAggregate.activeTodayCount} active today
                        </div>
                      </div>
                      <div className="rounded-[16px] border border-[#ece6db] bg-[#fcfbf8] px-3 py-3 sm:col-span-2">
                        <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#637268]">
                          Momentum
                        </div>
                        <div className="mt-1 font-semibold text-[#102018]">
                          {viewerGroupMomentum || 'Keep stacking solves.'}
                        </div>
                        <div className="mt-1 text-[11px] text-[#637268]">
                          {viewerGroupRecap?.detail || 'Every solve moves the board.'}
                        </div>
                      </div>
                    </div>

                    <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                      <div className="rounded-[16px] border border-[#ece6db] bg-white px-3 py-2.5">
                        <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#637268]">
                          Today's solvers
                        </div>
                        <div className="mt-1.5 text-[12px] font-semibold text-[#102018]">
                          {viewerGroupTodaySolvers.length > 0 ? viewerGroupTodaySolvers.join(' · ') : 'Nobody has checked in yet'}
                        </div>
                      </div>
                      <div className="rounded-[16px] border border-[#ece6db] bg-white px-3 py-2.5">
                        <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#637268]">
                          Race status
                        </div>
                        <div className="mt-1.5 text-[12px] font-semibold text-[#102018]">
                          {viewerGroupMomentum || 'Keep stacking solves.'}
                        </div>
                        <div className="mt-1 text-[11px] text-[#2d7651]">
                          {viewerGroupRank === 1 ? 'Defend the lead today.' : 'A small run can flip the board.'}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                      {viewerGroupChallenge ? (
                        <div className="rounded-[16px] border border-[#dfe9e2] bg-[linear-gradient(135deg,#f7fbf8,#fffdf8)] px-3 py-3">
                          <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#2d7651]">
                            Weekly challenge
                          </div>
                          <div className="mt-1 font-semibold text-[#102018]">
                            {viewerGroupChallenge.title}
                          </div>
                          <div className="mt-1 text-[12px] text-[#637268]">
                            {viewerGroupChallenge.detail}
                          </div>
                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e7efe9]">
                            <div
                              className="h-full rounded-full bg-[linear-gradient(90deg,#2d7651,#c76b3a)]"
                              style={{
                                width: `${Math.min(
                                  100,
                                  Math.max(
                                    12,
                                    (viewerGroupChallenge.progress / viewerGroupChallenge.goal) * 100
                                  )
                                )}%`,
                              }}
                            />
                          </div>
                          <div className="mt-1 flex items-center justify-between text-[11px]">
                            <span className="font-semibold text-[#102018]">
                              {viewerGroupChallenge.progress}/{viewerGroupChallenge.goal}
                            </span>
                            <span className="text-[#637268]">{viewerGroupChallenge.reward}</span>
                          </div>
                        </div>
                      ) : null}

                      {viewerGroupRecap ? (
                        <div className="rounded-[16px] border border-[#ece6db] bg-[#fcfbf8] px-3 py-3">
                          <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#637268]">
                            Weekly recap
                          </div>
                          <div className="mt-1 font-semibold text-[#102018]">
                            {viewerGroupRecap.title}
                          </div>
                          <div className="mt-1 text-[12px] text-[#637268]">
                            {viewerGroupRecap.detail}
                          </div>
                          <div className="mt-2 text-[11px] font-semibold text-[#2d7651]">
                            {viewerGroupRecap.accent}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </section>
                ) : null}

                <div className="grid gap-2.5 sm:grid-cols-2">
                  {selectedGroupChallenge ? (
                    <section className="rounded-[20px] border border-[#e7e1d6] bg-white p-3 shadow-[0_14px_34px_rgba(16,32,24,0.05)] sm:p-4">
                      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#2d7651]">
                        Weekly challenge
                      </div>
                      <div className="mt-1 font-serif text-[20px] font-bold tracking-[-0.03em] text-[#102018]">
                        {selectedGroupChallenge.title}
                      </div>
                      <div className="mt-1 text-[13px] leading-5 text-[#637268]">
                        {selectedGroupChallenge.detail}
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e7efe9]">
                        <div
                          className="h-full rounded-full bg-[linear-gradient(90deg,#2d7651,#c76b3a)]"
                          style={{
                            width: `${Math.min(
                              100,
                              Math.max(
                                12,
                                (selectedGroupChallenge.progress / selectedGroupChallenge.goal) * 100
                              )
                            )}%`,
                          }}
                        />
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-3 text-[12px]">
                        <span className="font-semibold text-[#102018]">
                          {selectedGroupChallenge.progress}/{selectedGroupChallenge.goal}
                        </span>
                        <span className="text-right text-[#637268]">{selectedGroupChallenge.reward}</span>
                      </div>
                    </section>
                  ) : null}

                  {selectedGroupRecap ? (
                    <section className="rounded-[20px] border border-[#e7e1d6] bg-white p-3 shadow-[0_14px_34px_rgba(16,32,24,0.05)] sm:p-4">
                      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#637268]">
                        Weekly recap
                      </div>
                      <div className="mt-1 font-serif text-[20px] font-bold tracking-[-0.03em] text-[#102018]">
                        {selectedGroupRecap.title}
                      </div>
                      <div className="mt-1 text-[13px] leading-5 text-[#637268]">
                        {selectedGroupRecap.detail}
                      </div>
                      <div className="mt-3 inline-flex rounded-full border border-[#dfe9e2] bg-[#f7fbf8] px-2.5 py-1 text-[11px] font-semibold text-[#2d7651]">
                        {selectedGroupRecap.accent}
                      </div>
                    </section>
                  ) : null}
                </div>

                <section className="rounded-[20px] border border-[#e7e1d6] bg-white p-3 shadow-[0_14px_34px_rgba(16,32,24,0.05)] sm:p-4">
                  <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#102018]">
                    Member leaderboard
                  </div>
                  <div className="mt-3 space-y-2">
                    {selectedGroupAggregate.memberStats.length > 0 ? (
                      selectedGroupAggregate.memberStats.map((entry, index) => (
                        <button
                          key={entry.member.id}
                          type="button"
                          onClick={() => setSelectedMemberStats(entry)}
                        className="grid w-full grid-cols-[24px_30px_minmax(0,1fr)_auto] items-center gap-2 rounded-2xl border border-[#ece6db] bg-white px-2 py-2 text-left transition hover:-translate-y-0.5 sm:grid-cols-[32px_34px_minmax(0,1fr)_auto] sm:gap-2.5 sm:px-2.5"
                        >
                          <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold sm:h-7 sm:w-7 sm:text-xs ${rankCircleClass(index + 1)}`}>
                            {index + 1}
                          </div>
                          <MemberAvatar
                            member={entry.member}
                            crowned={mvpEntry?.stats.member.session_id === entry.member.session_id}
                          />
                          <div className="min-w-0">
                            <div className="truncate font-serif text-[13px] font-bold text-[#102018] sm:text-[17px]">
                              {mvpEntry?.stats.member.session_id === entry.member.session_id ? '👑 ' : ''}
                              {entry.member.display_name}
                              {entry.member.session_id === sessionId ? (
                                <span className="ml-2 rounded-full bg-[#eef7f1] px-2 py-0.5 align-middle text-[10px] font-bold text-[#2d7651]">
                                  You
                                </span>
                              ) : null}
                            </div>
                            <div className="text-[10px] text-[#637268] sm:text-xs">
                              {entry.solves} solves · {entry.firstTrySolves} first try · {entry.longestStreak} day streak
                            </div>
                          </div>
                          <div className="flex items-center gap-2 sm:gap-3">
                            <div className="text-right">
                              <div className="font-serif text-[15px] font-bold leading-none text-[#102018] sm:text-[20px]">
                                {formatScore(entry.score)}
                              </div>
                              <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#637268]">
                                pts
                              </div>
                            </div>
                            {canEditSelectedGroup && entry.member.session_id !== sessionId ? (
                              <button
                                type="button"
                                disabled={removingMemberId === entry.member.id}
                                onClick={event => {
                                  event.stopPropagation()
                                  void removeMemberFromGroup(entry.member)
                                }}
                                className="rounded-full border border-[#f0d7c8] px-2.5 py-1 text-[10px] font-bold text-[#a24d24] transition hover:bg-[#fff1e8] disabled:opacity-50"
                              >
                                {removingMemberId === entry.member.id ? 'Removing' : 'Remove'}
                              </button>
                            ) : null}
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-dashed border-[#e6dfd3] bg-[#fcfbf8] px-4 py-8 text-center text-sm text-[#637268]">
                        No members yet.
                      </div>
                    )}
                  </div>
                </section>

                <section className="rounded-[20px] border border-[#e7e1d6] bg-white p-3 shadow-[0_14px_34px_rgba(16,32,24,0.05)] sm:p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#102018]">
                      Activity feed
                    </div>
                    <div className="text-[11px] font-semibold text-[#2d7651]">
                      {groupActivityFeed.length > 0 ? 'Live this week' : 'Waiting on activity'}
                    </div>
                  </div>

                  <div className="mt-3 divide-y divide-[#ece6db]">
                    {groupActivityFeed.length > 0 ? (
                      groupActivityFeed.map(item => (
                        <div key={item.id} className="flex items-start gap-2 py-2.5 first:pt-0 last:pb-0 sm:gap-3 sm:py-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f7f3ea] text-base sm:h-10 sm:w-10 sm:text-lg">
                            {getActivityIcon(item.icon)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[14px] font-semibold text-[#102018] sm:text-[15px]">{item.title}</div>
                            <div className="text-[13px] leading-5 text-[#4d5c53] sm:text-sm">{item.detail}</div>
                          </div>
                          <div className="shrink-0 text-[11px] text-[#7c877f] sm:text-xs">
                            {formatRelativeTime(item.createdAt)}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-dashed border-[#e6dfd3] bg-[#fcfbf8] px-4 py-8 text-center text-sm text-[#637268]">
                        No activity yet this week.
                      </div>
                    )}
                  </div>
                </section>
              </>
            ) : (
              <section className="rounded-[20px] border border-[#e7e1d6] bg-white p-5 text-center shadow-[0_14px_34px_rgba(16,32,24,0.05)]">
                <h1 className="font-serif text-2xl font-bold text-[#102018]">No group yet</h1>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#637268]">
                  Create or join a group to unlock your private leaderboard.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setShowJoinPanel(true)
                    setGroupActionMode('join')
                  }}
                  className="mt-4 rounded-xl bg-[#1f6448] px-4 py-2.5 text-xs font-bold text-white"
                >
                  Join or create
                </button>
              </section>
            )}
          </div>
        ) : null}

        {!loading && activeGroupsTab === 'profile' ? (
          <div className="mx-auto w-full">
            <section className="relative overflow-hidden rounded-[24px] border border-[#d9c9a6] bg-[radial-gradient(circle_at_12%_18%,rgba(255,214,89,0.14),transparent_26%),radial-gradient(circle_at_88%_14%,rgba(255,255,255,0.08),transparent_22%),linear-gradient(145deg,#0e5a3f,#063928)] p-3.5 text-white shadow-[0_18px_38px_rgba(6,57,40,0.24)] sm:p-5">
              <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:radial-gradient(circle,#e9b93f_1.4px,transparent_1.4px)] [background-size:34px_34px]" />
              <div className="relative">
              <div className="flex flex-col gap-4 md:grid md:grid-cols-[minmax(0,1fr)_260px] md:items-center md:gap-5">
                <div className="flex min-w-0 flex-col items-center gap-3 text-center md:pr-2">
                  <button
                    type="button"
                    onClick={() => setShowSelectedMemberIconPicker(prev => !prev)}
                    className="relative transition hover:-translate-y-0.5"
                    aria-label="Change profile icon"
                  >
                    <div className="rounded-full border-2 border-[#efbf48] p-1">
                      <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-[#fbf7ef] text-[38px] shadow-[0_10px_22px_rgba(16,32,24,0.06)] sm:h-28 sm:w-28 sm:text-[50px]">
                        <IconMark
                          value={profileIcon}
                          fallback={profileDisplayName.slice(0, 1).toUpperCase()}
                        />
                      </div>
                    </div>
                    <span className="absolute bottom-1 right-1 flex h-8 w-8 items-center justify-center rounded-full border border-[#d8cfbf] bg-white text-[#0e5a3f] shadow-[0_8px_18px_rgba(16,32,24,0.16)]">
                      <Pencil size={14} strokeWidth={2.2} />
                    </span>
                  </button>

                  <div className="min-w-0 w-full max-w-[360px]">
                    {isEditingProfileName ? (
                      <input
                        autoFocus
                        value={editDisplayName}
                        onChange={event => setEditDisplayName(event.target.value)}
                        onBlur={() => void commitProfileNameEdit()}
                        onKeyDown={event => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            void commitProfileNameEdit()
                          }
                          if (event.key === 'Escape') {
                            setEditDisplayName(profileDisplayName)
                            setIsEditingProfileName(false)
                          }
                        }}
                        placeholder="Your display name"
                        className="mx-auto h-11 w-full rounded-xl border border-white/20 bg-white/10 px-3 text-center text-base font-semibold text-white outline-none transition placeholder:text-white/70 focus:border-[#efbf48] sm:text-lg"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsEditingProfileName(true)}
                        className="mx-auto block max-w-full break-words text-center font-serif text-[26px] font-bold leading-[1.02] tracking-[-0.05em] text-white transition hover:text-[#f7e7bc] sm:text-[36px]"
                      >
                        {isViewerCurrentMvp ? '👑 ' : ''}
                        {profileDisplayName}
                      </button>
                    )}

                    <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-[#e7d4a7]/50 bg-[#fff6df] px-3 py-1.5 text-[12px] font-bold text-[#5f4a11] sm:text-sm">
                      <Star size={14} fill="currentColor" strokeWidth={0} />
                      {profileLevelTitle}
                    </div>

                    <div className="mt-3 text-[13px] font-semibold text-[#dfece5] sm:mt-4 sm:text-sm">
                      Level {profileLevel.level}
                    </div>
                    <div className="mt-2 h-2.5 w-full max-w-[340px] overflow-hidden rounded-full bg-white/14 sm:max-w-[360px]">
                      <div
                        className="h-full rounded-full bg-[linear-gradient(90deg,#efbf48,#f0d98c)]"
                        style={{ width: `${Math.max(10, (profileLevel.currentXp / profileLevel.nextXp) * 100)}%` }}
                      />
                    </div>
                    <div className="mt-2 text-[12px] font-medium leading-5 text-[#e7efe9] sm:text-sm">
                      {formatScore(profileXp)} XP
                      <span className="text-[#d6e7df]"> / {formatScore(profileLevel.nextXp)} to next level</span>
                    </div>
                    <div className="mt-1 text-[10px] font-medium leading-4 text-[#d6e7df] sm:text-[11px]">
                      Next title: {nextProfileTitle} · {formatScore(Math.max(0, profileLevel.nextXp - profileXp))} XP to go
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowProfileStatGuide(true)}
                      className="mt-2 inline-flex items-center gap-1 rounded-full border border-white/16 bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-white/90 transition hover:bg-white/14"
                    >
                      <Info size={12} strokeWidth={2.2} />
                      What these stats mean
                    </button>
                  </div>
                </div>

                <div className="grid w-full grid-cols-3 gap-2 border-t border-white/14 pt-3 md:min-w-[260px] md:border-l md:border-t-0 md:gap-4 md:pl-5 md:pt-0">
                  <div className="text-center">
                    <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-[#efbf48] md:h-10 md:w-10">
                      <Flame size={18} strokeWidth={2.1} />
                    </div>
                    <div className="mt-1.5 font-serif text-[19px] font-bold leading-none text-white md:mt-2 md:text-[24px]">
                      {viewerMemberStats?.longestStreak || 0}
                    </div>
                    <div className="mt-1 text-[8px] font-bold uppercase tracking-[0.1em] text-[#dfece5] md:text-[9px] md:tracking-[0.14em]">
                      day streak
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-[#efbf48] md:h-10 md:w-10">
                      <BookOpen size={18} strokeWidth={2.1} />
                    </div>
                    <div className="mt-1.5 font-serif text-[19px] font-bold leading-none text-white md:mt-2 md:text-[24px]">
                      {viewerMemberStats?.solves || 0}
                    </div>
                    <div className="mt-1 text-[8px] font-bold uppercase tracking-[0.1em] text-[#dfece5] md:text-[9px] md:tracking-[0.14em]">
                      total cases solved
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-[#efbf48] md:h-10 md:w-10">
                      <Target size={18} strokeWidth={2.1} />
                    </div>
                    <div className="mt-1.5 font-serif text-[19px] font-bold leading-none text-white md:mt-2 md:text-[24px]">
                      {viewerMemberStats?.firstTrySolves || 0}
                    </div>
                    <div className="mt-1 text-[8px] font-bold uppercase tracking-[0.1em] text-[#dfece5] md:text-[9px] md:tracking-[0.14em]">
                      first try solves
                    </div>
                  </div>
                </div>
              </div>

              {showSelectedMemberIconPicker ? (
                <div className="orthodle-icon-scroll mt-3 max-h-56 overflow-y-auto rounded-2xl border border-white/12 bg-white/8 p-2.5">
                  <IconSectionGrid
                    selectedIcon={editMemberIcon}
                    onSelect={icon => {
                      void updateMyMemberIcon(icon)
                      setShowSelectedMemberIconPicker(false)
                    }}
                    disabled={savingMemberIcon}
                    ariaLabelPrefix="Use your icon"
                    tone="dark"
                  />
                </div>
              ) : null}
              </div>
            </section>

            <section className="mt-3 rounded-[20px] border border-[#e7e1d6] bg-white p-3 shadow-[0_14px_34px_rgba(16,32,24,0.05)] sm:p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#637268]">
                    Account sync
                  </div>
                  <div className="mt-1 font-serif text-[20px] font-bold tracking-[-0.03em] text-[#102018]">
                    {accountSession ? accountSession.username : 'Save your progress'}
                  </div>
                </div>
                {accountSession ? (
                  <button
                    type="button"
                    onClick={logoutAccount}
                    className="rounded-full border border-[#ded7ca] px-3 py-1.5 text-[11px] font-semibold text-[#102018] transition hover:bg-[#fbfaf7]"
                  >
                    Sign out
                  </button>
                ) : null}
              </div>

              {accountSession ? (
                <div className="mt-2 text-[13px] leading-5 text-[#637268]">
                  This profile is tied to your login, so your group membership and play progress can follow you across devices.
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  <div className="text-[13px] leading-5 text-[#637268]">
                    Create a username and password to keep your progress if your browser gets cleared and to pick up where you left off on another computer.
                  </div>

                  <div className="inline-flex rounded-full border border-[#e6dfd3] bg-[#fcfbf8] p-0.5 text-[11px] font-semibold">
                    <button
                      type="button"
                      onClick={() => setAuthMode('signup')}
                      className={`rounded-full px-3 py-1 transition ${authMode === 'signup' ? 'bg-[#1f6448] text-white' : 'text-[#637268]'}`}
                    >
                      Create login
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuthMode('login')}
                      className={`rounded-full px-3 py-1 transition ${authMode === 'login' ? 'bg-[#1f6448] text-white' : 'text-[#637268]'}`}
                    >
                      Sign in
                    </button>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <input
                      value={authUsername}
                      onChange={event => setAuthUsername(event.target.value)}
                      placeholder="Username"
                      className="w-full rounded-xl border border-[#ded7ca] bg-[#fcfbf8] px-3 py-2 text-sm text-[#102018] outline-none transition focus:border-[#1f6448]"
                    />
                    <input
                      type="password"
                      value={authPassword}
                      onChange={event => setAuthPassword(event.target.value)}
                      placeholder="Password"
                      className="w-full rounded-xl border border-[#ded7ca] bg-[#fcfbf8] px-3 py-2 text-sm text-[#102018] outline-none transition focus:border-[#1f6448]"
                    />
                  </div>

                  <button
                    type="button"
                    disabled={authSubmitting}
                    onClick={() => void submitAccountAuth()}
                    className="rounded-xl bg-[#1f6448] px-4 py-2 text-[12px] font-bold text-white transition hover:bg-[#174c37] disabled:opacity-50"
                  >
                    {authSubmitting
                      ? authMode === 'signup'
                        ? 'Creating login...'
                        : 'Signing in...'
                      : authMode === 'signup'
                        ? 'Create account'
                        : 'Sign in'}
                  </button>
                </div>
              )}

              <div className="mt-4 rounded-[18px] border border-[#ece6db] bg-[#fcfbf8] px-3 py-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#637268]">
                      Emergency backup
                    </div>
                    <div className="mt-1 text-[13px] leading-5 text-[#637268]">
                      Download a file with your saved browser progress and any synced Orthodle data tied to this profile.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void downloadProgressBackup()}
                    disabled={backingUp}
                    className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full border border-[#d9eadf] bg-[#eef8f2] px-4 text-[12px] font-bold text-[#1f6448] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Download size={14} strokeWidth={2.2} />
                    {backingUp ? 'Saving backup...' : 'Download backup'}
                  </button>
                </div>
                {backupStatus ? (
                  <div className="mt-2 text-[12px] font-medium text-[#2d7651]">{backupStatus}</div>
                ) : null}
              </div>
            </section>

            <TrophyCase trophies={trophyCaseItems} />
          </div>
        ) : null}

        {showNotificationsPanel ? (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-[#0b130fcc] px-3 py-0 backdrop-blur-sm sm:flex sm:items-center sm:justify-center sm:py-6">
            <div className="mx-auto mt-[22vh] w-full max-w-[520px] rounded-t-[24px] border border-[#e6dfd3] bg-white p-4 shadow-[0_24px_70px_rgba(16,32,24,0.22)] sm:mt-0 sm:max-h-[calc(100vh-3rem)] sm:overflow-y-auto sm:rounded-[24px] sm:p-5">
              <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-[#ddd5c9] sm:hidden" />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#637268]">
                    Groups updates
                  </div>
                  <div className="mt-1 font-serif text-[24px] font-bold tracking-[-0.04em] text-[#102018]">
                    Your inbox
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowNotificationsPanel(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-[#e0d8ca] bg-white text-[#637268] transition hover:bg-[#fcfbf8]"
                  aria-label="Close updates"
                >
                  <X size={15} />
                </button>
              </div>

              <div className="mt-4 space-y-2">
                {groupNotifications.length > 0 ? (
                  groupNotifications.map(item => (
                    <div
                      key={item.id}
                      className="rounded-[18px] border border-[#ece6db] bg-[#fcfbf8] px-3 py-3"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#e6dfd3] bg-white text-[17px]">
                          {getActivityIcon(item.icon)}
                        </div>
                        <div className="min-w-0">
                          <div className="text-[13px] font-semibold text-[#102018]">
                            {item.title}
                          </div>
                          <div className="mt-0.5 text-[12px] leading-5 text-[#637268]">
                            {item.detail}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[18px] border border-dashed border-[#e6dfd3] bg-[#fcfbf8] px-4 py-8 text-center text-sm text-[#637268]">
                    No updates yet. Once your group gets moving, you’ll see streaks, MVP shifts, and race updates here.
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {showProfileStatGuide ? (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-[#0b130fcc] px-3 py-0 backdrop-blur-sm sm:flex sm:items-center sm:justify-center sm:py-6">
            <div className="mx-auto mt-[22vh] w-full max-w-[520px] rounded-t-[24px] border border-[#e6dfd3] bg-white p-4 shadow-[0_24px_70px_rgba(16,32,24,0.22)] sm:mt-0 sm:max-h-[calc(100vh-3rem)] sm:overflow-y-auto sm:rounded-[24px] sm:p-5">
              <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-[#ddd5c9] sm:hidden" />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#637268]">
                    Profile guide
                  </div>
                  <div className="mt-1 font-serif text-[24px] font-bold tracking-[-0.04em] text-[#102018]">
                    What the stats mean
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowProfileStatGuide(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-[#e0d8ca] bg-white text-[#637268] transition hover:bg-[#fcfbf8]"
                  aria-label="Close stat guide"
                >
                  <X size={15} />
                </button>
              </div>

              <div className="mt-4 grid gap-2">
                {[
                  {
                    title: 'XP',
                    detail: 'You earn XP from solving cases, first-try solves, and keeping momentum. Higher XP raises your level.',
                  },
                  {
                    title: 'Level title',
                    detail: 'Your title changes as your XP climbs. It is your current progression tag, like Chief Resident.',
                  },
                  {
                    title: 'Accuracy',
                    detail: 'Accuracy is the share of your total guesses that were correct across group play.',
                  },
                  {
                    title: 'First try solves',
                    detail: 'This counts how many cases you solved on your very first guess.',
                  },
                  {
                    title: 'Day streak',
                    detail: 'Your streak tracks consecutive days with at least one correct solve.',
                  },
                  {
                    title: 'Trophies',
                    detail: 'Trophies are milestone badges you unlock for streaks, categories, group performance, and special achievements.',
                  },
                ].map(item => (
                  <div key={item.title} className="rounded-[18px] border border-[#ece6db] bg-[#fcfbf8] px-3 py-3">
                    <div className="text-[13px] font-semibold text-[#102018]">{item.title}</div>
                    <div className="mt-1 text-[12px] leading-5 text-[#637268]">{item.detail}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {selectedMemberStats ? (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-[#0b130fcc] px-3 py-4 backdrop-blur-sm sm:flex sm:items-center sm:justify-center sm:py-6">
            <div className="mx-auto w-full max-w-[520px] rounded-[24px] border border-[#e6dfd3] bg-white p-4 shadow-[0_24px_70px_rgba(16,32,24,0.22)] sm:max-h-[calc(100vh-3rem)] sm:overflow-y-auto sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#637268]">
                    Player profile
                  </div>
                  <div className="mt-1 font-serif text-[23px] font-bold tracking-[-0.04em] text-[#102018]">
                    {selectedMemberStats.member.display_name}
                  </div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#637268]">
                    {selectedGroup?.name || 'Group member'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedMemberStats(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-[#e0d8ca] bg-white text-[#637268] transition hover:bg-[#fcfbf8]"
                  aria-label="Close player profile"
                >
                  <X size={15} />
                </button>
              </div>

              <div className="mt-4 flex flex-col items-center text-center">
                <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-2 border-[#e4b64b] bg-[#fbf7ef] text-[46px] shadow-[0_10px_22px_rgba(16,32,24,0.06)]">
                  <IconMark
                    value={selectedMemberStats.member.icon}
                    fallback={selectedMemberStats.member.display_name.slice(0, 1).toUpperCase()}
                  />
                </div>
                {isSelectedMemberCurrentMvp ? (
                  <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-[#edd39b] bg-[#fff7df] px-2.5 py-1 text-[11px] font-bold text-[#7d5a12]">
                    👑 MVP this week
                  </div>
                ) : null}
                <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-[#dfe9e2] bg-[#f7fbf8] px-2.5 py-1 text-[11px] font-bold text-[#2d7651]">
                  🏆 {selectedMemberMvpWinCount} MVP win{selectedMemberMvpWinCount === 1 ? '' : 's'}
                </div>

                <div className="mt-4 grid w-full grid-cols-4 divide-x divide-[#ece6db] rounded-2xl border border-[#ece6db] bg-[#fcfbf8] py-2.5">
                  {[
                    ['Pts', formatScore(selectedMemberStats.score)],
                    ['Solves', selectedMemberStats.solves],
                    ['Accuracy', selectedMemberStats.totalGuesses > 0 ? `${Math.round((selectedMemberStats.correctGuesses / selectedMemberStats.totalGuesses) * 100)}%` : '—'],
                    ['Streak', selectedMemberStats.longestStreak],
                  ].map(([label, value]) => (
                    <div key={label} className="px-2">
                      <div className="font-serif text-[16px] font-bold text-[#102018] sm:text-[18px]">{value}</div>
                      <div className="text-[8px] font-bold uppercase tracking-[0.12em] text-[#637268]">{label}</div>
                    </div>
                  ))}
                </div>
              </div>

              <TrophyCase trophies={selectedMemberTrophies} />
            </div>
          </div>
        ) : null}

        {showJoinPanel ? (
          <section className="mt-5 rounded-[22px] border border-[#e6dfd3] bg-white px-4 py-4 shadow-[0_12px_30px_rgba(16,32,24,0.05)]">
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#637268]">
                  {groupActionMode === 'join' ? 'Join a group' : 'Create a group'}
                </div>
                <div className="mt-1 text-[12px] text-[#637268]">
                  {groupActionMode === 'join'
                    ? 'Use a group code from a teammate.'
                    : 'Start a private leaderboard for your team.'}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="grid grid-cols-2 rounded-full border border-[#e6dfd3] bg-[#fcfbf8] p-0.5 text-[10px] font-semibold">
                  <button
                    type="button"
                    onClick={() => setGroupActionMode('join')}
                    className={`rounded-full px-2.5 py-1 transition ${
                      groupActionMode === 'join'
                        ? 'bg-[#2d7651] text-white'
                        : 'text-[#637268] hover:text-[#102018]'
                    }`}
                  >
                    Join
                  </button>
                  <button
                    type="button"
                    onClick={() => setGroupActionMode('create')}
                    className={`rounded-full px-2.5 py-1 transition ${
                      groupActionMode === 'create'
                        ? 'bg-[#2d7651] text-white'
                        : 'text-[#637268] hover:text-[#102018]'
                    }`}
                  >
                    Create
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setShowJoinPanel(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-[#e6dfd3] text-[#637268] transition hover:bg-[#fcfbf8]"
                  aria-label="Close group form"
                >
                  <X size={13} strokeWidth={2} />
                </button>
              </div>
            </div>

            {groupActionMode === 'join' ? (
              <>
                <div className="mt-3">
                  <IconPicker
                    label="Your icon"
                    selectedIcon={joinMemberIcon}
                    isOpen={showJoinMemberIconPicker}
                    onToggle={() => setShowJoinMemberIconPicker(prev => !prev)}
                    onSelect={icon => {
                      setJoinMemberIcon(icon)
                      setShowJoinMemberIconPicker(false)
                    }}
                    ariaLabelPrefix="Use your icon"
                  />
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <input
                    value={joinCode}
                    onChange={event => setJoinCode(normalizeJoinCode(event.target.value))}
                    placeholder="Group code"
                    className="w-full rounded-[12px] border border-[#dfd8cb] bg-white px-3 py-2 text-[12px] text-[#102018] outline-none transition focus:border-[#2d7651]"
                  />
                  <input
                    value={joinDisplayName}
                    onChange={event => setJoinDisplayName(event.target.value)}
                    placeholder="Your display name"
                    className="w-full rounded-[12px] border border-[#dfd8cb] bg-white px-3 py-2 text-[12px] text-[#102018] outline-none transition focus:border-[#2d7651]"
                  />
                  <button
                    type="button"
                    disabled={
                      joining ||
                      !normalizedJoinCode ||
                      !joinDisplayName.trim() ||
                      Boolean(normalizedJoinCode && !joinTargetGroup)
                    }
                    onClick={() => void submitGroupForm()}
                    className="inline-flex h-10 items-center justify-center rounded-xl bg-[#2d7651] px-4 text-[12px] font-bold text-white transition hover:bg-[#255e42] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {joining ? 'Joining...' : alreadyInJoinTarget ? 'Update' : 'Join'}
                  </button>
                </div>
                <div className="mt-2 text-[11px] leading-5 text-[#637268]">
                  Paste a teammate’s code or open their invite link and we’ll fill it in for you.
                </div>
              </>
            ) : (
              <>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <IconPicker
                    label="Group icon"
                    selectedIcon={createIcon}
                    isOpen={showCreateGroupIconPicker}
                    onToggle={() => setShowCreateGroupIconPicker(prev => !prev)}
                    onSelect={icon => {
                      setCreateIcon(icon)
                      setShowCreateGroupIconPicker(false)
                    }}
                    ariaLabelPrefix="Use group icon"
                  />
                  <IconPicker
                    label="Your icon"
                    selectedIcon={createMemberIcon}
                    isOpen={showCreateMemberIconPicker}
                    onToggle={() => setShowCreateMemberIconPicker(prev => !prev)}
                    onSelect={icon => {
                      setCreateMemberIcon(icon)
                      setShowCreateMemberIconPicker(false)
                    }}
                    ariaLabelPrefix="Use your icon"
                  />
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
                  <input
                    value={createName}
                    onChange={event => setCreateName(event.target.value)}
                    placeholder="Group name"
                    className="w-full rounded-[12px] border border-[#dfd8cb] bg-white px-3 py-2 text-[12px] text-[#102018] outline-none transition focus:border-[#2d7651]"
                  />
                  <input
                    value={createDisplayName}
                    onChange={event => setCreateDisplayName(event.target.value)}
                    placeholder="Your display name"
                    className="w-full rounded-[12px] border border-[#dfd8cb] bg-white px-3 py-2 text-[12px] text-[#102018] outline-none transition focus:border-[#2d7651]"
                  />
                  <input
                    value={createCode}
                    onChange={event => setCreateCode(normalizeJoinCode(event.target.value))}
                    placeholder="Custom code"
                    className="w-full rounded-[12px] border border-[#dfd8cb] bg-white px-3 py-2 text-[12px] text-[#102018] outline-none transition focus:border-[#2d7651]"
                  />
                  <button
                    type="button"
                    disabled={creating || !createName.trim() || !createDisplayName.trim()}
                    onClick={() => void submitGroupForm()}
                    className="inline-flex h-10 items-center justify-center rounded-xl bg-[#2d7651] px-4 text-[12px] font-bold text-white transition hover:bg-[#255e42] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {creating ? 'Creating...' : 'Create'}
                  </button>
                </div>
                <div className="mt-2 rounded-[14px] bg-[#fcfbf8] px-3 py-2 text-[11px] leading-5 text-[#637268]">
                  {createCode.trim()
                    ? `Your invite code will be ${normalizeJoinCode(createCode)}.`
                    : 'Leave custom code blank and Orthodle will make one for you.'}
                </div>
              </>
            )}
          </section>
        ) : null}
      </section>

      <section className="hidden mx-auto max-w-[700px] px-1.5 py-1.5 sm:px-2.5 sm:py-2.5">
        <div className="night-surface orthodle-groups-shell rounded-[20px] border border-[#e7e1d6] bg-white p-2.5 shadow-[0_8px_18px_rgba(16,32,24,0.03)] sm:rounded-[22px] sm:p-4">
          <div className="space-y-3.5 sm:space-y-4">
            <div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-serif text-[29px] font-bold leading-none tracking-[-0.05em] text-[#102018] sm:text-[34px]">
                    Groups
                  </h1>
                  <button
                    type="button"
                    onClick={() => setShowGroupsExplainer(true)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#e4ddd0] bg-white text-[#637268] transition hover:-translate-y-0.5 hover:bg-[#fcfbf8]"
                    aria-label="How groups work"
                  >
                    <Info size={14} strokeWidth={2} />
                  </button>
                </div>
                <p className="mt-1 max-w-[420px] text-[12px] leading-5 text-[#637268] sm:text-[13px]">
                  Private leaderboards for your class, rotation, residency, or friends.
                </p>
              </div>
            </div>

            {message ? (
              <div className="rounded-2xl border border-[#e7e1d6] bg-[#fcfbf8] px-3.5 py-2.5 text-[13px] text-[#355542]">
                {message}
              </div>
            ) : null}

            <section className="rounded-[18px] bg-white px-2 py-2 sm:px-3 sm:py-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#637268]">
                Your group
              </div>

              {loading ? (
                <div className="mt-3 space-y-3">
                  <div className="h-[82px] rounded-[18px] bg-[#fcfbf8]" />
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="h-[92px] rounded-[14px] bg-[#fcfbf8]" />
                    <div className="h-[92px] rounded-[14px] bg-[#fcfbf8]" />
                    <div className="h-[92px] rounded-[14px] bg-[#fcfbf8]" />
                    <div className="h-[92px] rounded-[14px] bg-[#fcfbf8]" />
                  </div>
                </div>
              ) : selectedGroup && selectedGroupAggregate ? (
                <div className="mt-3 space-y-3">
                  <button
                    type="button"
                    onClick={() => setYourGroupOpen(prev => !prev)}
                    className="orthodle-group-feature-card block w-full rounded-[22px] border border-[#e6dfd3] bg-[linear-gradient(135deg,#fffdf8,#f8f5ee)] p-3 text-left shadow-[0_12px_26px_rgba(16,32,24,0.05)] transition hover:-translate-y-0.5 hover:bg-white sm:p-3.5"
                    aria-expanded={yourGroupOpen}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <GroupCrest group={selectedGroup} size="md" />
                        <div className="min-w-0">
                          <div className="truncate font-serif text-[18px] font-semibold tracking-[-0.03em] text-[#102018] sm:text-[20px]">
                            {selectedGroup.name}
                          </div>
                          <div className="mt-0.5 text-[12px] text-[#637268]">
                            {formatMemberCount(selectedGroupAggregate.members.length)}
                          </div>
                        </div>
                      </div>
                      <div
                        className={`text-[22px] leading-none text-[#637268] transition-transform ${
                          yourGroupOpen ? 'rotate-90' : ''
                        }`}
                      >
                        ›
                      </div>
                    </div>
                  </button>

                  {yourGroupOpen ? (
                    <div className="rounded-[16px] bg-[#fcfbf8] px-3 py-2.5">
                      <div className="space-y-2">
                        {canEditSelectedGroup ? (
                          <>
                            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                              <input
                                value={editGroupName}
                                onChange={event => setEditGroupName(event.target.value)}
                                placeholder="Group name"
                                className="w-full rounded-[12px] border border-[#dfd8cb] bg-white px-3 py-2 text-[12px] font-semibold text-[#102018] outline-none transition focus:border-[#2d7651]"
                              />
                              <button
                                type="button"
                                disabled={savingGroupName || !editGroupName.trim()}
                                onClick={() => void updateSelectedGroupName()}
                                className="inline-flex h-9 items-center justify-center rounded-full border border-[#2d7651] bg-[#2d7651] px-4 text-[11px] font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#255e42] disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {savingGroupName ? 'Saving...' : 'Save group'}
                              </button>
                            </div>
                            <IconPicker
                              label="Group icon"
                              selectedIcon={selectedGroup.icon}
                              isOpen={showSelectedGroupIconPicker}
                              disabled={savingGroupIcon}
                              onToggle={() => setShowSelectedGroupIconPicker(prev => !prev)}
                              onSelect={icon => {
                                void updateSelectedGroupIcon(icon)
                                setShowSelectedGroupIconPicker(false)
                              }}
                              ariaLabelPrefix="Use group icon"
                            />
                          </>
                        ) : null}

                        {myMembership ? (
                          <div className="space-y-2">
                            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                              <input
                                value={editDisplayName}
                                onChange={event => setEditDisplayName(event.target.value)}
                                placeholder="Your display name"
                                className="w-full rounded-[12px] border border-[#dfd8cb] bg-white px-3 py-2 text-[12px] text-[#102018] outline-none transition focus:border-[#2d7651]"
                              />
                              <button
                                type="button"
                                disabled={savingDisplayName || !editDisplayName.trim()}
                                onClick={() => void updateMyDisplayName()}
                                className="inline-flex h-9 items-center justify-center rounded-full border border-[#e0d8ca] bg-[#fcfbf8] px-4 text-[11px] font-semibold text-[#102018] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {savingDisplayName ? 'Saving...' : 'Save name'}
                              </button>
                            </div>
                            <IconPicker
                              label="Your icon"
                              selectedIcon={editMemberIcon}
                              isOpen={showSelectedMemberIconPicker}
                              disabled={savingMemberIcon}
                              onToggle={() => setShowSelectedMemberIconPicker(prev => !prev)}
                              onSelect={icon => {
                                void updateMyMemberIcon(icon)
                                setShowSelectedMemberIconPicker(false)
                              }}
                              ariaLabelPrefix="Use your icon"
                            />
                          </div>
                        ) : null}
                      </div>

                    </div>
                  ) : null}

                  <div className="grid grid-cols-4 gap-0 border-t border-[#ece6db] pt-3 sm:pt-4">
                    <div className="min-w-0 px-1.5 sm:px-3">
                      <div className="truncate text-[8px] font-bold uppercase tracking-[0.12em] text-[#637268] sm:text-[9px] sm:tracking-[0.2em]">
                        Rank
                      </div>
                      <div className="mt-1 font-serif text-[20px] font-semibold leading-none text-[#102018] sm:text-[24px]">
                        #{selectedGroupRank}
                      </div>
                      <div className="mt-1 text-[10px] text-[#637268] sm:text-[11px]">of {groupAggregates.length || 1}</div>
                    </div>
                    <div className="min-w-0 border-l border-[#ece6db] px-1.5 sm:px-3">
                      <div className="truncate text-[8px] font-bold uppercase tracking-[0.12em] text-[#637268] sm:text-[9px] sm:tracking-[0.2em]">
                        Score
                      </div>
                      <div className="mt-1 truncate font-serif text-[20px] font-semibold leading-none text-[#102018] sm:text-[24px]">
                        {formatScore(selectedGroupAggregate.score)}
                      </div>
                      <div className="mt-1 text-[10px] text-[#637268] sm:text-[11px]">team score</div>
                    </div>
                    <div className="min-w-0 border-l border-[#ece6db] px-1.5 sm:px-3">
                      <div className="truncate text-[8px] font-bold uppercase tracking-[0.12em] text-[#637268] sm:text-[9px] sm:tracking-[0.2em]">
                        Accuracy
                      </div>
                      <div className="mt-1 font-serif text-[20px] font-semibold leading-none text-[#102018] sm:text-[24px]">
                        {selectedGroupAggregate.avgAccuracy !== null
                          ? `${Math.round(selectedGroupAggregate.avgAccuracy)}%`
                          : '—'}
                      </div>
                      <div className="mt-1 text-[10px] text-[#2d7651] sm:text-[11px]">correct</div>
                    </div>
                    <div className="min-w-0 border-l border-[#ece6db] px-1.5 sm:px-3">
                      <div className="truncate text-[8px] font-bold uppercase tracking-[0.12em] text-[#637268] sm:text-[9px] sm:tracking-[0.2em]">
                        Streak
                      </div>
                      <div className="mt-1 font-serif text-[20px] font-semibold leading-none text-[#102018] sm:text-[24px]">
                        {selectedGroupAggregate.longestStreak}
                      </div>
                      <div className="mt-1 text-[10px] text-[#637268] sm:text-[11px]">days</div>
                    </div>
                  </div>

                  {weeklyHonorsEnabled ? (
                    <div className="grid gap-2">
                      <div className="rounded-[14px] border border-[#eadfca] bg-[linear-gradient(135deg,#fffaf0,#fcfbf8)] px-3 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#d69a28]">
                              MVP spotlight
                            </div>
                            <div className="mt-1 text-[12px] font-semibold text-[#102018]">
                              MVP winners in {selectedGroup.name}
                            </div>
                          </div>
                          <div className="rounded-full border border-[#edd39b] bg-[#fff7df] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-[#7d5a12]">
                            {selectedGroupMvpHistory.length} winner{selectedGroupMvpHistory.length === 1 ? '' : 's'}
                          </div>
                        </div>
                        {selectedGroupMvpHistory.length > 0 ? (
                          <div className="mt-2.5 space-y-2">
                            {selectedGroupMvpHistory.map(winner => (
                              <div
                                key={winner.sessionId}
                                className="flex items-center justify-between gap-3 rounded-[12px] border border-[#ece6db] bg-white px-3 py-2"
                              >
                                <div className="min-w-0 truncate text-[12px] font-semibold text-[#102018]">
                                  {winner.name}
                                </div>
                                <div className="shrink-0 text-[14px]">
                                  {'🏆'.repeat(Math.min(winner.wins, 5))}
                                  {winner.wins > 5 ? ` +${winner.wins - 5}` : ''}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-2.5 text-[11px] text-[#637268]">
                            No MVP history yet for this group.
                          </div>
                        )}
                      </div>

                      <div className="rounded-[14px] border border-[#dfe9e2] bg-[linear-gradient(135deg,#f7fbf8,#fffdf8)] px-3 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#2d7651]">
                              Banner collection
                            </div>
                            <div className="mt-1 text-[12px] font-semibold text-[#102018]">
                              {selectedGroupTitleCount} group title{selectedGroupTitleCount === 1 ? '' : 's'}
                            </div>
                          </div>
                          <div className="text-[20px] leading-none">🏁</div>
                        </div>
                        {selectedGroupBannerHistory.length > 0 ? (
                          <div className="mt-2 space-y-2">
                            {selectedGroupBannerHistory.slice(0, 3).map((banner, index) => (
                              <div
                                key={banner.id}
                                className="rounded-[12px] border border-[#dfe9e2] bg-white px-3 py-2"
                              >
                                <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#2d7651]">
                                  Title #{selectedGroupTitleCount - index}
                                </div>
                                <div className="mt-0.5 text-[11px] font-semibold text-[#102018]">
                                  {formatWeekRangeLabel(banner.week_start, banner.week_end)}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-2.5 text-[11px] text-[#637268]">
                            Win Group of the Week to unlock your first banner.
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}

                  {selectedGroupAggregate.memberStats.length > 0 ? (
                    <div className="rounded-[14px] border border-[#ece6db] bg-[#fcfbf8] px-2.5 py-2">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#637268]">
                          Members
                        </div>
                        {selectedGroupAggregate.memberStats.length > 3 ? (
                          <button
                            type="button"
                            onClick={() => setMemberPreviewOpen(prev => !prev)}
                            className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-[#637268] transition hover:bg-white hover:text-[#2d7651]"
                            aria-expanded={memberPreviewOpen}
                          >
                            {memberPreviewOpen
                              ? 'Less'
                              : `+${selectedGroupAggregate.memberStats.length - 3}`}
                            <span
                              className={`text-[10px] leading-none transition-transform ${
                                memberPreviewOpen ? 'rotate-180' : ''
                              }`}
                            >
                              ⌄
                            </span>
                          </button>
                        ) : null}
                      </div>
                      <div className="divide-y divide-[#ece6db]">
                        {selectedMemberPreviewRows.map((entry, index) => (
                          <div
                            key={entry.member.id}
                            className="grid grid-cols-[20px_28px_1fr_auto] items-center gap-2 py-1.5"
                          >
                            <div className="text-[11px] font-semibold text-[#102018]">{index + 1}</div>
                            <MemberAvatar
                              member={entry.member}
                              size="sm"
                              crowned={mvpEntry?.stats.member.session_id === entry.member.session_id}
                            />
                            <div className="min-w-0">
                              <div className="truncate text-[11px] font-semibold text-[#102018]">
                                {mvpEntry?.stats.member.session_id === entry.member.session_id ? '👑 ' : ''}
                                {entry.member.display_name}
                                {entry.member.session_id === sessionId ? (
                                  <span className="ml-1 rounded-full bg-[#eef7f1] px-1.5 py-0.5 text-[9px] font-semibold text-[#2d7651]">
                                    You
                                  </span>
                                ) : null}
                              </div>
                              <div className="text-[10px] text-[#637268]">
                                {entry.solves} solves · {entry.firstTrySolves} first try
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-serif text-[14px] font-semibold leading-none text-[#102018]">
                                {formatScore(entry.score)}
                              </div>
                              <div className="text-[8px] uppercase tracking-[0.12em] text-[#637268]">
                                pts
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                </div>
              ) : (
                <div className="mt-3 rounded-[18px] bg-[#fcfbf8] px-3.5 py-4 text-sm text-[#7a857c]">
                  Create or join a group to unlock the live leaderboard.
                </div>
              )}
            </section>

            <section>
              <div className="mb-3 flex items-end justify-between gap-2">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#637268]">
                  Top 3 groups
                </div>
              </div>
              {loading ? (
                <div className="pb-1.5 pt-1.5">
                  <div className="grid grid-cols-3 gap-1.5 sm:gap-3">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <div
                        key={index}
                        className="h-[118px] rounded-[16px] border border-[#ece6db] bg-[#fcfbf8] sm:h-[146px]"
                      />
                    ))}
                  </div>
                </div>
              ) : leaderboardEntries.length > 0 ? (
                <div className="pb-1.5 pt-1.5">
                  <div className="flex justify-center gap-1.5 sm:gap-3">
                    {leaderboardEntries.slice(0, 3).map((group, index) => {
                      const rank = index + 1
                      return (
                        <button
                          key={group.id}
                          type="button"
                          onClick={() => {
                            router.push(`/groups/${group.id}`)
                          }}
                          data-rank={rank}
                          className="orthodle-podium-card relative flex min-h-[118px] w-[32%] max-w-[150px] flex-col items-center overflow-hidden rounded-[16px] border border-[#e0d7c8] bg-[linear-gradient(180deg,#fffdf8,#fbf7ef)] px-1.5 py-2 text-center shadow-[0_8px_22px_rgba(16,32,24,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_26px_rgba(16,32,24,0.1)] sm:min-h-[146px] sm:rounded-[18px] sm:px-2.5 sm:py-3"
                        >
                          <div className="absolute inset-x-6 bottom-0 h-px bg-[linear-gradient(90deg,transparent,#d8a947,transparent)]" />
                          <div
                            className={`flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-semibold sm:h-7 sm:w-7 sm:text-[10px] ${rankCircleClass(rank)}`}
                          >
                            {rank}
                          </div>
                          <div className="mt-1 sm:mt-2">
                            <GroupCrest group={group} size="xs" />
                          </div>
                          <div className="mt-1 line-clamp-2 min-h-[28px] font-serif text-[12px] font-semibold leading-tight text-[#102018] sm:mt-2 sm:text-[14px]">
                            {group.name}
                          </div>
                          <div className="mt-0.5 text-[14px] font-semibold leading-none text-[#2d7651] sm:mt-1.5 sm:text-[16px]">
                            {formatScore(group.score)}
                          </div>
                          <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#8a9389]">
                            avg
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div className="rounded-[16px] border border-dashed border-[#e6dfd3] bg-[#fcfbf8] px-3.5 py-4 text-[13px] text-[#637268]">
                  No groups yet. Create one below and become the first team on the board.
                </div>
              )}
            </section>

            <section className="px-1 py-1 sm:px-2">
              <div className="flex items-end justify-between gap-2">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#637268]">
                  Leaderboard
                </div>
              </div>
              <div className="mt-2 space-y-2">
                {loading ? (
                  Array.from({ length: 3 }).map((_, index) => (
                    <div
                      key={index}
                      className="h-[66px] rounded-[14px] border border-[#ece6db] bg-[#fcfbf8]"
                    />
                  ))
                ) : leaderboardEntries.length > 0 ? (
                  leaderboardEntries.map(
                  (group, index) => {
                    const rank = index + 1
                    const previous = leaderboardEntries[index - 1]
                    const isTop = rank === 1
                    const scoreDelta =
                      !isTop && previous ? Math.max(0, previous.score - group.score) : 0

                    return (
                      <button
                        key={group.id}
                        type="button"
                        onClick={() => {
                          router.push(`/groups/${group.id}`)
                        }}
                        className={`orthodle-leaderboard-row grid w-full grid-cols-[22px_1fr] items-center gap-2 rounded-[14px] border px-3 py-2.5 text-left transition hover:-translate-y-0.5 hover:bg-[#fcfbf8] ${
                          selectedGroupId === group.id
                            ? 'border-[#2d7651] bg-[#fcfbf8]'
                            : 'border-[#ece6db] bg-white'
                        }`}
                      >
                        <div className="text-[15px] font-semibold text-[#102018]">{rank}</div>
                        <div className="min-w-0">
                          <div className="line-clamp-2 pr-1 font-serif text-[15px] font-semibold leading-tight tracking-[-0.03em] text-[#102018]">
                            {group.name}
                          </div>
                          <div className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.12em] text-[#637268]">
                            {formatMemberCount(group.members)}
                            {isTop ? (
                              <span className="ml-2 text-[#53715f]">Leading the pack</span>
                            ) : scoreDelta === 0 ? (
                              <span className="ml-2 text-[#53715f]">Tied with #{rank - 1}</span>
                            ) : (
                              <span className="ml-2 text-[#53715f]">
                                {scoreDelta} pts back
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="col-start-2 mt-1 flex items-center justify-between border-t border-[#f1ece2] pt-1.5 text-right">
                          <div className="text-[8px] font-bold uppercase tracking-[0.12em] text-[#637268]">
                            score
                          </div>
                          <div className="font-serif text-[18px] font-semibold leading-none text-[#102018]">
                            {formatScore(group.score)}
                          </div>
                        </div>
                      </button>
                    )
                  }
                )
                ) : (
                  <div className="rounded-[14px] border border-dashed border-[#e6dfd3] bg-[#fcfbf8] px-3.5 py-4 text-[13px] text-[#637268]">
                    No leaderboard yet.
                  </div>
                )}
              </div>
            </section>

            <section className={`grid gap-1.5 ${selectedGroup ? 'grid-cols-3' : 'grid-cols-2'}`}>
              <button
                type="button"
                onClick={() => {
                  setGroupActionMode('join')
                  setShowJoinPanel(prev => (groupActionMode === 'join' ? !prev : true))
                }}
                className="orthodle-group-action-tile flex items-center gap-2 rounded-[13px] border border-[#e6dfd3] bg-white px-2.5 py-1.5 text-left transition hover:-translate-y-0.5"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-[10px] bg-[#fcfbf8] text-[15px]">
                  <UserPlus size={15} strokeWidth={2} />
                </div>
                  <div>
                    <div className="text-[11px] font-semibold text-[#102018]">Join or create</div>
                    <div className="text-[10px] text-[#637268]">Use a group code</div>
                  </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setRequestGroupId('')
                  setGroupActionMode('request')
                  setShowJoinPanel(prev => (groupActionMode === 'request' ? !prev : true))
                }}
                className="orthodle-group-action-tile flex items-center gap-2 rounded-[13px] border border-[#e6dfd3] bg-white px-2.5 py-1.5 text-left transition hover:-translate-y-0.5"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-[10px] bg-[#fcfbf8] text-[15px]">
                  <UserPlus size={15} strokeWidth={2} />
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-[#102018]">Request invite</div>
                  <div className="text-[10px] text-[#637268]">Ask to join a team</div>
                </div>
              </button>
              {selectedGroup ? (
                <button
                  type="button"
                  onClick={() => {
                    void shareInviteLink(selectedGroup)
                  }}
                  className="orthodle-group-action-tile flex items-center gap-2 rounded-[13px] border border-[#e6dfd3] bg-white px-2.5 py-1.5 text-left transition hover:-translate-y-0.5"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-[10px] bg-[#fcfbf8] text-[15px]">
                    <Share2 size={15} strokeWidth={2} />
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold text-[#102018]">
                      {copiedCode === selectedGroup.id ? 'Invite copied' : 'Text invite'}
                    </div>
                    <div className="text-[10px] text-[#637268]">Send a join link</div>
                  </div>
                </button>
              ) : null}
            </section>

            {showJoinPanel ? (
              <section className="rounded-[16px] border border-[#e6dfd3] bg-white px-3 py-3 sm:px-4">
                <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#637268]">
                      {groupActionMode === 'join'
                        ? 'Join a group'
                        : groupActionMode === 'request'
                          ? 'Request an invite'
                          : 'Create a group'}
                    </div>
                    <div className="mt-1 text-[12px] text-[#637268]">
                      {groupActionMode === 'join'
                        ? 'Use a group code from a teammate.'
                        : groupActionMode === 'request'
                          ? 'Ask to join a group if you do not have their code yet.'
                          : 'Start a private leaderboard for your team.'}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="grid grid-cols-3 rounded-full border border-[#e6dfd3] bg-[#fcfbf8] p-0.5 text-[10px] font-semibold">
                      <button
                        type="button"
                        onClick={() => setGroupActionMode('join')}
                        className={`rounded-full px-2.5 py-1 transition ${
                          groupActionMode === 'join'
                            ? 'bg-[#2d7651] text-white'
                            : 'text-[#637268] hover:text-[#102018]'
                        }`}
                      >
                        Join
                      </button>
                      <button
                        type="button"
                        onClick={() => setGroupActionMode('request')}
                        className={`rounded-full px-2.5 py-1 transition ${
                          groupActionMode === 'request'
                            ? 'bg-[#2d7651] text-white'
                            : 'text-[#637268] hover:text-[#102018]'
                        }`}
                      >
                        Request
                      </button>
                      <button
                        type="button"
                        onClick={() => setGroupActionMode('create')}
                        className={`rounded-full px-2.5 py-1 transition ${
                          groupActionMode === 'create'
                            ? 'bg-[#2d7651] text-white'
                            : 'text-[#637268] hover:text-[#102018]'
                        }`}
                      >
                        Create
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowJoinPanel(false)}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-[#e6dfd3] text-[#637268] transition hover:bg-[#fcfbf8]"
                      aria-label="Close group form"
                    >
                      <X size={13} strokeWidth={2} />
                    </button>
                  </div>
                </div>

                {groupActionMode === 'join' ? (
                  <>
                    <div className="mt-3">
                      <IconPicker
                        label="Your icon"
                        selectedIcon={joinMemberIcon}
                        isOpen={showJoinMemberIconPicker}
                        onToggle={() => setShowJoinMemberIconPicker(prev => !prev)}
                        onSelect={icon => {
                          setJoinMemberIcon(icon)
                          setShowJoinMemberIconPicker(false)
                        }}
                        ariaLabelPrefix="Use your icon"
                      />
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                      <input
                        value={joinCode}
                        onChange={event => setJoinCode(normalizeJoinCode(event.target.value))}
                        placeholder="Group code"
                        className="w-full rounded-[12px] border border-[#dfd8cb] bg-white px-3 py-2 text-[12px] text-[#102018] outline-none transition focus:border-[#2d7651]"
                      />
                      <input
                        value={joinDisplayName}
                        onChange={event => setJoinDisplayName(event.target.value)}
                        placeholder="Your display name"
                        className="w-full rounded-[12px] border border-[#dfd8cb] bg-white px-3 py-2 text-[12px] text-[#102018] outline-none transition focus:border-[#2d7651]"
                      />
                      <button
                        type="button"
                        disabled={
                          joining ||
                          !normalizedJoinCode ||
                          !joinDisplayName.trim() ||
                          Boolean(normalizedJoinCode && !joinTargetGroup)
                        }
                        onClick={() => void submitGroupForm()}
                        className="inline-flex h-9 items-center justify-center rounded-full border border-[#2d7651] bg-[#2d7651] px-4 text-[11px] font-semibold text-white transition hover:bg-[#255e42] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {joining ? 'Joining...' : alreadyInJoinTarget ? 'Update' : 'Join'}
                      </button>
                    </div>
                    <div className="mt-2 rounded-[14px] bg-[#fcfbf8] px-3 py-2 text-[11px] leading-5 text-[#637268]">
                      {normalizedJoinCode && joinTargetGroup ? (
                        <>
                          Invite found:{' '}
                          <span className="font-semibold text-[#102018]">{joinTargetGroup.name}</span>
                          {alreadyInJoinTarget ? ' · You are already in this group.' : ''}
                        </>
                      ) : normalizedJoinCode ? (
                        'No group found with that code yet.'
                      ) : (
                        'Paste a code from an invite link or ask a teammate for their group code.'
                      )}
                    </div>
                  </>
                ) : groupActionMode === 'request' ? (
                  <>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <IconPicker
                        label="Your icon"
                        selectedIcon={requestMemberIcon}
                        isOpen={showRequestMemberIconPicker}
                        onToggle={() => setShowRequestMemberIconPicker(prev => !prev)}
                        onSelect={icon => {
                          setRequestMemberIcon(icon)
                          setShowRequestMemberIconPicker(false)
                        }}
                        ariaLabelPrefix="Use your icon"
                      />
                      <div className="space-y-1.5">
                        <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#637268]">
                          Group
                        </div>
                        <select
                          value={requestGroupId}
                          onChange={event => setRequestGroupId(event.target.value)}
                          className="w-full rounded-[12px] border border-[#dfd8cb] bg-white px-3 py-2 text-[12px] text-[#102018] outline-none transition focus:border-[#2d7651]"
                        >
                          <option value="">Choose a group</option>
                          {groups.map(group => (
                            <option key={group.id} value={group.id}>
                              {group.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr]">
                      <input
                        value={requestDisplayName}
                        onChange={event => setRequestDisplayName(event.target.value)}
                        placeholder="Your display name"
                        className="w-full rounded-[12px] border border-[#dfd8cb] bg-white px-3 py-2 text-[12px] text-[#102018] outline-none transition focus:border-[#2d7651]"
                      />
                      <input
                        value={requestContact}
                        onChange={event => setRequestContact(event.target.value)}
                        placeholder="Contact info (optional)"
                        className="w-full rounded-[12px] border border-[#dfd8cb] bg-white px-3 py-2 text-[12px] text-[#102018] outline-none transition focus:border-[#2d7651]"
                      />
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
                      <input
                        value={requestNote}
                        onChange={event => setRequestNote(event.target.value)}
                        placeholder="Short note (optional)"
                        className="w-full rounded-[12px] border border-[#dfd8cb] bg-white px-3 py-2 text-[12px] text-[#102018] outline-none transition focus:border-[#2d7651]"
                      />
                      <button
                        type="button"
                        disabled={requestingInvite || !requestGroupId || !requestDisplayName.trim()}
                        onClick={() => void submitGroupForm()}
                        className="inline-flex h-9 items-center justify-center rounded-full border border-[#2d7651] bg-[#2d7651] px-4 text-[11px] font-semibold text-white transition hover:bg-[#255e42] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {requestingInvite ? 'Sending...' : 'Request invite'}
                      </button>
                    </div>
                    <div className="mt-2 rounded-[14px] bg-[#fcfbf8] px-3 py-2 text-[11px] leading-5 text-[#637268]">
                      {requestTargetGroup
                        ? `We’ll log your request for ${requestTargetGroup.name}. Add contact info if you want a follow-up outside the app.`
                        : 'Choose the group you want to join, then send a short request.'}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <IconPicker
                        label="Group icon"
                        selectedIcon={createIcon}
                        isOpen={showCreateGroupIconPicker}
                        onToggle={() => setShowCreateGroupIconPicker(prev => !prev)}
                        onSelect={icon => {
                          setCreateIcon(icon)
                          setShowCreateGroupIconPicker(false)
                        }}
                        ariaLabelPrefix="Use group icon"
                      />
                      <IconPicker
                        label="Your icon"
                        selectedIcon={createMemberIcon}
                        isOpen={showCreateMemberIconPicker}
                        onToggle={() => setShowCreateMemberIconPicker(prev => !prev)}
                        onSelect={icon => {
                          setCreateMemberIcon(icon)
                          setShowCreateMemberIconPicker(false)
                        }}
                        ariaLabelPrefix="Use your icon"
                      />
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
                      <input
                        value={createName}
                        onChange={event => setCreateName(event.target.value)}
                        placeholder="Group name"
                        className="w-full rounded-[12px] border border-[#dfd8cb] bg-white px-3 py-2 text-[12px] text-[#102018] outline-none transition focus:border-[#2d7651]"
                      />
                      <input
                        value={createDisplayName}
                        onChange={event => setCreateDisplayName(event.target.value)}
                        placeholder="Your display name"
                        className="w-full rounded-[12px] border border-[#dfd8cb] bg-white px-3 py-2 text-[12px] text-[#102018] outline-none transition focus:border-[#2d7651]"
                      />
                      <input
                        value={createCode}
                        onChange={event => setCreateCode(normalizeJoinCode(event.target.value))}
                        placeholder="Custom code"
                        className="w-full rounded-[12px] border border-[#dfd8cb] bg-white px-3 py-2 text-[12px] text-[#102018] outline-none transition focus:border-[#2d7651]"
                      />
                      <button
                        type="button"
                        disabled={creating || !createName.trim() || !createDisplayName.trim()}
                        onClick={() => void submitGroupForm()}
                        className="inline-flex h-9 items-center justify-center rounded-full border border-[#2d7651] bg-[#2d7651] px-4 text-[11px] font-semibold text-white transition hover:bg-[#255e42] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {creating ? 'Creating...' : 'Create'}
                      </button>
                    </div>
                    <p className="mt-2 text-[11px] leading-5 text-[#8a9389]">
                      Custom code is optional. If you leave it blank, Orthodle will make one for you.
                    </p>
                  </>
                )}
              </section>
            ) : null}
          </div>
        </div>
      </section>

      <PublicFooter />
    </main>
  )
}
