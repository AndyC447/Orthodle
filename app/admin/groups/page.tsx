'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Header } from '@/components/Header'
import { supabase } from '@/lib/supabase'
import { setTrackingDisabledForThisBrowser } from '@/lib/utils'

type GroupRow = {
  id: string
  name: string
  icon: string | null
  join_code: string
  creator_session_id: string
  created_at: string
}

type GroupMemberRow = {
  id: string
  group_id: string
  session_id: string
  display_name: string
  icon: string | null
  created_at: string
}

type GroupWithMembers = GroupRow & {
  members: GroupMemberRow[]
}

type GroupJoinRequestRow = {
  id: string
  group_id: string | null
  group_name: string
  requester_session_id: string
  requester_display_name: string
  requester_icon: string | null
  contact_text: string | null
  note: string | null
  status: string
  created_at: string
  handled_at: string | null
}

function formatMemberCount(count: number) {
  return `${count} member${count === 1 ? '' : 's'}`
}

function formatDate(dateText: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(dateText))
}

export default function AdminGroupsPage() {
  const [authReady, setAuthReady] = useState(false)
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [groups, setGroups] = useState<GroupRow[]>([])
  const [members, setMembers] = useState<GroupMemberRow[]>([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [removingGroupId, setRemovingGroupId] = useState('')
  const [requests, setRequests] = useState<GroupJoinRequestRow[]>([])
  const [updatingRequestId, setUpdatingRequestId] = useState('')

  useEffect(() => {
    const savedUnlock = window.sessionStorage.getItem('orthodle_admin_unlocked')
    setIsUnlocked(savedUnlock === 'true')
    setAuthReady(true)
  }, [])

  useEffect(() => {
    if (!isUnlocked) return
    setTrackingDisabledForThisBrowser(true)
    void loadGroups()
  }, [isUnlocked])

  async function loadGroups() {
    setLoading(true)
    setStatus('')

    const [groupResult, memberResult, requestResult] = await Promise.all([
      supabase.from('groups').select('*').order('created_at', { ascending: false }),
      supabase.from('group_members').select('*').order('created_at', { ascending: true }),
      supabase.from('group_join_requests').select('*').order('created_at', { ascending: false }),
    ])

    if (groupResult.error) {
      setStatus(`Could not load groups: ${groupResult.error.message}`)
      setLoading(false)
      return
    }

    if (memberResult.error) {
      setStatus(`Could not load members: ${memberResult.error.message}`)
      setLoading(false)
      return
    }

    if (requestResult.error && !requestResult.error.message.toLowerCase().includes('does not exist')) {
      setStatus(`Could not load invite requests: ${requestResult.error.message}`)
      setLoading(false)
      return
    }

    setGroups((groupResult.data || []) as GroupRow[])
    setMembers((memberResult.data || []) as GroupMemberRow[])
    setRequests(((requestResult.data || []) as GroupJoinRequestRow[]) || [])
    setLoading(false)
  }

  async function removeGroup(group: GroupRow) {
    const adminPassword = window.sessionStorage.getItem('orthodle_admin_password') || ''
    if (!adminPassword) {
      setStatus('Unlock admin first, then come back here to remove groups.')
      return
    }

    const confirmed = window.confirm(
      `Remove "${group.name}" and its group members? Player guesses and case stats will stay intact.`
    )
    if (!confirmed) return

    setRemovingGroupId(group.id)
    setStatus('')

    const response = await fetch('/api/admin-delete-group', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: adminPassword, groupId: group.id }),
    })

    const payload = await response.json().catch(() => ({}))

    if (!response.ok) {
      setRemovingGroupId('')
      setStatus(payload.error || 'Could not remove that group.')
      return
    }

    setGroups(prev => prev.filter(item => item.id !== group.id))
    setMembers(prev => prev.filter(item => item.group_id !== group.id))
    setRemovingGroupId('')
    setStatus(`Removed ${group.name}.`)
  }

  async function markRequestHandled(request: GroupJoinRequestRow) {
    setUpdatingRequestId(request.id)
    setStatus('')

    const { error } = await supabase
      .from('group_join_requests')
      .update({ status: 'handled', handled_at: new Date().toISOString() })
      .eq('id', request.id)

    if (error) {
      setUpdatingRequestId('')
      setStatus(error.message)
      return
    }

    setRequests(prev =>
      prev.map(entry =>
        entry.id === request.id
          ? { ...entry, status: 'handled', handled_at: new Date().toISOString() }
          : entry
      )
    )
    setUpdatingRequestId('')
    setStatus(`Marked ${request.requester_display_name}'s request as handled.`)
  }

  async function removeRequest(request: GroupJoinRequestRow) {
    const confirmed = window.confirm(`Remove invite request for ${request.group_name}?`)
    if (!confirmed) return

    setUpdatingRequestId(request.id)
    setStatus('')

    const { error } = await supabase.from('group_join_requests').delete().eq('id', request.id)

    if (error) {
      setUpdatingRequestId('')
      setStatus(error.message)
      return
    }

    setRequests(prev => prev.filter(entry => entry.id !== request.id))
    setUpdatingRequestId('')
    setStatus(`Removed the request for ${request.group_name}.`)
  }

  const groupsWithMembers = useMemo<GroupWithMembers[]>(() => {
    return groups.map(group => ({
      ...group,
      members: members.filter(member => member.group_id === group.id),
    }))
  }, [groups, members])

  const filteredGroups = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    if (!normalizedSearch) return groupsWithMembers

    return groupsWithMembers.filter(group => {
      const haystack = [
        group.name,
        group.join_code,
        ...group.members.map(member => member.display_name),
      ]
        .join(' ')
        .toLowerCase()

      return haystack.includes(normalizedSearch)
    })
  }, [groupsWithMembers, search])

  const filteredRequests = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    if (!normalizedSearch) return requests

    return requests.filter(request =>
      [request.group_name, request.requester_display_name, request.contact_text || '', request.note || '']
        .join(' ')
        .toLowerCase()
        .includes(normalizedSearch)
    )
  }, [requests, search])

  const totalMembers = members.length
  const averageMembers = groups.length > 0 ? totalMembers / groups.length : 0

  if (!authReady) {
    return (
      <main className="app-surface min-h-screen">
        <Header />
      </main>
    )
  }

  if (!isUnlocked) {
    return (
      <main className="app-surface min-h-screen">
        <Header />
        <div className="mx-auto max-w-xl px-6 py-12">
          <section className="night-surface rounded-2xl border border-[#ded7ca] bg-white p-6 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#637268]">
              Admin access
            </div>
            <h1 className="mt-3 font-serif text-3xl font-bold text-[#102018]">
              Unlock admin first
            </h1>
            <p className="mt-2 text-sm leading-6 text-[#637268]">
              Open the main admin dashboard first, then come back here to manage groups.
            </p>
            <Link
              href="/admin"
              className="mt-5 inline-flex rounded-lg bg-[#1f6448] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#174c37]"
            >
              Go to admin
            </Link>
          </section>
        </div>
      </main>
    )
  }

  return (
    <main className="app-surface min-h-screen">
      <Header />

      <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6 sm:py-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#637268]">
              Admin
            </div>
            <h1 className="mt-2 font-serif text-3xl font-bold text-[#102018]">
              Groups
            </h1>
            <p className="mt-1.5 text-sm leading-6 text-[#637268]">
              Review, search, and remove test groups from the competition board.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadGroups()}
              className="rounded-lg border border-[#ded7ca] px-3 py-1.5 text-sm font-semibold text-[#102018] transition hover:bg-white disabled:opacity-60"
              disabled={loading}
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
            <Link
              href="/admin/groups-stats"
              className="rounded-lg border border-[#ded7ca] px-3 py-1.5 text-sm font-semibold text-[#102018] transition hover:bg-white"
            >
              Stats
            </Link>
            <Link
              href="/admin"
              className="rounded-lg border border-[#ded7ca] px-3 py-1.5 text-sm font-semibold text-[#102018] transition hover:bg-white"
            >
              Back to admin
            </Link>
          </div>
        </div>

        {status && <p className="mt-4 text-sm text-[#637268]">{status}</p>}

        <section className="night-surface mt-5 rounded-2xl border border-[#e7e1d6] bg-white p-3.5 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-[#ded7ca] bg-[#fcfbf8] px-3 py-2.5">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#637268]">
                Groups
              </div>
              <div className="mt-1 font-serif text-2xl font-bold text-[#102018]">
                {groups.length}
              </div>
            </div>
            <div className="rounded-xl border border-[#ded7ca] bg-[#fcfbf8] px-3 py-2.5">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#637268]">
                Members
              </div>
              <div className="mt-1 font-serif text-2xl font-bold text-[#102018]">
                {totalMembers}
              </div>
            </div>
            <div className="rounded-xl border border-[#ded7ca] bg-[#fcfbf8] px-3 py-2.5">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#637268]">
                Avg size
              </div>
              <div className="mt-1 font-serif text-2xl font-bold text-[#102018]">
                {averageMembers.toFixed(1)}
              </div>
            </div>
          </div>
        </section>

        <section className="night-surface mt-4 rounded-2xl border border-[#e7e1d6] bg-white p-3.5 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-serif text-xl font-bold text-[#102018]">
                Invite requests
              </h2>
              <p className="mt-1 text-sm text-[#637268]">
                Review people asking to join a group when they do not have a code yet.
              </p>
            </div>
            <div className="rounded-lg border border-[#ded7ca] bg-[#fcfbf8] px-3 py-1.5 text-sm font-semibold text-[#102018]">
              {requests.filter(request => request.status !== 'handled').length} open
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-xl border border-[#e7e1d6]">
            <div className="hidden grid-cols-[130px_minmax(0,1fr)_150px_160px_180px] gap-3 border-b border-[#e7e1d6] bg-[#fbfaf7] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#637268] md:grid">
              <div>Group</div>
              <div>Requester</div>
              <div>Contact</div>
              <div>Requested</div>
              <div className="text-right">Action</div>
            </div>

            <div>
              {loading ? (
                <div className="px-3 py-5 text-sm text-[#637268]">Loading requests...</div>
              ) : filteredRequests.length === 0 ? (
                <div className="px-3 py-5 text-sm text-[#637268]">
                  No invite requests yet.
                </div>
              ) : (
                filteredRequests.map(request => (
                  <div
                    key={request.id}
                    className="grid gap-3 border-b border-[#f1ece2] px-3 py-3 last:border-b-0 md:grid-cols-[130px_minmax(0,1fr)_150px_160px_180px] md:items-center"
                  >
                    <div className="text-sm font-semibold text-[#102018]">
                      {request.group_name}
                    </div>
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#fcfbf8] text-xl">
                          {request.requester_icon || '🦴'}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-[#102018]">
                            {request.requester_display_name}
                          </div>
                          {request.note ? (
                            <div className="mt-0.5 text-[12px] text-[#637268]">
                              {request.note}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <div className="text-sm text-[#637268]">
                      {request.contact_text || 'No contact added'}
                    </div>
                    <div className="text-sm text-[#637268]">
                      {formatDate(request.created_at)}
                      <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8a9389]">
                        {request.status}
                      </div>
                    </div>
                    <div className="flex flex-wrap justify-start gap-2 md:justify-end">
                      {request.status !== 'handled' ? (
                        <button
                          type="button"
                          onClick={() => void markRequestHandled(request)}
                          disabled={updatingRequestId === request.id}
                          className="rounded-lg border border-[#d8e6dd] bg-[#f7fbf8] px-3 py-1.5 text-sm font-semibold text-[#1f6448] transition hover:bg-white disabled:opacity-50"
                        >
                          {updatingRequestId === request.id ? 'Saving...' : 'Mark handled'}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void removeRequest(request)}
                        disabled={updatingRequestId === request.id}
                        className="rounded-lg border border-[#f0d7c8] bg-[#fff8ef] px-3 py-1.5 text-sm font-semibold text-[#a24d24] transition hover:bg-[#fff1e8] disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="night-surface mt-4 rounded-2xl border border-[#e7e1d6] bg-white p-3.5 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-serif text-xl font-bold text-[#102018]">
                Group manager
              </h2>
              <p className="mt-1 text-sm text-[#637268]">
                Removing a group also removes that group membership list.
              </p>
            </div>
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search groups, codes, members"
              className="min-w-0 rounded-lg border border-[#ded7ca] px-3 py-2 text-sm text-[#102018] sm:w-72"
            />
          </div>

          <div className="mt-4 overflow-hidden rounded-xl border border-[#e7e1d6]">
            <div className="hidden grid-cols-[minmax(0,1fr)_110px_130px_120px] gap-3 border-b border-[#e7e1d6] bg-[#fbfaf7] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#637268] md:grid">
              <div>Group</div>
              <div>Members</div>
              <div>Created</div>
              <div className="text-right">Action</div>
            </div>

            <div>
              {loading ? (
                <div className="px-3 py-5 text-sm text-[#637268]">Loading groups...</div>
              ) : filteredGroups.length === 0 ? (
                <div className="px-3 py-5 text-sm text-[#637268]">
                  No groups match that search.
                </div>
              ) : (
                filteredGroups.map(group => (
                  <div
                    key={group.id}
                    className="grid gap-3 border-b border-[#f1ece2] px-3 py-3 last:border-b-0 md:grid-cols-[minmax(0,1fr)_110px_130px_120px] md:items-center"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#1f6448] text-2xl shadow-[inset_0_0_18px_rgba(255,255,255,0.18)]">
                        {group.icon || '🦴'}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-serif text-lg font-bold text-[#102018]">
                          {group.name}
                        </div>
                        <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#637268]">
                          Invite code {group.join_code}
                        </div>
                        {group.members.length > 0 ? (
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {group.members.slice(0, 5).map(member => (
                              <span
                                key={member.id}
                                className="rounded-full border border-[#ded7ca] bg-white px-2 py-0.5 text-[11px] text-[#637268]"
                              >
                                {member.icon || '🦴'} {member.display_name}
                              </span>
                            ))}
                            {group.members.length > 5 ? (
                              <span className="rounded-full border border-[#ded7ca] bg-[#fcfbf8] px-2 py-0.5 text-[11px] text-[#637268]">
                                +{group.members.length - 5} more
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="text-sm text-[#637268] md:text-[#102018]">
                      {formatMemberCount(group.members.length)}
                    </div>
                    <div className="text-sm text-[#637268]">
                      {formatDate(group.created_at)}
                    </div>
                    <div className="flex justify-start md:justify-end">
                      <button
                        type="button"
                        onClick={() => void removeGroup(group)}
                        disabled={removingGroupId === group.id}
                        className="rounded-lg border border-[#f0d7c8] bg-[#fff8ef] px-3 py-1.5 text-sm font-semibold text-[#a24d24] transition hover:bg-[#fff1e8] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {removingGroupId === group.id ? 'Removing...' : 'Remove'}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
