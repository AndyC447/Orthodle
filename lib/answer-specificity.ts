export type AnswerSpecificity = 'off' | 'named_diagnosis' | 'named_fracture'

export const ANSWER_SPECIFICITY = {
  named_diagnosis: {
    label: '🎯 Named Diagnosis Required',
    helper: 'Identify the specific named injury or diagnosis, not the broader condition.',
  },
  named_fracture: {
    label: '🎯 Named Fracture Required',
    helper: 'Identify the specific named fracture pattern. A general fracture diagnosis will not be accepted.',
  },
} as const

export function normalizeAnswerSpecificity(value: unknown): AnswerSpecificity {
  return value === 'named_diagnosis' || value === 'named_fracture' ? value : 'off'
}
