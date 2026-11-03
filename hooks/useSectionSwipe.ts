'use client'

import { useEffect, useLayoutEffect, useRef, useState, type TouchEvent, type TransitionEvent, type MouseEvent } from 'react'
import { useRouter } from 'next/navigation'

const pages = ['/', '/archive', '/impact']
const transitionKey = 'orthodle_swipe_nav_transition_v1'

export function useSectionSwipe(path: string, enabled = true) {
  const router = useRouter()
  const start = useRef<{ x: number; y: number } | null>(null)
  const busy = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const destination = useRef<string | null>(null)
  const suppressClickUntil = useRef(0)
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)

  useLayoutEffect(() => {
    if (!enabled) return
    busy.current = false
    start.current = null
    destination.current = null
    suppressClickUntil.current = 0
    setOffset(0)
    setDragging(false)
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    setReducedMotion(reduced)
    for (const page of pages) if (page !== path) router.prefetch(page)
    try {
      const raw = sessionStorage.getItem(transitionKey)
      const entry = raw ? JSON.parse(raw) : null
      if (entry?.target === path && Date.now() - entry.at < 3000) {
        sessionStorage.removeItem(transitionKey)
        // The outgoing page has already revealed this content during the swipe.
      }
    } catch { /* A stale transition must not block navigation. */ }
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [path, router, enabled])

  useEffect(() => {
    if (!enabled) return
    const target = offset === 0 ? null : pages[pages.indexOf(path) + (offset < 0 ? 1 : -1)] || null
    window.dispatchEvent(new CustomEvent('orthodle-section-swipe', {
      detail: { path, target, progress: Math.min(1, Math.abs(offset) / 160) },
    }))
  }, [enabled, offset, path])

  useEffect(() => {
    if (!enabled) return
    return () => {
      window.dispatchEvent(new CustomEvent('orthodle-section-swipe', { detail: { path, target: null, progress: 0 } }))
    }
  }, [enabled, path])

  function reset() {
    start.current = null
    setDragging(false)
    setOffset(0)
  }

  function finishNavigation() {
    const target = destination.current
    if (!target) return
    destination.current = null
    if (timer.current) clearTimeout(timer.current)
    router.push(target)
  }

  return {
    preview: offset === 0 ? null : pages[pages.indexOf(path) + (offset < 0 ? 1 : -1)] || null,
    offset,
    style: {
      backgroundColor: offset ? 'var(--bg)' : undefined,
      transform: offset ? `translate3d(${offset}px,0,0)` : undefined,
      transition: dragging || reducedMotion ? 'none' : 'transform 320ms cubic-bezier(0.22,1,0.36,1)',
      touchAction: 'pan-y pinch-zoom',
    },
    onTouchStart(event: TouchEvent<HTMLElement>) {
      if (busy.current || window.innerWidth >= 1024 || event.touches.length !== 1 ||
        (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]'))) return
      start.current = { x: event.touches[0].clientX, y: event.touches[0].clientY }
    },
    onTouchMove(event: TouchEvent<HTMLElement>) {
      if (!start.current) return
      if (event.touches.length !== 1) { reset(); return }
      const dx = event.touches[0].clientX - start.current.x
      const dy = event.touches[0].clientY - start.current.y
      if (Math.abs(dy) > 18 && Math.abs(dy) > Math.abs(dx)) { reset(); return }
      if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.4) return
      const target = pages[pages.indexOf(path) + (dx < 0 ? 1 : -1)]
      if (!target) return
      setDragging(true)
      suppressClickUntil.current = Date.now() + 500
      setOffset(dx * 0.7)
    },
    onTouchEnd(event: TouchEvent<HTMLElement>) {
      if (!start.current) return
      const dx = event.changedTouches[0].clientX - start.current.x
      const dy = event.changedTouches[0].clientY - start.current.y
      const target = pages[pages.indexOf(path) + (dx < 0 ? 1 : -1)]
      reset()
      if (!target || Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.8) return
      busy.current = true
      destination.current = target
      try {
        sessionStorage.setItem(transitionKey, JSON.stringify({ target: target === '/' ? 'home' : target, direction: dx < 0 ? 'from-right' : 'from-left', at: Date.now() }))
      } catch { /* Navigation still works without session storage. */ }
      setOffset(reducedMotion ? 0 : Math.sign(dx) * window.innerWidth)
      // transitionend owns the handoff; the timer covers interrupted CSS transitions.
      timer.current = setTimeout(finishNavigation, reducedMotion ? 0 : 380)
    },
    onTouchCancel: reset,
    onTransitionEnd(event: TransitionEvent<HTMLElement>) {
      if (event.propertyName === 'transform' && event.target instanceof HTMLElement &&
          event.target.dataset.sectionSwipeSurface === path) finishNavigation()
    },
    onClickCapture(event: MouseEvent<HTMLElement>) {
      if (Date.now() < suppressClickUntil.current || busy.current) {
        event.preventDefault()
        event.stopPropagation()
      }
    },
  }
}
