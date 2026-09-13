'use client'

import { useEffect, useRef, useState } from 'react'

function formatCount(value: number) {
  return Math.max(0, Math.round(value)).toLocaleString('en-US')
}

function readCachedValue(cacheKey: string | undefined, fallback: number) {
  if (!cacheKey || typeof window === 'undefined') return fallback
  const cached = window.localStorage.getItem(cacheKey)
  const parsed = cached ? Number(cached) : NaN
  return Number.isFinite(parsed) ? parsed : fallback
}

export function LiveStatNumber({
  value,
  loading,
  placeholder,
  cacheKey,
}: {
  value: number
  loading: boolean
  placeholder: number
  cacheKey?: string
}) {
  const [displayValue, setDisplayValue] = useState(placeholder)
  const [isTicking, setIsTicking] = useState(false)
  const latestValueRef = useRef(placeholder)

  useEffect(() => {
    setDisplayValue(readCachedValue(cacheKey, placeholder))
  }, [cacheKey, placeholder])

  useEffect(() => {
    if (loading) return

    const startValue = latestValueRef.current
    const targetValue = Math.max(0, Math.round(value))

    if (typeof window !== 'undefined' && cacheKey) {
      window.localStorage.setItem(cacheKey, String(targetValue))
    }

    if (startValue === targetValue) {
      setDisplayValue(targetValue)
      return
    }

    if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      latestValueRef.current = targetValue
      setDisplayValue(targetValue)
      return
    }

    setIsTicking(true)
    const startAt = performance.now()
    const duration = 1100
    let frameId = 0

    function tick(now: number) {
      const progress = Math.min(1, (now - startAt) / duration)
      const eased = 1 - Math.pow(1 - progress, 3)
      const nextValue = Math.round(startValue + (targetValue - startValue) * eased)
      latestValueRef.current = nextValue
      setDisplayValue(nextValue)

      if (progress < 1) {
        frameId = requestAnimationFrame(tick)
      } else {
        latestValueRef.current = targetValue
        setDisplayValue(targetValue)
        window.setTimeout(() => setIsTicking(false), 180)
      }
    }

    frameId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameId)
  }, [cacheKey, loading, value])

  return (
    <span className={`orthodle-live-stat-number ${isTicking ? 'orthodle-live-stat-number-active' : ''}`}>
      {formatCount(displayValue)}
    </span>
  )
}
