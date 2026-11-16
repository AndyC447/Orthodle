import type { ArchivePublicationSettings } from './archive-publication'
import type { DEFAULT_LEVEL_TITLES } from './level-display'

export type ArchiveCase = {
  id: string
  case_date: string
  level: 'med_student' | 'resident' | 'attending'
  answer: string
  category: string | null
  isAnatomy: boolean
  isChoice: boolean
}

export type ArchiveCatalog = {
  cases: ArchiveCase[]
  titles: typeof DEFAULT_LEVEL_TITLES
  publication: ArchivePublicationSettings | null
}

let saved: { day: string; data: ArchiveCatalog; at: number } | null = null
const pending = new Map<string, Promise<ArchiveCatalog>>()

export function loadArchiveCatalog(day: string) {
  if (saved?.day === day && Date.now() - saved.at < 5 * 60_000) return Promise.resolve(saved.data)
  const existing = pending.get(day)
  if (existing) return existing
  const request = (async () => {
    const response = await fetch(`/api/archive-catalog?day=${encodeURIComponent(day)}`)
    if (!response.ok) throw new Error('Could not load archive catalog.')
    const data = await response.json() as ArchiveCatalog
    saved = { day, data, at: Date.now() }
    return data
  })().finally(() => { pending.delete(day) })
  pending.set(day, request)
  return request
}
