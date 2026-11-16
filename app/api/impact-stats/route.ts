import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getExcludedStatsSessionIds } from '@/lib/stats-exclusions'
import { impactRefreshWindow, impactRefreshWindowEnd } from '@/lib/impact-refresh'

async function buildImpactStats() {
  const excludedIds = await getExcludedStatsSessionIds()
  const { data, error } = await getSupabaseAdmin().rpc('orthodle_impact_snapshot', {
    excluded_ids: excludedIds,
  })
  if (error || !data) throw new Error(error?.message || 'Missing impact snapshot.')
  return data
}

const readSharedSnapshot = unstable_cache(
  (_windowId: number) => buildImpactStats(),
  ['impact-stats-twice-daily-v1'],
  { revalidate: 86_400 }
)

const pending = new Map<number, ReturnType<typeof readSharedSnapshot>>()

export async function GET() {
  try {
    const windowId = impactRefreshWindow()
    let snapshot = pending.get(windowId)
    if (!snapshot) {
      snapshot = readSharedSnapshot(windowId).finally(() => { pending.delete(windowId) })
      pending.set(windowId, snapshot)
    }
    const stats = await snapshot
    const secondsLeft = Math.max(0, Math.floor((impactRefreshWindowEnd(windowId) - Date.now()) / 1000))
    return NextResponse.json(stats, {
      headers: { 'Cache-Control': `public, max-age=${secondsLeft}, s-maxage=${secondsLeft}` },
    })
  } catch {
    return NextResponse.json({ error: 'Could not load impact stats.' }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    })
  }
}
