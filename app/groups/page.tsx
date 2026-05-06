'use client'

import { useEffect, useMemo, useState } from 'react'
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
  isPlaceholder?: boolean
}

const SELECTED_GROUP_STORAGE_KEY = 'orthodle_selected_group'
const PLACEHOLDER_GROUPS: DisplayGroup[] = [
  {
    id: 'placeholder-ucla',
    name: 'UCLA Ortho & MSK',
    members: 48,
    score: 1952,
    avgAccuracy: 31,
    longestStreak: 7,
    isPlaceholder: true,
  },
  {
    id: 'placeholder-ucsf',
    name: 'UCSF Ortho',
    members: 42,
    score: 1842,
    avgAccuracy: 29,
    longestStreak: 6,
    isPlaceholder: true,
  },
  {
    id: 'placeholder-bone-bros',
    name: 'Bone Bros',
    members: 12,
    score: 1523,
    avgAccuracy: 27,
    longestStreak: 5,
    isPlaceholder: true,
  },
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
  const [copiedCode, setCopiedCode] = useState('')
  const [urlJoinCode, setUrlJoinCode] = useState('')
  const [timeframe, setTimeframe] = useState<'week' | 'all'>('week')
  const [actionMode, setActionMode] = useState<'create' | 'join'>('join')
  const sessionId = useMemo(() => getSessionId(), [])

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
    if (typeof window === 'undefined') return
    const codeFromUrl = normalizeJoinCode(new URLSearchParams(window.location.search).get('code') || '')
    setUrlJoinCode(codeFromUrl)
    if (codeFromUrl) {
      setJoinCode(codeFromUrl)
    }
  }, [])

  useEffect(() => {
    if (groups.length === 0) return

    const matchingGroup = urlJoinCode
      ? groups.find(group => group.join_code === urlJoinCode)
      : undefined
    const storedGroupId =
      typeof window !== 'undefined' ? window.localStorage.getItem(SELECTED_GROUP_STORAGE_KEY) : ''

    const nextSelected =
      matchingGroup?.id ||
      (storedGroupId && groups.some(group => group.id === storedGroupId) ? storedGroupId : '') ||
      groups[0].id

    if (nextSelected) {
      setSelectedGroupId(prev => prev || nextSelected)
    }
  }, [groups, urlJoinCode])

  useEffect(() => {
    if (!selectedGroupId || typeof window === 'undefined') return
    window.localStorage.setItem(SELECTED_GROUP_STORAGE_KEY, selectedGroupId)
  }, [selectedGroupId])

  const selectedGroup = groups.find(group => group.id === selectedGroupId) || null
  const selectedMembers = useMemo(
    () => members.filter(member => member.group_id === selectedGroupId),
    [members, selectedGroupId]
  )

  const timeframeCaseLookup = useMemo(() => {
    if (timeframe === 'all') return caseLookup

    const cutoff = new Date()
    cutoff.setHours(0, 0, 0, 0)
    cutoff.setDate(cutoff.getDate() - 6)

    return Object.fromEntries(
      Object.entries(caseLookup).filter(([, row]) => {
        const date = new Date(`${row.case_date}T12:00:00`)
        return date >= cutoff
      })
    )
  }, [caseLookup, timeframe])

  const groupAggregates = useMemo<GroupAggregate[]>(() => {
    return groups
      .map(group => {
        const groupMembers = members.filter(member => member.group_id === group.id)
        const memberStats = groupMembers.map(member => buildMemberStats(member, guessRows, timeframeCaseLookup))

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
  }, [groups, guessRows, members, timeframeCaseLookup])

  const selectedGroupAggregate =
    groupAggregates.find(entry => entry.group.id === selectedGroupId) || null
  const selectedGroupRank = selectedGroupAggregate
    ? groupAggregates.findIndex(entry => entry.group.id === selectedGroupAggregate.group.id) + 1
    : null
  const topGroups = groupAggregates.slice(0, 3)
  const myMembership = selectedMembers.find(member => member.session_id === sessionId) || null
  const activeGroupsThisWeek = groupAggregates.filter(entry => entry.totalSolves > 0).length
  const displayTopGroups: DisplayGroup[] =
    topGroups.length > 0
      ? topGroups.map(entry => ({
          id: entry.group.id,
          name: entry.group.name,
          members: entry.members.length,
          score: entry.score,
          avgAccuracy: entry.avgAccuracy,
          longestStreak: entry.longestStreak,
        }))
      : PLACEHOLDER_GROUPS
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
      : PLACEHOLDER_GROUPS
  const todayDate = new Date().toISOString().slice(0, 10)
  const selectedGroupTodayActiveCount = selectedGroup
    ? new Set(
        guessRows
          .filter(
            row =>
              row.created_at.slice(0, 10) === todayDate &&
              selectedMembers.some(member => member.session_id === row.session_id)
          )
          .map(row => row.session_id)
      ).size
    : 0
  const nextRankGroup =
    selectedGroupRank && selectedGroupRank > 1 ? groupAggregates[selectedGroupRank - 2] : null
  const pointsBehindNextGroup =
    selectedGroupAggregate && nextRankGroup
      ? Math.max(0, nextRankGroup.score - selectedGroupAggregate.score)
      : null
  const progressToNextRank =
    selectedGroupAggregate && nextRankGroup && nextRankGroup.score > 0
      ? Math.min(100, (selectedGroupAggregate.score / nextRankGroup.score) * 100)
      : selectedGroupAggregate
        ? 100
        : 0
  const selectedWeeklyMomentum = selectedGroupAggregate
    ? Math.round(selectedGroupAggregate.totalSolves * 18 + selectedGroupAggregate.longestStreak * 9)
    : 0

  async function createGroup() {
    const name = createName.trim()
    const displayName = createDisplayName.trim()
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
    setSelectedGroupId(groupData.id)
    setCreating(false)
    setMessage(`Created ${groupData.name}. Invite code: ${groupData.join_code}`)
    await loadGroupsData()
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
    setSelectedGroupId(targetGroup.id)
    setJoining(false)
    setMessage(`Joined ${targetGroup.name}.`)
    await loadGroupsData()
  }

  async function copyInviteCode(group: GroupRow) {
    const link = buildInviteLink(group.join_code)
    await navigator.clipboard.writeText(link)
    setCopiedCode(group.id)
    window.setTimeout(() => setCopiedCode(''), 1800)
  }

  return (
    <main className="app-surface min-h-screen">
      <Header />

      <section className="mx-auto max-w-[940px] px-2.5 py-2.5 sm:px-3 sm:py-3">
        <div className="night-surface rounded-[20px] border border-[#e7e1d6] bg-white p-2.5 shadow-[0_8px_18px_rgba(16,32,24,0.03)] sm:rounded-[22px] sm:p-3">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-2 sm:gap-2.5">
                <div className="inline-flex h-8.5 w-8.5 items-center justify-center rounded-xl border border-[#e7e1d6] bg-[#fcfbf8] text-[17px] text-[#1f6448] sm:h-9 sm:w-9 sm:text-[18px]">
                  👥
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#637268]">
                    Groups
                  </div>
                  <h1 className="mt-0.5 font-serif text-[23px] font-bold leading-none tracking-[-0.04em] text-[#102018] sm:text-[27px]">
                    Groups
                  </h1>
                </div>
              </div>
              <p className="mt-1.5 max-w-xl pr-1 text-[12px] leading-5 text-[#637268] sm:mt-2 sm:text-[13px]">
                Compete, collaborate, and climb the ranks with your residency, class, or friend
                group.
              </p>
            </div>

            <div className="inline-flex w-full items-center gap-2 rounded-[16px] border border-[#e7e1d6] bg-[#fcfbf8] px-3 py-2 sm:w-auto sm:rounded-[18px]">
              <span className="text-base text-[#637268]">🗓</span>
              <select
                value={timeframe}
                onChange={event => setTimeframe(event.target.value as 'week' | 'all')}
                className="w-full bg-transparent text-[13px] font-semibold text-[#102018] outline-none sm:w-auto"
              >
                <option value="week">This Week</option>
                <option value="all">All Time</option>
              </select>
            </div>
          </div>

          {message ? (
            <div className="mt-3 rounded-2xl border border-[#e7e1d6] bg-[#fcfbf8] px-3.5 py-2.5 text-[13px] text-[#355542]">
              {message}
            </div>
          ) : null}

          <div className="mt-2.5 grid items-start gap-2.5 xl:grid-cols-[1.12fr_0.88fr] xl:gap-2.5">
            <div className="h-fit rounded-[18px] border border-[#e7e1d6] bg-white p-2.5 shadow-[0_8px_18px_rgba(16,32,24,0.03)] sm:rounded-[20px] sm:p-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#637268]">
                Your group
              </div>

              {selectedGroup && selectedGroupAggregate ? (
                <>
                  <button
                    type="button"
                    onClick={() => setActionMode('join')}
                    className="mt-2.5 block w-full rounded-[16px] border border-[#ebe5db] bg-[#fcfbf8] p-2.5 text-left transition hover:bg-white sm:rounded-[18px] sm:p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] border border-[#e7d5b5] bg-[radial-gradient(circle_at_30%_30%,#fff3d8,transparent_45%),linear-gradient(180deg,#173d30,#1f6448)] px-3 text-center text-[13px] font-bold text-[#f8e1a0] shadow-[inset_0_1px_0_rgba(255,255,255,0.24)] sm:h-13 sm:w-13 sm:rounded-[18px] sm:text-sm">
                          {groupMonogram(selectedGroup.name)}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-serif text-[18px] font-semibold tracking-[-0.03em] text-[#102018] sm:text-[20px]">
                            {selectedGroup.name}
                          </div>
                          <div className="mt-0.5 text-[12px] text-[#637268] sm:text-[13px]">
                            {selectedGroupAggregate.members.length} members
                          </div>
                          <div className="mt-1 text-[9px] font-semibold uppercase tracking-[0.15em] text-[#637268] sm:text-[10px] sm:tracking-[0.16em]">
                            Code {selectedGroup.join_code}
                            {myMembership ? ` · ${myMembership.display_name}` : ''}
                          </div>
                        </div>
                      </div>
                      <div className="text-xl text-[#637268]">›</div>
                    </div>
                  </button>

                  <div className="mt-2.5 grid grid-cols-2 gap-2 border-t border-[#ece6db] pt-2.5 sm:grid-cols-4 sm:gap-2">
                    <div className="px-1 sm:px-2">
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#637268]">
                        Rank
                      </div>
                      <div className="mt-1 font-serif text-[24px] font-semibold leading-none text-[#102018] sm:text-[26px]">
                        #{selectedGroupRank}
                      </div>
                      <div className="mt-1 text-[11px] text-[#637268] sm:text-[12px]">
                        of {groupAggregates.length || 1}
                      </div>
                    </div>
                    <div className="border-l border-[#ece6db] px-3 sm:px-4">
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#637268]">
                        Score
                      </div>
                      <div className="mt-1 font-serif text-[24px] font-semibold leading-none text-[#102018] sm:text-[26px]">
                        {formatScore(selectedGroupAggregate.score)}
                      </div>
                      <div className="mt-1 text-[11px] text-[#637268] sm:text-[12px]">Group points</div>
                    </div>
                    <div className="border-l border-[#ece6db] px-3 sm:px-4">
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#637268]">
                        Avg accuracy
                      </div>
                      <div className="mt-1 font-serif text-[24px] font-semibold leading-none text-[#102018] sm:text-[26px]">
                        {selectedGroupAggregate.avgAccuracy !== null
                          ? `${Math.round(selectedGroupAggregate.avgAccuracy)}%`
                          : '—'}
                      </div>
                      <div className="mt-1 text-[11px] text-[#2d7651] sm:text-[12px]">
                        {timeframe === 'week' ? 'This week' : 'All time'}
                      </div>
                    </div>
                    <div className="border-l border-[#ece6db] px-3 sm:px-4">
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#637268]">
                        Streak
                      </div>
                      <div className="mt-1 font-serif text-[24px] font-semibold leading-none text-[#102018] sm:text-[26px]">
                        {selectedGroupAggregate.longestStreak}
                      </div>
                      <div className="mt-1 text-[11px] text-[#637268] sm:text-[12px]">days 🔥</div>
                    </div>
                  </div>

                  <div className="mt-2.5 grid gap-2 sm:grid-cols-3">
                    <div className="rounded-[14px] border border-[#eee7dd] bg-[#fcfbf8] px-3 py-2 sm:rounded-[16px]">
                      <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#637268]">
                        Recent activity
                      </div>
                      <div className="mt-1 text-[12px] font-semibold text-[#102018] sm:text-[13px]">
                        {selectedGroupTodayActiveCount} members active today
                      </div>
                    </div>
                    <div className="rounded-[14px] border border-[#eee7dd] bg-[#fcfbf8] px-3 py-2 sm:rounded-[16px]">
                      <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#637268]">
                        Weekly momentum
                      </div>
                      <div className="mt-1 text-[12px] font-semibold text-[#102018] sm:text-[13px]">
                        +{selectedWeeklyMomentum} pts this week
                      </div>
                    </div>
                    <div className="rounded-[14px] border border-[#eee7dd] bg-[#fcfbf8] px-3 py-2 sm:rounded-[16px]">
                      <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#637268]">
                        Next rank
                      </div>
                      <div className="mt-1 text-[12px] font-semibold text-[#102018] sm:text-[13px]">
                        {pointsBehindNextGroup !== null
                          ? `${pointsBehindNextGroup} behind ${nextRankGroup?.group.name}`
                          : 'You’re in first'}
                      </div>
                      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[#ebe5db]">
                        <div
                          className="h-full rounded-full bg-[#2d7651] transition-all duration-500"
                          style={{ width: `${progressToNextRank}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="mt-2.5 rounded-[18px] border border-dashed border-[#e6dfd3] bg-[#fcfbf8] px-3.5 py-4 text-sm text-[#7a857c] sm:mt-3 sm:rounded-[20px]">
                  Create or join a group to unlock the live leaderboard.
                </div>
              )}
            </div>

            <div className="space-y-2.5">
              <div className="rounded-[18px] border border-[#e7e1d6] bg-white p-2.5 shadow-[0_8px_18px_rgba(16,32,24,0.03)] sm:rounded-[20px] sm:p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#637268]">
                    Top 3 groups
                  </div>
                  <div className="text-[12px] text-[#637268]">
                    {timeframe === 'week' ? 'This week' : 'All time'}
                  </div>
                </div>
                <div className="-mx-1 mt-3 flex gap-2.5 overflow-x-auto px-1 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0">
                  {displayTopGroups.map((entry, index) => {
                    const highlight = index === 0
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => {
                          if (!entry.isPlaceholder) setSelectedGroupId(entry.id)
                        }}
                      className={`min-w-[138px] rounded-[16px] border px-2.5 py-3 text-center transition duration-200 active:scale-[0.98] sm:min-w-[150px] sm:rounded-[18px] sm:px-3 sm:py-3.5 ${
                          highlight
                            ? 'border-[#e6b54b] bg-[#fffaf0] shadow-[0_10px_24px_rgba(201,107,55,0.08)] hover:-translate-y-0.5 hover:shadow-[0_14px_28px_rgba(201,107,55,0.12)]'
                            : 'border-[#e7e1d6] bg-[#fcfbf8] hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_12px_24px_rgba(16,32,24,0.06)]'
                        }`}
                      >
                        <div
                          className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold ${
                            index === 0
                              ? 'bg-[#ecb632] text-white'
                              : index === 1
                                ? 'bg-[#d8dbe0] text-white'
                                : 'bg-[#c9874d] text-white'
                          }`}
                        >
                          {index + 1}
                        </div>
                        <div className="mx-auto mt-2.5 flex h-10 w-10 items-center justify-center rounded-[14px] border border-[#e7d5b5] bg-[radial-gradient(circle_at_30%_30%,#fff3d8,transparent_45%),linear-gradient(180deg,#173d30,#1f6448)] text-[11px] font-bold text-[#f8e1a0] sm:h-11 sm:w-11 sm:rounded-[15px] sm:text-xs">
                          {groupMonogram(entry.name)}
                        </div>
                        <div className="mt-2 text-[13px] font-semibold text-[#102018] sm:text-[14px]">
                          {entry.name}
                        </div>
                        <div
                          className={`mt-1.5 font-serif text-[20px] font-semibold leading-none sm:text-[22px] ${
                            highlight ? 'text-[#df9c25]' : 'text-[#123426]'
                          }`}
                        >
                          {formatScore(entry.score)}
                        </div>
                        <div className="mt-1 text-[10px] text-[#637268] sm:text-[11px]">{entry.members} members</div>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="rounded-[18px] border border-[#e7e1d6] bg-white p-2.5 shadow-[0_8px_18px_rgba(16,32,24,0.03)] sm:rounded-[20px] sm:p-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#637268]">
                  {actionMode === 'create' ? 'Create your group' : 'Join a group'}
                </div>
                <div className="mt-2.5 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setActionMode('create')}
                    className={`inline-flex min-h-[34px] items-center justify-center rounded-full px-3.5 text-[10px] font-semibold uppercase tracking-[0.13em] transition ${
                      actionMode === 'create'
                        ? 'border border-[#2d7651] bg-[#2d7651] text-white'
                        : 'border border-[#ded7ca] bg-[#fcfbf8] text-[#637268]'
                    }`}
                  >
                    Create
                  </button>
                  <button
                    type="button"
                    onClick={() => setActionMode('join')}
                    className={`inline-flex min-h-[34px] items-center justify-center rounded-full px-3.5 text-[10px] font-semibold uppercase tracking-[0.13em] transition ${
                      actionMode === 'join'
                        ? 'border border-[#2d7651] bg-[#2d7651] text-white'
                        : 'border border-[#ded7ca] bg-[#fcfbf8] text-[#637268]'
                    }`}
                  >
                    Join
                  </button>
                </div>

                <div className="mt-3 space-y-2.5 sm:mt-3.5">
                  <p className="text-[12px] leading-5 text-[#637268] sm:text-[13px]">
                    Compete with classmates, residents, or friends.{` `}
                    {activeGroupsThisWeek > 0
                      ? `${activeGroupsThisWeek} groups active this week.`
                      : 'Be the first active group this week.'}
                  </p>
                  {actionMode === 'create' ? (
                    <>
                      <input
                        value={createName}
                        onChange={event => setCreateName(event.target.value)}
                        placeholder="UCLA Ortho & MSK"
                        className="w-full rounded-[16px] border border-[#dfd8cb] bg-white px-3.5 py-2.5 text-[13px] text-[#102018] outline-none transition focus:border-[#2d7651] sm:rounded-[18px]"
                      />
                      <input
                        value={createDisplayName}
                        onChange={event => setCreateDisplayName(event.target.value)}
                        placeholder="Your display name"
                        className="w-full rounded-[16px] border border-[#dfd8cb] bg-white px-3.5 py-2.5 text-[13px] text-[#102018] outline-none transition focus:border-[#2d7651] sm:rounded-[18px]"
                      />
                      <input
                        value={createCode}
                        onChange={event => setCreateCode(normalizeJoinCode(event.target.value))}
                        placeholder="Optional invite code"
                        className="w-full rounded-[16px] border border-[#dfd8cb] bg-white px-3.5 py-2.5 text-[13px] uppercase text-[#102018] outline-none transition focus:border-[#2d7651] sm:rounded-[18px]"
                      />
                      <button
                        type="button"
                        disabled={creating}
                        onClick={() => void createGroup()}
                        className="inline-flex min-h-[38px] items-center justify-center rounded-full border border-[#2d7651] bg-[#2d7651] px-4 text-[13px] font-semibold text-white transition hover:bg-[#255e42] disabled:opacity-60"
                      >
                        {creating ? 'Creating...' : 'Create group'}
                      </button>
                    </>
                  ) : (
                    <>
                      <input
                        value={joinCode}
                        onChange={event => setJoinCode(normalizeJoinCode(event.target.value))}
                        placeholder="Invite code"
                        className="w-full rounded-[16px] border border-[#dfd8cb] bg-white px-3.5 py-2.5 text-[13px] uppercase text-[#102018] outline-none transition focus:border-[#2d7651] sm:rounded-[18px]"
                      />
                      <input
                        value={joinDisplayName}
                        onChange={event => setJoinDisplayName(event.target.value)}
                        placeholder="Your display name"
                        className="w-full rounded-[16px] border border-[#dfd8cb] bg-white px-3.5 py-2.5 text-[13px] text-[#102018] outline-none transition focus:border-[#2d7651] sm:rounded-[18px]"
                      />
                      <button
                        type="button"
                        disabled={joining}
                        onClick={() => void joinGroup()}
                        className="inline-flex min-h-[38px] items-center justify-center rounded-full border border-[#2d7651] bg-[#2d7651] px-4 text-[13px] font-semibold text-white transition hover:bg-[#255e42] disabled:opacity-60"
                      >
                        {joining ? 'Joining...' : 'Join group'}
                      </button>
                    </>
                  )}
                </div>

                {selectedGroup ? (
                  <button
                    type="button"
                    onClick={() => void copyInviteCode(selectedGroup)}
                    className="mt-2.5 inline-flex w-full min-h-[38px] items-center justify-center rounded-full border border-[#2d7651] bg-[#2d7651] px-4 text-[13px] font-semibold text-white shadow-[0_8px_18px_rgba(45,118,81,0.16)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#255e42] hover:shadow-[0_12px_22px_rgba(45,118,81,0.2)] active:scale-[0.98] sm:w-auto"
                  >
                    {copiedCode === selectedGroup.id ? 'Invite link copied' : 'Invite friends'}
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="mt-2.5 grid items-start gap-2.5 xl:grid-cols-[1.08fr_0.92fr] xl:gap-2.5">
            <div className="rounded-[18px] border border-[#e7e1d6] bg-white p-2.5 shadow-[0_8px_18px_rgba(16,32,24,0.03)] sm:rounded-[20px] sm:p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#637268]">
                  Leaderboard
                </div>
                <div className="text-[12px] text-[#637268]">All groups</div>
              </div>
              <div className="mt-2.5 space-y-2">
                {displayLeaderboard.map((entry, index) => {
                  const previousScore = displayLeaderboard[index - 1]?.score ?? null
                  const scoreGap = previousScore !== null ? previousScore - entry.score : null
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => {
                        if (!entry.isPlaceholder) setSelectedGroupId(entry.id)
                      }}
                    className={`flex w-full items-center gap-2.5 rounded-[15px] border px-3 py-2.5 text-left transition duration-200 active:scale-[0.995] sm:gap-3 sm:rounded-[16px] sm:px-3 ${
                        entry.id === selectedGroupId
                          ? 'border-[#d9d2c2] bg-[#fcfbf8] shadow-[0_10px_20px_rgba(16,32,24,0.04)]'
                          : 'border-[#eee7dd] bg-white hover:-translate-y-0.5 hover:bg-[#fcfbf8] hover:shadow-[0_10px_20px_rgba(16,32,24,0.04)]'
                      }`}
                    >
                      <div className="w-5 text-center text-lg font-semibold text-[#102018]">
                        {index + 1}
                      </div>
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-[#e7d5b5] bg-[radial-gradient(circle_at_30%_30%,#fff3d8,transparent_45%),linear-gradient(180deg,#173d30,#1f6448)] px-2 text-center text-[11px] font-bold text-[#f8e1a0] sm:h-11 sm:w-11 sm:rounded-[15px] sm:text-xs">
                        {groupMonogram(entry.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[16px] font-semibold leading-none tracking-[-0.03em] text-[#102018] sm:text-[18px]">
                          {entry.name}
                        </div>
                        <div className="mt-0.5 text-[11px] text-[#637268] sm:text-[12px]">
                          {entry.members} members
                        </div>
                        {index === 0 ? (
                          <div className="mt-1 text-[11px] text-[#2d7651] sm:text-[12px]">Leading the pack</div>
                        ) : scoreGap !== null ? (
                          <div className="mt-1 text-[11px] text-[#2d7651] sm:text-[12px]">{scoreGap} behind #{index}</div>
                        ) : null}
                      </div>
                      <div className="text-right">
                        <div className="font-serif text-[20px] font-semibold leading-none text-[#123426] sm:text-[22px]">
                          {formatScore(entry.score)}
                        </div>
                        <div className="mt-1 text-[11px] text-[#637268] sm:text-[12px]">score</div>
                      </div>
                      <div className="text-base text-[#637268]">›</div>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="rounded-[18px] border border-[#e7e1d6] bg-white p-2.5 shadow-[0_8px_18px_rgba(16,32,24,0.03)] sm:rounded-[20px] sm:p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#637268]">
                  In-group leaderboard
                </div>
                <div className="text-[12px] text-[#637268]">
                  {selectedGroup?.name || 'Choose a group'}
                </div>
              </div>

              <div className="mt-2.5 max-h-[380px] space-y-2 overflow-y-auto pr-0.5 sm:max-h-[420px]">
                {loading ? (
                  <div className="rounded-2xl border border-dashed border-[#e6dfd3] bg-[#fcfbf8] px-4 py-5 text-sm text-[#7a857c]">
                    Loading leaderboard...
                  </div>
                ) : !selectedGroupAggregate || selectedGroupAggregate.memberStats.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[#e6dfd3] bg-[#fcfbf8] px-4 py-5 text-sm text-[#7a857c]">
                    Once members start solving cases, their rank, streak, and efficiency will show
                    up here.
                  </div>
                ) : (
                  selectedGroupAggregate.memberStats.slice(0, 5).map((entry, index) => (
                    <div key={entry.member.id} className="rounded-[15px] border border-[#eee7dd] bg-[#fcfbf8] px-3 py-2.5 sm:rounded-[16px]">
                      <div className="flex items-start gap-2.5 sm:gap-3">
                        <div className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#ded7ca] bg-white text-[11px] font-semibold text-[#637268] sm:h-9 sm:w-9 sm:text-xs">
                          {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : index + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-[15px] font-semibold tracking-[-0.03em] text-[#102018] sm:text-[17px]">
                                {entry.member.display_name}
                              </div>
                              <div className="mt-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#637268] sm:text-[10px] sm:tracking-[0.16em]">
                                {entry.solves} solves
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-serif text-[18px] font-semibold leading-none text-[#123426] sm:text-[20px]">
                                {entry.avgGuesses !== null ? entry.avgGuesses.toFixed(1) : '—'}
                              </div>
                              <div className="mt-1 text-[10px] text-[#637268] sm:text-[11px]">avg guesses</div>
                            </div>
                          </div>
                          <div className="mt-2 grid grid-cols-3 gap-2 border-t border-[#ece6db] pt-2 text-center">
                            <div>
                              <div className="text-[8px] font-bold uppercase tracking-[0.14em] text-[#637268] sm:text-[9px] sm:tracking-[0.16em]">
                                Accuracy
                              </div>
                              <div className="mt-1 text-[15px] font-semibold text-[#102018] sm:text-base">
                                {entry.totalGuesses > 0
                                  ? `${Math.round((entry.correctGuesses / entry.totalGuesses) * 100)}%`
                                  : '—'}
                              </div>
                            </div>
                            <div>
                              <div className="text-[8px] font-bold uppercase tracking-[0.14em] text-[#637268] sm:text-[9px] sm:tracking-[0.16em]">
                                Longest streak
                              </div>
                              <div className="mt-1 text-[15px] font-semibold text-[#102018] sm:text-base">
                                {entry.longestStreak}
                              </div>
                            </div>
                            <div>
                              <div className="text-[8px] font-bold uppercase tracking-[0.14em] text-[#637268] sm:text-[9px] sm:tracking-[0.16em]">
                                First-try
                              </div>
                              <div className="mt-1 text-[15px] font-semibold text-[#102018] sm:text-base">
                                {entry.firstTrySolves}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <PublicFooter />
    </main>
  )
}
