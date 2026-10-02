'use client'

import { useEffect, useState } from 'react'

export type ImpactStats = {
  usersReached: number
  uniqueUsers: number
  combinedDailyUsers: number
  totalGuesses: number
  archiveGuesses: number
  countriesReached: number
  topCities: string[]
  caseCount: number
  stale?: boolean
}

/** ERAS and admin read the same snapshot and refresh when brought back into view. */
export function useImpactStats(enabled = true) {
  const [metrics, setMetrics] = useState<ImpactStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    let inFlight = false
    async function refresh() {
      if (inFlight || document.visibilityState === 'hidden') return
      inFlight = true
      try {
        const response = await fetch('/api/impact-stats', { cache: 'no-store', signal: controller.signal })
        if (!response.ok) throw new Error('Could not load impact stats')
        const next = await response.json() as ImpactStats
        if (!Number.isFinite(next.combinedDailyUsers) || !Number.isFinite(next.uniqueUsers)) throw new Error('Invalid audience stats')
        if (controller.signal.aborted) return
        setMetrics(next)
        setError(Boolean(next.stale))
      } catch {
        if (!controller.signal.aborted) setError(true)
      } finally {
        if (!controller.signal.aborted) setLoading(false)
        inFlight = false
      }
    }
    void refresh()
    const timer = window.setInterval(refresh, 60_000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      controller.abort()
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [enabled])
  return { metrics, loading, error }
}
