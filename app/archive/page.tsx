'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Header } from '@/components/Header'
import { supabase } from '@/lib/supabase'

type Level = 'med_student' | 'resident' | 'attending'

type ArchiveCase = {
  id: string
  case_date: string
  level: Level
  category: string | null
}

const levelOrder: Level[] = ['med_student', 'resident', 'attending']

export default function ArchivePage() {
  const [cases, setCases] = useState<ArchiveCase[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadArchive() {
      const { data } = await supabase
        .from('cases')
        .select('id, case_date, level, category')
        .order('case_date', { ascending: false })
        .limit(120)

      setCases((data || []) as ArchiveCase[])
      setLoading(false)
    }

    void loadArchive()
  }, [])

  const groupedDates = useMemo(() => {
    const grouped = new Map<string, ArchiveCase[]>()

    for (const item of cases) {
      const existing = grouped.get(item.case_date)
      if (existing) {
        existing.push(item)
      } else {
        grouped.set(item.case_date, [item])
      }
    }

    return Array.from(grouped.entries()).map(([date, items]) => ({
      date,
      items: [...items].sort(
        (a, b) => levelOrder.indexOf(a.level) - levelOrder.indexOf(b.level)
      ),
    }))
  }, [cases])

  function formatDate(dateText: string) {
    return new Date(`${dateText}T12:00:00`).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  function formatLevel(level: Level) {
    if (level === 'med_student') return 'Med Student'
    if (level === 'resident') return 'Resident'
    return 'Attending'
  }

  return (
    <main className="min-h-screen bg-[#fbfaf7]">
      <Header />

      <section className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <div className="rounded-[28px] border border-[#e7e1d6] bg-white p-4 shadow-[0_10px_24px_rgba(16,32,24,0.04)] sm:p-5">
          <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#637268]">
            Archive
          </div>
          <h1 className="mt-2 font-serif text-[30px] font-bold leading-tight tracking-[-0.03em] text-[#102018]">
            Browse older cases
          </h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-5.5 text-[#637268]">
            Jump straight into earlier Orthodle cases by date and difficulty.
          </p>

          {loading ? (
            <p className="mt-5 text-sm text-[#637268]">Loading archive...</p>
          ) : groupedDates.length === 0 ? (
            <p className="mt-5 text-sm text-[#637268]">No archive cases are available yet.</p>
          ) : (
            <div className="mt-5 space-y-3">
              {groupedDates.map(group => (
                <div
                  key={group.date}
                  className="rounded-2xl border border-[#e7e1d6] bg-[#fcfbf8] p-3.5"
                >
                  <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#637268]">
                    {formatDate(group.date)}
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    {levelOrder.map(level => {
                      const item = group.items.find(entry => entry.level === level)

                      return item ? (
                        <Link
                          key={`${group.date}-${level}`}
                          href={`/?date=${group.date}&level=${level}`}
                          className="rounded-xl border border-[#ded7ca] bg-white px-3 py-3 transition hover:bg-[#f8fbf9]"
                        >
                          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#637268]">
                            {formatLevel(level)}
                          </div>
                          <div className="mt-1.5 font-serif text-[16px] font-bold text-[#102018]">
                            {item.category || 'Case'}
                          </div>
                          <div className="mt-2 text-[12px] text-[#1f6448]">
                            Open case
                          </div>
                        </Link>
                      ) : (
                        <div
                          key={`${group.date}-${level}`}
                          className="rounded-xl border border-dashed border-[#ded7ca] bg-white px-3 py-3 text-[#9aa39c]"
                        >
                          <div className="text-[11px] font-bold uppercase tracking-[0.18em]">
                            {formatLevel(level)}
                          </div>
                          <div className="mt-1.5 text-[13px]">No case saved</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
