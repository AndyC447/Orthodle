import { revalidateTag } from 'next/cache'
import { readImpactExamples, IMPACT_EXAMPLES_TAG } from '@/lib/impact-examples-server'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { todayISO } from '@/lib/utils'
import { EXAMPLE_SLOTS, validExampleSelection } from '@/lib/impact-examples'

export const dynamic = 'force-dynamic'
const fields = 'id, case_date, level, category, prompt'

function failure(error: unknown) {
  console.error('Impact examples:', error)
  const code = (error as { code?: string })?.code
  if (code === '42P01' || code === 'PGRST205') {
    return NextResponse.json({ error: 'Example storage is not set up yet. Run supabase-impact-examples.sql in the Supabase SQL editor.' }, { status: 503 })
  }
  return NextResponse.json({ error: 'Could not load or save examples. Check the database setup and try again.' }, { status: 500 })
}

export async function GET() {
  try {
    return NextResponse.json(await readImpactExamples())
  } catch (error) { return failure(error) }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const db = getSupabaseAdmin()
    if (body.action === 'list') {
      const cases = []
      for (let offset = 0; ; offset += 500) {
        const result = await db.from('cases').select(`${fields}, answer`)
          .lte('case_date', todayISO()).order('case_date', { ascending: false }).order('id').range(offset, offset + 499)
        if (result.error) throw result.error
        cases.push(...result.data)
        if (result.data.length < 500) break
      }
      return NextResponse.json({ cases })
    }
    if (body.action !== 'save' || !validExampleSelection(body.selection)) {
      return NextResponse.json({ error: 'Choose valid examples before saving.' }, { status: 400 })
    }
    const ids = Object.values(body.selection).filter((id): id is string => typeof id === 'string')
    if (new Set(ids).size !== ids.length) {
      return NextResponse.json({ error: 'Choose a different case for each example.' }, { status: 400 })
    }
    if (ids.length) {
      const result = await db.from('cases').select('id').in('id', ids).lte('case_date', todayISO())
      if (result.error) throw result.error
      if (result.data.length !== ids.length) {
        return NextResponse.json({ error: 'An example is unavailable. Choose an existing published case.' }, { status: 400 })
      }
    }
    const { error } = await db.from('impact_examples').upsert(
      EXAMPLE_SLOTS.map(({ key }) => ({ slot: key, case_id: body.selection[key] })), { onConflict: 'slot' }
    )
    if (error) throw error
    revalidateTag(IMPACT_EXAMPLES_TAG, { expire: 0 })
    return NextResponse.json({ ok: true })
  } catch (error) { return failure(error) }
}
