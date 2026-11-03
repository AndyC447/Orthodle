'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { earnedStreakMilestones, streakMilestone, type PlayerStreakRewards } from '@/lib/streak-rewards'
import { getSessionId, isTrackingDisabledForThisBrowser } from '@/lib/utils'
import { PrivateStreakThankYou } from '@/components/PrivateStreakThankYou'

function MilestoneBadge({ days }: { days: number }) {
  const hue = Math.round((145 + (days / 5 - 1) * 137.5) % 360)
  return (
    <span className="streak-milestone" style={{ '--badge-hue': hue } as CSSProperties} title={`${days}-day streak badge earned`}>
      <svg viewBox="0 0 64 68" aria-hidden="true" className="streak-milestone-shield">
        <path className="streak-milestone-fill" d="M7 5h50v39L32 63 7 44Z" />
        <path d="M12 10h40v31L32 56 12 41Z" fill="none" stroke="currentColor" strokeWidth="1" opacity=".4" />
        <path d="m28 17 4-6 4 6-4 3Z" fill="currentColor" />
      </svg>
      <span className="streak-milestone-number">{days}</span>
      <span className="streak-milestone-unit">days</span>
    </span>
  )
}

export function StreakRewards({ summary, revision = '', collection = false, disabled = false, deferThankYou = false }: {
  summary: { currentStreak: number; longestStreak: number } | null
  revision?: string | number
  collection?: boolean
  disabled?: boolean
  deferThankYou?: boolean
}) {
  const [snapshot, setSnapshot] = useState<{ sessionId: string; rewards: PlayerStreakRewards } | null>(null)

  useEffect(() => {
    if (disabled || isTrackingDisabledForThisBrowser()) return
    let controller: AbortController | null = null
    async function refresh() {
      controller?.abort()
      const request = new AbortController()
      controller = request
      const sessionId = getSessionId()
      setSnapshot(previous => previous?.sessionId === sessionId ? previous : null)
      try {
        const response = await fetch('/api/streaks', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }), cache: 'no-store', signal: request.signal,
        })
        if (!response.ok) return
        const rewards = await response.json() as Partial<PlayerStreakRewards>
        if (!request.signal.aborted && getSessionId() === sessionId) {
          setSnapshot(previous => {
            const saved = previous?.sessionId === sessionId ? previous.rewards : undefined
            return { sessionId, rewards: {
              current: rewards.current ?? saved?.current ?? 0,
              longest: rewards.longest ?? saved?.longest ?? 0,
              topRank: rewards.topRank === undefined ? saved?.topRank ?? null : rewards.topRank,
              thankYou: rewards.thankYou,
            } }
          })
        }
      } catch { /* Earned local badges remain visible when ranking is unavailable. */ }
    }
    void refresh()
    const visible = () => { if (document.visibilityState === 'visible') void refresh() }
    const changed = (event: StorageEvent) => {
      if (event.key === 'orthodle_account_session_v1' || event.key === null) void refresh()
    }
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh() }, 60_000)
    window.addEventListener('focus', refresh)
    window.addEventListener('storage', changed)
    document.addEventListener('visibilitychange', visible)
    return () => {
      controller?.abort()
      window.clearInterval(interval)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('storage', changed)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [disabled, revision])

  if (disabled) return null
  const longest = Math.max(summary?.longestStreak || 0, snapshot?.rewards.longest || 0)
  const milestone = streakMilestone(longest)
  const rank = snapshot?.rewards.topRank
  const thankYou = snapshot?.rewards.thankYou
  if (!milestone && !rank && !thankYou) return null
  const milestones = collection ? earnedStreakMilestones(longest) : milestone ? [milestone] : []

  return (
    <div className={`streak-rewards ${collection ? 'streak-rewards-collection' : ''}`}>
      {collection && milestone > 0 && <h2 className="streak-rewards-heading">Earned streak badges</h2>}
      {(milestone > 0 || rank) && <div className="streak-rewards-row">
        {milestones.length > 0 && (
          <div className="streak-rewards-badges" role="list" aria-label="Earned streak badges">
            {milestones.map(days => <span role="listitem" key={days} aria-label={`${days}-day streak badge earned`}><MilestoneBadge days={days} /></span>)}
          </div>
        )}
        {!collection && milestone > 0 && <span className="streak-rewards-caption">{milestone}-day badge earned</span>}
        {rank && (
          <span className="streak-rewards-rank" role="status">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
              <path d="M7 3h10v6a5 5 0 0 1-10 0V3ZM7 5H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4M12 14v6m-4 1h8" />
            </svg>
            <span>You&apos;re #{rank} in all-time streaks</span>
          </span>
        )}
      </div>}
      {collection && milestone > 0 && <p className="streak-rewards-note">A new badge every 5 days. Your earned badges stay yours.</p>}
      {thankYou && snapshot && <PrivateStreakThankYou key={`${snapshot.sessionId}:${thankYou.id}`} note={thankYou} sessionId={snapshot.sessionId} paused={deferThankYou} />}
    </div>
  )
}
