import { unstable_cache } from 'next/cache'
import { NextResponse } from 'next/server'
import { fetchAdminPages } from '@/lib/admin-dashboard'
import { isChoiceQuestionCase } from '@/lib/anatomy-quiz'
import { supabase } from '@/lib/supabase'
import { normalizeAnswer, ORTHO_DIAGNOSIS_BANK } from '@/lib/utils'

type AnswerRow = NonNullable<Parameters<typeof isChoiceQuestionCase>[0]> & { case_date: string }

const loadBootstrap = unstable_cache(async (latestDay: string) => {
  const [cases, choices, taglines, titles] = await Promise.all([
    fetchAdminPages<AnswerRow>((from, to) => supabase.from('cases')
      .select('answer, level, case_date, synonyms, clue_1, clue_2, clue_3, clue_4, clue_5, clue_6')
      .lte('case_date', latestDay).order('id').range(from, to)),
    fetchAdminPages<{ label: string }>((from, to) => supabase.from('diagnosis_choices')
      .select('label').order('label').order('id').range(from, to)),
    supabase.from('difficulty_taglines').select('level, text')
      .order('updated_at', { ascending: false }).order('id', { ascending: false }),
    supabase.from('level_display_settings').select('level, title'),
  ])
  if (taglines.error || titles.error) throw new Error('Could not load case display settings.')

  const diagnoses = new Map<string, string>()
  const quizAnswers = new Set<string>()
  for (const row of cases) {
    const answer = row.answer?.trim()
    if (!answer) continue
    const key = normalizeAnswer(answer)
    if (isChoiceQuestionCase(row) || (row.level === 'attending' && row.case_date >= '2026-05-14')) {
      quizAnswers.add(key)
    } else {
      diagnoses.set(key, answer)
    }
  }
  const labels = new Map<string, string>(ORTHO_DIAGNOSIS_BANK.map(answer => [normalizeAnswer(answer), answer]))
  for (const [key, answer] of diagnoses) labels.set(key, answer)
  for (const { label } of choices) {
    const answer = label?.trim()
    if (!answer) continue
    const key = normalizeAnswer(answer)
    if (key && (!quizAnswers.has(key) || labels.has(key))) labels.set(key, answer)
  }
  const latestTaglines = new Map<string, string>()
  for (const row of taglines.data || []) {
    if (!latestTaglines.has(row.level)) latestTaglines.set(row.level, row.text?.trim().toUpperCase() || '')
  }
  return {
    answerOptions: [...labels.values()].sort((a, b) => a.localeCompare(b)),
    taglineByLevel: Object.fromEntries(latestTaglines),
    titleByLevel: Object.fromEntries((titles.data || []).map(row => [row.level, row.title])),
  }
}, ['play-bootstrap-v1'], { revalidate: 300 })

export async function GET() {
  try {
    const latestDay = new Date(Date.now() + 14 * 60 * 60_000).toISOString().slice(0, 10)
    return NextResponse.json(await loadBootstrap(latestDay), {
      headers: { 'Cache-Control': 'public, max-age=60, s-maxage=120, stale-while-revalidate=60' },
    })
  } catch {
    return NextResponse.json({ error: 'Could not load diagnosis choices.' }, {
      status: 503, headers: { 'Cache-Control': 'no-store' },
    })
  }
}
