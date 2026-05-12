import { NextResponse } from 'next/server'
import { getExcludedStatsSessionIds } from '@/lib/stats-exclusions'

export async function GET() {
  try {
    const excludedSessionIds = await getExcludedStatsSessionIds()
    return NextResponse.json({ excludedSessionIds })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Could not load the excluded stats accounts.'

    return NextResponse.json({ error: message, excludedSessionIds: [] }, { status: 500 })
  }
}
