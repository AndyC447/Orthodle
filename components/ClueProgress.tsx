type ClueProgressProps = { used: number; total: number; complete: boolean; won: boolean }

export function ClueProgress({ used, total, complete, won }: ClueProgressProps) {
  const attempts = Math.min(total, Math.max(0, used))
  const remaining = complete ? 0 : total - attempts
  return (
    <div className="orthodle-arcade-clues" role="status" aria-live="polite" aria-atomic="true"
      aria-label={complete ? (won ? 'Case solved' : 'No guesses remaining') : `${remaining} of ${total} guesses remaining`}>
      {Array.from({ length: total }, (_, index) => (
        <span key={index} aria-hidden="true" data-state={won && index === attempts - 1 ? 'correct' : index < attempts ? 'used' : complete ? 'inactive' : 'remaining'} />
      ))}
    </div>
  )
}
