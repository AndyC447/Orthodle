import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

function loadTypeScript(file, require = () => { throw new Error('Unexpected import') }) {
  const compiled = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const exports = {}
  vm.runInNewContext(compiled, { exports, require })
  return exports
}
const { fetchAdminPages } = loadTypeScript('../lib/admin-dashboard.ts')

test('schedule loading includes today even with more than 200 future cases and over 1000 total rows', async () => {
  const records = Array.from({ length: 1251 }, (_, id) => ({ id, date: id === 900 ? '2026-10-02' : '2026-12-01' }))
  const calls = []
  const rows = await fetchAdminPages(async (from, to) => {
    calls.push([from, to])
    return { data: records.slice(from, to + 1), error: null }
  })
  assert.equal(rows.length, 1251)
  assert.equal(rows.find(row => row.date === '2026-10-02')?.id, 900)
  assert.deepEqual(calls, [[0, 499], [500, 999], [1000, 1499]])
})

test('failed later pages reject the schedule rather than presenting partial results', async () => {
  const error = new Error('Request failed')
  await assert.rejects(fetchAdminPages(async from => from === 0
    ? { data: Array(500).fill({ id: 'case' }), error: null }
    : { data: null, error }), /Request failed/)
})

test('an empty schedule completes without another page request', async () => {
  let requests = 0
  const rows = await fetchAdminPages(async () => { requests++; return { data: [], error: null } })
  assert.equal(rows.length, 0)
  assert.equal(requests, 1)
})

test('today updates after midnight, on refocus, and when a sleeping tab becomes visible', () => {
  let date = '2026-10-01'
  let state
  let effect
  let tick
  let cleared = false
  const listeners = new Map()
  const react = {
    useState: init => { state = init(); return [state, value => { state = value }] },
    useEffect: callback => { effect = callback },
  }
  const source = ts.transpileModule(readFileSync(new URL('../hooks/useLocalToday.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText
  const exports = {}
  const target = {
    addEventListener: (key, fn) => listeners.set(key, fn),
    removeEventListener: (key, fn) => { assert.equal(listeners.get(key), fn); listeners.delete(key) },
  }
  vm.runInNewContext(source, {
    exports,
    require: name => name === 'react' ? react : { todayISO: () => date },
    window: { ...target, setInterval: fn => { tick = fn; return 1 }, clearInterval: () => { cleared = true } },
    document: target,
  })
  assert.equal(exports.useLocalToday(), '2026-10-01')
  const cleanup = effect()
  date = '2026-10-02'; tick(); assert.equal(state, date)
  date = '2026-10-03'; listeners.get('focus')(); assert.equal(state, date)
  date = '2026-10-04'; listeners.get('visibilitychange')(); assert.equal(state, date)
  cleanup()
  assert.equal(listeners.size, 0)
  assert.equal(cleared, true)
})
