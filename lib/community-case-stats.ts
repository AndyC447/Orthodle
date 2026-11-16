import {
  getAnatomyChoiceItems, isChoiceQuestionCase, parseAnatomyGuessLetters,
} from './anatomy-quiz'
import { filterExcludedSessionRows } from './stats-exclusions'
import { isAcceptedGuess } from './utils'

export type CommunityCaseStats = {
  solveRate: number | null
  averageGuessesToSolve: number | null
  firstTrySolveRate: number | null
  mostCommonIncorrectGuess: string | null
  anatomyChoiceBreakdown: Array<{
    letter: string
    label: string
    rate: number
  }>
}

export type CommunityVisitRow = {
  session_id: string
}

export type CommunityGuessRow = {
  session_id: string
  is_correct: boolean | null
  guess_text: string | null
}

function buildAnatomyChoiceBreakdown(
  choiceSource: Array<string | null | undefined>,
  guessRows: Array<{ session_id: string; guess_text?: string | null }>,
) {
  const choices = getAnatomyChoiceItems(choiceSource)
  if (choices.length < 2) return []
  const firstGuessBySession = new Map<string, string>()

  for (const row of guessRows) {
    if (!firstGuessBySession.has(row.session_id)) {
      const guessText = typeof row.guess_text === 'string' ? row.guess_text.trim() : ''
      firstGuessBySession.set(row.session_id, guessText)
    }
  }

  const counts = choices.map(() => 0)

  for (const guessText of firstGuessBySession.values()) {
    const selectedLetters = parseAnatomyGuessLetters(guessText, choiceSource)
    if (selectedLetters.length === 0) continue
    for (const letter of selectedLetters) {
      const matchIndex = choices.findIndex(choice => choice.letter === letter)
      if (matchIndex !== -1) {
        counts[matchIndex] += 1
      }
    }
  }

  return choices.map((choice, index) => ({
    letter: choice.letter,
    label: choice.label,
    rate: firstGuessBySession.size > 0 ? counts[index] / firstGuessBySession.size * 100 : 0,
  }))
}

export function buildCommunityStats(
  caseItem: NonNullable<Parameters<typeof isChoiceQuestionCase>[0]> & { answer: string },
  visitRows: CommunityVisitRow[] | null | undefined,
  guessRows: CommunityGuessRow[] | null | undefined,
  excludedSessionIds: string[]
): CommunityCaseStats {
  const excludedSessionIdSet = new Set(excludedSessionIds)
  const publicVisitRows = filterExcludedSessionRows(visitRows, excludedSessionIdSet)
  const publicGuessRows = filterExcludedSessionRows(guessRows, excludedSessionIdSet)

  const players = new Set<string>([
    ...publicVisitRows.map(item => item.session_id),
    ...publicGuessRows.map(item => item.session_id),
  ])

  const guessesBySession = new Map<string, boolean[]>()

  for (const guessRow of publicGuessRows) {
    const existing = guessesBySession.get(guessRow.session_id)
    const item = Boolean(guessRow.is_correct)

    if (existing) {
      existing.push(item)
    } else {
      guessesBySession.set(guessRow.session_id, [item])
    }
  }

  let solvedPlayers = 0
  let firstTrySolves = 0
  let totalGuessesBeforeSolve = 0
  const incorrectGuessCounts = new Map<string, { label: string; count: number }>()
  const acceptedGuesses = [caseItem.answer, ...(caseItem.synonyms || [])]

  for (const sessionGuesses of guessesBySession.values()) {
    const solvedIndex = sessionGuesses.findIndex(Boolean)
    if (solvedIndex === -1) continue

    solvedPlayers += 1
    totalGuessesBeforeSolve += solvedIndex + 1

    if (solvedIndex === 0) {
      firstTrySolves += 1
    }
  }

  for (const guessRow of publicGuessRows) {
    if (guessRow.is_correct) continue

    const normalizedGuess = guessRow.guess_text?.trim().toLowerCase()
    const rawGuess = guessRow.guess_text?.trim()

    if (!normalizedGuess || !rawGuess) continue
    if (isAcceptedGuess(rawGuess, acceptedGuesses)) continue

    const existing = incorrectGuessCounts.get(normalizedGuess)
    if (existing) {
      existing.count += 1
    } else {
      incorrectGuessCounts.set(normalizedGuess, { label: rawGuess, count: 1 })
    }
  }

  const mostCommonIncorrectGuess =
    incorrectGuessCounts.size > 0
      ? [...incorrectGuessCounts.values()].sort((a, b) => {
          if (b.count !== a.count) return b.count - a.count
          return a.label.localeCompare(b.label)
        })[0].label
      : null

  const anatomyChoiceBreakdown =
    isChoiceQuestionCase(caseItem)
      ? buildAnatomyChoiceBreakdown(
          [caseItem.clue_1, caseItem.clue_2, caseItem.clue_3, caseItem.clue_4, caseItem.clue_5, caseItem.clue_6],
          publicGuessRows,
        )
      : []

  return {
    solveRate: players.size > 0 ? (solvedPlayers / players.size) * 100 : null,
    averageGuessesToSolve:
      solvedPlayers > 0 ? totalGuessesBeforeSolve / solvedPlayers : null,
    firstTrySolveRate:
      solvedPlayers > 0 ? (firstTrySolves / solvedPlayers) * 100 : null,
    mostCommonIncorrectGuess,
    anatomyChoiceBreakdown,
  }
}
