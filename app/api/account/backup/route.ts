import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

type QueryError = {
  code?: string
  message?: string
}

function isMissingSchemaError(error: QueryError | null | undefined) {
  return error?.code === '42P01' || error?.code === '42703'
}

async function safeQuery<T>(
  label: string,
  run: () => PromiseLike<{ data: T | null; error: QueryError | null }>
) {
  const { data, error } = await run()

  if (error) {
    if (isMissingSchemaError(error)) {
      return {
        data: null,
        skipped: true,
        reason: `${label} is not set up in this database yet.`,
      }
    }

    throw new Error(error.message || `Could not load ${label}.`)
  }

  return {
    data,
    skipped: false,
    reason: null,
  }
}

function dedupeById<T extends { id: string }>(rows: T[]) {
  return Array.from(new Map(rows.map(row => [row.id, row])).values())
}

export async function GET(req: Request) {
  try {
    const supabaseAdmin = getSupabaseAdmin()
    const url = new URL(req.url)
    const accountId = url.searchParams.get('accountId')?.trim() || ''
    const sessionId = url.searchParams.get('sessionId')?.trim() || ''
    const targetIds = Array.from(new Set([accountId, sessionId].filter(Boolean)))

    if (targetIds.length === 0) {
      return NextResponse.json({ error: 'Missing account or session.' }, { status: 400 })
    }

    const skipped: Array<{ section: string; reason: string }> = []

    const accountResult = accountId
      ? await safeQuery('account profile', () =>
          supabaseAdmin
            .from('user_accounts')
            .select('id, username, display_name, profile_icon, created_at')
            .eq('id', accountId)
            .maybeSingle()
        )
      : { data: null, skipped: false, reason: null }

    if (accountResult.skipped && accountResult.reason) {
      skipped.push({ section: 'account', reason: accountResult.reason })
    }

    const guessesResult = await safeQuery('guesses', () =>
      supabaseAdmin
        .from('guesses')
        .select('*')
        .in('session_id', targetIds)
        .order('created_at', { ascending: true })
        .limit(5000)
    )
    if (guessesResult.skipped && guessesResult.reason) {
      skipped.push({ section: 'guesses', reason: guessesResult.reason })
    }

    const visitsResult = await safeQuery('visits', () =>
      supabaseAdmin
        .from('visits')
        .select('*')
        .in('session_id', targetIds)
        .order('created_at', { ascending: true })
        .limit(5000)
    )
    if (visitsResult.skipped && visitsResult.reason) {
      skipped.push({ section: 'visits', reason: visitsResult.reason })
    }

    const feedbackResult = await safeQuery('feedback', () =>
      supabaseAdmin
        .from('case_feedback')
        .select('*')
        .in('session_id', targetIds)
        .order('created_at', { ascending: true })
        .limit(2000)
    )
    if (feedbackResult.skipped && feedbackResult.reason) {
      skipped.push({ section: 'feedback', reason: feedbackResult.reason })
    }

    const feedbackMessagesResult = await safeQuery('feedback replies', () =>
      supabaseAdmin
        .from('feedback_messages')
        .select('*')
        .in('recipient_session_id', targetIds)
        .order('created_at', { ascending: true })
        .limit(2000)
    )
    if (feedbackMessagesResult.skipped && feedbackMessagesResult.reason) {
      skipped.push({ section: 'feedback_messages', reason: feedbackMessagesResult.reason })
    }

    const homepageSurveyResponsesResult = await safeQuery('homepage surveys', () =>
      supabaseAdmin
        .from('homepage_survey_responses')
        .select('*')
        .in('session_id', targetIds)
        .order('created_at', { ascending: true })
        .limit(1000)
    )
    if (homepageSurveyResponsesResult.skipped && homepageSurveyResponsesResult.reason) {
      skipped.push({
        section: 'homepage_survey_responses',
        reason: homepageSurveyResponsesResult.reason,
      })
    }

    const siteSurveyResponsesResult = await safeQuery('site surveys', () =>
      supabaseAdmin
        .from('site_survey_responses')
        .select('*')
        .in('session_id', targetIds)
        .order('created_at', { ascending: true })
        .limit(1000)
    )
    if (siteSurveyResponsesResult.skipped && siteSurveyResponsesResult.reason) {
      skipped.push({
        section: 'site_survey_responses',
        reason: siteSurveyResponsesResult.reason,
      })
    }

    const announcementResponsesResult = await safeQuery('announcement responses', () =>
      supabaseAdmin
        .from('homepage_announcement_responses')
        .select('*')
        .in('session_id', targetIds)
        .order('created_at', { ascending: true })
        .limit(1000)
    )
    if (announcementResponsesResult.skipped && announcementResponsesResult.reason) {
      skipped.push({
        section: 'homepage_announcement_responses',
        reason: announcementResponsesResult.reason,
      })
    }

    const membershipsResult = await safeQuery('group memberships', () =>
      supabaseAdmin
        .from('group_members')
        .select('*')
        .in('session_id', targetIds)
        .order('created_at', { ascending: true })
        .limit(500)
    )
    if (membershipsResult.skipped && membershipsResult.reason) {
      skipped.push({ section: 'group_members', reason: membershipsResult.reason })
    }

    const membershipRows = (membershipsResult.data as Array<{ group_id: string; id: string }> | null) || []
    const groupIds = Array.from(new Set(membershipRows.map(row => row.group_id).filter(Boolean)))

    const memberGroupsResult =
      groupIds.length > 0
        ? await safeQuery('joined groups', () =>
            supabaseAdmin
              .from('groups')
              .select('*')
              .in('id', groupIds)
              .order('created_at', { ascending: true })
              .limit(500)
          )
        : { data: [], skipped: false, reason: null }
    if (memberGroupsResult.skipped && memberGroupsResult.reason) {
      skipped.push({ section: 'groups', reason: memberGroupsResult.reason })
    }

    const createdGroupsResult = await safeQuery('created groups', () =>
      supabaseAdmin
        .from('groups')
        .select('*')
        .in('creator_session_id', targetIds)
        .order('created_at', { ascending: true })
        .limit(500)
    )
    if (createdGroupsResult.skipped && createdGroupsResult.reason) {
      skipped.push({ section: 'created_groups', reason: createdGroupsResult.reason })
    }

    const joinRequestsResult = await safeQuery('group join requests', () =>
      supabaseAdmin
        .from('group_join_requests')
        .select('*')
        .in('requester_session_id', targetIds)
        .order('created_at', { ascending: true })
        .limit(500)
    )
    if (joinRequestsResult.skipped && joinRequestsResult.reason) {
      skipped.push({ section: 'group_join_requests', reason: joinRequestsResult.reason })
    }

    const weeklyHonorsResult =
      groupIds.length > 0
        ? await safeQuery('group honors', () =>
            supabaseAdmin
              .from('group_weekly_honors')
              .select('*')
              .or(`group_id.in.(${groupIds.join(',')}),mvp_session_id.in.(${targetIds.join(',')})`)
              .order('week_start', { ascending: false })
              .limit(200)
          )
        : await safeQuery('group honors', () =>
            supabaseAdmin
              .from('group_weekly_honors')
              .select('*')
              .in('mvp_session_id', targetIds)
              .order('week_start', { ascending: false })
              .limit(200)
          )
    if (weeklyHonorsResult.skipped && weeklyHonorsResult.reason) {
      skipped.push({ section: 'group_weekly_honors', reason: weeklyHonorsResult.reason })
    }

    const directMessagesResult = accountId
      ? await safeQuery('direct messages', () =>
          supabaseAdmin
            .from('direct_messages')
            .select('*')
            .or(`sender_account_id.eq.${accountId},recipient_account_id.eq.${accountId}`)
            .order('created_at', { ascending: true })
            .limit(3000)
        )
      : { data: [], skipped: false, reason: null }
    if (directMessagesResult.skipped && directMessagesResult.reason) {
      skipped.push({ section: 'direct_messages', reason: directMessagesResult.reason })
    }

    const mergedGroups = dedupeById([
      ...(((memberGroupsResult.data as Array<{ id: string }> | null) || []) as Array<{ id: string }>),
      ...(((createdGroupsResult.data as Array<{ id: string }> | null) || []) as Array<{ id: string }>),
    ])

    return NextResponse.json({
      exportedAt: new Date().toISOString(),
      identity: {
        accountId: accountId || null,
        sessionId: sessionId || null,
      },
      skipped,
      serverData: {
        account: accountResult.data || null,
        guesses: guessesResult.data || [],
        visits: visitsResult.data || [],
        caseFeedback: feedbackResult.data || [],
        feedbackMessages: feedbackMessagesResult.data || [],
        homepageSurveyResponses: homepageSurveyResponsesResult.data || [],
        siteSurveyResponses: siteSurveyResponsesResult.data || [],
        homepageAnnouncementResponses: announcementResponsesResult.data || [],
        groups: mergedGroups,
        groupMembers: membershipsResult.data || [],
        groupJoinRequests: joinRequestsResult.data || [],
        groupWeeklyHonors: weeklyHonorsResult.data || [],
        directMessages: directMessagesResult.data || [],
      },
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Could not build your backup right now.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
