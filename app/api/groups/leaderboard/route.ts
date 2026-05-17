import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { buildGroupAggregatesFromRows, fetchAllRows } from '@/lib/groups-leaderboard'
import { DEFAULT_GROUP_SCORING_SETTINGS, normalizeGroupScoringSettings } from '@/lib/group-scoring'

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

type GroupScoringSettingsRow = {
  solve_points: number
  first_try_points: number
  streak_points: number
  efficiency_baseline: number
  efficiency_points_per_guess: number
  teamwork_bonus_per_member: number
  teamwork_bonus_max: number
}

export async function GET(req: Request) {
  try {
    const supabaseAdmin = getSupabaseAdmin()
    const url = new URL(req.url)
    const windowMode = url.searchParams.get('window') === 'all-time' ? 'all-time' : 'week'
    const startIso = url.searchParams.get('startIso') || ''
    const endIso = url.searchParams.get('endIso') || ''

    const { data: groupsData, error: groupsError } = await supabaseAdmin
      .from('groups')
      .select('*')
      .order('created_at', { ascending: false })

    if (groupsError) {
      return NextResponse.json({ error: groupsError.message }, { status: 500 })
    }

    const groups = ((groupsData || []) as GroupRow[]) || []

    const { data: membersData, error: membersError } = await supabaseAdmin
      .from('group_members')
      .select('*')
      .order('created_at', { ascending: true })

    if (membersError) {
      return NextResponse.json({ error: membersError.message }, { status: 500 })
    }

    const members = ((membersData || []) as GroupMemberRow[]) || []
    const { data: scoringData } = await supabaseAdmin
      .from('group_scoring_settings')
      .select(
        'solve_points, first_try_points, streak_points, efficiency_baseline, efficiency_points_per_guess, teamwork_bonus_per_member, teamwork_bonus_max'
      )
      .eq('id', 'default')
      .maybeSingle()

    const scoringRow = (scoringData as GroupScoringSettingsRow | null) || null
    const scoringSettings = normalizeGroupScoringSettings(
      scoringRow
        ? {
            solvePoints: scoringRow.solve_points,
            firstTryPoints: scoringRow.first_try_points,
            streakPoints: scoringRow.streak_points,
            efficiencyBaseline: scoringRow.efficiency_baseline,
            efficiencyPointsPerGuess: scoringRow.efficiency_points_per_guess,
            teamworkBonusPerMember: scoringRow.teamwork_bonus_per_member,
            teamworkBonusMax: scoringRow.teamwork_bonus_max,
          }
        : DEFAULT_GROUP_SCORING_SETTINGS
    )
    const memberSessionIds = Array.from(new Set(members.map(member => member.session_id)))

    if (memberSessionIds.length === 0) {
      return NextResponse.json({ aggregates: [] })
    }

    const guessRows = await fetchAllRows<GuessRow>(async (from, to) => {
      let query = supabaseAdmin
        .from('guesses')
        .select('session_id, case_id, is_correct, created_at')
        .in('session_id', memberSessionIds)
        .order('created_at', { ascending: true })
        .range(from, to)

      if (windowMode === 'week' && startIso && endIso) {
        query = query.gte('created_at', startIso).lte('created_at', endIso)
      }

      const { data, error } = await query

      if (error) throw error
      return (data || []) as GuessRow[]
    })

    const caseIds = Array.from(
      new Set(guessRows.map(row => row.case_id).filter((value): value is string => Boolean(value)))
    )

    const caseLookup: Record<string, CaseRow> = {}

    if (caseIds.length > 0) {
      const { data: caseData, error: caseError } = await supabaseAdmin
        .from('cases')
        .select('id, case_date, level, answer, category')
        .in('id', caseIds)

      if (caseError) {
        return NextResponse.json({ error: caseError.message }, { status: 500 })
      }

      for (const row of ((caseData || []) as CaseRow[])) {
        caseLookup[row.id] = row
      }
    }

    const aggregates = buildGroupAggregatesFromRows(
      groups,
      members,
      guessRows,
      caseLookup,
      scoringSettings
    )
    return NextResponse.json({ aggregates })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Could not build the group leaderboard right now.'

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
