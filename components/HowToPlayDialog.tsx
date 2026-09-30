'use client'

import { useEffect, useRef } from 'react'
import { BookOpen, Search, Lightbulb, X } from 'lucide-react'

const steps = [
  { Icon: BookOpen, title: 'Read the case', text: 'Start with the patient’s story and any images provided.' },
  { Icon: Search, title: 'Make your diagnosis', text: 'Type to search, select an answer from the list, then submit your guess. You have up to 6 guesses.' },
  { Icon: Lightbulb, title: 'Learn with each guess', text: 'An incorrect guess reveals another clue. Keep narrowing it down, then review the explanation when you finish.' },
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
          <div>
            <p className="how-to-eyebrow text-[11px] font-bold uppercase tracking-[0.18em]">Welcome to Orthodle</p>
            <h2 id="how-to-title" className="mt-2 font-serif text-[30px] font-bold leading-tight sm:text-[34px]">How to play</h2>
          </div>
          <button type="button" onClick={onDismiss} aria-label="Close how to play" className="how-to-close inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border">
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <p id="how-to-description" className="how-to-muted mt-3 text-sm leading-6">One daily case. Build your clinical reasoning, one clue at a time.</p>
        <ol className="my-6 space-y-5">
          {steps.map(({ Icon, title, text }, index) => (
            <li key={title} className="flex gap-3.5">
              <span className="how-to-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"><Icon size={20} aria-hidden="true" /></span>
              <div><h3 className="text-[15px] font-bold">{index + 1}. {title}</h3><p className="how-to-muted mt-1 text-sm leading-6">{text}</p></div>
            </li>
          ))}
        </ol>
        <div className="how-to-more border-t pt-4 text-sm leading-6">
          <p><strong>Playing a quiz?</strong> Anatomy and classification questions may use answer choices. Follow the instructions shown in that case.</p>
          <p className="how-to-muted mt-3">Explore previous cases in <strong>Archives</strong>, or find <strong>Groups</strong> in the menu to play alongside friends.</p>
        </div>
      </div>
      <div className="how-to-footer sticky bottom-0 px-5 pb-5 pt-3 sm:px-7 sm:pb-7">
        <button type="button" autoFocus onClick={onDismiss} className="orthodle-primary-button min-h-12 w-full rounded-xl px-4 py-3 text-base font-semibold text-white">Let’s play</button>
      </div>
    </dialog>
  )
}
