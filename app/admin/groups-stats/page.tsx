'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Header } from '@/components/Header'
import { supabase } from '@/lib/supabase'
import { setTrackingDisabledForThisBrowser } from '@/lib/utils'

type GroupRow = {
  id: string
  name: string
  created_at: string
}

type GroupMemberRow = {
  id: string
  group_id: string
  session_id: string
}

type GroupAggregate = {
  group: {
    id: string
    name: string
  }
  score: number
  activeTodayCount: number
  totalSolves: number
}

function getCurrentWeekRange() {
  const now = new Date()
  const day = now.getDay()
  const daysFromMonday = day === 0 ? 6 : day - 1
  const start = new Date(now)
  start.setDate(now.getDate() - daysFromMonday)
  start.setHours(0, 0, 0, 0)

  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  end.setHours(23, 59, 59, 999)

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  }
}

export default function AdminGroupsStatsPage() {
  const [authReady, setAuthReady] = useState(false)
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [groups, setGroups] = useState<GroupRow[]>([])
  const [members, setMembers] = useState<GroupMemberRow[]>([])
  const [aggregates, setAggregates] = useState<GroupAggregate[]>([])

  const weekRange = useMemo(() => getCurrentWeekRange(), [])

  useEffect(() => {
    const savedUnlock = window.sessionStorage.getItem('orthodle_admin_unlocked')
    setIsUnlocked(savedUnlock === 'true')
    setAuthReady(true)
  }, [])

  useEffect(() => {
    if (!isUnlocked) return
    setTrackingDisabledForThisBrowser(true)
    void loadStats()
  }, [isUnlocked])

  async function loadStats() {
    setLoading(true)
    setStatus('')

    const [groupResult, memberResult, aggregateResponse] = await Promise.all([
      supabase.from('groups').select('id, name, created_at').order('created_at', { ascending: false }),
      supabase.from('group_members').select('id, group_id, session_id').order('created_at', { ascending: true }),
      fetch(
        `/api/groups/leaderboard?window=week&startIso=${encodeURIComponent(weekRange.startIso)}&endIso=${encodeURIComponent(weekRange.endIso)}`,
        { cache: 'no-store' }
      ),
    ])

    if (groupResult.error) {
      setStatus(`Could not load groups: ${groupResult.error.message}`)
      setLoading(false)
      return
    }

    if (memberResult.error) {
      setStatus(`Could not load group members: ${memberResult.error.message}`)
      setLoading(false)
      return
    }

    const aggregatePayload = await aggregateResponse.json().catch(() => ({}))
    if (!aggregateResponse.ok) {
      setStatus(aggregatePayload.error || 'Could not load group stats.')
      setLoading(false)
      return
    }

    setGroups((groupResult.data || []) as GroupRow[])
    setMembers((memberResult.data || []) as GroupMemberRow[])
    setAggregates(((aggregatePayload.aggregates || []) as GroupAggregate[]) || [])
    setLoading(false)
  }

  const totalMembers = members.length
  const avgSize = groups.length > 0 ? totalMembers / groups.length : 0
  const summary = useMemo(
    () => ({
      groupsLive: groups.length,
      membersCompeting: totalMembers,
      activeToday: aggregates.reduce((sum, item) => sum + (item.activeTodayCount || 0), 0),
      totalSolves: aggregates.reduce((sum, item) => sum + (item.totalSolves || 0), 0),
    }),
    [aggregates, groups.length, totalMembers]
  )
  const topGroup = aggregates[0] || null

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
              Open the main admin dashboard first, then come back here to review group stats.
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
              Groups Stats
            </h1>
            <p className="mt-1.5 text-sm leading-6 text-[#637268]">
              Group-wide participation and leaderboard totals for the current week.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadStats()}
              className="rounded-lg border border-[#ded7ca] px-3 py-1.5 text-sm font-semibold text-[#102018] transition hover:bg-white disabled:opacity-60"
              disabled={loading}
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
            <Link
              href="/admin/groups"
              className="rounded-lg border border-[#ded7ca] px-3 py-1.5 text-sm font-semibold text-[#102018] transition hover:bg-white"
            >
              Group manager
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
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ['Groups live', summary.groupsLive],
              ['Members competing', summary.membersCompeting],
              ['Active today', summary.activeToday],
              ['Solves on board', summary.totalSolves],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-[#ded7ca] bg-[#fcfbf8] px-3 py-2.5">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#637268]">
                  {label}
                </div>
                <div className="mt-1 font-serif text-2xl font-bold text-[#102018]">
                  {value}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-[#ded7ca] bg-[#fcfbf8] px-3 py-2.5">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#637268]">
                Average group size
              </div>
              <div className="mt-1 font-serif text-2xl font-bold text-[#102018]">
                {avgSize.toFixed(1)}
              </div>
            </div>
            <div className="rounded-xl border border-[#ded7ca] bg-[#fcfbf8] px-3 py-2.5">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#637268]">
                Top group this week
              </div>
              <div className="mt-1 font-serif text-2xl font-bold text-[#102018]">
                {topGroup?.group.name || '—'}
              </div>
              <div className="mt-1 text-sm text-[#637268]">
                {topGroup ? `${topGroup.score} avg pts · ${topGroup.activeTodayCount} active today` : 'No weekly group data yet.'}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
