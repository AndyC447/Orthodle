export type SurveyPlacement = 'homepage_header' | 'group_header' | 'after_case'

export type SurveyLevelScope = 'all' | 'med_student' | 'resident' | 'attending'

export type SiteSurveyRow = {
  id: string
  question: string
  options: string[] | null
  placement: SurveyPlacement
  level_scope: SurveyLevelScope | null
  start_date: string
  end_date: string | null
  created_at: string
  response_counts?: Record<string, number>
  total_responses?: number
}

export type SiteSurveyResponseRow = {
  survey_id: string
  response: string
  session_id: string | null
}

export const SITE_SURVEY_STORAGE_PREFIX = 'orthodle_site_survey'

export function getSurveyPlacementLabel(placement: SurveyPlacement) {
  if (placement === 'homepage_header') return 'Home page header'
  if (placement === 'group_header') return 'Groups header'
  return 'After a case'
}

export function getSurveyLevelScopeLabel(levelScope: SurveyLevelScope | null | undefined) {
  if (!levelScope || levelScope === 'all') return 'All cases'
  if (levelScope === 'med_student') return 'Med Student only'
  if (levelScope === 'resident') return 'Resident only'
  return 'Anatomy only'
}

export function normalizeSurveyOptions(rawOptions: Array<string | null | undefined>) {
  return rawOptions.map(option => option?.trim() || '').filter(Boolean)
}
