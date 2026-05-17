export type GroupScoringSettings = {
  solvePoints: number
  firstTryPoints: number
  streakPoints: number
  efficiencyBaseline: number
  efficiencyPointsPerGuess: number
  teamworkBonusPerMember: number
  teamworkBonusMax: number
}

export const DEFAULT_GROUP_SCORING_SETTINGS: GroupScoringSettings = {
  solvePoints: 10,
  firstTryPoints: 3,
  streakPoints: 2,
  efficiencyBaseline: 7,
  efficiencyPointsPerGuess: 1,
  teamworkBonusPerMember: 3,
  teamworkBonusMax: 18,
}

export function normalizeGroupScoringSettings(
  value: Partial<Record<string, unknown>> | null | undefined
): GroupScoringSettings {
  const source = value || {}

  const read = (key: string, fallback: number) => {
    const raw = source[key]
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback
  }

  return {
    solvePoints: read('solvePoints', DEFAULT_GROUP_SCORING_SETTINGS.solvePoints),
    firstTryPoints: read('firstTryPoints', DEFAULT_GROUP_SCORING_SETTINGS.firstTryPoints),
    streakPoints: read('streakPoints', DEFAULT_GROUP_SCORING_SETTINGS.streakPoints),
    efficiencyBaseline: read(
      'efficiencyBaseline',
      DEFAULT_GROUP_SCORING_SETTINGS.efficiencyBaseline
    ),
    efficiencyPointsPerGuess: read(
      'efficiencyPointsPerGuess',
      DEFAULT_GROUP_SCORING_SETTINGS.efficiencyPointsPerGuess
    ),
    teamworkBonusPerMember: read(
      'teamworkBonusPerMember',
      DEFAULT_GROUP_SCORING_SETTINGS.teamworkBonusPerMember
    ),
    teamworkBonusMax: read('teamworkBonusMax', DEFAULT_GROUP_SCORING_SETTINGS.teamworkBonusMax),
  }
}

