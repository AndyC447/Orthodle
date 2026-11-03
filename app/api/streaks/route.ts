import { NextResponse } from 'next/server'
import { getStreakData } from '@/lib/streak-data'
import { personalStreakRewards } from '@/lib/streak-rewards'
import { getStreakThankYou } from '@/lib/streak-thank-you'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const headers = { 'Cache-Control': 'private, no-store' }
  if (typeof body?.sessionId !== 'string' || !body.sessionId.trim() || body.sessionId.length > 128) {
    return NextResponse.json({ error: 'Invalid player.' }, { status: 400, headers })
  }
  const sessionId = body.sessionId.trim()
  const thankYou = getStreakThankYou(sessionId)
  try {
    const result = await getStreakData()
    return NextResponse.json({
      ...personalStreakRewards(result.leaders, sessionId),
      ...(thankYou ? { thankYou } : {}),
    }, { headers })
  } catch {
    // The fixed thank-you campaign does not depend on a live leaderboard refresh.
    if (thankYou) return NextResponse.json({ thankYou }, { headers })
    return NextResponse.json({ error: 'Streak ranking temporarily unavailable.' }, { status: 503, headers })
  }
}
