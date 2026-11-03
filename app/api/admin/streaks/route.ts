import { NextResponse } from 'next/server'
import { isAdminPassword } from '@/lib/admin-auth'
import { getStreakData } from '@/lib/streak-data'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const headers = { 'Cache-Control': 'private, no-store' }
  if (!isAdminPassword(body?.password)) return NextResponse.json({ error: 'Admin access required.' }, { status: 401, headers })
  try {
    const result = await getStreakData(body?.refresh === true)
    return NextResponse.json({ ...result, leaders: result.leaders.slice(0, 10) }, { headers })
  } catch {
    return NextResponse.json({ error: 'Could not load streaks. Please try again.' }, { status: 500, headers })
  }
}
