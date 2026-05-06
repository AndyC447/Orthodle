'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Info, Share2, UserPlus, X } from 'lucide-react'
import { Header } from '@/components/Header'
import { PublicFooter } from '@/components/PublicFooter'
import { supabase } from '@/lib/supabase'
import { getSessionId } from '@/lib/utils'

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
}

type MemberStats = {
  member: GroupMemberRow
  solves: number
  avgGuesses: number | null
  longestStreak: number
  firstTrySolves: number
  totalGuesses: number
  correctGuesses: number
}

type GroupAggregate = {
  group: GroupRow
  members: GroupMemberRow[]
  memberStats: MemberStats[]
  score: number
  avgAccuracy: number | null
  avgGuesses: number | null
  longestStreak: number
  totalSolves: number
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

const SELECTED_GROUP_STORAGE_KEY = 'orthodle_selected_group'
const GROUPS_EXPLAINER_STORAGE_KEY = 'orthodle_groups_explainer_seen'
const GROUP_ICONS = [
  { value: '🦴', label: 'Bone' },
  { value: '🔨', label: 'Hammer' },
  { value: '🛠️', label: 'Tools' },
  { value: '🩺', label: 'Doctor' },
  { value: '🏥', label: 'Hospital' },
  { value: '💪', label: 'Strength' },
  { value: '🧠', label: 'Brain' },
  { value: '⚕️', label: 'Medicine' },
]

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

function buildInviteLink(joinCode: string) {
  if (typeof window === 'undefined') return `https://orthodle.com/groups?code=${joinCode}`
  return `${window.location.origin}/groups?code=${joinCode}`
}

function buildInviteMessage(group: GroupRow) {
  const link = buildInviteLink(group.join_code)
  return [
    'Orthodle group invite',
    '',
    `Join ${group.name}.`,
    'Solve the daily ortho cases with us and climb our private leaderboard.',
    '',
    `Join link: ${link}`,
    `Group code: ${group.join_code}`,
  ].join('\n')
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

function groupAvatarLabel(group: Pick<GroupRow, 'name' | 'icon'>) {
  return group.icon || groupMonogram(group.name)
}

function GroupCrest({ group, size = 'md' }: { group: Pick<GroupRow, 'name' | 'icon'>; size?: 'sm' | 'md' | 'lg' }) {
  const dimensions =
    size === 'lg'
      ? 'h-[70px] w-[70px] rounded-[24px] text-[28px]'
      : size === 'sm'
        ? 'h-[42px] w-[42px] rounded-[15px] text-[20px]'
        : 'h-14 w-14 rounded-[18px] text-[24px]'

  return (
    <div
      className={`orthodle-group-crest relative flex shrink-0 items-center justify-center overflow-hidden border border-[#d8cfbf] bg-[linear-gradient(145deg,#0f2c22,#1d6b4a_58%,#103427)] text-[#102018] shadow-[inset_0_1px_0_rgba(255,255,255,0.32),0_8px_18px_rgba(16,32,24,0.12)] ${dimensions}`}
      aria-hidden="true"
    >
      <div className="orthodle-group-crest-shield absolute inset-[5px] border border-white/50 bg-[radial-gradient(circle_at_28%_22%,#fff6d8,#f8efe1_58%,#e8dcc8)]" />
      <span className="relative z-10 drop-shadow-[0_1px_0_rgba(255,255,255,0.65)]">
        {groupAvatarLabel(group)}
      </span>
    </div>
  )
}

function rankCircleClass(rank: number) {
  if (rank === 1) return 'bg-[#e7b83f] text-white'
  if (rank === 2) return 'bg-[#c9ced2] text-white'
  if (rank === 3) return 'bg-[#b8753d] text-white'
  return 'bg-[#e6dfd3] text-[#637268]'
}

function formatScore(value: number) {
  return value.toLocaleString('en-US')
}

function formatMemberCount(count: number) {
  return `${count} member${count === 1 ? '' : 's'}`
}

function buildMemberStats(
  member: GroupMemberRow,
  guessRows: GuessRow[],
  caseLookup: Record<string, CaseRow>
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
  const solvedDates: string[] = []

  for (const [caseId, rows] of guessesByCase.entries()) {
    const caseInfo = caseLookup[caseId]
    if (!caseInfo) continue
    totalGuesses += rows.length
    correctGuesses += rows.filter(row => row.is_correct).length
    const firstCorrectIndex = rows.findIndex(row => row.is_correct)
    if (firstCorrectIndex === -1) continue
    solves += 1
    totalGuessesToSolve += firstCorrectIndex + 1
    if (firstCorrectIndex === 0) {
      firstTrySolves += 1
    }
    solvedDates.push(caseInfo.case_date)
  }

  const uniqueSortedDates = Array.from(new Set(solvedDates)).sort()

  return {
    member,
    solves,
    avgGuesses: solves > 0 ? totalGuessesToSolve / solves : null,
    longestStreak: computeLongestRun(uniqueSortedDates),
    firstTrySolves,
    totalGuesses,
    correctGuesses,
  }
}

export default function GroupsPage() {
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [groups, setGroups] = useState<GroupRow[]>([])
  const [members, setMembers] = useState<GroupMemberRow[]>([])
  const [guessRows, setGuessRows] = useState<GuessRow[]>([])
  const [caseLookup, setCaseLookup] = useState<Record<string, CaseRow>>({})
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [createName, setCreateName] = useState('')
  const [createCode, setCreateCode] = useState('')
  const [createIcon, setCreateIcon] = useState(GROUP_ICONS[0].value)
  const [createDisplayName, setCreateDisplayName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [joinDisplayName, setJoinDisplayName] = useState('')
  const [creating, setCreating] = useState(false)
  const [joining, setJoining] = useState(false)
  const [savingGroupName, setSavingGroupName] = useState(false)
  const [savingGroupIcon, setSavingGroupIcon] = useState(false)
  const [savingDisplayName, setSavingDisplayName] = useState(false)
  const [copiedCode, setCopiedCode] = useState('')
  const [urlJoinCode, setUrlJoinCode] = useState('')
  const [showJoinPanel, setShowJoinPanel] = useState(false)
  const [groupActionMode, setGroupActionMode] = useState<'join' | 'create'>('join')
  const [showAllGroups, setShowAllGroups] = useState(false)
  const [yourGroupOpen, setYourGroupOpen] = useState(false)
  const [showGroupsExplainer, setShowGroupsExplainer] = useState(false)
  const [editGroupName, setEditGroupName] = useState('')
  const [editDisplayName, setEditDisplayName] = useState('')
  const sessionId = useMemo(() => getSessionId(), [])
  const router = useRouter()

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

    const { data: guessesData, error: guessesError } = await supabase
      .from('guesses')
      .select('session_id, case_id, is_correct, created_at')
      .in('session_id', memberSessionIds)
      .order('created_at', { ascending: true })

    if (guessesError) {
      setMessage(guessesError.message)
      setLoading(false)
      return
    }

    const allGuesses = (guessesData || []) as GuessRow[]
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
      .select('id, case_date, level, answer')
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
  }, [])

  useEffect(() => {
    const refresh = () => void loadGroupsData()
    const channel = supabase
      .channel('groups-live-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'groups' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'guesses' }, refresh)
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const codeFromUrl = normalizeJoinCode(new URLSearchParams(window.location.search).get('code') || '')
    setUrlJoinCode(codeFromUrl)
    if (codeFromUrl) {
      setJoinCode(codeFromUrl)
      setGroupActionMode('join')
      setShowJoinPanel(true)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!window.localStorage.getItem(GROUPS_EXPLAINER_STORAGE_KEY)) {
      setShowGroupsExplainer(true)
    }
  }, [])

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
      (selectedGroupId && userGroupIds.has(selectedGroupId) ? selectedGroupId : '') ||
      (storedGroupId && userGroupIds.has(storedGroupId) ? storedGroupId : '') ||
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
  }, [selectedGroupId])

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
  const weekStartIso = useMemo(() => {
    const date = new Date()
    date.setDate(date.getDate() - 6)
    date.setHours(0, 0, 0, 0)
    return date.toISOString()
  }, [])
  const visibleGuessRows = useMemo(
    () => guessRows.filter(row => row.created_at >= weekStartIso),
    [guessRows, weekStartIso]
  )

  const groupAggregates = useMemo<GroupAggregate[]>(() => {
    return groups
      .map(group => {
        const groupMembers = members.filter(member => member.group_id === group.id)
        const memberStats = groupMembers.map(member =>
          buildMemberStats(member, visibleGuessRows, caseLookup)
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
        const totalSolves = memberStats.reduce((sum, entry) => sum + entry.solves, 0)
        const activeMemberStats = memberStats.filter(entry => entry.totalGuesses > 0)
        const totalMemberScore = activeMemberStats.reduce((sum, entry) => {
          const efficiencyBonus = entry.avgGuesses ? Math.max(0, 7 - entry.avgGuesses) * 12 : 0
          return (
            sum +
            entry.solves * 100 +
            entry.firstTrySolves * 35 +
            entry.longestStreak * 18 +
            efficiencyBonus
          )
        }, 0)
        const score =
          activeMemberStats.length > 0 ? Math.round(totalMemberScore / activeMemberStats.length) : 0

        return {
          group,
          members: groupMembers,
          memberStats: memberStats.sort((a, b) => {
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
          totalSolves,
        }
      })
      .sort((a, b) => b.score - a.score)
  }, [groups, visibleGuessRows, members, caseLookup])

  const selectedGroupAggregate =
    groupAggregates.find(entry => entry.group.id === selectedGroupId) || null
  const selectedGroupRank = selectedGroupAggregate
    ? groupAggregates.findIndex(entry => entry.group.id === selectedGroupAggregate.group.id) + 1
    : null
  const myMembership = selectedMembers.find(member => member.session_id === sessionId) || null
  const canEditSelectedGroup = selectedGroup?.creator_session_id === sessionId
  const canChangeSelectedGroupIcon = Boolean(canEditSelectedGroup)

  useEffect(() => {
    setEditGroupName(selectedGroup?.name || '')
  }, [selectedGroup?.id, selectedGroup?.name])

  useEffect(() => {
    setEditDisplayName(myMembership?.display_name || '')
  }, [myMembership?.id, myMembership?.display_name])

  const activeGroupCount = groupAggregates.filter(entry => entry.totalSolves > 0).length
  const displayLeaderboard: DisplayGroup[] =
    groupAggregates.length > 0
      ? groupAggregates.map(entry => ({
          id: entry.group.id,
          name: entry.group.name,
          icon: entry.group.icon,
          members: entry.members.length,
          score: entry.score,
          avgAccuracy: entry.avgAccuracy,
          longestStreak: entry.longestStreak,
        }))
      : []
  const leaderboardEntries = displayLeaderboard
  const visibleLeaderboardEntries = showAllGroups
    ? leaderboardEntries
    : leaderboardEntries.slice(0, 5)
  const introLine = loading
    ? 'Loading the live group board...'
    : groupAggregates.length > 0
      ? `${groupAggregates.length} group${groupAggregates.length === 1 ? '' : 's'} on the board. Tap any group to inspect it.`
      : 'Create or join a group to compete with classmates, residents, or friends.'
  async function createGroup() {
    const name = createName.trim()
    const displayName = (createDisplayName || joinDisplayName).trim()
    const requestedCode = normalizeJoinCode(createCode.trim())
    const finalCode = requestedCode || makeRandomJoinCode()

    if (!name || !displayName) {
      setMessage('Add a group name and your display name first.')
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

    const { error: memberError } = await supabase.from('group_members').insert({
      group_id: groupData.id,
      session_id: sessionId,
      display_name: displayName,
    })

    if (memberError) {
      setCreating(false)
      setMessage(memberError.message)
      return
    }

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(membershipKey(groupData.id), displayName)
    }

    setCreateName('')
    setCreateCode('')
    setCreateIcon(GROUP_ICONS[0].value)
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

    const existingMembership = members.find(
      member => member.group_id === targetGroup.id && member.session_id === sessionId
    )

    if (existingMembership) {
      const { error } = await supabase
        .from('group_members')
        .update({ display_name: displayName })
        .eq('id', existingMembership.id)

      if (error) {
        setJoining(false)
        setMessage(error.message)
        return
      }
    } else {
      const { error } = await supabase.from('group_members').insert({
        group_id: targetGroup.id,
        session_id: sessionId,
        display_name: displayName,
      })

      if (error) {
        setJoining(false)
        setMessage(error.message)
        return
      }
    }

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(membershipKey(targetGroup.id), displayName)
    }

    setJoinDisplayName('')
    setJoinCode('')
    setShowJoinPanel(false)
    setJoining(false)
    setMessage(existingMembership ? `Updated your name in ${targetGroup.name}.` : `Joined ${targetGroup.name}.`)
    await loadGroupsData()
    setSelectedGroupId(targetGroup.id)
    setYourGroupOpen(true)
    router.push(`/groups/${targetGroup.id}`)
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
    setMessage('Group icon updated.')
  }

  async function updateMyDisplayName() {
    const nextName = editDisplayName.trim()

    if (!myMembership || !nextName) {
      setMessage('Add a display name first.')
      return
    }

    setSavingDisplayName(true)
    setMessage('')

    const { error } = await supabase
      .from('group_members')
      .update({ display_name: nextName })
      .eq('id', myMembership.id)
      .eq('session_id', sessionId)

    if (error) {
      setSavingDisplayName(false)
      setMessage(error.message)
      return
    }

    setMembers(prev =>
      prev.map(member =>
        member.id === myMembership.id ? { ...member, display_name: nextName } : member
      )
    )

    if (selectedGroup) {
      window.localStorage.setItem(membershipKey(selectedGroup.id), nextName)
    }

    setSavingDisplayName(false)
    setMessage('Display name updated.')
  }

  async function submitGroupForm() {
    if (groupActionMode === 'join') {
      await joinGroup()
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

  return (
    <main className="app-surface min-h-screen">
      <Header />

      {showGroupsExplainer ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b130fcc] px-3 py-6 backdrop-blur-sm">
          <div className="w-full max-w-[420px] rounded-[24px] border border-[#e6dfd3] bg-white p-4 shadow-[0_24px_70px_rgba(16,32,24,0.22)] sm:p-5">
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
              <p>Correct solves add points, with bonuses for first-try solves, efficient guesses, and streaks.</p>
              <p>Group score uses average active-member points, so bigger groups do not get an automatic advantage.</p>
              <p>Share the invite link to add people to your group.</p>
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

      <section className="mx-auto max-w-[700px] px-1.5 py-1.5 sm:px-2.5 sm:py-2.5">
        <div className="night-surface rounded-[20px] border border-[#e7e1d6] bg-white p-2.5 shadow-[0_8px_18px_rgba(16,32,24,0.03)] sm:rounded-[22px] sm:p-4">
          <div className="space-y-3.5 sm:space-y-4">
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h1 className="font-serif text-[29px] font-bold leading-none tracking-[-0.05em] text-[#102018] sm:text-[34px]">
                  Groups
                </h1>
                <p className="mt-1.5 max-w-[470px] text-[12px] leading-5 text-[#637268] sm:text-[13px]">
                  {introLine}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowGroupsExplainer(true)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#e4ddd0] bg-white text-[#637268] transition hover:-translate-y-0.5 hover:bg-[#fcfbf8]"
                  aria-label="How groups work"
                >
                  <Info size={15} strokeWidth={2} />
                </button>
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
                    className="block w-full rounded-[18px] bg-[#fcfbf8] p-3 text-left transition hover:-translate-y-0.5 hover:bg-white"
                    aria-expanded={yourGroupOpen}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <GroupCrest group={selectedGroup} />
                        <div className="min-w-0">
                          <div className="truncate font-serif text-[18px] font-semibold tracking-[-0.03em] text-[#102018] sm:text-[20px]">
                            {selectedGroup.name}
                          </div>
                          <div className="mt-0.5 text-[12px] text-[#637268]">
                            {formatMemberCount(selectedGroupAggregate.members.length)}
                          </div>
                          <div className="mt-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-[#637268]">
                            Code {selectedGroup.join_code}
                            {myMembership ? ` · ${myMembership.display_name}` : ''}
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
                    <div className="rounded-[16px] bg-[#fcfbf8] px-3 py-2">
                      <div className="space-y-2 border-b border-[#ece6db] pb-3">
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
                            <div>
                              <div className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.16em] text-[#637268]">
                                Group icon
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {GROUP_ICONS.map(icon => (
                                  <button
                                    key={icon.value}
                                    type="button"
                                    disabled={savingGroupIcon}
                                    onClick={() => void updateSelectedGroupIcon(icon.value)}
                                    className={`flex h-9 w-9 items-center justify-center rounded-[13px] border text-[15px] shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_3px_8px_rgba(16,32,24,0.04)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 ${
                                      selectedGroup.icon === icon.value
                                        ? 'border-[#2d7651] bg-[linear-gradient(145deg,#eef7f1,#ffffff)]'
                                        : 'border-[#e6dfd3] bg-[#fcfbf8]'
                                    }`}
                                    aria-label={`Use ${icon.label} icon`}
                                  >
                                    {icon.value}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </>
                        ) : null}

                        {myMembership ? (
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
                        ) : null}
                      </div>

                      <div className="mb-1 mt-3 text-[9px] font-bold uppercase tracking-[0.16em] text-[#637268]">
                        Members
                      </div>
                      <div className="divide-y divide-[#ece6db]">
                        {selectedMembers.length > 0 ? (
                          selectedMembers.map(member => (
                            <div
                              key={member.id}
                              className="flex items-center justify-between gap-3 py-2 text-[12px]"
                            >
                              <span className="truncate font-semibold text-[#102018]">
                                {member.display_name}
                              </span>
                              {member.session_id === sessionId ? (
                                <span className="rounded-full bg-[#eef7f1] px-2 py-0.5 text-[10px] font-semibold text-[#2d7651]">
                                  You
                                </span>
                              ) : null}
                            </div>
                          ))
                        ) : (
                          <div className="py-2 text-[12px] text-[#637268]">No members yet.</div>
                        )}
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
                        Avg score
                      </div>
                      <div className="mt-1 truncate font-serif text-[20px] font-semibold leading-none text-[#102018] sm:text-[24px]">
                        {formatScore(selectedGroupAggregate.score)}
                      </div>
                      <div className="mt-1 text-[10px] text-[#637268] sm:text-[11px]">avg pts</div>
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
                {leaderboardEntries.length > 3 ? (
                  <button
                    type="button"
                    onClick={() => setShowAllGroups(prev => !prev)}
                    className="text-[11px] text-[#637268] transition hover:text-[#2d7651]"
                  >
                    {showAllGroups ? 'Show less' : 'View all'} ›
                  </button>
                ) : null}
              </div>
              {loading ? (
                <div className="pb-1.5 pt-1.5">
                  <div className="grid grid-cols-3 gap-1.5 sm:gap-3">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <div
                        key={index}
                        className="h-[136px] rounded-[16px] border border-[#ece6db] bg-[#fcfbf8] sm:h-[154px]"
                      />
                    ))}
                  </div>
                </div>
              ) : leaderboardEntries.length > 0 ? (
                <div className="pb-1.5 pt-1.5">
                  <div className="grid grid-cols-3 gap-1.5 sm:gap-3">
                    {leaderboardEntries.slice(0, 3).map((group, index) => {
                      const rank = index + 1
                      return (
                        <button
                          key={group.id}
                          type="button"
                          onClick={() => {
                            router.push(`/groups/${group.id}`)
                          }}
                          className="orthodle-podium-card relative flex min-h-[136px] w-full flex-col items-center overflow-hidden rounded-[16px] border border-[#e0d7c8] bg-[linear-gradient(180deg,#fffdf8,#fbf7ef)] px-1.5 py-2.5 text-center shadow-[0_8px_22px_rgba(16,32,24,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_26px_rgba(16,32,24,0.1)] sm:min-h-[154px] sm:rounded-[18px] sm:px-2.5 sm:py-3"
                        >
                          <div className="absolute inset-x-6 top-0 h-px bg-[linear-gradient(90deg,transparent,#d8a947,transparent)]" />
                          <div
                            className={`flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-semibold sm:h-7 sm:w-7 sm:text-[10px] ${rankCircleClass(rank)}`}
                          >
                            {rank}
                          </div>
                          <div className="mt-1.5 sm:mt-2">
                            <GroupCrest group={group} size="sm" />
                          </div>
                          <div className="mt-1.5 line-clamp-2 min-h-[30px] font-serif text-[12px] font-semibold leading-tight text-[#102018] sm:mt-2 sm:text-[14px]">
                            {group.name}
                          </div>
                          <div className="mt-1 text-[14px] font-semibold leading-none text-[#2d7651] sm:mt-1.5 sm:text-[16px]">
                            {formatScore(group.score)}
                          </div>
                          <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#8a9389]">
                            score
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
                {leaderboardEntries.length > 5 ? (
                  <button
                    type="button"
                    onClick={() => setShowAllGroups(prev => !prev)}
                    className="text-[11px] text-[#637268] transition hover:text-[#2d7651]"
                  >
                    {showAllGroups ? 'Top 5' : 'All groups'}
                  </button>
                ) : null}
              </div>
              <div className="mt-2 space-y-2">
                {loading ? (
                  Array.from({ length: 3 }).map((_, index) => (
                    <div
                      key={index}
                      className="h-[66px] rounded-[14px] border border-[#ece6db] bg-[#fcfbf8]"
                    />
                  ))
                ) : visibleLeaderboardEntries.length > 0 ? (
                  visibleLeaderboardEntries.map(
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
                        className={`grid w-full grid-cols-[22px_1fr_auto] items-center gap-2 rounded-[14px] border px-3 py-2.5 text-left transition hover:-translate-y-0.5 hover:bg-[#fcfbf8] ${
                          selectedGroupId === group.id
                            ? 'border-[#2d7651] bg-[#fcfbf8]'
                            : 'border-[#ece6db] bg-white'
                        }`}
                      >
                        <div className="text-[15px] font-semibold text-[#102018]">{rank}</div>
                        <div className="min-w-0">
                          <div className="truncate font-serif text-[15px] font-semibold tracking-[-0.03em] text-[#102018]">
                            {group.name}
                          </div>
                          <div className="mt-0.5 text-[10px] text-[#637268]">
                            {formatMemberCount(group.members)}
                            {isTop ? (
                              <span className="ml-2 text-[#53715f]">Leading the pack</span>
                            ) : scoreDelta === 0 ? (
                              <span className="ml-2 text-[#53715f]">Tied with #{rank - 1}</span>
                            ) : (
                              <span className="ml-2 text-[#53715f]">
                                {scoreDelta} avg pts behind #{rank - 1}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-serif text-[18px] font-semibold leading-none text-[#102018]">
                            {formatScore(group.score)}
                          </div>
                          <div className="mt-0.5 text-[9px] uppercase tracking-[0.14em] text-[#637268]">
                            avg score
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

            <section className={`grid gap-1.5 ${selectedGroup ? 'sm:grid-cols-2' : ''}`}>
              <button
                type="button"
                onClick={() => {
                  setGroupActionMode('join')
                  setShowJoinPanel(prev => (groupActionMode === 'join' ? !prev : true))
                }}
                className="flex items-center gap-2 rounded-[13px] border border-[#e6dfd3] bg-white px-2.5 py-1.5 text-left transition hover:-translate-y-0.5"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-[10px] bg-[#fcfbf8] text-[15px]">
                  <UserPlus size={15} strokeWidth={2} />
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-[#102018]">Join or create</div>
                  <div className="text-[10px] text-[#637268]">Use a group code</div>
                </div>
              </button>
              {selectedGroup ? (
                <button
                  type="button"
                  onClick={() => {
                    void shareInviteLink(selectedGroup)
                  }}
                  className="flex items-center gap-2 rounded-[13px] border border-[#e6dfd3] bg-white px-2.5 py-1.5 text-left transition hover:-translate-y-0.5"
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
                      {groupActionMode === 'join' ? 'Join a group' : 'Create a group'}
                    </div>
                    <div className="mt-1 text-[12px] text-[#637268]">
                      {groupActionMode === 'join'
                        ? 'Use a group code from a teammate.'
                        : 'Start a private leaderboard for your team.'}
                    </div>
                  </div>
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
                </div>

                {groupActionMode === 'join' ? (
                  <>
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
                ) : (
                  <>
                    <div className="mt-3">
                      <div className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.16em] text-[#637268]">
                        Group icon
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {GROUP_ICONS.map(icon => (
                          <button
                            key={icon.value}
                            type="button"
                            onClick={() => setCreateIcon(icon.value)}
                            className={`flex h-9 w-9 items-center justify-center rounded-[13px] border text-[15px] shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_3px_8px_rgba(16,32,24,0.04)] transition hover:-translate-y-0.5 ${
                              createIcon === icon.value
                                ? 'border-[#2d7651] bg-[linear-gradient(145deg,#eef7f1,#ffffff)]'
                                : 'border-[#e6dfd3] bg-[#fcfbf8]'
                            }`}
                            aria-label={`Use ${icon.label} icon`}
                          >
                            {icon.value}
                          </button>
                        ))}
                      </div>
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
