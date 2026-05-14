import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { buildGroupAggregatesFromRows, fetchAllRows } from '@/lib/groups-leaderboard'

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

    const aggregates = buildGroupAggregatesFromRows(groups, members, guessRows, caseLookup)
    return NextResponse.json({ aggregates })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Could not build the group leaderboard right now.'

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
