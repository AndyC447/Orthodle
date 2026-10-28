import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json({ error: 'GPT Draft has been retired. Use the case builder in Admin.' }, { status: 410 })
}
