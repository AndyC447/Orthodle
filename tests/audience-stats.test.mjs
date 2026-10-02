import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

function load(file, require = () => { throw new Error('Unexpected import') }) {
  const exports = {}
  const compiled = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  vm.runInNewContext(compiled, { exports, require, Intl, Date })
  return exports
}
const audience = load('../lib/audience-stats.ts')
const row = (session_id, created_at) => ({ session_id, created_at })

test('counts a browser once per day across visits and guesses, with repeat days contributing to the higher total', () => {
  const result = audience.calculateAudienceStats([
    row('a', '2026-10-01T15:00:00Z'), row('a', '2026-10-01T16:00:00Z'),
    row('b', '2026-10-01T17:00:00Z'), row('a', '2026-10-02T15:00:00Z'),
  ])
  assert.equal(result.uniqueUsers, 2)
  assert.equal(result.combinedDailyUsers, 3)
})

test('UTC midnight does not split a Pacific reporting day', () => {
  const result = audience.calculateAudienceStats([
    row('a', '2026-10-01T23:59:00Z'), row('a', '2026-10-02T00:01:00Z'),
  ])
  assert.equal(result.combinedDailyUsers, 1)
})

test('Pacific midnight starts a new reporting day even within the same UTC date', () => {
  const result = audience.calculateAudienceStats([
    row('a', '2026-10-02T06:59:00Z'), row('a', '2026-10-02T07:01:00Z'),
  ])
  assert.equal(result.combinedDailyUsers, 2)
})

test('daylight saving fallback counts the repeated hour only once', () => {
  assert.equal(audience.analyticsDateISO('2026-11-01T08:30:00Z'), '2026-11-01')
  assert.equal(audience.analyticsDateISO('2026-11-01T09:30:00Z'), '2026-11-01')
  assert.equal(audience.calculateAudienceStats([
    row('a', '2026-11-01T08:30:00Z'), row('a', '2026-11-01T09:30:00Z'),
  ]).combinedDailyUsers, 1)
})

test('excluded accounts and invalid records do not inflate either count', () => {
  const result = audience.calculateAudienceStats([
    row('admin', '2026-10-01T15:00:00Z'), row('a', '2026-10-01T15:00:00Z'),
    row(null, '2026-10-01T15:00:00Z'), row('b', 'invalid'),
  ], new Set(['admin']))
  assert.equal(result.uniqueUsers, 1)
  assert.equal(result.combinedDailyUsers, 1)
  assert.equal(audience.calculateAudienceStats([]).combinedDailyUsers, 0)
})

test('public snapshot includes all pages and applies the same exclusions as admin', async () => {
  const visits = Array.from({ length: 1002 }, (_, i) => ({
    ...row(`user-${i}`, '2026-10-01T15:00:00Z'), geo_country: 'US', geo_city: 'Los Angeles',
  }))
  const guesses = [
    {...row('user-1', '2026-10-02T15:00:00Z'), cases: { case_date: '2026-09-30' }},
    {...row('user-1', '2026-10-02T16:00:00Z'), cases: { case_date: '2026-09-30' }},
  ]
  const pages = []
  const supabase = {
    from(table) {
      return {
        select(_fields, options) {
          if (options?.head) return Promise.resolve({ count: 250, error: null })
          return {
            order(column) {
              assert.equal(column, 'id')
              return { async range(from, to) {
                pages.push([table, from, to])
                return { data: (table === 'visits' ? visits : guesses).slice(from, to + 1), error: null }
              } }
            },
          }
        },
      }
    },
  }
  const route = load('../app/api/impact-stats/route.ts', name => ({
    'next/server': { NextResponse: { json: (body, options) => ({ body, options }) } },
    '@/lib/supabase': { supabase },
    '@/lib/audience-stats': audience,
    '@/lib/stats-exclusions': {
      getExcludedStatsSessionIds: async () => ['user-0'],
      filterExcludedSessionRows: (rows, excluded) => rows.filter(row => !excluded.has(row.session_id)),
    },
  }[name]))
  const result = await route.GET()
  assert.equal(result.body.uniqueUsers, 1001)
  assert.equal(result.body.combinedDailyUsers, 1002)
  assert.equal(result.body.usersReached, result.body.combinedDailyUsers)
  assert.equal(result.options.headers['Cache-Control'], 'no-store')
  assert.ok(pages.some(([table, from]) => table === 'visits' && from === 1000))
  const requests = pages.length
  const cached = await route.GET()
  assert.equal(cached.body.combinedDailyUsers, result.body.combinedDailyUsers)
  assert.equal(pages.length, requests)
})
