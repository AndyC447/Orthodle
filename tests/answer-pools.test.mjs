import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

function load(file, imports = {}) {
  const exports = {}
  const compiled = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  new Function('require', 'exports', compiled)(id => imports[id], exports)
  return exports
}
const types = load('../lib/question-type.ts')
const utils = {
  normalizeAnswer: value => value.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().replace(/\s+/g, ' '),
  ORTHO_DIAGNOSIS_BANK: ['Posterior interosseous nerve syndrome'],
  readHiddenDiagnosisAnswers: () => new Set(['hidden diagnosis']),
}
const quiz = load('../lib/anatomy-quiz.ts', { './question-type': types, '@/lib/utils': utils })
const pools = load('../lib/answer-suggestions.ts', { './anatomy-quiz': quiz, '@/lib/utils': utils })
const record = (answer, type, level = 'med_student') => ({ answer, level, synonyms: types.withQuestionType([], type) })
const cases = [
  record('Posterior interosseous nerve', 'anatomy'),
  record('Posterior interosseous nerve', 'anatomy'),
  record('Posterior interosseous nerve syndrome', 'diagnosis'),
  record('Schatzker type II', 'classification'),
]
const custom = cases.map(item => ({ label: item.answer }))

test('diagnosis suggestions exclude quiz-only custom answers without conflating nerves and syndromes', () => {
  const suggestions = pools.buildAnswerSuggestions('posterior', custom, cases)
  assert.deepEqual(suggestions.map(item => item.label), ['Posterior interosseous nerve syndrome'])
  assert.equal(suggestions[0].count, 1)
  assert.ok(!pools.getAnswerPool(custom, cases).includes('Schatzker type II'))
})

test('switching type selects separate pools and counts despite sharing the daily slot', () => {
  const anatomy = pools.buildAnswerSuggestions('posterior', custom, cases, undefined, undefined, 'anatomy')
  assert.deepEqual(anatomy.map(item => item.label), ['Posterior interosseous nerve'])
  assert.equal(anatomy[0].count, 2)
  assert.deepEqual(pools.getAnswerPool(custom, cases, 'classification'), ['Schatzker type II'])
  assert.deepEqual(pools.buildAnswerSuggestions('posterior', custom, cases, undefined, undefined, 'classification'), [])
  assert.deepEqual(pools.getAnswerPool(custom, [], 'anatomy'), [])
})

test('a legitimate diagnosis used in two question types stays available in both', () => {
  const shared = [...cases, record('Shared answer', 'diagnosis'), record('Shared answer', 'classification')]
  for (const type of ['diagnosis', 'classification']) {
    const suggestion = pools.buildAnswerSuggestions('Shared', [], shared, undefined, undefined, type)[0]
    assert.equal(suggestion.label, 'Shared answer')
    assert.equal(suggestion.count, 1)
  }
})

test('older anatomy cases are classified using their choices, and explicit metadata takes precedence', () => {
  const legacy = { answer: 'Ulnar nerve', level: 'attending', clue_1: 'Ulnar nerve', clue_2: 'Median nerve' }
  assert.deepEqual(pools.getAnswerPool([], [legacy], 'anatomy'), ['Ulnar nerve'])
  assert.ok(!pools.getAnswerPool([], [legacy], 'diagnosis').includes('Ulnar nerve'))
  assert.deepEqual(pools.getAnswerPool([], [{ ...legacy, synonyms: types.withQuestionType([], 'classification') }], 'classification'), ['Ulnar nerve'])
  assert.ok(pools.getAnswerPool([], [{ answer: 'Legacy diagnosis', level: 'med_student' }]).includes('Legacy diagnosis'))
})

test('diagnosis hiding does not remove anatomy answers, and the source records stay untouched', () => {
  const source = [record('Hidden diagnosis', 'anatomy')]
  const original = JSON.stringify(source)
  assert.equal(pools.buildAnswerSuggestions('Hidden', [], source, undefined, undefined, 'anatomy').length, 1)
  assert.equal(pools.buildAnswerSuggestions('Hidden', [{ label: 'Hidden diagnosis' }], []).length, 0)
  assert.equal(JSON.stringify(source), original)
})
