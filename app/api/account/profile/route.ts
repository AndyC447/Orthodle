import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

type AccountRow = {
  id: string
  username: string
  display_name: string | null
  profile_icon: string | null
}

export async function POST(req: Request) {
  try {
    const supabaseAdmin = getSupabaseAdmin()
    const body = await req.json()
    const accountId = typeof body?.accountId === 'string' ? body.accountId.trim() : ''
    const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : ''
    const profileIcon =
      typeof body?.profileIcon === 'string' && body.profileIcon.trim() ? body.profileIcon.trim() : null

    if (!accountId) {
      return NextResponse.json({ error: 'Missing account.' }, { status: 400 })
    }

    if (!displayName) {
      return NextResponse.json({ error: 'Add a display name first.' }, { status: 400 })
    }

    const { data: account, error: accountError } = await supabaseAdmin
      .from('user_accounts')
      .update({
        display_name: displayName,
        profile_icon: profileIcon,
      })
      .eq('id', accountId)
      .select('id, username, display_name, profile_icon')
      .maybeSingle()

    const accountRow = (account as AccountRow | null) || null

    if (accountError || !accountRow) {
      return NextResponse.json(
        { error: accountError?.message || 'Could not update the profile.' },
        { status: 500 }
      )
    }

    await supabaseAdmin
      .from('group_members')
      .update({
        display_name: displayName,
        icon: profileIcon,
      })
      .eq('session_id', accountId)

    return NextResponse.json({
      account: {
        accountId: accountRow.id,
        username: accountRow.username,
        displayName: accountRow.display_name || accountRow.username,
        profileIcon: accountRow.profile_icon || null,
        loggedInAt: new Date().toISOString(),
      },
    })
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Profile syncing is not ready yet. Add the accounts tables first.'

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
