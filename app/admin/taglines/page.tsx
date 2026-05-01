'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Header } from '@/components/Header'
import { supabase } from '@/lib/supabase'

type Level = 'med_student' | 'resident' | 'attending'

type TaglineRow = {
  id?: string
  level: Level
  text: string
  updated_at?: string
}

const DEFAULT_TAGLINES: Record<Level, string> = {
  med_student: 'FOUNDATIONS',
  resident: 'MAKE THE CALL',
  attending: 'CONNECT THE DOTS',
}

const LEVEL_ORDER: Level[] = ['med_student', 'resident', 'attending']
const PLAY_BOOTSTRAP_CACHE_KEY = 'orthodle_play_bootstrap_v1'

export default function AdminTaglinesPage() {
  const [authReady, setAuthReady] = useState(false)
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [rows, setRows] = useState<Record<Level, string>>(DEFAULT_TAGLINES)
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
      .select('id, level, text, position, updated_at')
      .order('updated_at', { ascending: false })
      .order('id', { ascending: false })

    if (error) {
      setStatus(`Could not load subtitles: ${error.message}`)
      return
    }

    const nextRows = { ...DEFAULT_TAGLINES }

    for (const level of LEVEL_ORDER) {
      const latestRow = (data || []).find(item => item.level === level && item.text?.trim())
      if (latestRow?.text) {
        nextRows[level] = latestRow.text.toUpperCase()
      }
    }

    setRows(nextRows)
  }

  async function saveAll() {
    const payload = LEVEL_ORDER.map(level => ({
      level,
      text: (rows[level] || DEFAULT_TAGLINES[level]).trim().toUpperCase(),
    }))

    if (payload.some(item => !item.text)) {
      setStatus('Each level needs a subtitle.')
      return
    }

    for (const item of payload) {
      const { data: existingRows, error: existingError } = await supabase
        .from('difficulty_taglines')
        .select('id')
        .eq('level', item.level)
        .order('updated_at', { ascending: false })
        .order('id', { ascending: false })

      if (existingError) {
        setStatus(`Could not load existing subtitles: ${existingError.message}`)
        return
      }

      if (!existingRows || existingRows.length === 0) {
        const { error: insertError } = await supabase.from('difficulty_taglines').insert({
          level: item.level,
          text: item.text,
          position: 0,
        })

        if (insertError) {
          setStatus(`Could not save subtitles: ${insertError.message}`)
          return
        }
        continue
      }

      const primaryId = existingRows[0].id
      const duplicateIds = existingRows.slice(1).map(row => row.id)

      const { error: updateError } = await supabase
        .from('difficulty_taglines')
        .update({
          text: item.text,
          position: 0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', primaryId)

      if (updateError) {
        setStatus(`Could not save subtitles: ${updateError.message}`)
        return
      }

      if (duplicateIds.length > 0) {
        const { error: cleanupError } = await supabase
          .from('difficulty_taglines')
          .delete()
          .in('id', duplicateIds)

        if (cleanupError) {
          setStatus(`Saved, but could not clean old subtitle duplicates: ${cleanupError.message}`)
          return
        }
      }
    }

    window.sessionStorage.removeItem(PLAY_BOOTSTRAP_CACHE_KEY)
    setStatus('Button subtitles updated.')
    await loadRows()
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

      <div className="mx-auto max-w-4xl px-5 py-6 sm:px-6 sm:py-7">
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
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="font-serif text-xl font-bold text-[#102018]">
              Daily captions
            </h2>
            <button
              type="button"
              onClick={() => void saveAll()}
              className="rounded-lg border border-[#ded7ca] px-3 py-2 text-sm font-semibold text-[#102018] transition hover:bg-white"
            >
              Save all
            </button>
          </div>

          <div className="mt-4 space-y-4">
            {LEVEL_ORDER.map(level => (
              <div key={level} className="rounded-xl border border-[#e7e1d6] bg-[#fcfbf8] p-3">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#102018]">
                    {formatLevel(level)}
                  </span>
                  <input
                    value={rows[level]}
                    onChange={e =>
                      setRows(prev => ({
                        ...prev,
                        [level]: e.target.value.toUpperCase(),
                      }))
                    }
                    placeholder={`${formatLevel(level)} subtitle`}
                    className="w-full rounded-xl border border-[#ded7ca] bg-white px-3 py-2.5 text-sm text-[#102018] outline-none transition focus:border-[#1f6448] focus:ring-2 focus:ring-[#1f6448]/15"
                  />
                </label>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
