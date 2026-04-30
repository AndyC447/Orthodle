import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: Request) {
  try {
    const { password, caseId } = await req.json()
    const adminPassword = process.env.ADMIN_PASSWORD || 'Pibbles'

    if (password !== adminPassword) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
    }

    if (!caseId) {
      return NextResponse.json({ error: 'Missing case id.' }, { status: 400 })
    }

    const supabaseAdmin = getSupabaseAdmin()
    const { error } = await supabaseAdmin.from('cases').delete().eq('id', caseId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Could not delete case right now.'

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
