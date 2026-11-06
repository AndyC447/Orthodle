import { extractPlainSynonyms } from './anatomy-quiz'
import { normalizeAnswer } from './utils'

// Shared labels are canonical diagnoses; synonyms belong only to the open case.
export function getDiagnosisAutocompleteLabels(
  answer: string | null | undefined,
  synonyms: string[] | null | undefined,
  sharedLabels: readonly string[] = []
) {
  const labels = new Map<string, string>()
  for (const value of [...sharedLabels, answer, ...extractPlainSynonyms(synonyms)]) {
    const label = value?.trim()
    if (!label) continue
    const normalized = normalizeAnswer(label)
    if (normalized && !labels.has(normalized)) labels.set(normalized, label)
  }
  return [...labels.values()]
}
