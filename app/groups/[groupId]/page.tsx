'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Share2 } from 'lucide-react'
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
  score: number
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

const GROUP_ICONS = [
  { value: '🦴', label: 'Bone' },
  { value: '🦵', label: 'Leg' },
  { value: '🦶', label: 'Foot' },
  { value: '💀', label: 'Skull' },
  { value: '🔨', label: 'Hammer' },
  { value: '🛠️', label: 'Tools' },
  { value: '🪛', label: 'Screwdriver' },
  { value: '🧰', label: 'Toolbox' },
  { value: '🩻', label: 'X-ray' },
  { value: '🩺', label: 'Doctor' },
  { value: '🥼', label: 'White coat' },
  { value: '🏥', label: 'Hospital' },
  { value: '💊', label: 'Pill' },
  { value: '💉', label: 'Syringe' },
  { value: '🩹', label: 'Bandage' },
  { value: '🧬', label: 'DNA' },
  { value: '💪', label: 'Strength' },
  { value: '🧠', label: 'Brain' },
  { value: '❤️', label: 'Heart' },
  { value: '⚕️', label: 'Medicine' },
  { value: '🐶', label: 'Dog' },
  { value: '🐱', label: 'Cat' },
  { value: '🦁', label: 'Lion' },
  { value: '🐯', label: 'Tiger' },
  { value: '🐻', label: 'Bear' },
  { value: '🐺', label: 'Wolf' },
  { value: '🦊', label: 'Fox' },
  { value: '🐵', label: 'Monkey' },
  { value: '🦍', label: 'Gorilla' },
  { value: '🦅', label: 'Eagle' },
  { value: '🦉', label: 'Owl' },
  { value: '🐢', label: 'Turtle' },
  { value: '🦈', label: 'Shark' },
  { value: '🐍', label: 'Snake' },
]

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
      ? 'h-[74px] w-[74px] text-[36px]'
      : size === 'sm'
        ? 'h-12 w-12 text-[25px]'
        : 'h-14 w-14 text-[28px]'

  return (
    <div
      className={`orthodle-group-crest relative flex shrink-0 items-center justify-center rounded-full border border-[#d8cfbf] bg-[#fbf7ef] shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_8px_18px_rgba(16,32,24,0.1)] ${dimensions}`}
      aria-hidden="true"
    >
      <span className="orthodle-group-crest-mark leading-none">
        {groupAvatarLabel(group)}
      </span>
    </div>
  )
}

function formatScore(value: number) {
  return value.toLocaleString('en-US')
}

function formatMemberCount(count: number) {
  return `${count} member${count === 1 ? '' : 's'}`
}

function calculateMemberScore(
  solves: number,
  firstTrySolves: number,
  longestStreak: number,
  avgGuesses: number | null
) {
  const efficiencyBonus = avgGuesses ? Math.max(0, 7 - avgGuesses) : 0
  return Math.round(solves * 10 + firstTrySolves * 3 + longestStreak * 2 + efficiencyBonus)
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

  const avgGuesses = solves > 0 ? totalGuessesToSolve / solves : null
  const longestStreak = computeLongestRun(uniqueSortedDates)
  const score = calculateMemberScore(solves, firstTrySolves, longestStreak, avgGuesses)

  return {
    member,
    score,
    solves,
    avgGuesses,
    longestStreak,
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
      const activeMemberStats = memberStats.filter(entry => entry.totalGuesses > 0)
      const totalMemberScore = activeMemberStats.reduce((sum, entry) => sum + entry.score, 0)
      const score =
        activeMemberStats.length > 0 ? Math.round(totalMemberScore / activeMemberStats.length) : 0

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
  const [savingGroupIcon, setSavingGroupIcon] = useState(false)
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
  const canEditGroup = Boolean(group && group.creator_session_id === sessionId)
  const pointsContext =
    aggregate && rank && rank > 1
      ? `${Math.max(0, groupAggregates[rank - 2].score - aggregate.score)} pts behind #${rank - 1}`
      : aggregate && groupAggregates.length > 1
        ? `${Math.max(0, aggregate.score - groupAggregates[1].score)} pts ahead of #2`
        : 'Leading the pack'
  async function updateGroupIcon(nextIcon: string) {
    if (!group || !canEditGroup) {
      setMessage('Only the group creator can change this icon.')
      return
    }

    setSavingGroupIcon(true)
    setMessage('')

    const { error } = await supabase
      .from('groups')
      .update({ icon: nextIcon })
      .eq('id', group.id)

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
      prev.map(entry => (entry.id === group.id ? { ...entry, icon: nextIcon } : entry))
    )
    setSavingGroupIcon(false)
  }

  async function shareInvite() {
    if (!group) return

    const link = buildInviteLink(group.join_code)
    const shareText = buildInviteMessage(group)

    if (navigator.share) {
      try {
        await navigator.share({
          title: `Orthodle group invite: ${group.name}`,
          text: shareText,
          url: link,
        })
        return
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
      }
    }

    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(shareText)
        setCopied(true)
        setMessage('Text invite copied.')
        window.setTimeout(() => setCopied(false), 1800)
        return
      } catch {
        setMessage(`Group code: ${group.join_code}`)
        return
      }
    }

    setMessage(`Group code: ${group.join_code}`)
  }

  return (
    <main className="app-surface min-h-screen">
      <Header />

      <section className="mx-auto max-w-[700px] px-1.5 py-1.5 sm:px-2.5 sm:py-2.5">
        <div className="night-surface rounded-[20px] border border-[#e7e1d6] bg-white p-2.5 shadow-[0_8px_18px_rgba(16,32,24,0.03)] sm:rounded-[22px] sm:p-4">
          <div className="space-y-3.5 sm:space-y-4">
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
                <section className="rounded-[20px] border border-[#e6dfd3] bg-white p-3.5 sm:p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <GroupCrest group={group} size="lg" />
                      <div className="min-w-0">
                        <div className="truncate font-serif text-[21px] font-semibold tracking-[-0.04em] text-[#102018] sm:text-[24px]">
                          {group.name}
                        </div>
                        <div className="mt-1 text-[12px] text-[#637268]">
                          {formatMemberCount(aggregate.members.length)}
                          {!membership && !canEditGroup ? ' · Public preview' : ''}
                        </div>
                        <div className="mt-2 rounded-full bg-[#fcfbf8] px-3 py-1 text-[11px] font-semibold text-[#102018]">
                          {pointsContext}
                        </div>
                      </div>
                    </div>

                    {membership || canEditGroup ? (
                      <button
                        type="button"
                        onClick={() => void shareInvite()}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-[#2d7651] bg-[#2d7651] px-4 text-[12px] font-semibold text-white shadow-[0_8px_18px_rgba(45,118,81,0.14)] transition hover:-translate-y-0.5 hover:bg-[#255e42]"
                      >
                        <Share2 size={15} strokeWidth={2} />
                        {copied ? 'Invite copied' : 'Text invite'}
                      </button>
                    ) : null}
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
                  {canEditGroup ? (
                    <div className="mt-3 border-t border-[#ece6db] pt-3">
                      <div className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.16em] text-[#637268]">
                        Group icon
                      </div>
                      <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {GROUP_ICONS.map(icon => (
                          <button
                            key={icon.value}
                            type="button"
                            disabled={savingGroupIcon}
                            onClick={() => void updateGroupIcon(icon.value)}
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-[16px] shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_3px_8px_rgba(16,32,24,0.04)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 ${
                              group.icon === icon.value
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
                  ) : null}
                </section>

                <section className="rounded-[18px] border border-[#e6dfd3] bg-white px-3 py-3 sm:px-4 sm:py-4">
                  <div className="flex items-end justify-between gap-3">
                    <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#637268]">
                      Member leaderboard
                    </div>
                    <div className="text-[11px] text-[#637268]">
                      {formatMemberCount(aggregate.members.length)}
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    {aggregate.memberStats.length > 0 ? (
                      aggregate.memberStats.map((entry, index) => (
                        <div
                          key={entry.member.id}
                          className="grid grid-cols-[24px_1fr_auto] items-center gap-2 rounded-[14px] border border-[#ece6db] bg-white px-3 py-2.5 transition hover:-translate-y-0.5 hover:bg-[#fcfbf8]"
                        >
                          <div className="text-[14px] font-semibold text-[#102018]">{index + 1}</div>
                          <div className="flex min-w-0 items-center gap-2">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#eff5ef] text-[11px] font-bold text-[#2d7651]">
                              {entry.member.display_name.slice(0, 1).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-[13px] font-semibold text-[#102018]">
                                {entry.member.display_name}
                              </div>
                              <div className="mt-0.5 text-[10px] text-[#637268]">
                                {entry.solves} solves · {entry.longestStreak} day streak
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-serif text-[16px] font-semibold leading-none text-[#102018]">
                              {formatScore(entry.score)}
                            </div>
                            <div className="mt-0.5 text-[9px] uppercase tracking-[0.14em] text-[#637268]">
                              pts
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
