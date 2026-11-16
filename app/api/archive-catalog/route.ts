import { unstable_cache } from 'next/cache'
import { NextResponse } from 'next/server'
import { fetchAdminPages } from '@/lib/admin-dashboard'
import { isAnatomyQuizCaseRecord, isChoiceQuestionCase } from '@/lib/anatomy-quiz'
import type { ArchiveCase, ArchiveCatalog } from '@/lib/archive-catalog'
import { normalizeCaseCategory } from '@/lib/case-category'
import { normalizeLevelTitles } from '@/lib/level-display'
import { supabase } from '@/lib/supabase'

type CaseRow = Omit<ArchiveCase, 'isAnatomy' | 'isChoice'> & {
  synonyms: string[] | null
  clue_1: string | null
  clue_2: string | null
  clue_3: string | null
  clue_4: string | null
  clue_5: string | null
  clue_6: string | null
}

const getCatalog = unstable_cache(async (latestDay: string): Promise<ArchiveCatalog> => {
  const [rows, titles, publication] = await Promise.all([
    fetchAdminPages<CaseRow>((from, to) => supabase.from('cases')
      .select('id, case_date, level, answer, synonyms, category, clue_1, clue_2, clue_3, clue_4, clue_5, clue_6')
      .gte('case_date', '2026-04-27').lt('case_date', latestDay)
      .order('case_date', { ascending: false }).order('id').range(from, to)),
    supabase.from('level_display_settings').select('level, title'),
    supabase.from('play_mode_settings').select('*').eq('id', 'default').maybeSingle(),
  ])
  if (titles.error || publication.error) throw new Error('Could not load archive settings.')
  return {
    cases: rows.map(row => ({
      id: row.id,
      case_date: row.case_date,
      level: row.level,
      answer: row.answer,
      category: normalizeCaseCategory(row.category),
      isAnatomy: row.level === 'attending' && isAnatomyQuizCaseRecord(row),
      isChoice: isChoiceQuestionCase(row),
    })),
    titles: normalizeLevelTitles(Object.fromEntries((titles.data || []).map(row => [row.level, row.title]))),
    publication: publication.data,
  }
}, ['archive-catalog-v1'], { revalidate: 300 })

export async function GET(request: Request) {
  try {
    const day = new URL(request.url).searchParams.get('day') || ''
    const earliest = new Date(Date.now() - 12 * 60 * 60_000).toISOString().slice(0, 10)
    const latest = new Date(Date.now() + 14 * 60 * 60_000).toISOString().slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < earliest || day > latest) {
      return NextResponse.json({ error: 'Invalid archive date.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
    }
    return NextResponse.json(await getCatalog(day), {
      headers: { 'Cache-Control': 'public, max-age=60, s-maxage=120, stale-while-revalidate=60' },
    })
  } catch {
    return NextResponse.json({ error: 'Could not load archive catalog.' }, {
      status: 503, headers: { 'Cache-Control': 'no-store' },
    })
  }
}
