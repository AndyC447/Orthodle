import { normalizeCaseCategory } from './case-category'

const OPTIONAL_CASE_FIELDS = ['answer_specificity', 'learning_image_caption', 'learning_image_caption_2'] as const
type OptionalCaseField = typeof OPTIONAL_CASE_FIELDS[number]
type SaveError = { message: string; code?: string }

function missingOptionalField(error: SaveError | null): OptionalCaseField | undefined {
  if (!error) return
  // Only retry explicit missing-column errors, never permissions or validation errors.
  return OPTIONAL_CASE_FIELDS.find(field =>
    error.message.includes(`Could not find the '${field}' column of 'cases' in the schema cache`) ||
    (error.code === '42703' && new RegExp(`column (?:cases\\.)?["']?${field}["']? (?:of relation ["']cases["'] )?does not exist`, 'i').test(error.message))
  )
}

export async function saveCaseCompat<T extends Record<string, unknown>>(
  payload: T,
  write: (payload: Partial<T>) => PromiseLike<{ error: SaveError | null }>
) {
  const compatible: Partial<T> = {
    ...payload,
    ...(typeof payload.category === 'string' ? { category: normalizeCaseCategory(payload.category) } : {}),
  }
  const omittedFields: OptionalCaseField[] = []
  for (;;) {
    const { error } = await write({ ...compatible })
    const field = missingOptionalField(error)
    if (!field || !Object.prototype.hasOwnProperty.call(compatible, field)) return { error, omittedFields }
    delete compatible[field]
    omittedFields.push(field)
  }
}

export function hasOmittedCaseContent(payload: Record<string, unknown>, fields: readonly string[]) {
  return fields.some(field => field === 'answer_specificity'
    ? Boolean(payload[field] && payload[field] !== 'off')
    : Boolean(typeof payload[field] === 'string' && payload[field].trim()))
}

export function caseSaveCompatibilityNotice(fields: readonly string[]) {
  const labels = []
  if (fields.includes('answer_specificity')) labels.push('answer guidance')
  if (fields.some(field => field.startsWith('learning_image_caption'))) labels.push('teaching image captions')
  return labels.length ? ` The case was saved, but ${labels.join(' and ')} cannot be stored until the database update is applied.` : ''
}
