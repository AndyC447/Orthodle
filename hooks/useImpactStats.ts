'use client'

import { useEffect, useState } from 'react'
import { impactRefreshWindow, impactRefreshWindowEnd } from '@/lib/impact-refresh'

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

let latestSnapshot: ImpactStats | null = null
let latestWindow = -Infinity
const pending = new Map<number, Promise<ImpactStats>>()

async function fetchImpactSnapshot(windowId: number) {
  if (latestSnapshot && latestWindow === windowId) return latestSnapshot
  const existing = pending.get(windowId)
  if (existing) return existing
  const request = (async () => {
    const response = await fetch('/api/impact-stats')
    if (!response.ok) throw new Error('Could not load impact stats')
    const next = await response.json() as ImpactStats
    if (!Number.isFinite(next.combinedDailyUsers) || !Number.isFinite(next.uniqueUsers)) throw new Error('Invalid audience stats')
    if (windowId >= latestWindow) {
      latestSnapshot = next
      latestWindow = windowId
    }
    return next
  })().finally(() => { pending.delete(windowId) })
  pending.set(windowId, request)
  return request
}

export function useImpactStats(enabled = true) {
  const [metrics, setMetrics] = useState<ImpactStats | null>(() => latestSnapshot)
  const [loading, setLoading] = useState(!latestSnapshot)
  const [error, setError] = useState(false)
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let inFlight = false
    let timer: number
    async function refresh() {
      if (cancelled || inFlight || document.visibilityState === 'hidden') return
      inFlight = true
      const windowId = impactRefreshWindow()
      try {
        const next = await fetchImpactSnapshot(windowId)
        if (cancelled || impactRefreshWindow() !== windowId) return
        setMetrics(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next)
        setError(Boolean(next.stale))
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
        inFlight = false
        if (impactRefreshWindow() !== windowId) void refresh()
      }
    }
    function scheduleRefresh() {
      const now = Date.now()
      timer = window.setTimeout(() => {
        void refresh()
        scheduleRefresh()
      }, impactRefreshWindowEnd(impactRefreshWindow(now)) - now)
    }
    void refresh()
    scheduleRefresh()
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [enabled])
  return { metrics, loading, error }
}
