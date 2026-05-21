import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const CANONICAL_VISIT_HOSTS = new Set(['orthodle.com', 'www.orthodle.com'])

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
  const path = typeof body.path === 'string' ? body.path : null
  const browserTimezone =
    typeof body.browserTimezone === 'string' ? body.browserTimezone : null
  const browserLocale =
    typeof body.browserLocale === 'string' ? body.browserLocale : null
  const browserTheme =
    body.browserTheme === 'dark' || body.browserTheme === 'light'
      ? body.browserTheme
      : null
  const doNotTrack = body.doNotTrack === true
  const isPreview = body.preview === true

  if (!sessionId) {
    return NextResponse.json({ error: 'Missing session id' }, { status: 400 })
  }

  const rawHost = req.headers.get('host') || ''
  const host = rawHost.split(':')[0].toLowerCase()
  const userAgent = (req.headers.get('user-agent') || '').toLowerCase()
  const secChUa = (req.headers.get('sec-ch-ua') || '').toLowerCase()
  const isAutomationTraffic =
    userAgent.includes('headless') ||
    userAgent.includes('playwright') ||
    userAgent.includes('puppeteer') ||
    userAgent.includes('phantomjs') ||
    userAgent.includes('cypress') ||
    userAgent.includes('openai') ||
    userAgent.includes('codex') ||
    secChUa.includes('headless')
  if (
    !CANONICAL_VISIT_HOSTS.has(host) ||
    doNotTrack ||
    isPreview ||
    isAutomationTraffic
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
    browser_theme: browserTheme,
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
