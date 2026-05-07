import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: Request) {
  try {
    const { groupId, memberId, leaderSessionId } = await req.json()

    if (!groupId || !memberId || !leaderSessionId) {
      return NextResponse.json({ error: 'Missing group or member details.' }, { status: 400 })
    }

    const supabaseAdmin = getSupabaseAdmin()

    const { data: group, error: groupError } = await supabaseAdmin
      .from('groups')
      .select('id, creator_session_id')
      .eq('id', groupId)
      .maybeSingle()

    if (groupError) {
      return NextResponse.json({ error: groupError.message }, { status: 500 })
    }

    if (!group || group.creator_session_id !== leaderSessionId) {
      return NextResponse.json({ error: 'Only the group leader can remove players.' }, { status: 403 })
    }

    const { data: member, error: memberError } = await supabaseAdmin
      .from('group_members')
      .select('id, group_id, session_id')
      .eq('id', memberId)
      .eq('group_id', groupId)
      .maybeSingle()

    if (memberError) {
      return NextResponse.json({ error: memberError.message }, { status: 500 })
    }

    if (!member) {
      return NextResponse.json({ error: 'That player is not in this group.' }, { status: 404 })
    }

    if (member.session_id === group.creator_session_id) {
      return NextResponse.json({ error: 'The group leader cannot be removed here.' }, { status: 400 })
    }

    const { error: deleteError } = await supabaseAdmin
      .from('group_members')
      .delete()
      .eq('id', memberId)
      .eq('group_id', groupId)

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not remove player right now.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
