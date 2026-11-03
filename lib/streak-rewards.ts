export type PlayerStreakRewards = {
  current: number
  longest: number
  topRank: number | null
}

const wholeDays = (days: number) => Number.isFinite(days) ? Math.max(0, Math.floor(days)) : 0

export function streakMilestone(days: number) {
  return Math.floor(wholeDays(days) / 5) * 5
}

export function earnedStreakMilestones(longest: number) {
  return Array.from({ length: streakMilestone(longest) / 5 }, (_, i) => (i + 1) * 5)
}

export function personalStreakRewards(
  leaders: Array<{ sessionId: string; current: number; longest: number }>, sessionId: string
): PlayerStreakRewards {
  const index = leaders.findIndex(player => player.sessionId === sessionId)
  const player = leaders[index]
  // Only the requesting player's numbers leave the server, never leaderboard identities.
  return { current: player?.current || 0, longest: player?.longest || 0, topRank: index >= 0 && index < 3 ? index + 1 : null }
}
