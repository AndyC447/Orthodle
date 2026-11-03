'use client'

import { useEffect, useRef } from 'react'
import { BookOpen, Search, Lightbulb, X } from 'lucide-react'

const steps = [
  { Icon: BookOpen, text: 'Read the case and images.' },
  { Icon: Search, text: 'Search for a diagnosis, select it, and guess.' },
  { Icon: Lightbulb, text: 'Each wrong guess reveals a new clue.' },
]

export function HowToPlayDialog({ onDismiss }: { onDismiss: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    const previousOverflow = document.body.style.overflow
    dialog?.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      dialog?.close()
      document.body.style.overflow = previousOverflow
    }
  }, [])

  return (
    <dialog ref={dialogRef} className="orthodle-how-to" aria-labelledby="how-to-title" aria-describedby="how-to-description"
      onCancel={event => { event.preventDefault(); onDismiss() }}>
      <div className="p-5 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <h2 id="how-to-title" className="font-serif text-[26px] font-bold leading-tight sm:text-[30px]">How to play</h2>
          <button type="button" onClick={onDismiss} aria-label="Close how to play" className="how-to-close inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border">
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <p id="how-to-description" className="how-to-muted mt-2 text-sm leading-6">One daily case. Up to 6 guesses.</p>
        <ol className="my-5 space-y-3">
          {steps.map(({ Icon, text }) => (
            <li key={text} className="flex items-center gap-3">
              <span className="how-to-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"><Icon size={18} aria-hidden="true" /></span>
              <p className="text-sm leading-6">{text}</p>
            </li>
          ))}
        </ol>
        <details className="how-to-more border-t pt-3 text-sm leading-6">
          <summary className="how-to-muted cursor-pointer">Quiz questions</summary>
          <p className="how-to-muted mt-2">Quizzes use answer choices and one submission. If prompted, select all that apply before submitting.</p>
        </details>
      </div>
      <div className="how-to-footer sticky bottom-0 px-5 pb-5 pt-3 sm:px-7 sm:pb-7">
        <button type="button" autoFocus onClick={onDismiss} className="orthodle-primary-button min-h-12 w-full rounded-xl px-4 py-3 text-base font-semibold text-white">Let’s play</button>
      </div>
    </dialog>
  )
}
