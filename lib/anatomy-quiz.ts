import { normalizeAnswer } from '@/lib/utils'

const MULTI_SELECT_SYNONYM_PREFIX = '__multi_select__:'

export function stripAnatomyChoicePrefix(value: string) {
  return value.replace(/^[A-F][\).\:\-]\s*/i, '').trim()
}

export function getAnatomyChoiceItems(choiceSource: Array<string | null | undefined>) {
  return choiceSource
    .map(choice => (typeof choice === 'string' ? choice.trim() : ''))
    .filter(Boolean)
    .slice(0, 6)
    .map((choice, index) => ({
      letter: String.fromCharCode(65 + index),
      raw: choice,
      label: stripAnatomyChoicePrefix(choice),
      normalizedLabel: normalizeAnswer(stripAnatomyChoicePrefix(choice)),
    }))
}

export function extractPlainSynonyms(synonyms: string[] | null | undefined) {
  return (synonyms || []).filter(
    synonym =>
      typeof synonym === 'string' &&
      synonym.trim().length > 0 &&
      !synonym.trim().toLowerCase().startsWith(MULTI_SELECT_SYNONYM_PREFIX)
  )
}

export function parseChoiceLetterList(value: string) {
  return Array.from(
    new Set(
      value
        .toUpperCase()
        .split(/[^A-F]+/)
        .map(item => item.trim())
        .filter(Boolean)
        .filter(item => /^[A-F]$/.test(item))
    )
  ).sort()
}

export function buildMultiSelectSynonymMetadata(letters: string[]) {
  const normalized = parseChoiceLetterList(letters.join(','))
  if (normalized.length === 0) return null
  return `${MULTI_SELECT_SYNONYM_PREFIX}${normalized.join('|')}`
}

export function getStoredMultiSelectLetters(synonyms: string[] | null | undefined) {
  const metadata = (synonyms || []).find(
    synonym =>
      typeof synonym === 'string' &&
      synonym.trim().toLowerCase().startsWith(MULTI_SELECT_SYNONYM_PREFIX)
  )

  if (!metadata) return []
  return parseChoiceLetterList(metadata.slice(MULTI_SELECT_SYNONYM_PREFIX.length))
}

export function getCorrectAnatomyChoiceLetters(
  choiceSource: Array<string | null | undefined>,
  answer: string,
  synonyms: string[] | null | undefined
) {
  const choiceItems = getAnatomyChoiceItems(choiceSource)
  const storedLetters = getStoredMultiSelectLetters(synonyms).filter(letter =>
    choiceItems.some(choice => choice.letter === letter)
  )

  if (storedLetters.length > 0) {
    return storedLetters
  }

  const acceptedLabels = new Set(
    [answer, ...extractPlainSynonyms(synonyms)]
      .map(item => normalizeAnswer(item))
      .filter(Boolean)
  )

  return choiceItems
    .filter(choice => acceptedLabels.has(choice.normalizedLabel))
    .map(choice => choice.letter)
}

export function serializeAnatomyGuessLetters(letters: string[]) {
  return parseChoiceLetterList(letters.join(',')).join('|')
}

export function parseAnatomyGuessLetters(
  guessText: string,
  choiceSource: Array<string | null | undefined>
) {
  const directLetters = parseChoiceLetterList(guessText)
  if (directLetters.length > 0) return directLetters

  const normalizedGuess = normalizeAnswer(stripAnatomyChoicePrefix(guessText))
  if (!normalizedGuess) return []

  const match = getAnatomyChoiceItems(choiceSource).find(
    choice => choice.normalizedLabel === normalizedGuess
  )

  return match ? [match.letter] : []
}

export function isCorrectAnatomySelection(
  guessText: string,
  choiceSource: Array<string | null | undefined>,
  answer: string,
  synonyms: string[] | null | undefined
) {
  const selectedLetters = parseAnatomyGuessLetters(guessText, choiceSource)
  const correctLetters = getCorrectAnatomyChoiceLetters(choiceSource, answer, synonyms)

  if (selectedLetters.length === 0 || correctLetters.length === 0) return false
  if (selectedLetters.length !== correctLetters.length) return false

  const selectedSet = new Set(selectedLetters)
  return correctLetters.every(letter => selectedSet.has(letter))
}
