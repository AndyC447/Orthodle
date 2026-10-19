import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
const require = createRequire(import.meta.url)
function load(path) {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(require, module, module.exports)
  return module.exports
}
const { findSimilarCase, buildClueStats } = load('../lib/case-learning.ts')
const { ClueSolveStats } = load('../components/ClueSolveStats.tsx')
const current = { id: 'current', case_date: '2026-10-18', level: 'med_student', category: 'Hand / Trauma' }
const candidate = (id, extra = {}) => ({ ...current, id, case_date: '2026-10-01', ...extra })
const choose = (cases, guesses = [], completed = []) => findSimilarCase(cases, current, guesses, completed, '2026-10-18')

test('similar cases match category tokens and level, exclude current and unpublished cases', () => {
  const cases = [current, candidate('future', { case_date: '2027-01-01' }), candidate('today', { case_date: '2026-10-18' }), candidate('wrong-level', { level: 'resident' }), candidate('wrong-topic', { category: 'Shoulder' }), candidate('match', { category: ' hand ' })]
  assert.equal(choose(cases).id, 'match')
  assert.equal(choose(cases.slice(0, -1)), null)
  assert.equal(findSimilarCase(cases, { ...current, category: null }, [], [], '2026-10-18'), null)
})
test('recommendations exclude completed, solved, exhausted and prefer fresh practice', () => {
  const cases = ['solved', 'exhausted', 'local', 'partial', 'fresh'].map(id => candidate(id, id === 'local' ? { case_date: '2026-09-30' } : {}))
  const guesses = [{ case_id: 'solved', is_correct: true }, ...Array.from({ length: 6 }, () => ({ case_id: 'exhausted', is_correct: false })), { case_id: 'partial', is_correct: false }]
  assert.equal(choose(cases, guesses, ['2026-09-30:med_student:daily']).id, 'fresh')
  assert.equal(choose(cases.slice(0, -1), guesses, ['2026-09-30:med_student:archive']).id, 'partial')
  const anatomy = candidate('anatomy', { level: 'attending' })
  assert.equal(findSimilarCase([anatomy], { ...current, level: 'attending' }, [{ case_id: 'anatomy', is_correct: false }], [], '2026-10-18'), null)
})
function round(session, results, caseId = 'case') {
  return results.map((is_correct, i) => ({ id: `${session}-${i}`, session_id: session, case_id: caseId, is_correct, created_at: `2026-10-01T12:00:0${i}Z` }))
}
test('clue stats count first solves, unfinished, exhausted and ignore replays and duplicates', () => {
  const first = round('one', [true, false, true])
  const guesses = [...first, ...round('three', [false, false, true]), ...round('six', [false, false, false, false, false, true]), ...round('unfinished', [false, false]), ...round('exhausted', [false, false, false, false, false, false, true]), first[0], ...round('other', [true], 'other')].reverse()
  const stats = buildClueStats(guesses)
  assert.deepEqual(stats.case, { players: 5, solves: [1, 0, 1, 0, 0, 1], reached: [5, 4, 3, 2, 2, 2], exhausted: 1, unfinished: 1 })
  assert.equal(stats.other.players, 1)
  assert.deepEqual(buildClueStats([]), {})
})
test('stats UI renders all six clues, totals and explicit empty state', () => {
  const cases = [{ ...candidate('case'), answer: 'Example' }]
  const html = renderToStaticMarkup(React.createElement(ClueSolveStats, { cases, stats: buildClueStats(round('player', [false, true])) }))
  assert.ok(html.includes('Clue-by-clue solves'))
  assert.ok(html.includes('1 players'))
  assert.ok(html.includes('100%'))
  assert.equal((html.match(/<tr/g) || []).length, 7)
  const empty = renderToStaticMarkup(React.createElement(ClueSolveStats, { cases, stats: {} }))
  assert.ok(empty.includes('No recorded guesses'))
})
