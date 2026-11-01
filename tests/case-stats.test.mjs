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

test('builder stats load the selected saved case with pagination and stale-request protection', () => {
  const component = readFileSync(new URL('../components/AdminCaseStats.tsx', import.meta.url), 'utf8')
  assert.match(component, /fetchAdminPages<CaseGuess>/)
  assert.match(component, /\.eq\('case_id', caseId\)/)
  assert.match(component, /filterExcludedSessionRows\(rows, excluded\)/)
  assert.match(component, /key=\{caseId \|\| 'empty'\}/)
  assert.match(component, /cancelled = true/)
  const admin = readFileSync(new URL('../app/admin/page.tsx', import.meta.url), 'utf8')
  assert.match(admin, /<AdminCaseStats caseId=\{cases.find\(item => item.case_date === caseDate && item.level === level\)\?\.id\}/)
})
