import { NextResponse } from 'next/server'
import type { MessageUser } from '@/lib/messaging'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

type AccountRow = {
  id: string
  username: string
  display_name: string | null
  profile_icon: string | null
}

function toMessageUser(account: AccountRow) {
  return {
    accountId: account.id,
    username: account.username,
    displayName: account.display_name || account.username,
    profileIcon: account.profile_icon || null,
  } satisfies MessageUser
}

export async function GET(req: Request) {
  try {
    const supabaseAdmin = getSupabaseAdmin()
    const url = new URL(req.url)
    const query = url.searchParams.get('q')?.trim() || ''
    const excludeAccountId = url.searchParams.get('excludeAccountId')?.trim() || ''
    const accountId = url.searchParams.get('accountId')?.trim() || ''

    if (accountId) {
      const { data, error } = await supabaseAdmin
        .from('user_accounts')
        .select('id, username, display_name, profile_icon')
        .eq('id', accountId)
        .maybeSingle()

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      const account = data as AccountRow | null
      return NextResponse.json({ user: account ? toMessageUser(account) : null })
    }

    if (query.length < 2) {
      return NextResponse.json({ users: [] as MessageUser[] })
    }

    const { data, error } = await supabaseAdmin
      .from('user_accounts')
      .select('id, username, display_name, profile_icon')
      .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
      .limit(12)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const users = ((data || []) as AccountRow[])
      .filter(item => item.id !== excludeAccountId)
      .map(toMessageUser)
      .sort((a, b) => a.displayName.localeCompare(b.displayName))

    return NextResponse.json({ users })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Could not search people right now.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
