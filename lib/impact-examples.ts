export const EXAMPLE_SLOTS = [
  { key: 'featured', label: 'Daily case example', action: 'Try this case' },
  { key: 'anatomy', label: 'Anatomy example', action: 'Try anatomy' },
  { key: 'classification', label: 'Classification example', action: 'Try classification' },
] as const

export type ExampleSlot = typeof EXAMPLE_SLOTS[number]['key']
export type ExampleCase = {
  id: string
  case_date: string
  level: string
  category: string | null
  prompt: string | null
  answer?: string
}
export type ExampleSelection = Record<ExampleSlot, string | null>
export const EMPTY_EXAMPLES: ExampleSelection = { featured: null, anatomy: null, classification: null }

export function exampleCaseHref(item: ExampleCase) {
  return `/?${new URLSearchParams({ case: item.id, date: item.case_date, level: item.level })}`
}

export function validExampleSelection(value: unknown): value is ExampleSelection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const entries = Object.entries(value)
  return entries.length === EXAMPLE_SLOTS.length && EXAMPLE_SLOTS.every(({ key }) =>
    Object.prototype.hasOwnProperty.call(value, key) && ((value as ExampleSelection)[key] === null ||
      (typeof (value as ExampleSelection)[key] === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test((value as ExampleSelection)[key]!)))
  )
}

export type ExampleSnapshot = { selection: ExampleSelection; cases: ExampleCase[] }
