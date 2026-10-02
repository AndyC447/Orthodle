import { unstable_cache } from 'next/cache'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { todayISO } from '@/lib/utils'
import { EMPTY_EXAMPLES, EXAMPLE_SLOTS, type ExampleSnapshot } from '@/lib/impact-examples'

export const IMPACT_EXAMPLES_TAG = 'impact-examples'

export async function readImpactExamples(): Promise<ExampleSnapshot> {
  const db = getSupabaseAdmin()
  const { data: rows, error } = await db.from('impact_examples').select('slot, case_id')
  if (error) throw error
  const ids = (rows || []).map(row => row.case_id).filter(Boolean)
  const selection = { ...EMPTY_EXAMPLES }
  let cases = []
  if (ids.length) {
    const result = await db.from('cases').select('id, case_date, level, category, prompt').in('id', ids).lte('case_date', todayISO())
    if (result.error) throw result.error
    cases = result.data || []
  }
  for (const { key } of EXAMPLE_SLOTS) {
    const id = rows?.find(row => row.slot === key)?.case_id
    selection[key] = cases.some(item => item.id === id) ? id : null
  }
  return { selection, cases }
}

export const getCachedImpactExamples = unstable_cache(readImpactExamples, ['impact-examples-v1'], {
  revalidate: 300, tags: [IMPACT_EXAMPLES_TAG],
})
