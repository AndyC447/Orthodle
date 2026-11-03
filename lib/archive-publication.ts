export type ArchivePublicationSettings = {
  no_resident_mode?: boolean
  no_resident_mode_start_date?: string | null
  no_anatomy_mode?: boolean
  no_anatomy_mode_start_date?: string | null
}

export function isPublicArchiveCase(
  item: { level: string; case_date: string },
  settings: ArchivePublicationSettings | null,
  includeOlderBonus = false
) {
  if (item.level === 'med_student') return true
  if (!includeOlderBonus || !settings) return false
  if (item.level === 'resident') {
    return !settings.no_resident_mode || Boolean(settings.no_resident_mode_start_date && item.case_date < settings.no_resident_mode_start_date)
  }
  if (item.level === 'attending') {
    return !settings.no_anatomy_mode || Boolean(settings.no_anatomy_mode_start_date && item.case_date < settings.no_anatomy_mode_start_date)
  }
  return false
}
