import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

async function migrateAnonymousProgress(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  anonymousSessionId: string | undefined,
  accountId: string
) {
  if (!anonymousSessionId || anonymousSessionId === accountId) return

  const anonymousId = anonymousSessionId.trim()
  if (!anonymousId) return

  const tablesWithSessionId = [
    'guesses',
    'visits',
    'case_feedback',
    'case_submissions',
    'homepage_survey_responses',
  ]

  for (const table of tablesWithSessionId) {
    await supabaseAdmin.from(table).update({ session_id: accountId }).eq('session_id', anonymousId)
  }

  await supabaseAdmin
    .from('groups')
    .update({ creator_session_id: accountId })
    .eq('creator_session_id', anonymousId)

  const { data: anonMemberships } = await supabaseAdmin
    .from('group_members')
    .select('id, group_id')
    .eq('session_id', anonymousId)

  if (anonMemberships?.length) {
    const { data: accountMemberships } = await supabaseAdmin
      .from('group_members')
      .select('id, group_id')
      .eq('session_id', accountId)

    const accountGroups = new Set((accountMemberships || []).map(item => item.group_id))

    for (const membership of anonMemberships) {
      if (accountGroups.has(membership.group_id)) {
        await supabaseAdmin.from('group_members').delete().eq('id', membership.id)
      } else {
        await supabaseAdmin
          .from('group_members')
          .update({ session_id: accountId })
          .eq('id', membership.id)
      }
    }
  }
}

export async function POST(req: Request) {
  try {
    const supabaseAdmin = getSupabaseAdmin()
    const body = await req.json()
    const accountId = typeof body?.accountId === 'string' ? body.accountId.trim() : ''
    const anonymousSessionId =
      typeof body?.anonymousSessionId === 'string' ? body.anonymousSessionId : undefined

    if (!accountId) {
      return NextResponse.json({ error: 'Missing account.' }, { status: 400 })
    }

    await migrateAnonymousProgress(supabaseAdmin, anonymousSessionId, accountId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Could not repair the linked account right now.'

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
