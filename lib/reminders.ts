export type ReminderMode = 'instant' | 'scheduled'

export const DEFAULT_REMINDER_MODE: ReminderMode = 'instant'
export const DEFAULT_REMINDER_TIME = '08:00'
export const PACIFIC_TIMEZONE = 'America/Los_Angeles'

export function normalizeReminderMode(value: unknown): ReminderMode {
  return value === 'scheduled' ? 'scheduled' : DEFAULT_REMINDER_MODE
}

export function parseReminderTimeToMinutes(value: unknown) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(trimmed)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  return hours * 60 + minutes
}

export function formatReminderMinutes(minutes: number | null | undefined) {
  const safeMinutes =
    typeof minutes === 'number' && Number.isFinite(minutes)
      ? Math.max(0, Math.min(23 * 60 + 59, Math.floor(minutes)))
      : parseReminderTimeToMinutes(DEFAULT_REMINDER_TIME) || 8 * 60

  const hours = Math.floor(safeMinutes / 60)
  const mins = safeMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

export function normalizeScheduledReminderMinutes(value: unknown) {
  return parseReminderTimeToMinutes(value) ?? parseReminderTimeToMinutes(DEFAULT_REMINDER_TIME) ?? 8 * 60
}

export function normalizeReminderTimezone(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return PACIFIC_TIMEZONE
  const timezone = value.trim()

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date())
    return timezone
  } catch {
    return PACIFIC_TIMEZONE
  }
}

export function getPacificDateParts(date = new Date()) {
  return getDatePartsForTimezone(PACIFIC_TIMEZONE, date)
}

export function getDatePartsForTimezone(timeZone: string, date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const year = parts.find(part => part.type === 'year')?.value || '0000'
  const month = parts.find(part => part.type === 'month')?.value || '00'
  const day = parts.find(part => part.type === 'day')?.value || '00'
  const hour = Number(parts.find(part => part.type === 'hour')?.value || '0')
  const minute = Number(parts.find(part => part.type === 'minute')?.value || '0')

  return {
    isoDate: `${year}-${month}-${day}`,
    minutesIntoDay: hour * 60 + minute,
  }
}

export function isReminderDueToday(
  mode: ReminderMode,
  scheduledMinutes: number | null | undefined,
  currentMinutesIntoDay: number
) {
  if (mode === 'instant') return true
  const targetMinutes =
    typeof scheduledMinutes === 'number' && Number.isFinite(scheduledMinutes)
      ? Math.max(0, Math.min(23 * 60 + 59, Math.floor(scheduledMinutes)))
      : normalizeScheduledReminderMinutes(DEFAULT_REMINDER_TIME)
  return currentMinutesIntoDay >= targetMinutes
}
