'use client'

import { useEffect, useId, useRef, useState, type FormEvent, type RefObject } from 'react'
import { Check, Mail, X } from 'lucide-react'

export function DailyEmailDialog({
  sourcePath,
  returnFocusRef,
  onDismiss,
}: {
  sourcePath: string
  returnFocusRef: RefObject<HTMLButtonElement | null>
  onDismiss: () => void
}) {
  const id = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [subscribed, setSubscribed] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const dialog = dialogRef.current
    const trigger = returnFocusRef.current
    const previousOverflow = document.body.style.overflow
    dialog?.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      dialog?.close()
      document.body.style.overflow = previousOverflow
      trigger?.focus({ preventScroll: true })
    }
  }, [returnFocusRef])

  async function subscribe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/reminders/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, sourcePath }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        setError(data.error || 'Could not sign up right now. Please try again.')
        return
      }
      setSubscribed(true)
    } catch {
      setError('Could not sign up right now. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="orthodle-how-to daily-email-dialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      onCancel={event => { event.preventDefault(); onDismiss() }}
      onClick={event => { if (event.target === event.currentTarget) onDismiss() }}
    >
      <div className="p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <span className="how-to-icon grid h-9 w-9 place-items-center rounded-xl">
            {subscribed ? <Check size={18} aria-hidden="true" /> : <Mail size={18} aria-hidden="true" />}
          </span>
          <button
            type="button"
            autoFocus
            onClick={onDismiss}
            aria-label="Close daily email"
            className="how-to-close grid h-11 w-11 place-items-center rounded-full"
          >
            <X size={19} aria-hidden="true" />
          </button>
        </div>
        <div aria-live="polite">
          <h2 id={`${id}-title`} className="mt-2 font-serif text-2xl font-bold">
            {subscribed ? 'You’re on the list' : 'Daily email'}
          </h2>
          <p id={`${id}-description`} className="how-to-muted mt-1 text-sm leading-6">
            {subscribed
              ? 'Look for your next Daily Case in your inbox.'
              : 'One email a day with a link to play. Unsubscribe anytime.'}
          </p>
        </div>
        {subscribed ? (
          <button
            type="button"
            onClick={onDismiss}
            className="orthodle-primary-button mt-4 min-h-11 w-full rounded-xl px-4 text-sm font-semibold text-white"
          >
            Done
          </button>
        ) : (
          <form onSubmit={subscribe} className="mt-4">
            <label htmlFor={`${id}-email`} className="sr-only">Email address</label>
            <input
              id={`${id}-email`}
              type="email"
              name="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="Your email address"
              maxLength={254}
              required
              value={email}
              onChange={event => { setEmail(event.target.value); setError('') }}
              className="orthodle-ui-input min-h-11 w-full px-3 text-base"
            />
            {error && <p role="alert" className="how-to-muted mt-2 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={saving}
              className="orthodle-primary-button mt-2 min-h-11 w-full rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? 'Signing up…' : 'Sign me up'}
            </button>
          </form>
        )}
      </div>
    </dialog>
  )
}
