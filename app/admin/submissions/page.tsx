'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Header } from '@/components/Header'
import { supabase } from '@/lib/supabase'

type Level = 'med_student' | 'resident' | 'attending'

type SubmissionRow = {
  id: string
  contributor_name: string | null
  status: string
  scheduled_date: string | null
  published_case_id: string | null
  level: Level
  category: string | null
  prompt: string
  answer: string
  synonyms: string[] | null
  image_url: string | null
  image_credit: string | null
  image_reveal_clue: number | null
  clue_1: string | null
  clue_2: string | null
  clue_3: string | null
  clue_4: string | null
  clue_5: string | null
  clue_6: string | null
  teaching_point: string | null
  created_at: string
}

export default function AdminSubmissionsPage() {
  const [authReady, setAuthReady] = useState(false)
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([])
  const [status, setStatus] = useState('')

  useEffect(() => {
    const savedUnlock = window.sessionStorage.getItem('orthodle_admin_unlocked')
    setIsUnlocked(savedUnlock === 'true')
    setAuthReady(true)
  }, [])

  useEffect(() => {
    if (!isUnlocked) return
    void loadSubmissions()
  }, [isUnlocked])

  async function loadSubmissions() {
    const { data, error } = await supabase
      .from('case_submissions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) {
      setStatus(`Could not load submissions: ${error.message}`)
      return
    }

    setSubmissions((data || []) as SubmissionRow[])
  }

  async function updateSubmissionStatus(
    submissionId: string,
    nextStatus: 'accepted' | 'needs_edits' | 'rejected'
  ) {
    const { error } = await supabase
      .from('case_submissions')
      .update({ status: nextStatus })
      .eq('id', submissionId)

    if (error) {
      setStatus(`Could not update submission: ${error.message}`)
      return
    }

    setSubmissions(prev =>
      prev.map(item =>
        item.id === submissionId
          ? {
              ...item,
              status: nextStatus,
            }
          : item
      )
    )
    setStatus(`Submission marked as ${nextStatus.replace('_', ' ')}.`)
  }

  function formatLevel(level: Level) {
    if (level === 'med_student') return 'Med Student'
    if (level === 'resident') return 'Resident'
    return 'Attending'
  }

  function formatStatusLabel(value: string) {
    if (value === 'needs_edits') return 'Needs edits'
    if (value === 'accepted') return 'Accepted'
    if (value === 'rejected') return 'Rejected'
    if (value === 'scheduled') return 'Scheduled'
    return 'Pending'
  }

  if (!authReady) {
    return (
      <main>
        <Header />
      </main>
    )
  }

  if (!isUnlocked) {
    return (
      <main className="min-h-screen bg-[#fbfaf7]">
        <Header />
        <div className="mx-auto max-w-xl px-6 py-12">
          <section className="rounded-2xl border border-[#ded7ca] bg-white p-6 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#637268]">
              Admin Access
            </div>
            <h1 className="mt-3 font-serif text-3xl font-bold text-[#102018]">
              Unlock admin first
            </h1>
            <p className="mt-2 text-sm leading-6 text-[#637268]">
              Open the main admin page first, then come back here to review submissions.
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
    <main className="min-h-screen bg-[#fbfaf7]">
      <Header />

      <div className="mx-auto max-w-6xl px-5 py-6 sm:px-6 sm:py-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#637268]">
              Admin
            </div>
            <h1 className="mt-2 font-serif text-3xl font-bold text-[#102018]">
              Case Submissions
            </h1>
            <p className="mt-1.5 text-sm text-[#637268]">
              Review submitted cases, update their status, and pull them into the scheduler from the main admin page when needed.
            </p>
          </div>

          <Link
            href="/admin"
            className="rounded-lg border border-[#ded7ca] px-3 py-1.5 text-sm font-semibold text-[#102018] transition hover:bg-white"
          >
            Back to admin
          </Link>
        </div>

        {status && <p className="mt-4 text-sm text-[#637268]">{status}</p>}

        <section className="mt-5 rounded-2xl border border-[#e7e1d6] bg-white p-4 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-serif text-xl font-bold text-[#102018]">
              Submission sheet
            </h2>
            <div className="rounded-full border border-[#ded7ca] bg-[#fbfaf7] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#637268]">
              {submissions.length} rows
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-xl border border-[#e7e1d6]">
            <div className="grid grid-cols-[150px_120px_130px_minmax(0,1fr)_300px] border-b border-[#e7e1d6] bg-[#fbfaf7] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#637268]">
              <div>Contributor</div>
              <div>Level</div>
              <div>Status</div>
              <div>Case</div>
              <div className="text-center">Actions</div>
            </div>

            <div className="max-h-[720px] overflow-y-auto">
              {submissions.length === 0 ? (
                <div className="px-3 py-4 text-sm text-[#637268]">
                  No submissions yet.
                </div>
              ) : (
                submissions.map(item => (
                  <div
                    key={item.id}
                    className="grid grid-cols-[150px_120px_130px_minmax(0,1fr)_300px] items-start gap-2 border-b border-[#f1ece2] px-3 py-3 last:border-b-0"
                  >
                    <div className="text-sm text-[#102018]">
                      {item.contributor_name || 'Anonymous'}
                    </div>
                    <div className="text-sm text-[#102018]">
                      {formatLevel(item.level)}
                    </div>
                    <div className="text-sm text-[#102018]">
                      {formatStatusLabel(item.status)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[#102018]">
                        {item.answer}
                      </div>
                      <div className="mt-1 text-sm text-[#637268]">
                        {item.category || 'Uncategorized'}
                      </div>
                      <p className="mt-2 line-clamp-3 text-sm leading-6 text-[#637268]">
                        {item.prompt}
                      </p>
                    </div>
                    <div className="flex flex-wrap justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateSubmissionStatus(item.id, 'accepted')}
                        className="rounded-lg border border-[#ded7ca] px-3 py-2 text-sm font-semibold text-[#102018] transition hover:bg-white"
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        onClick={() => updateSubmissionStatus(item.id, 'needs_edits')}
                        className="rounded-lg border border-[#ded7ca] px-3 py-2 text-sm font-semibold text-[#102018] transition hover:bg-white"
                      >
                        Needs edits
                      </button>
                      <button
                        type="button"
                        onClick={() => updateSubmissionStatus(item.id, 'rejected')}
                        className="rounded-lg border border-[#f0d7c8] bg-[#fff1e8] px-3 py-2 text-sm font-semibold text-[#a24d24] transition hover:bg-[#ffe8da]"
                      >
                        Reject
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
