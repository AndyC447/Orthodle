'use client'

import { useEffect, useState } from 'react'
import { Header } from '@/components/Header'
import {
  clearStatsSummary,
  getStatsLevelLabel,
  getStatsSummary,
  type StatsSummary,
} from '@/lib/utils'

export default function StatsPage() {
  const [statsSnapshot, setStatsSnapshot] = useState<StatsSummary | null>(null)

  useEffect(() => {
    const refreshStats = () => setStatsSnapshot(getStatsSummary())

    refreshStats()
    window.addEventListener('focus', refreshStats)

    return () => {
      window.removeEventListener('focus', refreshStats)
    }
  }, [])

  const maxDistribution = Math.max(
    1,
    ...Object.values(statsSnapshot?.guessDistribution || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 })
  )

  function formatAverage(value: number | null) {
    if (value === null) return '—'
    return value.toFixed(1)
  }

  function resetStats() {
    const confirmed = window.confirm(
      'Clear your saved Orthodle stats on this browser? This will remove your local performance history.'
    )

    if (!confirmed) return

    clearStatsSummary()
    setStatsSnapshot(getStatsSummary())
  }

  return (
    <main className="min-h-screen bg-[#fbfaf7]">
      <Header />

      <section className="mx-auto max-w-5xl px-6 pt-6 pb-1">
        <div className="overflow-hidden rounded-[28px] border border-[#ded7ca] bg-white shadow-sm">
          <div className="h-1.5 bg-gradient-to-r from-[#1f6448] via-[#c76b3a] to-[#ead9b7]" />

          <div className="p-4 md:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#637268]">
                  Stats
                </div>
                <h1 className="mt-2.5 font-serif text-[28px] font-bold leading-tight tracking-[-0.03em] text-[#102018]">
                  Your daily performance
                </h1>
                <p className="mt-2.5 max-w-2xl text-[13px] leading-5.5 text-[#637268]">
                  Results are saved on this browser after each completed case, so you can keep
                  track of your streaks, daily card, and solve distribution over time.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="rounded-full border border-[#cfded4] bg-[#f7fbf8] px-3.5 py-1.5 text-[11px] font-semibold text-[#1f6448]">
                  Today: {statsSnapshot?.today.wins || 0}/3 solved
                </div>

                <button
                  onClick={resetStats}
                  className="rounded-full border border-[#ead9b7] bg-[#fffaf1] px-3.5 py-1.5 text-[11px] font-semibold text-[#a35d32] transition hover:bg-[#fff4df]"
                >
                  Reset stats
                </button>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2.5 xl:grid-cols-4">
              <div className="rounded-2xl border border-[#ded7ca] bg-[#fbfaf7] p-3.5">
                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#637268]">
                  Games played
                </div>
                <div className="mt-2.5 font-serif text-[25px] font-bold text-[#102018]">
                  {statsSnapshot?.gamesPlayed || 0}
                </div>
              </div>

              <div className="rounded-2xl border border-[#ead9b7] bg-[#fffaf1] p-3.5">
                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#637268]">
                  Win rate
                </div>
                <div className="mt-2.5 font-serif text-[25px] font-bold text-[#a35d32]">
                  {statsSnapshot && statsSnapshot.gamesPlayed > 0
                    ? `${Math.round(statsSnapshot.winRate)}%`
                    : '—'}
                </div>
              </div>

              <div className="rounded-2xl border border-[#cfded4] bg-[#f7fbf8] p-3.5">
                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#637268]">
                  Current streak
                </div>
                <div className="mt-2.5 font-serif text-[25px] font-bold text-[#1f6448]">
                  {statsSnapshot?.currentStreak || 0}
                </div>
              </div>

              <div className="rounded-2xl border border-[#ded7ca] bg-white p-3.5">
                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#637268]">
                  Longest streak
                </div>
                <div className="mt-2.5 font-serif text-[25px] font-bold text-[#102018]">
                  {statsSnapshot?.longestStreak || 0}
                </div>
              </div>

              <div className="rounded-2xl border border-[#ded7ca] bg-[#fbfaf7] p-3.5 col-span-2 xl:col-span-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#637268]">
                  Archive plays
                </div>
                <div className="mt-2.5 font-serif text-[25px] font-bold text-[#102018]">
                  {statsSnapshot?.archiveGamesPlayed || 0}
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_250px]">
              <div className="rounded-2xl border border-[#ded7ca] bg-[#fbfaf7] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#315f4d]">
                    Guess distribution
                  </div>
                  <div className="text-[11px] text-[#637268]">
                    Avg win: {formatAverage(statsSnapshot?.averageGuessesInWins ?? null)}
                  </div>
                </div>

                <div className="mt-3.5 space-y-2.5">
                  {[1, 2, 3, 4, 5, 6].map(guessNumber => {
                    const count = statsSnapshot?.guessDistribution[guessNumber] || 0
                    const width = `${Math.max(count > 0 ? 14 : 0, (count / maxDistribution) * 100)}%`

                    return (
                      <div
                        key={guessNumber}
                        className="grid grid-cols-[22px_minmax(0,1fr)_30px] items-center gap-2.5"
                      >
                        <div className="text-center font-serif text-[16px] font-bold text-[#102018]">
                          {guessNumber}
                        </div>
                        <div className="h-6 overflow-hidden rounded-full bg-[#ece8df]">
                          <div
                            className="flex h-full items-center justify-end rounded-full bg-gradient-to-r from-[#8a5a3a] to-[#5f3e2a] px-2.5 text-[11px] font-bold text-white transition-[width] duration-500"
                            style={{ width }}
                          >
                            {count > 0 ? count : ''}
                          </div>
                        </div>
                        <div className="text-right text-[11px] font-semibold text-[#637268]">
                          {count}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="rounded-2xl border border-[#ded7ca] bg-white p-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#315f4d]">
                  Today&apos;s card
                </div>

                <div className="mt-3 space-y-2.5">
                  {(['med_student', 'resident', 'attending'] as const).map(level => {
                    const entry = statsSnapshot?.today.levels.find(item => item.level === level)

                    return (
                      <div
                        key={level}
                        className={
                          entry
                            ? entry.won
                              ? 'rounded-xl border border-[#cfded4] bg-[#f7fbf8] p-3.5'
                              : 'rounded-xl border border-[#ead9b7] bg-[#fffaf1] p-3.5'
                            : 'rounded-xl border border-dashed border-[#ded7ca] bg-[#fbfaf7] p-3.5'
                        }
                      >
                        <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#637268]">
                          {getStatsLevelLabel(level)}
                        </div>
                        <div className="mt-1.5 font-serif text-[18px] font-bold text-[#102018]">
                          {entry ? (entry.won ? `${entry.guessesUsed}/6` : 'Missed') : 'Not played'}
                        </div>
                        <p className="mt-1.5 text-[11px] leading-4.5 text-[#637268]">
                          {entry ? `${entry.category} · ${entry.answer}` : 'Still open today.'}
                        </p>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-[#ded7ca] bg-white p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#315f4d]">
                  By difficulty
                </div>
                <div className="text-[11px] text-[#637268]">
                  Faster mobile snapshot
                </div>
              </div>

              <div className="grid gap-2.5 sm:grid-cols-3">
                {(statsSnapshot?.byLevel || []).map(level => (
                  <div
                    key={level.level}
                    className="rounded-xl border border-[#ded7ca] bg-[#fbfaf7] p-3"
                  >
                    <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#637268]">
                      {getStatsLevelLabel(level.level)}
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.14em] text-[#8a948d]">
                          Win
                        </div>
                        <div className="mt-1 font-serif text-[15px] font-bold text-[#102018]">
                          {level.played > 0 ? `${Math.round(level.winRate)}%` : '—'}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.14em] text-[#8a948d]">
                          Avg
                        </div>
                        <div className="mt-1 font-serif text-[15px] font-bold text-[#102018]">
                          {formatAverage(level.averageGuesses)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.14em] text-[#8a948d]">
                          Solved
                        </div>
                        <div className="mt-1 font-serif text-[15px] font-bold text-[#102018]">
                          {level.wins}/{level.played}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
