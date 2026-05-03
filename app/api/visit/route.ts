import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
  const path = typeof body.path === 'string' ? body.path : null
  const browserTimezone =
    typeof body.browserTimezone === 'string' ? body.browserTimezone : null
  const browserLocale =
    typeof body.browserLocale === 'string' ? body.browserLocale : null

  if (!sessionId) {
    return NextResponse.json({ error: 'Missing session id' }, { status: 400 })
  }

  const host = req.headers.get('host') || ''
  if (
    host.includes('localhost') ||
    host.includes('127.0.0.1') ||
    host.includes('0.0.0.0')
  ) {
    return NextResponse.json({ ok: true, local: true })
  }

  const geoCountry = req.headers.get('x-vercel-ip-country')
  const geoRegion = req.headers.get('x-vercel-ip-country-region')
  const geoCity = req.headers.get('x-vercel-ip-city')
  const geoTimezone = req.headers.get('x-vercel-ip-timezone')

  const { error } = await supabase.from('visits').insert({
    session_id: sessionId,
    path,
    browser_timezone: browserTimezone,
    browser_locale: browserLocale,
    geo_country: geoCountry,
    geo_region: geoRegion,
    geo_city: geoCity,
    geo_timezone: geoTimezone,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
