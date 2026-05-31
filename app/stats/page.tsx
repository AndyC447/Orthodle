'use client'

import { useEffect, useState } from 'react'
import { Header } from '@/components/Header'
import { PublicFooter } from '@/components/PublicFooter'
import {
  clearStatsSummary,
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
  const streakLine =
    !statsSnapshot || statsSnapshot.currentStreak <= 0
      ? 'No active streak yet'
      : statsSnapshot.currentStreak === 1
        ? '🔥 1-day streak started'
        : `🔥 ${statsSnapshot.currentStreak}-day streak alive`

  const maxDistribution = Math.max(
    1,
    ...Object.values(statsSnapshot?.guessDistribution || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 })
  )
  const distributionColors = {
    1: 'from-[#1f6448] to-[#2d8b61]',
    2: 'from-[#3e7f51] to-[#5f9a67]',
    3: 'from-[#6a8750] to-[#8da260]',
    4: 'from-[#948553] to-[#b29863]',
    5: 'from-[#b17948] to-[#c98a55]',
    6: 'from-[#c76b3a] to-[#d88b57]',
  } as const

  function resetStats() {
    const confirmed = window.confirm(
      'Clear your saved Orthodle stats on this browser? This will remove your local performance history.'
    )

    if (!confirmed) return

    clearStatsSummary()
    setStatsSnapshot(getStatsSummary())
  }

  return (
    <main className="app-surface min-h-screen">
      <Header />

      <section className="mx-auto max-w-5xl px-3 pb-1 pt-3 sm:px-6 sm:pt-6">
        <div className="night-surface overflow-hidden rounded-[24px] border border-[#ebe5db] bg-white shadow-[0_10px_24px_rgba(16,32,24,0.04)] sm:rounded-[28px]">
          <div className="p-2.5 sm:p-4 md:p-5">
            <div>
              <div className="px-10 text-center sm:px-16">
                <h1 className="font-serif text-[22px] font-bold leading-tight tracking-[-0.03em] text-[#102018] sm:text-[28px]">
                  Your daily performance
                </h1>
                <div className="mt-2">
                  <span className="orthodle-stats-streak-ember orthodle-streak-chip inline-flex items-center justify-center border border-[#e7d7b6] bg-[#fff8eb] px-3 py-1 text-[12px] font-semibold text-[#102018] shadow-[0_8px_20px_rgba(137,103,44,0.08)] sm:text-[13px]">
                    {streakLine}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-3 space-y-3 sm:mt-5 sm:space-y-4">
              <div className="orthodle-stats-shell rounded-[18px] bg-white p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] sm:rounded-[24px] sm:p-4">
                <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#315f4d] sm:text-[10px] sm:tracking-[0.24em]">
                  Daily Case Solve Distribution
                </div>

                <div className="mt-3 space-y-2.5 sm:space-y-3">
                  {[1, 2, 3, 4, 5, 6].map(guessNumber => {
                    const count = statsSnapshot?.guessDistribution[guessNumber] || 0
                    const width = count > 0 ? `${Math.max(8, (count / maxDistribution) * 100)}%` : '0%'

                    return (
                      <div
                        key={guessNumber}
                        className="grid grid-cols-[18px_minmax(0,1fr)_28px] items-center gap-2.5 sm:grid-cols-[22px_minmax(0,1fr)_34px]"
                      >
                        <div className="text-center font-serif text-[16px] font-bold tracking-[-0.03em] text-[#102018]">
                          {guessNumber}
                        </div>
                        <div className="h-5 overflow-hidden rounded-full bg-[#ece8df] sm:h-6">
                          <div
                            className={`flex h-full items-center justify-end rounded-full bg-gradient-to-r px-2 text-[10px] font-bold text-white transition-[width] duration-500 sm:px-2.5 sm:text-[11px] ${distributionColors[guessNumber as keyof typeof distributionColors]}`}
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

              <div className="orthodle-stats-shell rounded-[18px] bg-white p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] sm:rounded-[24px] sm:p-4">
                <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#315f4d] sm:text-[10px] sm:tracking-[0.24em]">
                  Anatomy Quiz
                </div>

                <div className="mt-2.5 divide-y divide-[#efe7da] rounded-[16px] border border-[#efe7da] bg-[#fffdf9]">
                  <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#637268]">
                      Accuracy
                    </div>
                    <div className="font-serif text-[18px] font-bold leading-none tracking-[-0.04em] text-[#102018]">
                      {statsSnapshot && statsSnapshot.anatomy.played > 0
                        ? `${Math.round(statsSnapshot.anatomy.winRate)}%`
                        : '—'}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#637268]">
                      Completed
                    </div>
                    <div className="font-serif text-[18px] font-bold leading-none tracking-[-0.04em] text-[#102018]">
                      {statsSnapshot?.anatomy.played || 0}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#637268]">
                      Misses
                    </div>
                    <div className="font-serif text-[18px] font-bold leading-none tracking-[-0.04em] text-[#102018]">
                      {statsSnapshot?.anatomy.losses || 0}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
                <div className="orthodle-stat-tile rounded-[16px] bg-[#faf8f2] p-3 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] sm:rounded-[20px] sm:p-4">
                  <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#6d786f]">
                    Games played
                  </div>
                  <div className="mt-2 font-serif text-[22px] font-bold leading-none tracking-[-0.04em] text-[#102018] sm:mt-3 sm:text-[30px]">
                    {statsSnapshot?.gamesPlayed || 0}
                  </div>
                </div>

                <div className="orthodle-stat-tile rounded-[16px] bg-[#faf8f2] p-3 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] sm:rounded-[20px] sm:p-4">
                  <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#6d786f]">
                    Win rate
                  </div>
                  <div className="mt-2 font-serif text-[22px] font-bold leading-none tracking-[-0.04em] text-[#102018] sm:mt-3 sm:text-[30px]">
                    {statsSnapshot && statsSnapshot.gamesPlayed > 0
                      ? `${Math.round(statsSnapshot.winRate)}%`
                      : '—'}
                  </div>
                </div>

                <div className="orthodle-stat-tile rounded-[16px] bg-[#faf8f2] p-3 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] sm:rounded-[20px] sm:p-4">
                  <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#6d786f]">
                    Current streak
                  </div>
                  <div className="mt-2 font-serif text-[22px] font-bold leading-none tracking-[-0.04em] text-[#102018] sm:mt-3 sm:text-[30px]">
                    {statsSnapshot?.currentStreak || 0}
                  </div>
                </div>

                <div className="orthodle-stat-tile rounded-[16px] bg-[#faf8f2] p-3 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] sm:rounded-[20px] sm:p-4">
                  <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#6d786f]">
                    Longest streak
                  </div>
                  <div className="mt-2 font-serif text-[22px] font-bold leading-none tracking-[-0.04em] text-[#102018] sm:mt-3 sm:text-[30px]">
                    {statsSnapshot?.longestStreak || 0}
                  </div>
                </div>
              </div>

              <div className="flex justify-center pt-1 sm:pt-2">
                <button
                  onClick={resetStats}
                  className="rounded-[10px] bg-[#fbf5ea] px-3 py-1.5 text-[10px] font-semibold text-[#a35d32] transition hover:bg-[#fff4df] sm:rounded-full sm:px-4 sm:py-2 sm:text-[11px]"
                >
                  Reset stats
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
      <style jsx global>{`
        @keyframes orthodle-stats-ember-shimmer {
          0% {
            background-position: 180% 0;
          }
          100% {
            background-position: -120% 0;
          }
        }

        .orthodle-stats-streak-ember {
          position: relative;
          overflow: hidden;
        }

        .orthodle-stats-streak-ember::after {
          content: '';
          position: absolute;
          inset: 0;
          pointer-events: none;
          background-image: linear-gradient(
            110deg,
            rgba(255, 255, 255, 0) 0%,
            rgba(255, 255, 255, 0) 34%,
            rgba(240, 194, 71, 0.22) 50%,
            rgba(255, 255, 255, 0) 66%,
            rgba(255, 255, 255, 0) 100%
          );
          background-repeat: no-repeat;
          background-size: 220% 100%;
          animation: orthodle-stats-ember-shimmer 3s linear infinite;
        }
      `}</style>
      <PublicFooter />
    </main>
  )
}
