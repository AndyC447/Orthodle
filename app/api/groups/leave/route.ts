import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: Request) {
  try {
    const { groupId, sessionId } = await req.json()

    if (!groupId || !sessionId) {
      return NextResponse.json({ error: 'Missing group details.' }, { status: 400 })
    }

    const supabaseAdmin = getSupabaseAdmin()

    const { data: group, error: groupError } = await supabaseAdmin
      .from('groups')
      .select('id, name, creator_session_id')
      .eq('id', groupId)
      .maybeSingle()

    if (groupError) {
      return NextResponse.json({ error: groupError.message }, { status: 500 })
    }

    if (!group) {
      return NextResponse.json({ error: 'That group no longer exists.' }, { status: 404 })
    }

    const { data: membership, error: membershipError } = await supabaseAdmin
      .from('group_members')
      .select('id, session_id, group_id, created_at')
      .eq('group_id', groupId)
      .eq('session_id', sessionId)
      .maybeSingle()

    if (membershipError) {
      return NextResponse.json({ error: membershipError.message }, { status: 500 })
    }

    if (!membership) {
      return NextResponse.json({ error: 'You are not in that group.' }, { status: 404 })
    }

    const isCreator = group.creator_session_id === sessionId

    if (isCreator) {
      const { data: remainingMembers, error: remainingMembersError } = await supabaseAdmin
        .from('group_members')
        .select('id, session_id, created_at')
        .eq('group_id', groupId)
        .neq('session_id', sessionId)
        .order('created_at', { ascending: true })

      if (remainingMembersError) {
        return NextResponse.json({ error: remainingMembersError.message }, { status: 500 })
      }

      if (!remainingMembers || remainingMembers.length === 0) {
        const { error: deleteMembershipError } = await supabaseAdmin
          .from('group_members')
          .delete()
          .eq('id', membership.id)
          .eq('group_id', groupId)

        if (deleteMembershipError) {
          return NextResponse.json({ error: deleteMembershipError.message }, { status: 500 })
        }

        const { error: deleteGroupError } = await supabaseAdmin
          .from('groups')
          .delete()
          .eq('id', groupId)

        if (deleteGroupError) {
          return NextResponse.json({ error: deleteGroupError.message }, { status: 500 })
        }

        return NextResponse.json({ ok: true, deletedGroup: true })
      }

      const nextCreator = remainingMembers[0]

      const { error: transferError } = await supabaseAdmin
        .from('groups')
        .update({ creator_session_id: nextCreator.session_id })
        .eq('id', groupId)

      if (transferError) {
        return NextResponse.json({ error: transferError.message }, { status: 500 })
      }
    }

    const { error: deleteMembershipError } = await supabaseAdmin
      .from('group_members')
      .delete()
      .eq('id', membership.id)
      .eq('group_id', groupId)

    if (deleteMembershipError) {
      return NextResponse.json({ error: deleteMembershipError.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, deletedGroup: false })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not leave the group right now.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
