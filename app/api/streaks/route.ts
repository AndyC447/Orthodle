import { NextResponse } from 'next/server'
import { getStreakData } from '@/lib/streak-data'
import { personalStreakRewards } from '@/lib/streak-rewards'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const headers = { 'Cache-Control': 'private, no-store' }
  if (typeof body?.sessionId !== 'string' || !body.sessionId.trim() || body.sessionId.length > 128) {
    return NextResponse.json({ error: 'Invalid player.' }, { status: 400, headers })
  }
  try {
    const result = await getStreakData()
    return NextResponse.json(personalStreakRewards(result.leaders, body.sessionId.trim()), { headers })
  } catch {
    return NextResponse.json({ error: 'Streak ranking temporarily unavailable.' }, { status: 503, headers })
  }
}
