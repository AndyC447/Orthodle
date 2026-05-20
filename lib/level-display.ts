export type DisplayLevel = 'med_student' | 'resident' | 'attending'

export const DEFAULT_LEVEL_TITLES: Record<DisplayLevel, string> = {
  med_student: 'Med Student',
  resident: 'Resident',
  attending: 'Anatomy',
}

export const LEVEL_TITLE_CACHE_KEY = 'orthodle_level_titles_v1'

export function normalizeLevelTitle(value: string | null | undefined, fallback: string) {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return trimmed || fallback
}

export function normalizeLevelTitles(
  value: Partial<Record<DisplayLevel, string>> | null | undefined
) {
  const source = value || {}

  return {
    med_student: normalizeLevelTitle(source.med_student, DEFAULT_LEVEL_TITLES.med_student),
    resident: normalizeLevelTitle(source.resident, DEFAULT_LEVEL_TITLES.resident),
    attending: normalizeLevelTitle(source.attending, DEFAULT_LEVEL_TITLES.attending),
  } satisfies Record<DisplayLevel, string>
}

export function readCachedLevelTitles() {
  if (typeof window === 'undefined') return DEFAULT_LEVEL_TITLES

  try {
    const raw = window.localStorage.getItem(LEVEL_TITLE_CACHE_KEY)
    if (!raw) return DEFAULT_LEVEL_TITLES
    return normalizeLevelTitles(JSON.parse(raw) as Partial<Record<DisplayLevel, string>>)
  } catch {
    window.localStorage.removeItem(LEVEL_TITLE_CACHE_KEY)
    return DEFAULT_LEVEL_TITLES
  }
}

export function writeCachedLevelTitles(titles: Record<DisplayLevel, string>) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(LEVEL_TITLE_CACHE_KEY, JSON.stringify(titles))
}

export function getLevelTitle(level: DisplayLevel, titles?: Record<DisplayLevel, string>) {
  const source = titles || DEFAULT_LEVEL_TITLES
  return source[level] || DEFAULT_LEVEL_TITLES[level]
}
