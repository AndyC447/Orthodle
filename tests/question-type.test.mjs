import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'
import React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextResponse } from 'next/server.js'

function load(path, mocks = {}) {
  const exports = {}
  const compiled = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  new Function('require', 'exports', compiled)(name => mocks[name], exports)
  return exports
}
const types = load('../lib/question-type.ts')
const utils = load('../lib/utils.ts')
const quiz = load('../lib/anatomy-quiz.ts', { './question-type': types, '@/lib/utils': utils })
const { QuestionTypeField } = load('../components/QuestionTypeField.tsx', { '@/lib/question-type': types, 'react/jsx-runtime': jsxRuntime })
const base = { level: 'med_student', answer: 'Type II', clue_1: 'Type I', clue_2: 'Type II', clue_3: 'Type III' }

test('all three question types are selectable without changing the publishing slot', () => {
  for (const type of types.QUESTION_TYPES) {
    const html = renderToStaticMarkup(React.createElement(QuestionTypeField, { value: type, onChange() {} }))
    assert.equal((html.match(/<option /g) || []).length, 3)
    assert.ok(html.includes(`value="${type}" selected=""`))
    assert.ok(html.includes('Available on any date'))
    const record = { ...base, synonyms: types.withQuestionType(['Accepted alias'], type) }
    assert.equal(record.level, 'med_student')
    assert.equal(quiz.getCaseQuestionType(record), type)
    assert.equal(quiz.isChoiceQuestionCase(record), type !== 'diagnosis')
    assert.deepEqual(quiz.extractPlainSynonyms(record.synonyms), ['Accepted alias'])
  }
})

test('type switching replaces metadata, preserves aliases, and explicitly restores diagnosis mode', () => {
  let aliases = ['Alternative name']
  for (const type of ['anatomy', 'classification', 'diagnosis']) {
    aliases = types.withQuestionType(aliases, type)
    assert.equal(aliases.filter(types.isQuestionTypeMetadata).length, 1)
    assert.equal(quiz.getCaseQuestionType({ ...base, level: 'attending', synonyms: aliases }), type)
  }
})

test('legacy anatomy quizzes still work while ordinary daily and attending cases stay free-text', () => {
  assert.equal(quiz.getCaseQuestionType(base), 'diagnosis')
  assert.equal(quiz.getCaseQuestionType({ ...base, level: 'attending' }), 'anatomy')
  assert.equal(quiz.getCaseQuestionType({ ...base, level: 'attending', answer: 'Different diagnosis' }), 'diagnosis')
})

test('classification labels and anatomy words are matched as text, not letters found inside words', () => {
  assert.deepEqual(quiz.parseAnatomyGuessLetters('Type II', ['Type I', 'Type II', 'Type III']), ['B'])
  assert.deepEqual(quiz.parseAnatomyGuessLetters('Femoral nerve', ['Sciatic nerve', 'Femoral nerve']), ['B'])
  assert.deepEqual(quiz.parseAnatomyGuessLetters('B|D', ['one', 'two', 'three', 'four']), ['B', 'D'])
  assert.equal(quiz.isCorrectAnatomySelection('Type I', ['Type I', 'Type II'], 'Type II', []), false)
})

test('quiz validation rejects missing, duplicated, and gapped choices without renumbering them', () => {
  assert.equal(quiz.validateChoiceQuestion(['Type I', 'Type II', ''], ['B']), '')
  assert.match(quiz.validateChoiceQuestion(['Type I', '', 'Type II'], ['B']), /without blank gaps/)
  assert.match(quiz.validateChoiceQuestion(['Type I', 'Type I'], ['B']), /must be different/)
  assert.match(quiz.validateChoiceQuestion(['Type I', 'Type II'], []), /valid correct letters/)
  assert.match(quiz.validateChoiceQuestion(['Type I', 'Type II'], ['D']), /valid correct letters/)
})

for (const type of ['anatomy', 'classification']) {
  test(`server grades a daily ${type} question strictly with one submission`, async () => {
    const record = { ...base, synonyms: types.withQuestionType(['__multi_select__:B'], type) }
    const writes = []
    const db = { from: table => {
      const query = {
        select: () => query, eq: () => query,
        single: async () => ({ data: record, error: null }),
        insert: async row => { writes.push(row); return { error: null } },
        then: resolve => Promise.resolve({ count: writes.length }).then(resolve),
      }
      return query
    } }
    const route = load('../app/api/guess/route.ts', { 'next/server': { NextResponse }, '@/lib/anatomy-quiz': quiz, '@/lib/utils': utils, '@/lib/supabase': { supabase: db } })
    const send = async (guess, preview = false) => {
      const response = await route.POST(new Request('https://orthodle.com/api/guess', { method: 'POST', body: JSON.stringify({ caseId: 'case', sessionId: 'session', guess, preview }) }))
      assert.equal(response.status, 200)
      return response.json()
    }
    assert.equal((await send('A', true)).correct, false)
    assert.equal((await send('B', true)).correct, true)
    assert.equal((await send('A|B', true)).correct, false)
    assert.equal(writes.length, 0)
    const result = await send('B')
    assert.equal(result.correct, true)
    assert.equal(result.remaining, 0)
    assert.equal(writes[0].case_id, 'case')
  })
}

test('player and archive completion use the same type detector, not the separate anatomy slot', () => {
  const player = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8')
  assert.match(player, /const isSurgicalAnatomyMode =\s*isChoiceQuestionCase\(dailyCase\)/)
  assert.match(player, /isChoiceQuestionCase\(data\)/)
  assert.match(player, /!isChoiceQuestionCase\(item\) && isDiagnosisAutocompleteCaseLevel/)
  assert.doesNotMatch(player, /visibleTodayLevels\.includes\(item.level\) && \(item.won/)
  for (const file of ['../components/ArchiveCaseActions.tsx', '../app/archive/page.tsx']) {
    const text = readFileSync(new URL(file, import.meta.url), 'utf8')
    assert.match(text, /isChoiceQuestionCase\(item\) \? 1 : 6/)
  }
})
