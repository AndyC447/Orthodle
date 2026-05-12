import { getSupabaseAdmin } from '@/lib/supabase-admin'

const EXCLUDED_STATS_USERNAMES = ['andycon447']

let cachedExcludedSessionIdsPromise: Promise<string[]> | null = null

export function isExcludedStatsSessionId(
  sessionId: string | null | undefined,
  excludedSessionIds: ReadonlySet<string>
) {
  return Boolean(sessionId && excludedSessionIds.has(sessionId))
}

export function filterExcludedSessionRows<T extends { session_id: string | null | undefined }>(
  rows: T[] | null | undefined,
  excludedSessionIds: ReadonlySet<string>
) {
  return (rows || []).filter(row => !isExcludedStatsSessionId(row.session_id, excludedSessionIds))
}

export async function getExcludedStatsSessionIds() {
  if (EXCLUDED_STATS_USERNAMES.length === 0) return []

  const supabaseAdmin = getSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('user_accounts')
    .select('id')
    .in('username_normalized', EXCLUDED_STATS_USERNAMES)

  if (error) {
    throw new Error(error.message || 'Could not load the excluded stats accounts.')
  }

  return Array.from(
    new Set(
      (data || [])
        .map(row => (typeof row.id === 'string' ? row.id.trim() : ''))
        .filter(Boolean)
    )
  )
}

export async function fetchExcludedStatsSessionIds() {
  if (typeof window === 'undefined') return []

  if (!cachedExcludedSessionIdsPromise) {
    cachedExcludedSessionIdsPromise = fetch('/api/stats-exclusions', {
      method: 'GET',
      cache: 'no-store',
    })
      .then(async response => {
        if (!response.ok) return []
        const payload = (await response.json()) as { excludedSessionIds?: string[] }
        return Array.isArray(payload.excludedSessionIds)
          ? payload.excludedSessionIds.filter(value => typeof value === 'string' && value.trim())
          : []
      })
      .catch(() => [])
  }

  return cachedExcludedSessionIdsPromise
}
