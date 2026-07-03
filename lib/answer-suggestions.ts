import { normalizeAnswer, ORTHO_DIAGNOSIS_BANK, readHiddenDiagnosisAnswers } from '@/lib/utils'

type Level = 'med_student' | 'resident' | 'attending'

type AnswerSuggestionSource = {
  answer: string | null | undefined
  case_date?: string | null | undefined
  level?: Level | null | undefined
}

type DiagnosisChoiceSource = {
  label: string | null | undefined
}

export type AnswerSuggestionItem = {
  label: string
  count: number
  score: number
}

function tokenizeAnswer(value: string) {
  return normalizeAnswer(value)
    .split(' ')
    .map(token => token.trim())
    .filter(Boolean)
}

function scoreAnswerSuggestion(query: string, label: string) {
  const normalizedQuery = normalizeAnswer(query)
  const normalizedLabel = normalizeAnswer(label)
  if (!normalizedQuery || !normalizedLabel) return 0
  if (normalizedLabel === normalizedQuery) return 10_000

  let score = 0

  if (normalizedLabel.startsWith(normalizedQuery)) {
    score += 600
  } else if (normalizedLabel.includes(normalizedQuery)) {
    score += 320
  }

  const queryTokens = [...new Set(tokenizeAnswer(query))]
  const labelTokens = [...new Set(tokenizeAnswer(label))]

  let exactMatches = 0
  let prefixMatches = 0

  for (const token of queryTokens) {
    if (labelTokens.includes(token)) {
      exactMatches += 1
      continue
    }

    if (
      labelTokens.some(
        labelToken =>
          labelToken.startsWith(token) ||
          (token.length > 2 && token.startsWith(labelToken))
      )
    ) {
      prefixMatches += 1
    }
  }

  score += exactMatches * 120
  score += prefixMatches * 72

  if (score === 0) return 0

  const tokenCoverage =
    queryTokens.length > 0 ? (exactMatches + prefixMatches) / queryTokens.length : 0

  score += Math.round(tokenCoverage * 100)

  return score
}

export function buildAnswerSuggestions(
  query: string,
  diagnosisChoices: DiagnosisChoiceSource[],
  caseAnswers: AnswerSuggestionSource[],
  currentCaseDate?: string,
  currentLevel?: Level
) {
  const trimmedQuery = query.trim()
  if (!trimmedQuery) return [] as AnswerSuggestionItem[]

  const hiddenAnswers = readHiddenDiagnosisAnswers()
  const usageCounts = new Map<string, number>()

  for (const item of caseAnswers) {
    const label = item.answer?.trim()
    if (!label) continue
    const normalized = normalizeAnswer(label)
    if (!normalized || hiddenAnswers.has(normalized)) continue
    usageCounts.set(normalized, (usageCounts.get(normalized) || 0) + 1)
  }

  const suggestionMap = new Map<string, { label: string; count: number }>()

  const addSuggestion = (rawLabel: string | null | undefined) => {
    const label = rawLabel?.trim()
    if (!label) return
    const normalized = normalizeAnswer(label)
    if (!normalized || hiddenAnswers.has(normalized)) return

    const existing = suggestionMap.get(normalized)
    const count = usageCounts.get(normalized) || 0

    if (!existing) {
      suggestionMap.set(normalized, { label, count })
      return
    }

    if (label.length > existing.label.length) {
      existing.label = label
    }
    existing.count = Math.max(existing.count, count)
  }

  for (const label of ORTHO_DIAGNOSIS_BANK) addSuggestion(label)
  for (const item of diagnosisChoices) addSuggestion(item.label)
  for (const item of caseAnswers) addSuggestion(item.answer)

  const normalizedCurrent = normalizeAnswer(trimmedQuery)

  return Array.from(suggestionMap.entries())
    .map(([normalized, item]) => {
      let score = scoreAnswerSuggestion(trimmedQuery, item.label)

      if (
        currentCaseDate &&
        currentLevel &&
        caseAnswers.some(
          caseItem =>
            caseItem.case_date === currentCaseDate &&
            caseItem.level === currentLevel &&
            normalizeAnswer(caseItem.answer || '') === normalized
        )
      ) {
        score += 20
      }

      score += Math.min(item.count, 40)

      return {
        label: item.label,
        count: item.count,
        score,
      }
    })
    .filter(item => item.score > 0 && normalizeAnswer(item.label) !== normalizedCurrent)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      if (b.count !== a.count) return b.count - a.count
      return a.label.localeCompare(b.label)
    })
    .slice(0, 8)
}
