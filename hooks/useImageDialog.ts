'use client'

import { useEffect, useRef } from 'react'

export function useImageDialog(open: boolean, onClose: () => void) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const y = window.scrollY
    const body = document.body
    const old = { position: body.style.position, top: body.style.top, width: body.style.width, overflow: body.style.overflow }
    previousFocus?.blur()
    Object.assign(body.style, { position: 'fixed', top: `-${y}px`, width: '100%', overflow: 'hidden' })
    const closeButton = dialogRef.current?.querySelector<HTMLButtonElement>('[data-close-image]')
    closeButton?.focus({ preventScroll: true })
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); return }
      if (event.key !== 'Tab') return
      const items = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex="0"]') || [])
        .filter(item => item.getClientRects().length > 0)
      const first = items[0], last = items[items.length - 1]
      if (!first) { event.preventDefault(); return }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      Object.assign(body.style, old)
      window.scrollTo({ top: y, behavior: 'instant' })
      if (previousFocus?.isConnected && !previousFocus.matches('input, textarea')) previousFocus.focus({ preventScroll: true })
    }
  }, [open])
  return dialogRef
}
