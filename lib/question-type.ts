export const QUESTION_TYPES = ['diagnosis', 'anatomy', 'classification'] as const
export type QuestionType = typeof QUESTION_TYPES[number]
const PREFIX = '__question_type__:'

export function normalizeQuestionType(value: unknown): QuestionType {
  return value === 'anatomy' || value === 'classification' ? value : 'diagnosis'
}

export function isQuestionTypeMetadata(value: unknown) {
  return typeof value === 'string' && value.trim().toLowerCase().startsWith(PREFIX)
}

export function readQuestionType(synonyms?: string[] | null): QuestionType | null {
  const value = synonyms?.find(isQuestionTypeMetadata)?.trim().toLowerCase().slice(PREFIX.length)
  return QUESTION_TYPES.includes(value as QuestionType) ? value as QuestionType : null
}

// Match the existing private multi-select metadata convention; no new DB column.
export function withQuestionType(synonyms: string[], type: QuestionType) {
  return [...synonyms.filter(s => !isQuestionTypeMetadata(s)), `${PREFIX}${type}`]
}
