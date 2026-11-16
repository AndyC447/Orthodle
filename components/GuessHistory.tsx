import { Check, Minus, X } from 'lucide-react'
import { getAnatomyChoiceItems, parseAnatomyGuessLetters } from '@/lib/anatomy-quiz'

export function GuessHistory({
  guesses,
  quizChoices,
}: {
  guesses: readonly { text: string; correct: boolean }[]
  quizChoices?: string[]
}) {
  if (guesses.length === 0) return null
  const choices = quizChoices ? getAnatomyChoiceItems(quizChoices) : []

  return (
    <section aria-label="Your guesses" className="orthodle-guess-history mb-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
      <h3 className="orthodle-guess-history-label text-xs font-semibold">Your guesses</h3>
      <ol role="list" className="flex min-w-0 flex-wrap gap-1.5">
        {guesses.map(({ text, correct }, index) => {
          const trimmed = text.trim()
          const selected = quizChoices ? parseAnatomyGuessLetters(trimmed, quizChoices) : []
          const answer = choices.filter(choice => selected.includes(choice.letter))
            .map(choice => choice.label).join('; ') || trimmed
          const status = !trimmed ? 'skipped' : correct ? 'correct' : 'incorrect'
          const Icon = status === 'skipped' ? Minus : correct ? Check : X

          return (
            <li key={index} data-status={status} className="orthodle-guess-history-item inline-flex max-w-full items-baseline gap-1.5 px-2 py-1 text-xs leading-4">
              <Icon aria-hidden="true" size={13} strokeWidth={2.5} className="shrink-0 self-center" />
              <span className="sr-only">{`Guess ${index + 1}${status === 'skipped' ? ':' : `, ${status}:`} `}</span>
              <span className="min-w-0 break-words">{answer || 'Skipped'}</span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
