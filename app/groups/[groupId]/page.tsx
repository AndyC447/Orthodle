'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Share2, UserPlus } from 'lucide-react'
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

function normalizeJoinCode(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12)
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

function formatLevel(level: CaseRow['level']) {
  if (level === 'med_student') return 'Med Student'
  if (level === 'resident') return 'Resident'
  return 'Attending'
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

function buildGroupAggregates(
  groups: GroupRow[],
  members: GroupMemberRow[],
  guesses: GuessRow[],
  caseLookup: Record<string, CaseRow>
): GroupAggregate[] {
  return groups
    .map(group => {
      const groupMembers = members.filter(member => member.group_id === group.id)
      const memberStats = groupMembers.map(member => buildMemberStats(member, guesses, caseLookup))
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
}

export default function GroupDetailPage() {
  const params = useParams<{ groupId: string }>()
  const router = useRouter()
  const groupId = Array.isArray(params.groupId) ? params.groupId[0] : params.groupId
  const sessionId = useMemo(() => getSessionId(), [])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [groups, setGroups] = useState<GroupRow[]>([])
  const [members, setMembers] = useState<GroupMemberRow[]>([])
  const [guesses, setGuesses] = useState<GuessRow[]>([])
  const [caseLookup, setCaseLookup] = useState<Record<string, CaseRow>>({})
  const [displayName, setDisplayName] = useState('')
  const [joining, setJoining] = useState(false)
  const [copied, setCopied] = useState(false)

  async function loadGroupPageData() {
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
      setGuesses([])
      setCaseLookup({})
      setLoading(false)
      return
    }

    const { data: guessData, error: guessError } = await supabase
      .from('guesses')
      .select('session_id, case_id, is_correct, created_at')
      .in('session_id', memberSessionIds)
      .order('created_at', { ascending: true })

    if (guessError) {
      setMessage(guessError.message)
      setLoading(false)
      return
    }

    const allGuesses = (guessData || []) as GuessRow[]
    setGuesses(allGuesses)

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
    void loadGroupPageData()
  }, [groupId])

  useEffect(() => {
    const refresh = () => void loadGroupPageData()
    const channel = supabase
      .channel(`group-detail-${groupId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'groups' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'guesses' }, refresh)
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [groupId])

  const groupAggregates = useMemo(
    () => buildGroupAggregates(groups, members, guesses, caseLookup),
    [groups, members, guesses, caseLookup]
  )
  const aggregate = groupAggregates.find(entry => entry.group.id === groupId) || null
  const group = aggregate?.group || groups.find(entry => entry.id === groupId) || null
  const rank = aggregate ? groupAggregates.findIndex(entry => entry.group.id === groupId) + 1 : null
  const membership = members.find(
    member => member.group_id === groupId && member.session_id === sessionId
  )
  const memberBySession = new Map(
    members.filter(member => member.group_id === groupId).map(member => [member.session_id, member])
  )
  const pointsContext =
    aggregate && rank && rank > 1
      ? `${Math.max(0, groupAggregates[rank - 2].score - aggregate.score)} points behind #${rank - 1}`
      : aggregate && groupAggregates.length > 1
        ? `${Math.max(0, aggregate.score - groupAggregates[1].score)} points ahead of #2`
        : 'Leading the pack'
  const recentSolves = guesses
    .filter(row => row.is_correct && row.case_id && memberBySession.has(row.session_id))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 8)
    .map(row => ({
      guess: row,
      member: memberBySession.get(row.session_id)!,
      caseInfo: row.case_id ? caseLookup[row.case_id] : null,
    }))

  useEffect(() => {
    setDisplayName(membership?.display_name || '')
  }, [membership?.id, membership?.display_name])

  async function joinThisGroup() {
    if (!group || !displayName.trim()) {
      setMessage('Add your display name first.')
      return
    }

    setJoining(true)
    setMessage('')

    if (membership) {
      const { error } = await supabase
        .from('group_members')
        .update({ display_name: displayName.trim() })
        .eq('id', membership.id)
        .eq('session_id', sessionId)

      if (error) {
        setJoining(false)
        setMessage(error.message)
        return
      }
    } else {
      const { error } = await supabase.from('group_members').insert({
        group_id: group.id,
        session_id: sessionId,
        display_name: displayName.trim(),
      })

      if (error) {
        setJoining(false)
        setMessage(error.message)
        return
      }
    }

    window.localStorage.setItem(membershipKey(group.id), displayName.trim())
    setJoining(false)
    setMessage(membership ? 'Display name updated.' : `Joined ${group.name}.`)
    await loadGroupPageData()
  }

  async function shareInvite() {
    if (!group) return

    const link = buildInviteLink(group.join_code)
    const shareText = `Join my Orthodle group "${group.name}" and climb the leaderboard with us.`

    if (navigator.share) {
      try {
        await navigator.share({
          title: `${group.name} on Orthodle`,
          text: shareText,
          url: link,
        })
        return
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
      }
    }

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
      return
    }

    setMessage(`Invite code: ${group.join_code}`)
  }

  return (
    <main className="app-surface min-h-screen">
      <Header />

      <section className="mx-auto max-w-[700px] px-2 py-2 sm:px-2.5 sm:py-2.5">
        <div className="night-surface rounded-[20px] border border-[#e7e1d6] bg-white p-3 shadow-[0_8px_18px_rgba(16,32,24,0.03)] sm:rounded-[22px] sm:p-4">
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => router.push('/groups')}
              className="text-[12px] font-semibold text-[#637268] transition hover:text-[#2d7651]"
            >
              ← Back to groups
            </button>

            {message ? (
              <div className="rounded-2xl border border-[#e7e1d6] bg-[#fcfbf8] px-3.5 py-2.5 text-[13px] text-[#355542]">
                {message}
              </div>
            ) : null}

            {loading ? (
              <div className="space-y-3">
                <div className="h-[170px] rounded-[20px] border border-[#ece6db] bg-[#fcfbf8]" />
                <div className="h-[240px] rounded-[20px] border border-[#ece6db] bg-[#fcfbf8]" />
              </div>
            ) : group && aggregate ? (
              <>
                <section className="rounded-[20px] border border-[#e6dfd3] bg-white p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] bg-[radial-gradient(circle_at_30%_30%,#fff3d8,transparent_45%),linear-gradient(180deg,#173d30,#1f6448)] text-[14px] font-bold text-[#f8e1a0] shadow-[inset_0_1px_0_rgba(255,255,255,0.24)]">
                        {groupMonogram(group.name)}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-serif text-[24px] font-semibold tracking-[-0.04em] text-[#102018]">
                          {group.name}
                        </div>
                        <div className="mt-1 text-[12px] text-[#637268]">
                          {formatMemberCount(aggregate.members.length)} · Code {group.join_code}
                        </div>
                        <div className="mt-2 rounded-full bg-[#fcfbf8] px-3 py-1 text-[11px] font-semibold text-[#102018]">
                          {pointsContext}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => void shareInvite()}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-[#2d7651] bg-[#2d7651] px-4 text-[12px] font-semibold text-white shadow-[0_8px_18px_rgba(45,118,81,0.14)] transition hover:-translate-y-0.5 hover:bg-[#255e42]"
                    >
                      <Share2 size={15} strokeWidth={2} />
                      {copied ? 'Link copied' : 'Invite'}
                    </button>
                  </div>

                  <div className="mt-4 grid grid-cols-4 gap-0 border-t border-[#ece6db] pt-4">
                    <div className="min-w-0 px-1.5 sm:px-3">
                      <div className="truncate text-[8px] font-bold uppercase tracking-[0.12em] text-[#637268] sm:text-[9px]">
                        Rank
                      </div>
                      <div className="mt-1 font-serif text-[20px] font-semibold text-[#102018]">
                        #{rank}
                      </div>
                    </div>
                    <div className="min-w-0 border-l border-[#ece6db] px-1.5 sm:px-3">
                      <div className="truncate text-[8px] font-bold uppercase tracking-[0.12em] text-[#637268] sm:text-[9px]">
                        Score
                      </div>
                      <div className="mt-1 truncate font-serif text-[20px] font-semibold text-[#102018]">
                        {formatScore(aggregate.score)}
                      </div>
                    </div>
                    <div className="min-w-0 border-l border-[#ece6db] px-1.5 sm:px-3">
                      <div className="truncate text-[8px] font-bold uppercase tracking-[0.12em] text-[#637268] sm:text-[9px]">
                        Accuracy
                      </div>
                      <div className="mt-1 font-serif text-[20px] font-semibold text-[#102018]">
                        {aggregate.avgAccuracy !== null ? `${Math.round(aggregate.avgAccuracy)}%` : '—'}
                      </div>
                    </div>
                    <div className="min-w-0 border-l border-[#ece6db] px-1.5 sm:px-3">
                      <div className="truncate text-[8px] font-bold uppercase tracking-[0.12em] text-[#637268] sm:text-[9px]">
                        Streak
                      </div>
                      <div className="mt-1 font-serif text-[20px] font-semibold text-[#102018]">
                        {aggregate.longestStreak}
                      </div>
                    </div>
                  </div>
                </section>

                <section className="rounded-[18px] border border-[#e6dfd3] bg-white px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#637268]">
                        {membership ? 'Your profile' : 'Join this group'}
                      </div>
                      <div className="mt-1 text-[12px] text-[#637268]">
                        Display names make the leaderboard feel personal.
                      </div>
                    </div>
                    <UserPlus size={19} strokeWidth={2} />
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                    <input
                      value={displayName}
                      onChange={event => setDisplayName(event.target.value)}
                      placeholder="Your display name"
                      className="w-full rounded-[14px] border border-[#dfd8cb] bg-white px-3 py-2 text-[12px] text-[#102018] outline-none transition focus:border-[#2d7651]"
                    />
                    <button
                      type="button"
                      disabled={joining || !displayName.trim()}
                      onClick={() => void joinThisGroup()}
                      className="inline-flex h-10 items-center justify-center rounded-full border border-[#2d7651] bg-[#2d7651] px-5 text-[12px] font-semibold text-white transition hover:bg-[#255e42] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {joining ? 'Saving...' : membership ? 'Update name' : 'Join group'}
                    </button>
                  </div>
                </section>

                <section className="rounded-[18px] border border-[#e6dfd3] bg-white px-4 py-4">
                  <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#637268]">
                    Member rankings
                  </div>
                  <div className="mt-3 space-y-2">
                    {aggregate.memberStats.length > 0 ? (
                      aggregate.memberStats.map((entry, index) => (
                        <div
                          key={entry.member.id}
                          className="grid grid-cols-[24px_1fr_auto] items-center gap-2 rounded-[14px] border border-[#ece6db] bg-white px-3 py-2.5 transition hover:-translate-y-0.5 hover:bg-[#fcfbf8]"
                        >
                          <div className="text-[14px] font-semibold text-[#102018]">{index + 1}</div>
                          <div className="min-w-0">
                            <div className="truncate text-[13px] font-semibold text-[#102018]">
                              {entry.member.display_name}
                            </div>
                            <div className="mt-0.5 text-[10px] text-[#637268]">
                              {entry.solves} solves · {entry.longestStreak} day streak
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-serif text-[16px] font-semibold leading-none text-[#102018]">
                              {entry.avgGuesses !== null ? entry.avgGuesses.toFixed(1) : '—'}
                            </div>
                            <div className="mt-0.5 text-[9px] uppercase tracking-[0.14em] text-[#637268]">
                              avg guesses
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-[14px] border border-dashed border-[#e6dfd3] bg-[#fcfbf8] px-3 py-4 text-[13px] text-[#637268]">
                        No members yet.
                      </div>
                    )}
                  </div>
                </section>

                <section className="rounded-[18px] border border-[#e6dfd3] bg-white px-4 py-4">
                  <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#637268]">
                    Recent solves
                  </div>
                  <div className="mt-3 space-y-2">
                    {recentSolves.length > 0 ? (
                      recentSolves.map((entry, index) => (
                        <div
                          key={`${entry.guess.session_id}-${entry.guess.case_id}-${entry.guess.created_at}-${index}`}
                          className="rounded-[14px] bg-[#fcfbf8] px-3 py-2.5"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="truncate text-[13px] font-semibold text-[#102018]">
                              {entry.member.display_name}
                            </div>
                            <div className="text-[10px] text-[#637268]">
                              {new Date(entry.guess.created_at).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                              })}
                            </div>
                          </div>
                          <div className="mt-1 text-[11px] text-[#637268]">
                            solved{' '}
                            <span className="font-semibold text-[#102018]">
                              {entry.caseInfo?.answer || 'a case'}
                            </span>
                            {entry.caseInfo ? ` · ${formatLevel(entry.caseInfo.level)}` : ''}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-[14px] border border-dashed border-[#e6dfd3] bg-[#fcfbf8] px-3 py-4 text-[13px] text-[#637268]">
                        No recent solves yet.
                      </div>
                    )}
                  </div>
                </section>
              </>
            ) : (
              <div className="rounded-[18px] border border-dashed border-[#e6dfd3] bg-[#fcfbf8] px-4 py-5 text-[13px] text-[#637268]">
                Group not found.
              </div>
            )}
          </div>
        </div>
      </section>

      <PublicFooter />
    </main>
  )
}
