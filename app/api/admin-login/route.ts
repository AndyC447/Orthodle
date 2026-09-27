import { NextResponse } from 'next/server'
import { isAdminPassword } from '@/lib/admin-auth'

export async function POST(req: Request) {
  const { password } = await req.json()

  if (isAdminPassword(password)) return NextResponse.json({ ok: true })
  return NextResponse.json({ ok: false }, { status: 401 })
}
