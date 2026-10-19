'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { fetchAdminPages } from '@/lib/admin-dashboard'
import { findSimilarCase, type SimilarCase } from '@/lib/case-learning'
import { getCompletedCaseKeys, getSessionId, todayISO } from '@/lib/utils'

export function SimilarCaseAction({ current }: { current: SimilarCase }) {
  const [next, setNext] = useState<SimilarCase | null>(null)
  useEffect(() => {
    let cancelled = false
    setNext(null)
    if (!current.category?.trim()) return
    async function load() {
      const today = todayISO()
      const session = getSessionId()
      const [cases, guesses] = await Promise.all([
        fetchAdminPages<SimilarCase>((from, to) => supabase.from('cases').select('id, case_date, level, category')
          .eq('level', current.level).gte('case_date', '2026-04-27').lt('case_date', today)
          .order('case_date', { ascending: false }).order('id').range(from, to)),
        fetchAdminPages<{ case_id: string; is_correct: boolean }>((from, to) => supabase.from('guesses').select('case_id, is_correct')
          .eq('session_id', session).order('id').range(from, to)),
      ])
      const match = findSimilarCase(cases, current, guesses, [...getCompletedCaseKeys()], today)
      if (!cancelled) setNext(match)
    }
    // Recommendations are optional; failures must not interrupt the completed case.
    void load().catch(() => { if (!cancelled) setNext(null) })
    return () => { cancelled = true }
  }, [current.id, current.category, current.level])
  if (!next) return null
  return <div className="mx-auto mt-4 max-w-[460px] text-center">
    <Link href={`/?${new URLSearchParams({ case: next.id, date: next.case_date, level: next.level })}`} className="orthodle-primary-button inline-flex rounded-lg border px-4 py-2 font-semibold">Try a similar case →</Link>
    <p className="mt-1 text-xs text-[#637268]">More practice in {next.category}</p>
  </div>
}
