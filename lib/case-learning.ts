export type SimilarCase = { id: string; case_date: string; level: string; category?: string | null }
type Progress = { case_id: string | null; is_correct: boolean }
const categories = (value?: string | null) => (value || '').toLowerCase().split(/[,/;&]/).map(part => part.trim()).filter(Boolean)

export function findSimilarCase(cases: SimilarCase[], current: SimilarCase, guesses: Progress[], completedKeys: string[], today: string) {
  const topics = new Set(categories(current.category))
  if (!topics.size) return null
  const completed = new Set(completedKeys.map(key => key.replace(/:daily$/, ':archive')))
  const progress = new Map<string, { count: number; solved: boolean }>()
  for (const guess of guesses) {
    if (!guess.case_id) continue
    const item = progress.get(guess.case_id) || { count: 0, solved: false }
    item.count++
    item.solved ||= guess.is_correct
    progress.set(guess.case_id, item)
  }
  return cases.filter(item => {
    const played = progress.get(item.id)
    return item.id !== current.id && item.case_date < today && item.case_date >= '2026-04-27' && item.level === current.level &&
      categories(item.category).some(topic => topics.has(topic)) &&
      !completed.has(`${item.case_date}:${item.level}:archive`) &&
      !played?.solved && (played?.count || 0) < (item.level === 'attending' && item.case_date >= '2026-05-14' ? 1 : 6)
  }).sort((a, b) => {
    const overlap = (item: SimilarCase) => categories(item.category).filter(topic => topics.has(topic)).length
    return Number(progress.has(a.id)) - Number(progress.has(b.id)) || overlap(b) - overlap(a) || b.case_date.localeCompare(a.case_date) || a.id.localeCompare(b.id)
  })[0] || null
}

export type ClueGuess = { id?: string; case_id: string | null; session_id: string; is_correct: boolean; created_at: string }
export type ClueStats = { players: number; solves: number[]; reached: number[]; exhausted: number; unfinished: number }

// Existing play reveals the next clue after each guess. Count each browser's
// first round only, so later retries cannot inflate clue-six solves.
export function buildClueStats(guesses: ClueGuess[]): Record<string, ClueStats> {
  const rounds = new Map<string, ClueGuess[]>()
  const seen = new Set<string>()
  for (const guess of guesses) {
    if (!guess.case_id || !guess.session_id || (guess.id && seen.has(guess.id))) continue
    if (guess.id) seen.add(guess.id)
    const key = JSON.stringify([guess.case_id, guess.session_id])
    const round = rounds.get(key) || []
    round.push(guess)
    rounds.set(key, round)
  }
  const result: Record<string, ClueStats> = {}
  for (const round of rounds.values()) {
    round.sort((a, b) => a.created_at.localeCompare(b.created_at) || (a.id || '').localeCompare(b.id || ''))
    const stats = result[round[0].case_id!] ||= { players: 0, solves: [0,0,0,0,0,0], reached: [0,0,0,0,0,0], exhausted: 0, unfinished: 0 }
    stats.players++
    const firstSix = round.slice(0, 6)
    const correct = firstSix.findIndex(guess => guess.is_correct)
    const attempts = correct < 0 ? firstSix.length : correct + 1
    for (let index = 0; index < attempts; index++) stats.reached[index]++
    if (correct >= 0) stats.solves[correct]++
    else if (attempts === 6) stats.exhausted++
    else stats.unfinished++
  }
  return result
}
