'use client'

import { useEffect, useState } from 'react'
import type { StreakLeader } from '@/lib/streak-leaderboard'

type Snapshot = { leaders: StreakLeader[]; trackedPlayers: number; longestStreak: number; updatedAt: string }

function dateLabel(value: string) {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function AdminStreakLeaderboard() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(true)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    async function load() {
      setLoading(true)
      setError('')
      try {
        const response = await fetch('/api/admin/streaks', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store', signal: controller.signal,
          body: JSON.stringify({ password: window.sessionStorage.getItem('orthodle_admin_password') || '', refresh: revision > 0 }),
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Could not load streaks.')
        if (!controller.signal.aborted) setSnapshot(data)
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load streaks.')
      } finally { if (!controller.signal.aborted) setLoading(false) }
    }
    void load()
    return () => controller.abort()
  }, [open, revision])

  return (
    <section className="card rounded-2xl border border-[#e7e1d6] bg-white p-3.5 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-serif text-xl font-bold">Top streaks</h2>
        <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} className="rounded-lg border border-[#ded7ca] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#637268]">{open ? 'Hide' : 'Show'}</button>
      </div>
      {open && <>
        <div className="mt-3 flex items-end justify-between gap-3">
          <div><p className="text-xs text-[#637268]">Longest recorded streak</p><p className="mt-1 font-serif text-3xl font-bold">{snapshot ? `${snapshot.longestStreak} days` : '—'}</p></div>
          <button type="button" disabled={loading} onClick={() => setRevision(value => value + 1)} className="min-h-[44px] px-2 text-xs font-semibold text-[#1f6448] disabled:opacity-50">{loading ? 'Loading…' : 'Refresh'}</button>
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-[#a24d24]">{error}</p>}
        {snapshot && <>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#e7e1d6] text-[#637268]"><tr><th scope="col" className="py-2 pr-2">#</th><th scope="col" className="py-2">Player</th><th scope="col" className="py-2 pl-2 text-right">Best</th><th scope="col" className="py-2 pl-2 text-right" title="Streaks ending today or yesterday remain current.">Current</th></tr></thead>
              <tbody>{snapshot.leaders.map((leader, index) => <tr key={leader.sessionId} className="border-b border-[#efe9df] last:border-0">
                <td className="py-3 pr-2 text-[#637268]">{index + 1}</td>
                <th scope="row" className="py-3 font-medium"><span className="block max-w-[150px] truncate" title={leader.name}>{leader.name}</span>{leader.username && leader.name !== leader.username && <span className="block text-[10px] text-[#637268]">@{leader.username}</span>}</th>
                <td className="py-3 pl-2 text-right font-bold tabular-nums" title={`${dateLabel(leader.bestStart)} – ${dateLabel(leader.bestEnd)}`}>{leader.longest}</td>
                <td className="py-3 pl-2 text-right tabular-nums">{leader.current}</td>
              </tr>)}</tbody>
            </table>
          </div>
          {snapshot.leaders.length === 0 && <p className="mt-3 text-sm text-[#637268]">No qualifying daily-case streaks yet.</p>}
          <p className="mt-3 text-[11px] leading-5 text-[#637268]">Consecutive publish days solved, counted once per day in Pacific time. Archives and admin/test sessions excluded. Anonymous entries are browser-based.</p>
          <p className="mt-1 text-[10px] text-[#8a948d]">{snapshot.trackedPlayers.toLocaleString()} players with a daily solve · Updated {new Date(snapshot.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
        </>}
      </>}
    </section>
  )
}
