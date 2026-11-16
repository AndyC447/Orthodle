import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

function load(file, require = () => { throw new Error('Unexpected import') }, clock = Date) {
  const exports = {}
  const compiled = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  vm.runInNewContext(compiled, { exports, require, Intl, Date: clock })
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

function impactRoute(rpc, now = Date.now) {
  const clock = { now }
  const windows = load('../lib/impact-refresh.ts', undefined, clock)
  const shared = new Map()
  return load('../app/api/impact-stats/route.ts', name => ({
    'next/cache': { unstable_cache: (fn, _key, options) => {
      assert.ok(options.revalidate >= 12 * 60 * 60)
      return windowId => {
        if (!shared.has(windowId)) {
          shared.set(windowId, fn(windowId).catch(error => {
            shared.delete(windowId)
            throw error
          }))
        }
        return shared.get(windowId)
      }
    } },
    'next/server': { NextResponse: { json: (body, options) => ({ body, options }) } },
    '@/lib/supabase-admin': { getSupabaseAdmin: () => ({ rpc, from: () => assert.fail('Unexpected raw table access') }) },
    '@/lib/stats-exclusions': { getExcludedStatsSessionIds: async () => ['user-0'] },
    '@/lib/impact-refresh': windows,
  }[name]), clock)
}

test('the public snapshot shares one aggregate request and applies exclusions', async () => {
  let reads = 0
  const summary = { uniqueUsers: 1001, combinedDailyUsers: 1002, usersReached: 1002 }
  const route = impactRoute(async (name, args) => {
    reads++
    assert.equal(name, 'orthodle_impact_snapshot')
    assert.deepEqual(args.excluded_ids, ['user-0'])
    return { data: summary }
  })
  const results = await Promise.all([route.GET(), route.GET(), route.GET()])
  assert.equal(reads, 1)
  for (const result of results) {
    assert.equal(result.body, summary)
    assert.match(result.options.headers['Cache-Control'], /^public,/)
  }
})

test('an unavailable aggregate never falls back to downloading raw rows', async () => {
  const route = impactRoute(async () => ({ error: { code: 'PGRST202' } }))
  const result = await route.GET()
  assert.equal(result.options.status, 503)
  assert.equal(result.options.headers['Cache-Control'], 'no-store')
})

test('ERAS computes once per half-day and browser caches expire at the next refresh window', async () => {
  let now = Date.parse('2026-11-14T00:01:00Z')
  let reads = 0
  const route = impactRoute(async () => ({ data: { totalGuesses: ++reads } }), () => now)
  const first = await route.GET()
  assert.equal(first.body.totalGuesses, 1)
  assert.equal(first.options.headers['Cache-Control'], 'public, max-age=43140, s-maxage=43140')
  now = Date.parse('2026-11-14T11:59:30Z')
  const endOfWindow = await route.GET()
  assert.equal(endOfWindow.body.totalGuesses, 1)
  assert.equal(endOfWindow.options.headers['Cache-Control'], 'public, max-age=30, s-maxage=30')
  now = Date.parse('2026-11-14T12:00:00Z')
  assert.equal((await route.GET()).body.totalGuesses, 2)
  now = Date.parse('2026-11-14T23:59:59Z')
  assert.equal((await route.GET()).body.totalGuesses, 2)
  now = Date.parse('2026-11-15T00:00:00Z')
  assert.equal((await route.GET()).body.totalGuesses, 3)
})
test('archive plays use the submission day and deduplicate browser/case pairs', () => {
  const guess = (session_id, case_id, case_date, created_at) => ({ session_id, case_id, cases: { case_date }, created_at })
  const daily = guess('a', 'one', '2026-05-01', '2026-05-01T18:00:00Z')
  assert.equal(audience.isArchiveGuess(daily), false)
  assert.equal(audience.countArchivePlays([
    daily,
    guess('a', 'one', '2026-05-01', '2026-05-02T18:00:00Z'),
    guess('a', 'one', '2026-05-01', '2026-05-03T18:00:00Z'),
    guess('b', 'one', '2026-05-01', '2026-05-02T18:00:00Z'),
    guess('a', 'two', '2026-05-01', '2026-05-02T18:00:00Z'),
    guess('a', 'future', '2026-06-01', '2026-05-02T18:00:00Z'),
    guess(null, 'two', '2026-05-01', '2026-05-02T18:00:00Z'),
  ]), 3)
})

test('archive classification respects Pacific midnight and missing data', () => {
  const base = { session_id: 'a', case_id: 'one', cases: [{ case_date: '2026-10-02' }] }
  assert.equal(audience.isArchiveGuess({ ...base, created_at: '2026-10-03T06:59:00Z' }), false)
  assert.equal(audience.isArchiveGuess({ ...base, created_at: '2026-10-03T07:00:00Z' }), true)
  assert.equal(audience.isArchiveGuess({ ...base, created_at: 'invalid' }), false)
  assert.equal(audience.isArchiveGuess({ ...base, cases: null, created_at: '2026-10-03T07:00:00Z' }), false)
})
