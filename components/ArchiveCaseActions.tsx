'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { getCompletedCaseKeys, getSessionId, todayISO } from '@/lib/utils'
import { isChoiceQuestionCase } from '@/lib/anatomy-quiz'
import { isPublicArchiveCase } from '@/lib/archive-publication'

export function ArchiveCaseActions({ currentId }: { currentId: string }) {
  const [nextHref, setNextHref] = useState<string | null>(null)
  const [status, setStatus] = useState('Finding your next case…')
  useEffect(() => {
    let cancelled = false
    setNextHref(null)
    setStatus('Finding your next case…')
    async function load() {
      const cases = []
      const guesses = []
      const session = getSessionId()
      const publicationResult = await supabase.from('play_mode_settings').select('*').eq('id', 'default').maybeSingle()
      const publication = publicationResult.error ? null : publicationResult.data
      for (let offset = 0; ; offset += 500) {
        const result = await supabase.from('cases')
          .select('id, case_date, level, answer, synonyms, clue_1, clue_2, clue_3, clue_4, clue_5, clue_6')
          .gte('case_date', '2026-04-27').lt('case_date', todayISO())
          .order('case_date', { ascending: false }).order('level').order('id').range(offset, offset + 499)
        if (result.error) throw result.error
        cases.push(...(result.data || []))
        if ((result.data || []).length < 500) break
      }
      for (let offset = 0; ; offset += 500) {
        const result = await supabase.from('guesses').select('case_id, is_correct')
          .eq('session_id', session).order('id').range(offset, offset + 499)
        if (result.error) throw result.error
        guesses.push(...(result.data || []))
        if ((result.data || []).length < 500) break
      }
      const completed = new Set([...getCompletedCaseKeys()].map(key => key.replace(/:daily$/, ':archive')))
      const counts = new Map<string, { count: number; correct: boolean }>()
      for (const guess of guesses) {
        if (!guess.case_id) continue
        const previous = counts.get(guess.case_id) || { count: 0, correct: false }
        counts.set(guess.case_id, { count: previous.count + 1, correct: previous.correct || guess.is_correct })
      }
      // Continue through older cases, wrapping to newer pending cases at the end.
      const current = cases.find(item => item.id === currentId)
      let includeOlderBonus = Boolean(current && current.level !== 'med_student')
      try { includeOlderBonus ||= JSON.parse(sessionStorage.getItem('orthodle_archive_view_v1') || 'null')?.showOlderBonus === true } catch { /* Keep the current case's archive scope. */ }
      const publicCases = cases.filter(item => isPublicArchiveCase(item, publication, includeOlderBonus))
      const index = publicCases.findIndex(item => item.id === currentId)
      const ordered = index < 0 ? publicCases : [...publicCases.slice(index + 1), ...publicCases.slice(0, index)]
      const next = ordered.find(item => {
        if (item.id === currentId || completed.has(`${item.case_date}:${item.level}:archive`)) return false
        const progress = counts.get(item.id)
        const limit = isChoiceQuestionCase(item) ? 1 : 6
        return !progress || (!progress.correct && progress.count < limit)
      })
      if (cancelled) return
      setNextHref(next ? `/?case=${next.id}&date=${next.case_date}&level=${next.level}` : null)
      setStatus(next ? '' : 'You’ve completed all available archive cases.')
    }
    void load().catch(() => { if (!cancelled) setStatus('Could not find the next case. You can still browse the archive.') })
    return () => { cancelled = true }
  }, [currentId])
  return <div className="mx-auto mt-4 flex max-w-[460px] flex-wrap justify-center gap-2">
    {nextHref && <Link href={nextHref} className="orthodle-primary-button rounded-lg border px-4 py-2 text-center font-semibold">Next unsolved case →</Link>}
    <Link href="/archive" className="rounded-lg border border-[#ded7ca] px-4 py-2 text-center font-semibold">Back to calendar</Link>
    {status && <p role="status" className="w-full text-center text-sm text-[#637268]">{status}</p>}
  </div>
}
