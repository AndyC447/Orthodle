import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const { password } = await req.json()
  const adminPassword = process.env.ADMIN_PASSWORD || 'Pibbles'

  if (password === adminPassword) return NextResponse.json({ ok: true })
  return NextResponse.json({ ok: false }, { status: 401 })
}
