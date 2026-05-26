'use client'

import { useEffect, useState } from 'react'
import { Header } from '@/components/Header'
import { PublicFooter } from '@/components/PublicFooter'
import {
  getLevelTitle,
  normalizeLevelTitles,
  readCachedLevelTitles,
  writeCachedLevelTitles,
} from '@/lib/level-display'
import { supabase } from '@/lib/supabase'
import {
  clearStatsSummary,
  getStatsSummary,
  todayISO,
  type StatsSummary,
} from '@/lib/utils'

type PlayModeSettingsRow = {
  no_resident_mode: boolean
  no_resident_mode_start_date: string | null
}

export default function StatsPage() {
  const [statsSnapshot, setStatsSnapshot] = useState<StatsSummary | null>(null)
  const [showDistribution, setShowDistribution] = useState(true)
  const [showDifficulty, setShowDifficulty] = useState(false)
  const [levelTitles, setLevelTitles] = useState(readCachedLevelTitles())
  const [noResidentMode, setNoResidentMode] = useState(false)
  const [noResidentModeStartDate, setNoResidentModeStartDate] = useState<string | null>(null)

  useEffect(() => {
    const refreshStats = () => setStatsSnapshot(getStatsSummary())

    refreshStats()
    window.addEventListener('focus', refreshStats)

    return () => {
      window.removeEventListener('focus', refreshStats)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadLevelTitles() {
      const { data } = await supabase
        .from('level_display_settings')
        .select('level, title')

      if (cancelled) return

      const nextTitles = normalizeLevelTitles(
        ((data || []) as Array<{ level: 'med_student' | 'resident' | 'attending'; title: string }>).reduce(
          (acc, item) => {
            acc[item.level] = item.title
            return acc
          },
          {} as Partial<Record<'med_student' | 'resident' | 'attending', string>>
        )
      )

      setLevelTitles(nextTitles)
      writeCachedLevelTitles(nextTitles)
    }

    async function loadPlayModeSettings() {
      const { data } = await supabase
        .from('play_mode_settings')
        .select('no_resident_mode, no_resident_mode_start_date')
        .eq('id', 'default')
        .maybeSingle()

      if (cancelled) return
      const row = (data as PlayModeSettingsRow | null) || null
      setNoResidentMode(Boolean(row?.no_resident_mode))
      setNoResidentModeStartDate(row?.no_resident_mode_start_date || null)
    }

    void loadLevelTitles()
    void loadPlayModeSettings()

    return () => {
      cancelled = true
    }
  }, [])

  const noResidentModeActiveToday =
    noResidentMode && (!noResidentModeStartDate || noResidentModeStartDate <= todayISO())
  const requiredDailyLevels = noResidentModeActiveToday ? 2 : 3
  const visibleTodayLevels: Array<'med_student' | 'resident' | 'attending'> = noResidentModeActiveToday
    ? ['med_student', 'attending']
    : ['med_student', 'resident', 'attending']
  const todaySolvedCount =
    statsSnapshot?.today.levels.filter(item => visibleTodayLevels.includes(item.level) && item.won).length || 0

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

  function formatAverage(value: number | null) {
    if (value === null) return '—'
    return value.toFixed(1)
  }

  function getWinRateTheme(winRate: number | null) {
    if (winRate === null) {
      return {
        card: 'border-[#ead9b7] bg-[#fffaf1]',
        value: 'text-[#a35d32]',
      }
    }

    if (winRate > 90) {
      return {
        card: 'border-[#cfe0d5] bg-[#f3fbf6]',
        value: 'text-[#1f6448]',
      }
    }

    if (winRate >= 80) {
      return {
        card: 'border-[#d8e3cf] bg-[#f7fbf1]',
        value: 'text-[#4f7f52]',
      }
    }

    if (winRate >= 70) {
      return {
        card: 'border-[#e0dfc9] bg-[#fcfaef]',
        value: 'text-[#7a8453]',
      }
    }

    if (winRate >= 60) {
      return {
        card: 'border-[#ead9b7] bg-[#fffaf1]',
        value: 'text-[#a07a3f]',
      }
    }

    return {
      card: 'border-[#f0d7c8] bg-[#fff3eb]',
      value: 'text-[#c76b3a]',
    }
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
    <main className="app-surface min-h-screen">
      <Header />

      <section className="mx-auto max-w-5xl px-3 pb-1 pt-3 sm:px-6 sm:pt-6">
        <div className="night-surface overflow-hidden rounded-[24px] border border-[#ebe5db] bg-white shadow-[0_10px_24px_rgba(16,32,24,0.04)] sm:rounded-[28px]">
          <div className="p-2.5 sm:p-4 md:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="font-serif text-[22px] font-bold leading-tight tracking-[-0.03em] text-[#102018] sm:text-[28px]">
                  Your daily performance
                </h1>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <div className="rounded-[10px] bg-[#f3f7f5] px-2 py-1 text-[9px] font-semibold text-[#1f6448] sm:rounded-full sm:px-3.5 sm:py-1.5 sm:text-[11px]">
                  Today: {todaySolvedCount}/{requiredDailyLevels} solved
                </div>

                <button
                  onClick={resetStats}
                  className="rounded-[10px] bg-[#fbf5ea] px-2 py-1 text-[9px] font-semibold text-[#a35d32] transition hover:bg-[#fff4df] sm:rounded-full sm:px-3.5 sm:py-1.5 sm:text-[11px]"
                >
                  Reset stats
                </button>
              </div>
            </div>

            <div className="mt-2.5 grid grid-cols-2 gap-1.5 sm:mt-5 sm:grid-cols-2 sm:gap-3 xl:grid-cols-4">
              <div className="orthodle-stat-tile rounded-[16px] bg-[#faf8f2] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] sm:rounded-[24px] sm:p-4">
                <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#6d786f]">
                  Games played
                </div>
                <div className="mt-1.5 font-serif text-[22px] font-bold leading-none tracking-[-0.04em] text-[#102018] sm:mt-3 sm:text-[30px]">
                  {statsSnapshot?.gamesPlayed || 0}
                </div>
              </div>

              <div className={`orthodle-stat-tile rounded-[16px] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] sm:rounded-[24px] sm:p-4 ${getWinRateTheme(
                statsSnapshot && statsSnapshot.gamesPlayed > 0 ? statsSnapshot.winRate : null
              ).card}`}>
                <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#6d786f]">
                  Win rate
                </div>
                <div className={`mt-1.5 font-serif text-[22px] font-bold leading-none tracking-[-0.04em] sm:mt-3 sm:text-[30px] ${getWinRateTheme(
                  statsSnapshot && statsSnapshot.gamesPlayed > 0 ? statsSnapshot.winRate : null
                ).value}`}>
                  {statsSnapshot && statsSnapshot.gamesPlayed > 0
                    ? `${Math.round(statsSnapshot.winRate)}%`
                    : '—'}
                </div>
              </div>

              <div className="orthodle-stat-tile rounded-[16px] bg-[#f3f8f5] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] sm:rounded-[24px] sm:p-4">
                <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#6d786f]">
                  Current streak
                </div>
                <div className="mt-1.5 font-serif text-[22px] font-bold leading-none tracking-[-0.04em] text-[#1f6448] sm:mt-3 sm:text-[30px]">
                  {statsSnapshot?.currentStreak || 0}
                </div>
              </div>

              <div className="orthodle-stat-tile rounded-[16px] bg-[#f8f8f5] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] sm:rounded-[24px] sm:p-4">
                <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#6d786f]">
                  Longest streak
                </div>
                <div className="mt-1.5 font-serif text-[22px] font-bold leading-none tracking-[-0.04em] text-[#102018] sm:mt-3 sm:text-[30px]">
                  {statsSnapshot?.longestStreak || 0}
                </div>
              </div>

            </div>

            <div className="mt-3 grid gap-3 sm:mt-5 sm:gap-4 lg:grid-cols-[minmax(0,1.05fr)_250px]">
              <div className="orthodle-stats-shell flex h-full min-h-[280px] flex-col rounded-[18px] bg-[#fbfaf7] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] sm:min-h-[350px] sm:rounded-[24px] sm:p-4">
                <button
                  type="button"
                  onClick={() => setShowDistribution(prev => !prev)}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#315f4d] sm:text-[10px] sm:tracking-[0.24em]">
                    Case guess distribution
                  </div>
                  <div className="text-[9px] font-medium text-[#637268] sm:text-[11px]">
                    {showDistribution
                      ? 'Hide'
                      : `Avg win ${formatAverage(statsSnapshot?.averageGuessesInWins ?? null)}`}
                  </div>
                </button>

                {showDistribution && (
                <div className="mt-2.5 flex flex-1 flex-col justify-between gap-2 sm:mt-3.5 sm:gap-2.5">
                  {[1, 2, 3, 4, 5, 6].map(guessNumber => {
                    const count = statsSnapshot?.guessDistribution[guessNumber] || 0
                    const width = `${Math.max(count > 0 ? 14 : 0, (count / maxDistribution) * 100)}%`

                    return (
                      <div
                        key={guessNumber}
                        className="grid grid-cols-[18px_minmax(0,1fr)_24px] items-center gap-2 sm:grid-cols-[22px_minmax(0,1fr)_30px] sm:gap-2.5"
                      >
                        <div className="text-center font-serif text-[15px] font-bold tracking-[-0.03em] text-[#102018] sm:text-[17px]">
                          {guessNumber}
                        </div>
                        <div className="orthodle-stat-track h-5 overflow-hidden rounded-full bg-[#ece8df] sm:h-6">
                          <div
                            className={`flex h-full items-center justify-end rounded-full bg-gradient-to-r px-2 text-[10px] font-bold text-white transition-[width] duration-500 sm:px-2.5 sm:text-[11px] ${distributionColors[guessNumber as keyof typeof distributionColors]}`}
                            style={{ width }}
                          >
                            {count > 0 ? count : ''}
                          </div>
                        </div>
                        <div className="text-right text-[10px] font-semibold text-[#637268] sm:text-[11px]">
                          {count}
                        </div>
                      </div>
                    )
                  })}
                </div>
                )}
              </div>

              <div className="space-y-2.5 sm:space-y-4">
                <div className="orthodle-stats-shell rounded-[18px] bg-white p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] sm:rounded-[24px] sm:p-4">
                  <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#315f4d] sm:text-[10px] sm:tracking-[0.24em]">
                    Anatomy performance
                  </div>

                  <div className="mt-2.5 grid grid-cols-2 gap-2">
                    <div className="rounded-[14px] bg-[#f7fbf8] px-2 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] sm:rounded-2xl sm:px-3 sm:py-3">
                      <div className="text-[8px] font-bold uppercase tracking-[0.14em] text-[#637268] sm:text-[9px] sm:tracking-[0.18em]">
                        Accuracy
                      </div>
                      <div className="mt-1 font-serif text-[18px] font-bold leading-none tracking-[-0.03em] text-[#1f6448] sm:mt-1.5 sm:text-[22px]">
                        {statsSnapshot && statsSnapshot.anatomy.played > 0
                          ? `${Math.round(statsSnapshot.anatomy.winRate)}%`
                          : '—'}
                      </div>
                    </div>
                    <div className="rounded-[14px] bg-[#fffdf8] px-2 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] sm:rounded-2xl sm:px-3 sm:py-3">
                      <div className="text-[8px] font-bold uppercase tracking-[0.14em] text-[#637268] sm:text-[9px] sm:tracking-[0.18em]">
                        Attempts
                      </div>
                      <div className="mt-1 font-serif text-[18px] font-bold leading-none tracking-[-0.03em] text-[#102018] sm:mt-1.5 sm:text-[22px]">
                        {statsSnapshot?.anatomy.played || 0}
                      </div>
                    </div>
                    <div className="rounded-[14px] bg-[#f7fbf8] px-2 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] sm:rounded-2xl sm:px-3 sm:py-3">
                      <div className="text-[8px] font-bold uppercase tracking-[0.14em] text-[#637268] sm:text-[9px] sm:tracking-[0.18em]">
                        Correct picks
                      </div>
                      <div className="mt-1 font-serif text-[18px] font-bold leading-none tracking-[-0.03em] text-[#1f6448] sm:mt-1.5 sm:text-[22px]">
                        {statsSnapshot?.anatomy.wins || 0}
                      </div>
                    </div>
                    <div className="rounded-[14px] bg-[#fffaf1] px-2 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] sm:rounded-2xl sm:px-3 sm:py-3">
                      <div className="text-[8px] font-bold uppercase tracking-[0.14em] text-[#637268] sm:text-[9px] sm:tracking-[0.18em]">
                        Misses
                      </div>
                      <div className="mt-1 font-serif text-[18px] font-bold leading-none tracking-[-0.03em] text-[#a24d24] sm:mt-1.5 sm:text-[22px]">
                        {statsSnapshot?.anatomy.losses || 0}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="orthodle-stats-shell rounded-[18px] bg-white p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] sm:rounded-[24px] sm:p-4">
                  <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#315f4d] sm:text-[10px] sm:tracking-[0.24em]">
                    Today&apos;s card
                  </div>

                  <div className="mt-2.5 space-y-2">
                    {visibleTodayLevels.map(level => {
                      const entry = statsSnapshot?.today.levels.find(item => item.level === level)

                      return (
                        <div
                          key={level}
                          className={
                            entry
                              ? entry.won
                                ? 'rounded-[14px] bg-[#f7fbf8] p-2 sm:rounded-2xl sm:p-3.5'
                                : 'rounded-[14px] bg-[#fffaf1] p-2 sm:rounded-2xl sm:p-3.5'
                              : 'rounded-[14px] bg-[#fbfaf7] p-2 sm:rounded-2xl sm:p-3.5'
                          }
                        >
                          <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#637268] sm:text-[10px] sm:tracking-[0.22em]">
                            {getLevelTitle(level, levelTitles)}
                          </div>
                          <div className="mt-1 font-serif text-[17px] font-bold leading-none tracking-[-0.03em] text-[#102018] sm:mt-2 sm:text-[22px]">
                            {entry ? (entry.won ? `${entry.guessesUsed}/6` : 'Missed') : 'Not played'}
                          </div>
                          <p className="mt-1 text-[10px] leading-4 text-[#637268] sm:mt-1.5 sm:text-[11px] sm:leading-4.5">
                            {entry ? `${entry.category} · ${entry.answer}` : 'Still open today.'}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="orthodle-stats-shell mt-3 rounded-[18px] bg-white p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] sm:mt-5 sm:rounded-[24px] sm:p-4">
              <button
                type="button"
                onClick={() => setShowDifficulty(prev => !prev)}
                className="mb-3 flex w-full items-center justify-between gap-3 text-left"
              >
                <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#315f4d] sm:text-[11px] sm:tracking-[0.24em]">
                  By difficulty
                </div>
                <div className="text-[9px] text-[#637268] sm:text-[11px]">
                  {showDifficulty ? 'Hide' : 'Show'}
                </div>
              </button>

              {showDifficulty && (
              <div className="grid gap-2 sm:grid-cols-3 sm:gap-2.5">
                {(statsSnapshot?.byLevel || []).map(level => (
                  <div
                    key={level.level}
                    className="orthodle-stat-tile rounded-[14px] bg-[#fbfaf7] p-2 sm:rounded-xl sm:p-3"
                  >
                    <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#637268] sm:text-[11px] sm:tracking-[0.18em]">
                      {getLevelTitle(level.level, levelTitles)}
                    </div>
                    <div className="mt-1.5 grid grid-cols-3 gap-1 text-center sm:mt-2 sm:gap-2">
                      <div>
                        <div className="text-[9px] uppercase tracking-[0.12em] text-[#8a948d] sm:text-[10px] sm:tracking-[0.14em]">
                          Win
                        </div>
                        <div className="mt-0.5 font-serif text-[13px] font-bold text-[#102018] sm:mt-1 sm:text-[15px]">
                          {level.played > 0 ? `${Math.round(level.winRate)}%` : '—'}
                        </div>
                      </div>
                      <div>
                        <div className="text-[9px] uppercase tracking-[0.12em] text-[#8a948d] sm:text-[10px] sm:tracking-[0.14em]">
                          Avg
                        </div>
                        <div className="mt-0.5 font-serif text-[13px] font-bold text-[#102018] sm:mt-1 sm:text-[15px]">
                          {formatAverage(level.averageGuesses)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[9px] uppercase tracking-[0.12em] text-[#8a948d] sm:text-[10px] sm:tracking-[0.14em]">
                          Solved
                        </div>
                        <div className="mt-0.5 font-serif text-[13px] font-bold text-[#102018] sm:mt-1 sm:text-[15px]">
                          {level.wins}/{level.played}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              )}
            </div>
          </div>
        </div>
      </section>
      <PublicFooter />
    </main>
  )
}
