import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { todayISO } from '@/lib/utils'
import { EMPTY_EXAMPLES, EXAMPLE_SLOTS, validExampleSelection } from '@/lib/impact-examples'

export const dynamic = 'force-dynamic'
const fields = 'id, case_date, level, category, prompt'

function failure(error: unknown) {
  console.error('Impact examples:', error)
  return NextResponse.json({ error: 'Could not load or save examples. Check the database setup and try again.' }, { status: 500 })
}

export async function GET() {
  try {
    const db = getSupabaseAdmin()
    const { data: rows, error } = await db.from('impact_examples').select('slot, case_id')
    if (error) throw error
    const ids = (rows || []).map(row => row.case_id).filter(Boolean)
    const selection = { ...EMPTY_EXAMPLES }
    let cases = []
    if (ids.length) {
      const result = await db.from('cases').select(fields).in('id', ids).lte('case_date', todayISO())
      if (result.error) throw result.error
      cases = result.data || []
    }
    for (const { key } of EXAMPLE_SLOTS) {
      const id = rows?.find(row => row.slot === key)?.case_id
      selection[key] = cases.some(item => item.id === id) ? id : null
    }
    return NextResponse.json({ selection, cases })
  } catch (error) { return failure(error) }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const password = process.env.ADMIN_PASSWORD
    if (!password || body.password !== password) {
      return NextResponse.json({ error: 'Sign in to admin again to manage examples.' }, { status: 401 })
    }
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
    return NextResponse.json({ ok: true })
  } catch (error) { return failure(error) }
}
