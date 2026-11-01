'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { fetchAdminPages } from '@/lib/admin-dashboard'
import { fetchExcludedStatsSessionIds, filterExcludedSessionRows } from '@/lib/stats-exclusions'
import { summarizeCaseStats, type CaseGuess } from '@/lib/case-stats'

export function AdminCaseStats({ caseId }: { caseId?: string }) {
  // Remount when changing slots so another case's numbers never flash here.
  return <CaseStatsPanel key={caseId || 'empty'} caseId={caseId} />
}

function CaseStatsPanel({ caseId }: { caseId?: string }) {
  const [stats, setStats] = useState<ReturnType<typeof summarizeCaseStats> | null>(null)
  const [loading, setLoading] = useState(Boolean(caseId))
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    if (!caseId) return
    let cancelled = false
    setLoading(true)
    setError('')
    async function load() {
      try {
        const excluded = new Set(await fetchExcludedStatsSessionIds())
        const rows = await fetchAdminPages<CaseGuess>((from, to) => supabase.from('guesses')
          .select('session_id, is_correct, guess_text').eq('case_id', caseId)
          .order('id').range(from, to))
        if (!cancelled) setStats(summarizeCaseStats(filterExcludedSessionRows(rows, excluded)))
      } catch {
        if (!cancelled) setError('Could not load case stats. Try refreshing.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [caseId, revision])

  return <section aria-label="Case stats" className="border-t border-[#ebe5db] pt-3">
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#637268]">Case stats</h3>
      {caseId && <button type="button" disabled={loading} onClick={() => setRevision(value => value + 1)} className="min-h-[44px] px-2 text-[12px] font-semibold text-[#1f6448] disabled:opacity-50">{loading ? 'Updating…' : 'Refresh'}</button>}
    </div>
    {!caseId ? <p className="mt-2 text-[13px] text-[#637268]">Save this case to start tracking plays.</p> : <>
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
