'use client'

import { useEffect, useRef, useState } from 'react'

function formatCount(value: number | null) {
  return value === null ? '—' : Math.max(0, Math.round(value)).toLocaleString('en-US')
}

function readCachedValue(cacheKey: string | undefined): number | null {
  if (!cacheKey || typeof window === 'undefined') return null
  try {
    const cached = window.localStorage.getItem(cacheKey)
    if (cached === null || !cached.trim()) return null
    const parsed = Number(cached)
    return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null
  } catch {
    return null
  }
}

export function LiveStatNumber({ value, loading, placeholder, cacheKey }: {
  value: number
  loading: boolean
  placeholder: number | null
  cacheKey?: string
}) {
  const [displayValue, setDisplayValue] = useState<number | null>(placeholder)
  const [isTicking, setIsTicking] = useState(false)
  const latestValueRef = useRef<number | null>(placeholder)
  const lastTargetRef = useRef<number | null>(null)

  useEffect(() => {
    const cached = readCachedValue(cacheKey)
    latestValueRef.current = cached ?? placeholder
    lastTargetRef.current = cached
    setDisplayValue(cached ?? placeholder)
    setIsTicking(false)
  }, [cacheKey, placeholder])

  useEffect(() => {
    if (loading) {
      // Keep the last confirmed number visible, including if refresh interrupts a tick.
      if (lastTargetRef.current !== null) {
        latestValueRef.current = lastTargetRef.current
        setDisplayValue(lastTargetRef.current)
      }
      setIsTicking(false)
      return
    }
    if (!Number.isFinite(value)) return
    const targetValue = Math.max(0, Math.round(value))
    const previousTarget = lastTargetRef.current
    const startValue = latestValueRef.current ?? targetValue
    lastTargetRef.current = targetValue

    try {
      if (cacheKey) window.localStorage.setItem(cacheKey, String(targetValue))
    } catch {
      // Storage may be unavailable; the in-memory value still stays visible.
    }

    // First data is shown directly. Only a change from known data earns an animation.
    if (previousTarget === null || previousTarget === targetValue ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      latestValueRef.current = targetValue
      setDisplayValue(targetValue)
      setIsTicking(false)
      return
    }

    setIsTicking(true)
    const startAt = performance.now()
    const duration = 1100
    let frameId = 0
    let settleTimer: number | undefined
    function tick(now: number) {
      const progress = Math.min(1, (now - startAt) / duration)
      const eased = 1 - Math.pow(1 - progress, 3)
      const nextValue = Math.round(startValue + (targetValue - startValue) * eased)
      latestValueRef.current = nextValue
      setDisplayValue(nextValue)
      if (progress < 1) {
        frameId = requestAnimationFrame(tick)
      } else {
        settleTimer = window.setTimeout(() => setIsTicking(false), 180)
      }
    }
    frameId = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frameId)
      if (settleTimer !== undefined) window.clearTimeout(settleTimer)
    }
  }, [cacheKey, placeholder, loading, value])

  return (
    <span className={`orthodle-live-stat-number ${isTicking ? 'orthodle-live-stat-number-active' : ''}`}>
      {formatCount(displayValue)}
    </span>
  )
}
