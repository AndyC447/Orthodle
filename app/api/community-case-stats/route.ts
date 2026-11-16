import { unstable_cache } from 'next/cache'
import { NextResponse } from 'next/server'
import { fetchAdminPages } from '@/lib/admin-dashboard'
import { buildCommunityStats, type CommunityGuessRow, type CommunityVisitRow } from '@/lib/community-case-stats'
import { getExcludedStatsSessionIds } from '@/lib/stats-exclusions'
import { supabase } from '@/lib/supabase'

const loadStats = unstable_cache(async (id: string) => {
  const { data: item, error } = await supabase.from('cases')
    .select('level, case_date, answer, synonyms, clue_1, clue_2, clue_3, clue_4, clue_5, clue_6')
    .eq('id', id).lte('case_date', new Date(Date.now() + 14 * 60 * 60_000).toISOString().slice(0, 10)).maybeSingle()
  if (error) throw error
  if (!item) return null
  const [visits, guesses, excluded] = await Promise.all([
    fetchAdminPages<CommunityVisitRow>((from, to) => supabase.from('visits').select('session_id')
      .eq('path', `/${item.level}/${item.case_date}`).order('id').range(from, to)),
    fetchAdminPages<CommunityGuessRow>((from, to) => supabase.from('guesses').select('session_id, is_correct, guess_text')
      .eq('case_id', id).order('created_at').order('id').range(from, to)),
    getExcludedStatsSessionIds(),
  ])
  return buildCommunityStats(item, visits, guesses, excluded)
}, ['community-case-stats-v1'], { revalidate: 300 })

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id') || ''
  const noStore = { 'Cache-Control': 'no-store' }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'Invalid case.' }, { status: 400, headers: noStore })
  }
  try {
    const summary = await loadStats(id.toLowerCase())
    if (!summary) return NextResponse.json({ error: 'Case not found.' }, { status: 404, headers: noStore })
    return NextResponse.json(summary, {
      headers: { 'Cache-Control': 'public, max-age=60, s-maxage=120, stale-while-revalidate=60' },
    })
  } catch {
    return NextResponse.json({ error: 'Could not load Case Stats.' }, { status: 503, headers: noStore })
  }
}
