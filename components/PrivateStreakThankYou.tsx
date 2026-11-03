'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { StreakThankYou } from '@/lib/streak-rewards'
import { dismissThankYou, isThankYouDismissed, thankYouDismissalKey, THANK_YOU_DISMISSED_EVENT } from '@/lib/streak-thank-you-dismissal'
import { burstThankYouConfetti } from '@/lib/thank-you-confetti'

export function PrivateStreakThankYou({ note, sessionId, paused = false }: { note: StreakThankYou; sessionId: string; paused?: boolean }) {
  const key = thankYouDismissalKey(note.id, sessionId)
  const [visibleKey, setVisibleKey] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const labelId = useId()

  const dismiss = () => {
    const dialog = dialogRef.current
    const celebrate = Boolean(dialog?.open) && !isThankYouDismissed(key)
    const rect = celebrate ? dialog?.getBoundingClientRect() : null
    setVisibleKey(null)
    dismissThankYou(key)
    dialog?.close()
    if (celebrate && rect) burstThankYouConfetti({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
  }

  useEffect(() => {
    const sync = () => setVisibleKey(isThankYouDismissed(key) ? null : key)
    const changed = (event: StorageEvent) => { if (event.key === key || event.key === null) sync() }
    sync()
    window.addEventListener('storage', changed)
    window.addEventListener('focus', sync)
    window.addEventListener(THANK_YOU_DISMISSED_EVENT, sync)
    return () => {
      window.removeEventListener('storage', changed)
      window.removeEventListener('focus', sync)
      window.removeEventListener(THANK_YOU_DISMISSED_EVENT, sync)
    }
  }, [key])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog || visibleKey !== key || paused) return
    let previousOverflow = ''
    let scrollLocked = false
    const showWhenReady = () => {
      if (isThankYouDismissed(key)) { setVisibleKey(null); return }
      if (dialog.open || document.visibilityState === 'hidden' || !dialog.isConnected) return
      const anotherDialog = Array.from(document.querySelectorAll('dialog[open], [role="dialog"][aria-modal="true"]'))
        .some(element => element !== dialog && (element.tagName === 'DIALOG' ? element.hasAttribute('open') : element.getClientRects().length > 0))
      if (anotherDialog) return
      previousOverflow = document.body.style.overflow
      dialog.showModal()
      document.body.style.overflow = 'hidden'
      scrollLocked = true
    }
    // Wait for another dialog to finish rather than covering How to Play or an image.
    const observer = new MutationObserver(showWhenReady)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open', 'aria-modal'] })
    document.addEventListener('visibilitychange', showWhenReady)
    showWhenReady()
    return () => {
      observer.disconnect()
      document.removeEventListener('visibilitychange', showWhenReady)
      if (dialog.open) dialog.close()
      if (scrollLocked) document.body.style.overflow = previousOverflow
    }
  }, [key, visibleKey, paused])

  if (visibleKey !== key || paused) return null
  return (
    <dialog ref={dialogRef} className="orthodle-how-to streak-thank-you" role="dialog" aria-modal="true"
      aria-labelledby={`${labelId}-title`} aria-describedby={`${labelId}-body`}
      onCancel={event => { event.preventDefault(); dismiss() }}
      onTouchStart={event => event.stopPropagation()} onTouchMove={event => event.stopPropagation()} onTouchEnd={event => event.stopPropagation()}>
      <button type="button" autoFocus className="streak-thank-you-dismiss" aria-label="Dismiss thank-you note" onClick={dismiss}>
        <X size={20} aria-hidden="true" />
      </button>
      <h2 id={`${labelId}-title`} className="streak-thank-you-title">{note.title}</h2>
      <p id={`${labelId}-body`} className="streak-thank-you-body">{note.body}</p>
      <p className="streak-thank-you-signature">{note.signature}</p>
    </dialog>
  )
}
