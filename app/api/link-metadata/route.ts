import { NextRequest, NextResponse } from 'next/server'

type LinkMetadata = {
  title: string | null
  siteName: string | null
  author: string | null
  creditLine: string | null
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .trim()
}

function stripTags(value: string) {
  return decodeHtmlEntities(value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim())
}

function extractMetaContent(html: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) {
      return stripTags(match[1])
    }
  }

  return null
}

function toTitleCase(value: string) {
  return value
    .split(/[\s-]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

function formatSiteName(hostname: string) {
  const host = hostname.replace(/^www\./i, '')
  const mapped: Record<string, string> = {
    'orthobullets.com': 'Orthobullets',
    'aofoundation.org': 'AO Surgery Reference',
    'radiopaedia.org': 'Radiopaedia',
    'pubmed.ncbi.nlm.nih.gov': 'PubMed',
    'ncbi.nlm.nih.gov': 'NCBI',
  }

  if (mapped[host]) return mapped[host]

  const parts = host.split('.')
  if (parts.length === 0) return host
  return toTitleCase(parts[0] || host)
}

function buildCreditLine(author: string | null, siteName: string | null) {
  if (author && siteName && author.toLowerCase() !== siteName.toLowerCase()) {
    return `Credit: ${author}, ${siteName}`
  }
  if (author) return `Credit: ${author}`
  if (siteName) return `Credit: ${siteName}`
  return null
}

function extractJsonLdAuthor(html: string) {
  const scriptMatches = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]

  for (const match of scriptMatches) {
    const raw = match[1]?.trim()
    if (!raw) continue

    try {
      const parsed = JSON.parse(raw)
      const queue = Array.isArray(parsed) ? [...parsed] : [parsed]

      while (queue.length > 0) {
        const item = queue.shift()
        if (!item || typeof item !== 'object') continue

        if (Array.isArray(item)) {
          queue.push(...item)
          continue
        }

        if ('@graph' in item && Array.isArray((item as Record<string, unknown>)['@graph'])) {
          queue.push(...(((item as Record<string, unknown>)['@graph'] as unknown[]) || []))
        }

        const author = (item as Record<string, unknown>).author
        if (typeof author === 'string' && author.trim()) {
          return author.trim()
        }
        if (author && typeof author === 'object' && !Array.isArray(author)) {
          const name = (author as Record<string, unknown>).name
          if (typeof name === 'string' && name.trim()) {
            return name.trim()
          }
        }
      }
    } catch {
      continue
    }
  }

  return null
}

function parseMetadata(html: string, url: string): LinkMetadata {
  const title =
    extractMetaContent(html, [
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
      /<title>([\s\S]*?)<\/title>/i,
    ]) || null

  const siteName =
    extractMetaContent(html, [
      /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+name=["']application-name["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+name=["']publisher["'][^>]+content=["']([^"']+)["']/i,
    ]) || formatSiteName(new URL(url).hostname)

  const author =
    extractMetaContent(html, [
      /<meta[^>]+name=["']author["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+property=["']article:author["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+name=["']citation_author["'][^>]+content=["']([^"']+)["']/i,
    ]) ||
    extractJsonLdAuthor(html)

  return {
    title,
    siteName,
    author,
    creditLine: buildCreditLine(author, siteName),
  }
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url')?.trim()

  if (!url || !/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: 'A valid http or https URL is required.' }, { status: 400 })
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 8000)

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'user-agent':
          'Mozilla/5.0 (compatible; OrthodleBot/1.0; +https://orthodle.com)',
        accept: 'text/html,application/xhtml+xml',
      },
      cache: 'no-store',
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      return NextResponse.json({ error: 'Could not load metadata for that link.' }, { status: 502 })
    }

    const html = await response.text()
    const metadata = parseMetadata(html, url)
    return NextResponse.json(metadata)
  } catch {
    return NextResponse.json({ error: 'Could not load metadata for that link.' }, { status: 502 })
  }
}
