'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Calendar, ChevronDown, Share2, UserPlus } from 'lucide-react'
import { Header } from '@/components/Header'
import { PublicFooter } from '@/components/PublicFooter'
import { supabase } from '@/lib/supabase'
import { getSessionId } from '@/lib/utils'

type GroupRow = {
  id: string
  name: string
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
  members: number
  score: number
  avgAccuracy: number | null
  longestStreak: number
}

const SELECTED_GROUP_STORAGE_KEY = 'orthodle_selected_group'

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
  const [createDisplayName, setCreateDisplayName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [joinDisplayName, setJoinDisplayName] = useState('')
  const [creating, setCreating] = useState(false)
  const [joining, setJoining] = useState(false)
  const [savingGroupName, setSavingGroupName] = useState(false)
  const [savingDisplayName, setSavingDisplayName] = useState(false)
  const [copiedCode, setCopiedCode] = useState('')
  const [urlJoinCode, setUrlJoinCode] = useState('')
  const [showJoinPanel, setShowJoinPanel] = useState(false)
  const [groupActionMode, setGroupActionMode] = useState<'join' | 'create'>('join')
  const [showAllGroups, setShowAllGroups] = useState(false)
  const [yourGroupOpen, setYourGroupOpen] = useState(false)
  const [editGroupName, setEditGroupName] = useState('')
  const [editDisplayName, setEditDisplayName] = useState('')
  const [timeframe, setTimeframe] = useState<'week' | 'all'>('week')
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
    () =>
      timeframe === 'week'
        ? guessRows.filter(row => row.created_at >= weekStartIso)
        : guessRows,
    [guessRows, timeframe, weekStartIso]
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
        const score = Math.round(
          memberStats.reduce((sum, entry) => {
            const efficiencyBonus = entry.avgGuesses ? Math.max(0, 7 - entry.avgGuesses) * 12 : 0
            return (
              sum +
              entry.solves * 100 +
              entry.firstTrySolves * 35 +
              entry.longestStreak * 18 +
              efficiencyBonus
            )
          }, 0)
        )

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
  const selectedGroupPointsContext =
    selectedGroupAggregate && selectedGroupRank && selectedGroupRank > 1
      ? `${Math.max(0, groupAggregates[selectedGroupRank - 2].score - selectedGroupAggregate.score)} pts behind #${selectedGroupRank - 1}`
      : selectedGroupAggregate && groupAggregates.length > 1
        ? `${Math.max(0, selectedGroupAggregate.score - groupAggregates[1].score)} pts ahead of #2`
        : 'Leading the pack'
  const introLine = loading
    ? 'Loading the live group board...'
    : groupAggregates.length > 0
      ? `${groupAggregates.length} group${groupAggregates.length === 1 ? '' : 's'} on the board, ${activeGroupCount} active ${timeframe === 'week' ? 'this week' : 'overall'}. Tap any group to inspect it.`
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

    const { data: groupData, error: groupError } = await supabase
      .from('groups')
      .insert({
        name,
        join_code: finalCode,
        creator_session_id: sessionId,
      })
      .select()
      .single()

    if (groupError || !groupData) {
      setCreating(false)
      setMessage(groupError?.message || 'Could not create the group.')
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
    setCreateDisplayName('')
    setJoinDisplayName('')
    setJoinCode('')
    setShowJoinPanel(false)
    setCreating(false)
    setMessage(`Created ${groupData.name}. Invite code: ${groupData.join_code}`)
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

    const { error } = await supabase
      .from('groups')
      .update({ name: nextName })
      .eq('id', selectedGroup.id)
      .eq('creator_session_id', sessionId)

    if (error) {
      setSavingGroupName(false)
      setMessage(error.message)
      return
    }

    setGroups(prev =>
      prev.map(group => (group.id === selectedGroup.id ? { ...group, name: nextName } : group))
    )
    setSavingGroupName(false)
    setMessage('Group name updated.')
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
    const shareText = `Join my Orthodle group "${group.name}" and climb the leaderboard with us.`

    if (navigator.share) {
      try {
        await navigator.share({
          title: `${group.name} on Orthodle`,
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
      await navigator.clipboard.writeText(link)
      setCopiedCode(group.id)
      setMessage('Invite link copied.')
    } else {
      setMessage(`Invite code: ${group.join_code}`)
    }
    window.setTimeout(() => setCopiedCode(''), 1800)
  }

  return (
    <main className="app-surface min-h-screen">
      <Header />

      <section className="mx-auto max-w-[700px] px-2 py-2 sm:px-2.5 sm:py-2.5">
        <div className="night-surface rounded-[20px] border border-[#e7e1d6] bg-white p-3 shadow-[0_8px_18px_rgba(16,32,24,0.03)] sm:rounded-[22px] sm:p-4">
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h1 className="font-serif text-[29px] font-bold leading-none tracking-[-0.05em] text-[#102018] sm:text-[34px]">
                  Groups
                </h1>
                <p className="mt-1.5 max-w-[470px] text-[12px] leading-5 text-[#637268] sm:text-[13px]">
                  {introLine}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTimeframe(prev => (prev === 'week' ? 'all' : 'week'))}
                className="inline-flex w-fit items-center gap-2 rounded-[14px] border border-[#e4ddd0] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#102018] shadow-[0_1px_0_rgba(255,255,255,0.6)] transition hover:-translate-y-0.5 hover:bg-[#fcfbf8] sm:px-4 sm:py-2 sm:text-[12px]"
                aria-label="Toggle leaderboard timeframe"
              >
                <Calendar size={15} strokeWidth={2} />
                {timeframe === 'week' ? 'This Week' : 'All Time'}
                <ChevronDown size={13} strokeWidth={2} />
              </button>
            </div>

            {message ? (
              <div className="rounded-2xl border border-[#e7e1d6] bg-[#fcfbf8] px-3.5 py-2.5 text-[13px] text-[#355542]">
                {message}
              </div>
            ) : null}

            <section className="rounded-[18px] border border-[#e6dfd3] bg-white px-4 py-4 sm:rounded-[22px] sm:px-5 sm:py-5">
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
                    className="block w-full rounded-[18px] border border-[#e6dfd3] bg-[#fcfbf8] p-3 text-left transition hover:-translate-y-0.5 hover:bg-white"
                    aria-expanded={yourGroupOpen}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] bg-[radial-gradient(circle_at_30%_30%,#fff3d8,transparent_45%),linear-gradient(180deg,#173d30,#1f6448)] text-[13px] font-bold text-[#f8e1a0] shadow-[inset_0_1px_0_rgba(255,255,255,0.24)]">
                          {groupMonogram(selectedGroup.name)}
                        </div>
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
                    <div className="rounded-[16px] border border-[#e6dfd3] bg-white px-3 py-2">
                      <div className="space-y-2 border-b border-[#ece6db] pb-3">
                        {canEditSelectedGroup ? (
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
                              className="inline-flex h-9 items-center justify-center rounded-full border border-[#2d7651] bg-[#2d7651] px-4 text-[11px] font-semibold text-white transition hover:bg-[#255e42] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {savingGroupName ? 'Saving...' : 'Save group'}
                            </button>
                          </div>
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
                        Score
                      </div>
                      <div className="mt-1 truncate font-serif text-[20px] font-semibold leading-none text-[#102018] sm:text-[24px]">
                        {formatScore(selectedGroupAggregate.score)}
                      </div>
                      <div className="mt-1 text-[10px] text-[#637268] sm:text-[11px]">points</div>
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
                      <div className="mt-1 text-[10px] text-[#2d7651] sm:text-[11px]">this week</div>
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

                  <div className="rounded-[14px] bg-[#fcfbf8] px-3 py-2 text-[12px] font-semibold text-[#102018]">
                    {selectedGroupPointsContext}
                  </div>

                </div>
              ) : (
                <div className="mt-3 rounded-[18px] border border-dashed border-[#e6dfd3] bg-[#fcfbf8] px-3.5 py-4 text-sm text-[#7a857c]">
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
                <div className="flex justify-start gap-3 overflow-x-auto pb-1.5 pt-1.5 [scrollbar-width:none] sm:justify-center [&::-webkit-scrollbar]:hidden">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div
                      key={index}
                      className="h-[174px] w-[140px] shrink-0 rounded-[18px] border border-[#ece6db] bg-[#fcfbf8] sm:w-[158px]"
                    />
                  ))}
                </div>
              ) : leaderboardEntries.length > 0 ? (
                <div className="flex justify-start gap-3 overflow-x-auto pb-1.5 pt-1.5 [scrollbar-width:none] sm:justify-center [&::-webkit-scrollbar]:hidden">
                  {leaderboardEntries.slice(0, 3).map(
                  (group, index) => {
                    const isTop = index === 0
                    const rank = index + 1
                    return (
                      <button
                        key={group.id}
                        type="button"
                        onClick={() => {
                          router.push(`/groups/${group.id}`)
                        }}
                        className={`flex w-[140px] shrink-0 flex-col items-center rounded-[18px] border px-3 py-3 text-center transition hover:-translate-y-0.5 sm:w-[158px] sm:px-4 sm:py-4 ${
                          selectedGroupId === group.id
                            ? 'border-[#2d7651] bg-[#fcfbf8]'
                            : isTop
                              ? 'border-[#e7c16a] bg-[#fcfbf8]'
                              : 'border-[#ece6db] bg-white'
                        }`}
                      >
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e7c16a] text-[11px] font-semibold text-white">
                          {rank}
                        </div>
                        <div className="mt-3 flex h-11 w-11 items-center justify-center rounded-[14px] bg-[#fcfbf8] text-[16px] shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] sm:mt-4 sm:h-12 sm:w-12 sm:text-[18px]">
                          {groupMonogram(group.name)}
                        </div>
                        <div className="mt-3 line-clamp-2 font-serif text-[15px] font-semibold leading-tight text-[#102018] sm:mt-4 sm:text-[16px]">
                          {group.name}
                        </div>
                        <div className="mt-1 text-[15px] font-semibold text-[#2d7651]">
                          {formatScore(group.score)}
                        </div>
                        <div className="mt-0.5 text-[10px] text-[#637268]">
                          {formatMemberCount(group.members)}
                        </div>
                      </button>
                    )
                  }
                )}
                </div>
              ) : (
                <div className="rounded-[16px] border border-dashed border-[#e6dfd3] bg-[#fcfbf8] px-3.5 py-4 text-[13px] text-[#637268]">
                  No groups yet. Create one below and become the first team on the board.
                </div>
              )}
            </section>

            <section className="rounded-[18px] border border-[#e6dfd3] bg-white px-4 py-4 sm:rounded-[22px] sm:px-5 sm:py-5">
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
              <div className="mt-3 space-y-2">
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
                            ) : (
                              <span className="ml-2 text-[#53715f]">
                                {scoreDelta || group.score} behind #{rank - 1}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-serif text-[18px] font-semibold leading-none text-[#102018]">
                            {formatScore(group.score)}
                          </div>
                          <div className="mt-0.5 text-[9px] uppercase tracking-[0.14em] text-[#637268]">
                            score
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

            <section className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  setGroupActionMode('join')
                  setShowJoinPanel(prev => (groupActionMode === 'join' ? !prev : true))
                }}
                className="flex items-center gap-3 rounded-[18px] border border-[#e6dfd3] bg-white px-4 py-3 text-left transition hover:-translate-y-0.5 sm:py-4"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#fcfbf8] text-[18px]">
                  <UserPlus size={20} strokeWidth={2} />
                </div>
                <div>
                  <div className="text-[13px] font-semibold text-[#102018]">Join a Group</div>
                  <div className="text-[12px] text-[#637268]">Enter code or create</div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (selectedGroup) {
                    void shareInviteLink(selectedGroup)
                    return
                  }
                  setGroupActionMode('join')
                  setShowJoinPanel(true)
                }}
                className="flex items-center gap-3 rounded-[18px] border border-[#e6dfd3] bg-white px-4 py-3 text-left transition hover:-translate-y-0.5 sm:py-4"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#fcfbf8] text-[18px]">
                  <Share2 size={20} strokeWidth={2} />
                </div>
                <div>
                  <div className="text-[13px] font-semibold text-[#102018]">
                    {selectedGroup && copiedCode === selectedGroup.id ? 'Link copied' : 'Invite Friends'}
                  </div>
                  <div className="text-[12px] text-[#637268]">Grow your group</div>
                </div>
              </button>
            </section>

            {showJoinPanel ? (
              <section className="rounded-[18px] border border-[#e6dfd3] bg-white px-4 py-4 sm:rounded-[22px] sm:px-5 sm:py-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#637268]">
                      {groupActionMode === 'join' ? 'Join a group' : 'Create a group'}
                    </div>
                    <div className="mt-1 text-[12px] text-[#637268]">
                      {groupActionMode === 'join'
                        ? 'Use an invite code from a teammate.'
                        : 'Start a private leaderboard for your team.'}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 rounded-full border border-[#e6dfd3] bg-[#fcfbf8] p-1 text-[11px] font-semibold">
                    <button
                      type="button"
                      onClick={() => setGroupActionMode('join')}
                      className={`rounded-full px-3 py-1.5 transition ${
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
                      className={`rounded-full px-3 py-1.5 transition ${
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
                        placeholder="Invite code"
                        className="w-full rounded-[14px] border border-[#dfd8cb] bg-white px-3 py-2 text-[12px] uppercase text-[#102018] outline-none transition focus:border-[#2d7651]"
                      />
                      <input
                        value={joinDisplayName}
                        onChange={event => setJoinDisplayName(event.target.value)}
                        placeholder="Your display name"
                        className="w-full rounded-[14px] border border-[#dfd8cb] bg-white px-3 py-2 text-[12px] text-[#102018] outline-none transition focus:border-[#2d7651]"
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
                        className="inline-flex h-10 items-center justify-center rounded-full border border-[#2d7651] bg-[#2d7651] px-5 text-[12px] font-semibold text-white transition hover:bg-[#255e42] disabled:cursor-not-allowed disabled:opacity-50"
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
                    <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
                      <input
                        value={createName}
                        onChange={event => setCreateName(event.target.value)}
                        placeholder="Group name"
                        className="w-full rounded-[14px] border border-[#dfd8cb] bg-white px-3 py-2 text-[12px] text-[#102018] outline-none transition focus:border-[#2d7651]"
                      />
                      <input
                        value={createDisplayName}
                        onChange={event => setCreateDisplayName(event.target.value)}
                        placeholder="Your display name"
                        className="w-full rounded-[14px] border border-[#dfd8cb] bg-white px-3 py-2 text-[12px] text-[#102018] outline-none transition focus:border-[#2d7651]"
                      />
                      <input
                        value={createCode}
                        onChange={event => setCreateCode(normalizeJoinCode(event.target.value))}
                        placeholder="Custom code"
                        className="w-full rounded-[14px] border border-[#dfd8cb] bg-white px-3 py-2 text-[12px] uppercase text-[#102018] outline-none transition focus:border-[#2d7651]"
                      />
                      <button
                        type="button"
                        disabled={creating || !createName.trim() || !createDisplayName.trim()}
                        onClick={() => void submitGroupForm()}
                        className="inline-flex h-10 items-center justify-center rounded-full border border-[#2d7651] bg-[#2d7651] px-5 text-[12px] font-semibold text-white transition hover:bg-[#255e42] disabled:cursor-not-allowed disabled:opacity-50"
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
