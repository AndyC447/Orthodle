'use client'

import { useState } from 'react'
import { loadAdminCaseStats, type AdminCaseSnapshot } from '@/lib/admin-case-stats'

export function AdminCaseStats({ caseId, onRefresh }: {
  caseId?: string
  onRefresh: (caseId: string, snapshot: AdminCaseSnapshot) => void
}) {
  // Remount when changing slots so another case's numbers never flash here.
  return <CaseStatsPanel key={caseId || 'empty'} caseId={caseId} onRefresh={onRefresh} />
}

function CaseStatsPanel({ caseId, onRefresh }: Parameters<typeof AdminCaseStats>[0]) {
  const [snapshot, setSnapshot] = useState<AdminCaseSnapshot | null>(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const stats = snapshot?.stats

  async function load(refresh = false) {
    if (!caseId || loading) return
    setLoading(true)
    setError('')
    try {
      const result = await loadAdminCaseStats(caseId, refresh)
      setSnapshot(result)
      onRefresh(caseId, result)
    } catch {
      setError('Could not load case stats. Try refreshing.')
    } finally {
      setLoading(false)
    }
  }

  return <section aria-label="Case stats" className="border-t border-[#ebe5db] pt-3">
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#637268]">Case stats</h3>
      {caseId && <button type="button" aria-expanded={open} onClick={() => {
        setOpen(!open)
        if (!open) void load()
      }} className="min-h-[44px] px-2 text-[12px] font-semibold text-[#1f6448]">{open ? 'Hide stats' : 'Show stats'}</button>}
    </div>
    {!caseId ? <p className="mt-2 text-[13px] text-[#637268]">Save this case to start tracking plays.</p> : open && <>
      <div className="flex min-h-8 items-center justify-between gap-3 text-[11px] text-[#637268]">
        {snapshot && <span>Updated {new Date(snapshot.savedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>}
        <button type="button" disabled={loading} onClick={() => void load(true)} className="ml-auto min-h-[44px] px-2 font-semibold text-[#1f6448] disabled:opacity-50">{loading ? 'Updating…' : 'Refresh'}</button>
      </div>
      {error && <p role="alert" className="mt-2 text-[13px] text-[#a24d24]">{error}</p>}
      {!stats && loading && <p role="status" className="mt-2 text-[13px] text-[#637268]">Loading case stats…</p>}
      {stats && <>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          {[
            ['Players', stats.players], ['Solved', stats.solveRate === null ? '—' : `${stats.solveRate}%`],
            ['Guesses', stats.guesses], ['Avg guesses / player', stats.averageGuesses?.toFixed(1) ?? '—'],
          ].map(([label, value]) => <div key={label}>
            <dt className="text-[10px] uppercase tracking-[0.08em] text-[#637268]">{label}</dt>
            <dd className="mt-1 font-serif text-xl font-bold text-[#102018]">{value}</dd>
          </div>)}
        </dl>
        <p className="mt-2 text-[11px] leading-5 text-[#637268]">{stats.solved} solved · Includes anyone who submitted at least one guess, including archive plays. Excludes preview attempts and excluded admin activity.</p>
        {stats.incorrect.length > 0 && <details className="mt-2 text-[13px]">
          <summary className="cursor-pointer py-2 font-semibold text-[#637268]">Top incorrect guesses</summary>
          <ul className="space-y-1">{stats.incorrect.map(([label, count]) => <li key={label} className="flex justify-between gap-3"><span className="min-w-0 break-words">{label}</span><span className="shrink-0 tabular-nums">{count}</span></li>)}</ul>
        </details>}
      </>}
    </>}
  </section>
}
