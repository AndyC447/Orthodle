'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Header } from '@/components/Header'
import { supabase } from '@/lib/supabase'

type FeedbackRow = {
  id: string
  case_id: string | null
  case_date: string | null
  level: 'med_student' | 'resident' | 'attending' | null
  answer: string | null
  feedback_text: string
  created_at: string
  session_id: string | null
}

export default function AdminFeedbackPage() {
  const [authReady, setAuthReady] = useState(false)
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [feedbackRows, setFeedbackRows] = useState<FeedbackRow[]>([])
  const [status, setStatus] = useState('')

  useEffect(() => {
    const savedUnlock = window.sessionStorage.getItem('orthodle_admin_unlocked')
    setIsUnlocked(savedUnlock === 'true')
    setAuthReady(true)
  }, [])

  useEffect(() => {
    if (!isUnlocked) return
    void loadFeedback()
  }, [isUnlocked])

  async function loadFeedback() {
    const { data, error } = await supabase
      .from('case_feedback')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      setStatus(`Could not load feedback: ${error.message}`)
      return
    }

    setFeedbackRows((data || []) as FeedbackRow[])
  }

  async function deleteFeedback(id: string) {
    const { error } = await supabase.from('case_feedback').delete().eq('id', id)

    if (error) {
      setStatus(`Could not remove feedback: ${error.message}`)
      return
    }

    setStatus('Feedback removed.')
    await loadFeedback()
  }

  function formatLevel(level: FeedbackRow['level']) {
    if (level === 'med_student') return 'Med Student'
    if (level === 'resident') return 'Resident'
    if (level === 'attending') return 'Attending'
    return 'Unknown'
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
              Open the main admin page first, then come back here to review case feedback.
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
              Case Feedback
            </h1>
            <p className="mt-1.5 text-sm text-[#637268]">
              Review player feedback from completed cases.
            </p>
          </div>

          <Link
            href="/admin"
            className="rounded-lg border border-[#ded7ca] px-3 py-1.5 text-sm font-semibold text-[#102018] transition hover:bg-white"
          >
            Back to admin
          </Link>
        </div>

        {status && (
          <p className="mt-4 text-sm text-[#637268]">{status}</p>
        )}

        <section className="mt-5 rounded-2xl border border-[#e7e1d6] bg-white p-4 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-serif text-xl font-bold text-[#102018]">
              Feedback sheet
            </h2>
            <div className="rounded-full border border-[#ded7ca] bg-[#fbfaf7] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#637268]">
              {feedbackRows.length} rows
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-xl border border-[#e7e1d6]">
            <div className="grid grid-cols-[110px_130px_150px_minmax(0,1fr)_100px] border-b border-[#e7e1d6] bg-[#fbfaf7] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#637268]">
              <div>Date</div>
              <div>Level</div>
              <div>Answer</div>
              <div>Feedback</div>
              <div className="text-center">Remove</div>
            </div>

            <div className="max-h-[720px] overflow-y-auto">
              {feedbackRows.length === 0 ? (
                <div className="px-3 py-4 text-sm text-[#637268]">
                  No feedback yet.
                </div>
              ) : (
                feedbackRows.map(item => (
                  <div
                    key={item.id}
                    className="grid grid-cols-[110px_130px_150px_minmax(0,1fr)_100px] items-start gap-2 border-b border-[#f1ece2] px-3 py-3 last:border-b-0"
                  >
                    <div className="text-sm text-[#102018]">
                      {item.case_date || item.created_at.slice(0, 10)}
                    </div>
                    <div className="text-sm text-[#102018]">
                      {formatLevel(item.level)}
                    </div>
                    <div className="text-sm text-[#102018]">
                      {item.answer || 'Unknown'}
                    </div>
                    <div className="text-sm leading-6 text-[#102018]">
                      {item.feedback_text}
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteFeedback(item.id)}
                      className="rounded-lg border border-[#f0d7c8] bg-[#fff1e8] px-3 py-2 text-sm font-semibold text-[#a24d24] transition hover:bg-[#ffe8da]"
                    >
                      Remove
                    </button>
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
