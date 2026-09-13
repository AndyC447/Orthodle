import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const LEVELS = new Set(['med_student', 'resident', 'attending'])
const LAUNCH_DATE = '2026-04-27'
const FALLBACK_AGE_WINDOWS_DAYS = [42, 28, 14, 7, 1] as const

function todayISOInLosAngeles() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return formatter.format(new Date())
}

function shiftISODate(dateText: string, deltaDays: number) {
  const date = new Date(`${dateText}T00:00:00`)
  date.setDate(date.getDate() + deltaDays)
  return date.toISOString().slice(0, 10)
}

function normalizeAnswerKey(value: string | null | undefined) {
  return (value || '').trim().toLowerCase()
}

function buildFallbackPayload(sourceCase: Record<string, unknown>, targetDate: string, level: string) {
  const payload = { ...sourceCase }
  delete payload.id
  delete payload.created_at
  delete payload.updated_at
  payload.case_date = targetDate
  payload.level = level
  return payload
}

export async function POST(req: Request) {
  try {
    const { targetDate, level } = await req.json()

    if (
      typeof targetDate !== 'string' ||
      targetDate < LAUNCH_DATE ||
      targetDate !== todayISOInLosAngeles() ||
      typeof level !== 'string' ||
      !LEVELS.has(level)
    ) {
      return NextResponse.json({ error: 'Invalid fallback request.' }, { status: 400 })
    }

    const supabaseAdmin = getSupabaseAdmin()

    const { data: existingCase, error: existingError } = await supabaseAdmin
      .from('cases')
      .select('*')
      .eq('case_date', targetDate)
      .eq('level', level)
      .maybeSingle()

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 })
    }

    if (existingCase) {
      return NextResponse.json({
        case: existingCase,
        fallbackUsed: false,
        sourceCaseDate: null,
      })
    }

    const { data: priorCases, error: priorCasesError } = await supabaseAdmin
      .from('cases')
      .select('*')
      .eq('level', level)
      .lt('case_date', targetDate)
      .gte('case_date', LAUNCH_DATE)
      .order('case_date', { ascending: true })

    if (priorCasesError) {
      return NextResponse.json({ error: priorCasesError.message }, { status: 500 })
    }

    const priorCaseRows = (priorCases as Array<Record<string, unknown>> | null) || []

    if (!priorCaseRows.length) {
      return NextResponse.json({ error: 'No fallback cases are available yet.' }, { status: 404 })
    }

    const answerUsage = new Map<string, number>()
    for (const caseRow of priorCaseRows) {
      const key = normalizeAnswerKey(caseRow.answer as string | null | undefined)
      if (!key) continue
      answerUsage.set(key, (answerUsage.get(key) || 0) + 1)
    }

    let candidatePool: Array<Record<string, unknown>> = []

    for (const windowDays of FALLBACK_AGE_WINDOWS_DAYS) {
      const cutoff = shiftISODate(targetDate, -windowDays)
      candidatePool = priorCaseRows.filter(caseRow => {
        const caseDate = typeof caseRow.case_date === 'string' ? caseRow.case_date : ''
        return caseDate >= LAUNCH_DATE && caseDate <= cutoff
      })
      if (candidatePool.length) break
    }

    if (!candidatePool.length) {
      candidatePool = priorCaseRows
    }

    const selectedFallback = [...candidatePool].sort((a, b) => {
      const usageA = answerUsage.get(normalizeAnswerKey(a.answer as string | null | undefined)) || 0
      const usageB = answerUsage.get(normalizeAnswerKey(b.answer as string | null | undefined)) || 0
      if (usageA !== usageB) return usageA - usageB

      const dateA = typeof a.case_date === 'string' ? a.case_date : ''
      const dateB = typeof b.case_date === 'string' ? b.case_date : ''
      if (dateA !== dateB) return dateA.localeCompare(dateB)

      const answerA = typeof a.answer === 'string' ? a.answer : ''
      const answerB = typeof b.answer === 'string' ? b.answer : ''
      if (answerA !== answerB) return answerA.localeCompare(answerB)

      const idA = typeof a.id === 'string' ? a.id : ''
      const idB = typeof b.id === 'string' ? b.id : ''
      return idA.localeCompare(idB)
    })[0]

    const fallbackPayload = buildFallbackPayload(selectedFallback, targetDate, level)

    const { error: insertError } = await supabaseAdmin.from('cases').upsert(fallbackPayload, {
      onConflict: 'case_date,level',
    })

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    const { data: createdCase, error: createdCaseError } = await supabaseAdmin
      .from('cases')
      .select('*')
      .eq('case_date', targetDate)
      .eq('level', level)
      .single()

    if (createdCaseError || !createdCase) {
      return NextResponse.json(
        { error: createdCaseError?.message || 'Could not load fallback case.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      case: createdCase,
      fallbackUsed: true,
      sourceCaseDate:
        typeof selectedFallback.case_date === 'string' ? selectedFallback.case_date : null,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not create fallback case.' },
      { status: 500 }
    )
  }
}
