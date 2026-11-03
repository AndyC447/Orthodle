import { extractPlainSynonyms } from './anatomy-quiz'
import { normalizeAnswer } from './utils'

export function getDiagnosisAutocompleteLabels(answer: string | null | undefined, synonyms: string[] | null | undefined) {
  const labels = new Map<string, string>()
  for (const value of [answer, ...extractPlainSynonyms(synonyms)]) {
    const label = value?.trim()
    if (!label) continue
    const normalized = normalizeAnswer(label)
    if (normalized && !labels.has(normalized)) labels.set(normalized, label)
  }
  return [...labels.values()]
}
