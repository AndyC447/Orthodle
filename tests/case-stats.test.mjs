import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const exports = {}
const source = readFileSync(new URL('../lib/case-stats.ts', import.meta.url), 'utf8')
new Function('exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(exports)

test('case stats count one-guess players and deduplicate solves by player', () => {
  const result = exports.summarizeCaseStats([
    { session_id: 'one', is_correct: false, guess_text: 'Wrong' },
    { session_id: 'two', is_correct: false, guess_text: 'Wrong' },
    { session_id: 'two', is_correct: true, guess_text: 'Right' },
    { session_id: 'two', is_correct: true, guess_text: 'Right' },
    { session_id: null, is_correct: true, guess_text: 'Right' },
  ])
  assert.equal(result.players, 2)
  assert.equal(result.solved, 1)
  assert.equal(result.solveRate, 50)
  assert.equal(result.guesses, 4)
  assert.equal(result.averageGuesses, 2)
  assert.deepEqual(result.incorrect, [['Wrong', 2]])
})

test('empty cases show zero counts without misleading percentages', () => {
  const result = exports.summarizeCaseStats([])
  assert.equal(result.players, 0)
  assert.equal(result.solveRate, null)
  assert.equal(result.averageGuesses, null)
})

test('the editor loads case stats only on opening or refreshing the panel', () => {
  const component = readFileSync(new URL('../components/AdminCaseStats.tsx', import.meta.url), 'utf8')
  assert.match(component, /const \[open, setOpen\] = useState\(false\)/)
  assert.match(component, /if \(!open\) void load\(\)/)
  assert.match(component, /onClick=\{\(\) => void load\(true\)\}/)
  assert.match(component, /key=\{caseId \|\| 'empty'\}/)
  assert.doesNotMatch(component, /useEffect|setInterval/)
  const admin = readFileSync(new URL('../app/admin/page.tsx', import.meta.url), 'utf8')
  assert.match(admin, /<AdminCaseStats\s+caseId=\{cases.find\(item => item.case_date === caseDate && item.level === level\)\?\.id\}/)
  assert.match(admin, /\[isUnlocked, overviewCaseIdsKey, overviewRefreshRevision\]/)
  assert.match(admin, /const \[showAnalytics, setShowAnalytics\] = useState\(false\)/)
})

function setup({ blockedStorage = false } = {}) {
  const saved = new Map()
  const calls = []
  const rows = new Map()
  let now = 15_000
  let fail = false
  const supabase = { from(table) {
    assert.equal(table, 'guesses')
    let caseId
    return {
      select(fields) { assert.equal(fields, 'session_id, is_correct, guess_text'); return this },
      eq(field, value) { assert.equal(field, 'case_id'); caseId = value; return this },
      order() { return this },
      async range(from, to) {
        calls.push([caseId, from, to])
        if (fail) return { data: null, error: new Error('Offline') }
        return { data: (rows.get(caseId) || []).slice(from, to + 1), error: null }
      },
    }
  } }
  function load(file, imports = {}) {
    const exports = {}
    const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText
    const window = { sessionStorage: {
      getItem(key) { if (blockedStorage) throw new Error('Blocked'); return saved.get(key) },
      setItem(key, value) { if (blockedStorage) throw new Error('Blocked'); saved.set(key, value) },
    } }
    new Function('require', 'exports', 'window', 'Date', code)(id => imports[id], exports, window, { now: () => now })
    return exports
  }
  const reload = () => load('../lib/admin-case-stats.ts', {
    './supabase': { supabase },
    './admin-dashboard': load('../lib/admin-dashboard.ts'),
    './case-stats': exports,
    './stats-exclusions': {
      fetchExcludedStatsSessionIds: async () => ['admin'],
      filterExcludedSessionRows: (rows, excluded) => rows.filter(row => !excluded.has(row.session_id)),
    },
  })
  return {
    cache: reload(), reload, calls, rows, saved,
    advance(ms) { now += ms },
    fail(value) { fail = value },
  }
}

test('overview and editor share one paginated snapshot and reopen without another download', async () => {
  const { cache, reload, rows, saved, calls } = setup()
  rows.set('case-a', Array.from({ length: 500 }, () => ({ session_id: 'player', is_correct: false, guess_text: 'A' }))
    .concat({ session_id: 'admin', is_correct: true, guess_text: 'B' }))
  const first = cache.loadAdminCaseStats('case-a')
  assert.equal(cache.loadAdminCaseStats('case-a'), first)
  const snapshot = await first
  assert.equal(snapshot.stats.guesses, 500)
  assert.equal(snapshot.stats.players, 1)
  assert.equal(snapshot.stats.solved, 0)
  assert.equal((await cache.loadAdminCaseStats('case-a')).stats.guesses, 500)
  assert.deepEqual(await reload().loadAdminCaseStats('case-a'), snapshot)
  assert.deepEqual(calls, [['case-a', 0, 499], ['case-a', 500, 999]])
  assert.doesNotMatch([...saved.values()][0], /session_id|player"/)
})

test('manual refresh bypasses the cache, expiry is lazy, and failed refreshes do not erase cached stats', async () => {
  const { cache, calls, rows, advance, fail } = setup()
  assert.equal((await cache.loadAdminCaseStats('case-a')).stats.guesses, 0)
  rows.set('case-a', [{ session_id: 'player', is_correct: true, guess_text: 'B' }])
  assert.equal((await cache.loadAdminCaseStats('case-a')).stats.guesses, 0)
  assert.equal((await cache.loadAdminCaseStats('case-a', true)).stats.guesses, 1)
  fail(true)
  await assert.rejects(cache.loadAdminCaseStats('case-a', true), /Offline/)
  assert.equal((await cache.loadAdminCaseStats('case-a')).stats.guesses, 1)
  fail(false)
  advance(12 * 60 * 60_000)
  assert.equal(calls.length, 3)
  await cache.loadAdminCaseStats('case-a')
  assert.equal(calls.length, 4)
})

test('blocked browser storage still allows in-memory reuse without mixing cases', async () => {
  const { cache, calls, rows } = setup({ blockedStorage: true })
  rows.set('case-a', [{ session_id: 'player', is_correct: true, guess_text: 'B' }])
  assert.equal((await cache.loadAdminCaseStats('case-a')).stats.guesses, 1)
  assert.equal((await cache.loadAdminCaseStats('case-b')).stats.guesses, 0)
  assert.equal((await cache.loadAdminCaseStats('case-a')).stats.guesses, 1)
  assert.equal(calls.length, 2)
})
