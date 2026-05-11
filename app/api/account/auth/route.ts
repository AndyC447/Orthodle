import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

type AccountRow = {
  id: string
  username: string
  username_normalized: string
  password_hash: string
  password_salt: string
  display_name: string | null
  profile_icon: string | null
  created_at: string
}

function normalizeUsername(value: string) {
  return value.trim().toLowerCase()
}

function hashPassword(password: string, salt: string) {
  return crypto.scryptSync(password, salt, 64).toString('hex')
}

function verifyPassword(password: string, salt: string, expectedHash: string) {
  const actual = Buffer.from(hashPassword(password, salt), 'hex')
  const expected = Buffer.from(expectedHash, 'hex')

  if (actual.length !== expected.length) return false
  return crypto.timingSafeEqual(actual, expected)
}

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

function buildResponse(account: AccountRow) {
  return {
    account: {
      accountId: account.id,
      username: account.username,
      displayName: account.display_name || account.username,
      profileIcon: account.profile_icon || null,
      loggedInAt: new Date().toISOString(),
    },
  }
}

export async function POST(req: Request) {
  try {
    const supabaseAdmin = getSupabaseAdmin()
    const body = await req.json()
    const mode = body?.mode === 'signup' ? 'signup' : 'login'
    const username = typeof body?.username === 'string' ? body.username.trim() : ''
    const normalizedUsername = normalizeUsername(username)
    const password = typeof body?.password === 'string' ? body.password : ''
    const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : ''
    const profileIcon = typeof body?.profileIcon === 'string' ? body.profileIcon.trim() : null
    const anonymousSessionId =
      typeof body?.anonymousSessionId === 'string' ? body.anonymousSessionId : undefined

    if (!normalizedUsername || normalizedUsername.length < 3) {
      return NextResponse.json(
        { error: 'Pick a username with at least 3 characters.' },
        { status: 400 }
      )
    }

    if (!/^[a-z0-9_]+$/.test(normalizedUsername)) {
      return NextResponse.json(
        { error: 'Use only letters, numbers, and underscores in the username.' },
        { status: 400 }
      )
    }

    if (!password || password.length < 6) {
      return NextResponse.json(
        { error: 'Use a password with at least 6 characters.' },
        { status: 400 }
      )
    }

    const { data: existingAccount, error: existingError } = await supabaseAdmin
      .from('user_accounts')
      .select('*')
      .eq('username_normalized', normalizedUsername)
      .maybeSingle()

    if (existingError) {
      return NextResponse.json(
        { error: existingError.message || 'Could not reach accounts right now.' },
        { status: 500 }
      )
    }

    if (mode === 'signup') {
      const existingAccountRow = (existingAccount as AccountRow | null) || null

      if (existingAccountRow) {
        return NextResponse.json(
          { error: 'That username is already taken.' },
          { status: 409 }
        )
      }

      const salt = crypto.randomBytes(16).toString('hex')
      const passwordHash = hashPassword(password, salt)

      const { data: createdAccount, error: createError } = await supabaseAdmin
        .from('user_accounts')
        .insert({
          username,
          username_normalized: normalizedUsername,
          password_hash: passwordHash,
          password_salt: salt,
          display_name: displayName || username,
          profile_icon: profileIcon || null,
        })
        .select('*')
        .single()

      const createdAccountRow = (createdAccount as AccountRow | null) || null

      if (createError || !createdAccountRow) {
        return NextResponse.json(
          { error: createError?.message || 'Could not create the account.' },
          { status: 500 }
        )
      }

      await migrateAnonymousProgress(supabaseAdmin, anonymousSessionId, createdAccountRow.id)
      return NextResponse.json(buildResponse(createdAccountRow))
    }

    const existingAccountRow = (existingAccount as AccountRow | null) || null

    if (!existingAccountRow) {
      return NextResponse.json({ error: 'That username was not found.' }, { status: 404 })
    }

    const validPassword = verifyPassword(
      password,
      existingAccountRow.password_salt,
      existingAccountRow.password_hash
    )

    if (!validPassword) {
      return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 })
    }

    await migrateAnonymousProgress(supabaseAdmin, anonymousSessionId, existingAccountRow.id)
    return NextResponse.json(buildResponse(existingAccountRow))
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Account setup is incomplete. Add the accounts tables first.'

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
