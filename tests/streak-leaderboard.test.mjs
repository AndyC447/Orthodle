import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

function load(path, imports = {}) {
  const exports = {}
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  new Function('require', 'exports', code)(name => imports[name], exports)
  return exports
}
const audience = load('../lib/audience-stats.ts')
const publication = load('../lib/archive-publication.ts')
const streaks = load('../lib/streak-leaderboard.ts', { './audience-stats': audience, './archive-publication': publication })
const settings = { no_resident_mode: true, no_resident_mode_start_date: '2026-05-17', no_anatomy_mode: true, no_anatomy_mode_start_date: '2026-06-15' }
const item = (date, level = 'med_student', id = date) => ({ id, case_date: date, level })
const guess = (session, date, extras = {}) => ({ session_id: session, case_id: date, created_at: `${date}T20:00:00Z`, is_correct: true, ...extras })
const build = (guesses, cases, accounts = [], names = [], excluded = new Set()) => streaks.buildStreakLeaderboard(guesses, cases, accounts, names, excluded, settings, '2026-11-03')

test('multiple solves on one day count once, and archives, wrong answers, and retired slots do not count', () => {
  const cases = [item('2026-10-31'), item('2026-11-01'), item('2026-11-02'), item('2026-11-02', 'resident', 'retired'), item('2026-11-03')]
  const result = build([
    guess('a', '2026-10-31'), guess('a', '2026-10-31'), guess('a', '2026-11-01'), guess('a', '2026-11-02'),
    guess('a', '2026-11-03', { is_correct: false }),
    guess('archive-only', '2026-10-31', { created_at: '2026-11-01T20:00:00Z' }),
    guess('retired-only', '2026-11-02', { case_id: 'retired' }),
    guess(null, '2026-11-02'),
  ], cases)
  assert.equal(result.trackedPlayers, 1)
  assert.equal(result.longestStreak, 3)
  assert.equal(result.leaders[0].current, 3)
})

test('Pacific midnight and daylight saving fallback preserve consecutive calendar days', () => {
  const cases = ['2026-10-31', '2026-11-01', '2026-11-02'].map(date => item(date))
  const result = build([
    guess('a', '2026-10-31', { created_at: '2026-11-01T06:59:00Z' }),
    guess('a', '2026-11-01', { created_at: '2026-11-01T08:30:00Z' }),
    guess('a', '2026-11-01', { created_at: '2026-11-01T09:30:00Z' }),
    guess('a', '2026-11-02', { created_at: '2026-11-03T07:59:00Z' }),
  ], cases)
  assert.equal(result.longestStreak, 3)
  assert.deepEqual([result.leaders[0].bestStart, result.leaders[0].bestEnd], ['2026-10-31', '2026-11-02'])
})

test('a broken streak retains its historical best while current streak expires after a missed day', () => {
  const dates = ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04', '2026-10-31', '2026-11-01']
  const result = build(dates.map(date => guess('a', date)), dates.map(date => item(date)))
  assert.equal(result.leaders[0].longest, 4)
  assert.equal(result.leaders[0].current, 0)
  assert.equal(result.leaders[0].bestStart, '2026-08-01')
})

test('accounts and group names identify players; excluded admin accounts never enter the ranking', () => {
  const result = build(['account', 'group', 'browser-12345678', 'admin'].map(id => guess(id, '2026-11-03')), [item('2026-11-03')],
    [{ id: 'account', username: 'learner', display_name: 'Learner Name' }], [{ session_id: 'group', display_name: 'Group Player' }], new Set(['admin']))
  assert.equal(result.trackedPlayers, 3)
  assert.equal(result.leaders.find(row => row.sessionId === 'account').name, 'Learner Name')
  assert.equal(result.leaders.find(row => row.sessionId === 'group').name, 'Group Player')
  assert.equal(result.leaders.find(row => row.sessionId === 'browser-12345678').name, 'Anonymous · 12345678')
})

test('leaderboard is limited to ten unique players and ties are deterministic', () => {
  const guesses = Array.from({ length: 12 }, (_, i) => guess(`player-${String(i).padStart(2, '0')}`, '2026-11-03'))
  const result = build([...guesses].reverse(), [item('2026-11-03')])
  assert.equal(result.trackedPlayers, 12)
  assert.equal(result.leaders.length, 10)
  assert.equal(result.leaders[0].sessionId, 'player-00')
  assert.equal(result.leaders.at(-1).sessionId, 'player-09')
})

test('historical bonus solves qualify before retirement, and all daily-slot quiz types qualify', () => {
  const cases = [item('2026-05-15', 'attending'), item('2026-05-16', 'resident'), item('2026-05-17')]
  const result = build(cases.map(row => guess('a', row.case_date)), cases)
  assert.equal(result.longestStreak, 3)
})

function routeHarness() {
  let reads = 0
  const day = audience.analyticsDateISO(new Date().toISOString())
  const rows = { guesses: [guess('player', day)], cases: [item(day)], user_accounts: [{ id: 'player', username: 'learner', display_name: null }], group_members: [] }
  const db = { from(table) {
    reads++
    return { select() { return this }, eq() { return this }, gte() { return this }, lte() { return this }, order() { return this },
      range: async (from, to) => ({ data: rows[table].slice(from, to + 1), error: null }),
      maybeSingle: async () => ({ data: settings, error: null }),
    }
  } }
  const data = load('../lib/streak-data.ts', {
    'server-only': {},
    './supabase-admin': { getSupabaseAdmin: () => db },
    './admin-dashboard': load('../lib/admin-dashboard.ts'),
    './stats-exclusions': { getExcludedStatsSessionIds: async () => [] },
    './audience-stats': audience,
    './streak-leaderboard': streaks,
  })
  const route = load('../app/api/admin/streaks/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => new Response(JSON.stringify(body), init) } },
    '@/lib/admin-auth': { isAdminPassword: value => value === 'test-password' },
    '@/lib/streak-data': data,
  })
  const request = body => new Request('https://orthodle.com/api/admin/streaks', { method: 'POST', body: JSON.stringify(body) })
  return { route, request, data, rows, get reads() { return reads } }
}

test('private endpoint checks admin credentials before database access and before returning cached results', async () => {
  const h = routeHarness()
  assert.equal((await h.route.POST(h.request({}))).status, 401)
  assert.equal(h.reads, 0)
  const response = await h.route.POST(h.request({ password: 'test-password' }))
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  assert.equal((await response.json()).leaders[0].name, 'learner')
  const reads = h.reads
  assert.equal((await h.route.POST(h.request({ password: 'wrong' }))).status, 401)
  assert.equal(h.reads, reads)
  await h.route.POST(h.request({ password: 'test-password' }))
  assert.equal(h.reads, reads)
  await h.route.POST(h.request({ password: 'test-password', refresh: true }))
  assert.ok(h.reads > reads)
})

test('all player streaks remain available internally while the admin endpoint still limits its response to ten', async () => {
  const h = routeHarness()
  const day = audience.analyticsDateISO(new Date().toISOString())
  h.rows.guesses = Array.from({ length: 12 }, (_, i) => guess(`player-${i}`, day))
  assert.equal((await h.data.getStreakData()).leaders.length, 12)
  const response = await h.route.POST(h.request({ password: 'test-password' }))
  assert.equal((await response.json()).leaders.length, 10)
})

test('a newly saved solve invalidates the shared cache and concurrent readers reuse one reload', async () => {
  const h = routeHarness()
  await h.data.getStreakData()
  const reads = h.reads
  const day = audience.analyticsDateISO(new Date().toISOString())
  h.rows.guesses.push(guess('new-player', day))
  h.data.invalidateStreakData()
  const [one, two] = await Promise.all([h.data.getStreakData(), h.data.getStreakData()])
  assert.equal(one.trackedPlayers, 2)
  assert.equal(one, two)
  assert.equal(h.reads, reads * 2)
})
