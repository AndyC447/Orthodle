'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Header } from '@/components/Header'
import { supabase } from '@/lib/supabase'

type Level = 'med_student' | 'resident' | 'attending'

type TaglineRow = {
  level: Level
  text: string
  position: number
}

const DEFAULT_TAGLINES: Record<Level, string[]> = {
  med_student: ['START HERE'],
  resident: ['MAKE THE CALL'],
  attending: ['CONNECT THE DOTS'],
}

const LEVEL_ORDER: Level[] = ['med_student', 'resident', 'attending']
const PLAY_BOOTSTRAP_CACHE_KEY = 'orthodle_play_bootstrap_v1'

function normalizeSubtitleList(today: string, upcomingText: string) {
  const normalizedToday = today.trim().toUpperCase()
  const seen = new Set<string>(normalizedToday ? [normalizedToday] : [])
  const upcoming: string[] = []

  for (const item of upcomingText.split('\n')) {
    const normalized = item.trim().toUpperCase()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    upcoming.push(normalized)
  }

  return {
    today: normalizedToday,
    upcoming,
  }
}

export default function AdminTaglinesPage() {
  const [authReady, setAuthReady] = useState(false)
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [todayRows, setTodayRows] = useState<Record<Level, string>>({
    med_student: DEFAULT_TAGLINES.med_student[0],
    resident: DEFAULT_TAGLINES.resident[0],
    attending: DEFAULT_TAGLINES.attending[0],
  })
  const [futureRows, setFutureRows] = useState<Record<Level, string>>({
    med_student: '',
    resident: '',
    attending: '',
  })
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
      .select('level, text, position')
      .order('level', { ascending: true })
      .order('position', { ascending: true })

    if (error) {
      setStatus(`Could not load taglines: ${error.message}`)
      return
    }

    const byLevel: Record<Level, string[]> = {
      med_student: [],
      resident: [],
      attending: [],
    }

    for (const item of (data || []) as TaglineRow[]) {
      byLevel[item.level].push(item.text)
    }

    const resolved = {
      med_student: byLevel.med_student.length > 0 ? byLevel.med_student : DEFAULT_TAGLINES.med_student,
      resident: byLevel.resident.length > 0 ? byLevel.resident : DEFAULT_TAGLINES.resident,
      attending: byLevel.attending.length > 0 ? byLevel.attending : DEFAULT_TAGLINES.attending,
    }

    const medStudentClean = normalizeSubtitleList(
      resolved.med_student[0] || DEFAULT_TAGLINES.med_student[0],
      resolved.med_student.slice(1).join('\n')
    )
    const residentClean = normalizeSubtitleList(
      resolved.resident[0] || DEFAULT_TAGLINES.resident[0],
      resolved.resident.slice(1).join('\n')
    )
    const attendingClean = normalizeSubtitleList(
      resolved.attending[0] || DEFAULT_TAGLINES.attending[0],
      resolved.attending.slice(1).join('\n')
    )

    setTodayRows({
      med_student: medStudentClean.today || DEFAULT_TAGLINES.med_student[0],
      resident: residentClean.today || DEFAULT_TAGLINES.resident[0],
      attending: attendingClean.today || DEFAULT_TAGLINES.attending[0],
    })

    setFutureRows({
      med_student: medStudentClean.upcoming.join('\n'),
      resident: residentClean.upcoming.join('\n'),
      attending: attendingClean.upcoming.join('\n'),
    })
  }

  async function saveLevel(level: Level) {
    const cleaned = normalizeSubtitleList(todayRows[level], futureRows[level])
    const items = [cleaned.today, ...cleaned.upcoming].filter(Boolean)

    if (items.length === 0) {
      setStatus('Each level needs at least one subtitle.')
      return
    }

    const { error: deleteError } = await supabase
      .from('difficulty_taglines')
      .delete()
      .eq('level', level)

    if (deleteError) {
      setStatus(`Could not clear old subtitles: ${deleteError.message}`)
      return
    }

    const { error } = await supabase.from('difficulty_taglines').insert(
      items.map((text, index) => ({
        level,
        text,
        position: index,
      }))
    )

    if (error) {
      setStatus(`Could not save subtitles: ${error.message}`)
      return
    }

    setTodayRows(prev => ({
      ...prev,
      [level]: cleaned.today,
    }))
    setFutureRows(prev => ({
      ...prev,
      [level]: cleaned.upcoming.join('\n'),
    }))
    window.sessionStorage.removeItem(PLAY_BOOTSTRAP_CACHE_KEY)
    setStatus(`${formatLevel(level)} subtitles updated.`)
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
              3 levels
            </div>
          </div>

          <div className="mt-4 space-y-4">
            {LEVEL_ORDER.map(level => (
              <div key={level} className="rounded-xl border border-[#e7e1d6] bg-[#fcfbf8] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-[#102018]">
                    {formatLevel(level)}
                  </div>
                  <button
                    type="button"
                    onClick={() => saveLevel(level)}
                    className="rounded-lg border border-[#ded7ca] px-3 py-2 text-sm font-semibold text-[#102018] transition hover:bg-white"
                  >
                    Save
                  </button>
                </div>

                <label className="mt-3 grid gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#637268]">
                    Today
                  </span>
                  <input
                    value={todayRows[level]}
                    onChange={e =>
                      setTodayRows(prev => ({
                        ...prev,
                        [level]: e.target.value.toUpperCase(),
                      }))
                    }
                    placeholder="Today's subtitle"
                    className="w-full rounded-xl border border-[#ded7ca] bg-white px-3 py-2.5 text-sm text-[#102018] outline-none transition focus:border-[#1f6448] focus:ring-2 focus:ring-[#1f6448]/15"
                  />
                </label>

                <label className="mt-3 grid gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#637268]">
                    Upcoming list
                  </span>
                  <textarea
                    value={futureRows[level]}
                    onChange={e =>
                      setFutureRows(prev => ({
                        ...prev,
                        [level]: e.target.value.toUpperCase(),
                      }))
                    }
                    rows={5}
                    placeholder="One subtitle per line for tomorrow and after"
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
