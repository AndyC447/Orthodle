'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Header } from '@/components/Header'
import { supabase } from '@/lib/supabase'

type Level = 'med_student' | 'resident' | 'attending'

type TaglineRow = {
  level: Level
  text: string
}

const DEFAULT_TAGLINES: Record<Level, string> = {
  med_student: 'START HERE',
  resident: 'MAKE THE CALL',
  attending: 'CONNECT THE DOTS',
}

const LEVEL_ORDER: Level[] = ['med_student', 'resident', 'attending']

export default function AdminTaglinesPage() {
  const [authReady, setAuthReady] = useState(false)
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [rows, setRows] = useState<TaglineRow[]>([])
  const [status, setStatus] = useState('')

  useEffect(() => {
    const savedUnlock = window.sessionStorage.getItem('orthodle_admin_unlocked')
    setIsUnlocked(savedUnlock === 'true')
    setAuthReady(true)
  }, [])

  useEffect(() => {
    if (!isUnlocked) return
    void loadRows()
  }, [isUnlocked])

  async function loadRows() {
    const { data, error } = await supabase
      .from('difficulty_taglines')
      .select('level, text')
      .order('level', { ascending: true })

    if (error) {
      setStatus(`Could not load taglines: ${error.message}`)
      return
    }

    const byLevel = new Map<Level, string>()
    for (const item of (data || []) as TaglineRow[]) {
      byLevel.set(item.level, item.text)
    }

    setRows(
      LEVEL_ORDER.map(level => ({
        level,
        text: byLevel.get(level) || DEFAULT_TAGLINES[level],
      }))
    )
  }

  async function saveRow(level: Level, text: string) {
    const trimmedText = text.trim().toUpperCase()
    if (!trimmedText) {
      setStatus('Taglines cannot be blank.')
      return
    }

    const { error } = await supabase
      .from('difficulty_taglines')
      .upsert({ level, text: trimmedText }, { onConflict: 'level' })

    if (error) {
      setStatus(`Could not save tagline: ${error.message}`)
      return
    }

    setRows(prev =>
      prev.map(row => (row.level === level ? { ...row, text: trimmedText } : row))
    )
    setStatus(`${formatLevel(level)} subtitle updated.`)
  }

  function formatLevel(level: Level) {
    if (level === 'med_student') return 'Med Student'
    if (level === 'resident') return 'Resident'
    return 'Attending'
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
              Open the main admin page first, then come back here to edit button subtitles.
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

      <div className="mx-auto max-w-5xl px-5 py-6 sm:px-6 sm:py-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#637268]">
              Admin
            </div>
            <h1 className="mt-2 font-serif text-3xl font-bold text-[#102018]">
              Button Subtitles
            </h1>
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
              Subtitle sheet
            </h2>
            <div className="rounded-full border border-[#ded7ca] bg-[#fbfaf7] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#637268]">
              {rows.length} rows
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-xl border border-[#e7e1d6]">
            <div className="grid grid-cols-[180px_minmax(0,1fr)_100px] border-b border-[#e7e1d6] bg-[#fbfaf7] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#637268]">
              <div>Level</div>
              <div>Subtitle text</div>
              <div className="text-center">Save</div>
            </div>

            <div>
              {rows.map(row => (
                <div
                  key={row.level}
                  className="grid grid-cols-[180px_minmax(0,1fr)_100px] items-center gap-2 border-b border-[#f1ece2] px-3 py-3 last:border-b-0"
                >
                  <div className="text-sm font-semibold text-[#102018]">
                    {formatLevel(row.level)}
                  </div>
                  <input
                    type="text"
                    value={row.text}
                    onChange={e =>
                      setRows(prev =>
                        prev.map(item =>
                          item.level === row.level
                            ? { ...item, text: e.target.value.toUpperCase() }
                            : item
                        )
                      )
                    }
                    className="rounded-lg border border-[#ded7ca] bg-white px-3 py-2 text-sm text-[#102018] outline-none transition focus:border-[#1f6448] focus:ring-2 focus:ring-[#1f6448]/15"
                  />
                  <button
                    type="button"
                    onClick={() => saveRow(row.level, row.text)}
                    className="rounded-lg border border-[#ded7ca] px-3 py-2 text-sm font-semibold text-[#102018] transition hover:bg-white"
                  >
                    Save
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
