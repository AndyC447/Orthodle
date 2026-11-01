export type CaseGuess = { session_id: string | null; is_correct: boolean; guess_text: string | null }

export function summarizeCaseStats(rows: CaseGuess[]) {
  const players = new Set<string>()
  const solved = new Set<string>()
  const incorrect = new Map<string, number>()
  let guesses = 0
  for (const row of rows) {
    if (!row.session_id) continue
    players.add(row.session_id)
    guesses++
    if (row.is_correct) solved.add(row.session_id)
    else {
      const label = row.guess_text?.trim() || '(Skipped guess)'
      incorrect.set(label, (incorrect.get(label) || 0) + 1)
    }
  }
  return {
    players: players.size, guesses, solved: solved.size,
    solveRate: players.size ? Math.round(solved.size / players.size * 100) : null,
    averageGuesses: players.size ? guesses / players.size : null,
    incorrect: [...incorrect].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5),
  }
}
