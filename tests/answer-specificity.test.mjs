import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const require = createRequire(import.meta.url)
const source = path => readFileSync(new URL(path, import.meta.url), 'utf8')
function load(path, mocks = {}) {
  const code = ts.transpileModule(source(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(name => mocks[name] ?? require(name), module, module.exports)
  return module.exports
}
const helpers = load('../lib/answer-specificity.ts')
const { AnswerSpecificityBadge, AnswerSpecificityField } = load('../components/AnswerSpecificity.tsx', {
  '@/lib/answer-specificity': helpers,
})
const states = ['off', 'named_diagnosis', 'named_fracture']
const expected = {
  named_diagnosis: ['🎯 Named Diagnosis Required', 'Identify the specific named injury or diagnosis, not the broader condition.'],
  named_fracture: ['🎯 Named Fracture Required', 'Identify the specific named fracture pattern. A general fracture diagnosis will not be accepted.'],
}

test('player renders exact badge/helper text; legacy and off cases render no markup', () => {
  for (const value of [undefined, null, '', 'off', 'unknown']) {
    assert.equal(renderToStaticMarkup(React.createElement(AnswerSpecificityBadge, { value })), '')
  }
  for (const [value, texts] of Object.entries(expected)) {
    const html = renderToStaticMarkup(React.createElement(AnswerSpecificityBadge, { value }))
    texts.forEach(text => assert.ok(html.includes(text)))
  }
})

test('admin selector offers exactly three options and selects each saved value', () => {
  for (const value of states) {
    const html = renderToStaticMarkup(React.createElement(AnswerSpecificityField, { value, onChange() {} }))
    assert.equal((html.match(/<option /g) || []).length, 3)
    assert.ok(html.includes(`value="${value}" selected=""`))
  }
})

// Execute each editor's actual save payload expression, then round-trip the stored
// value through its actual edit hydration expression. No live cases are modified.
for (const editor of ['../app/admin/page.tsx', '../app/admin/studio/page.tsx']) {
  test(`${editor}: create, edit, and clear preserve state and accepted aliases`, () => {
    const text = source(editor)
    const ast = ts.createSourceFile(editor, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    let payload
    function visit(node) {
      if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'casePayload') payload = node.initializer.getText(ast)
      ts.forEachChild(node, visit)
    }
    visit(ast)
    assert.ok(payload)
    const hydration = text.match(/setAnswerSpecificity\((normalizeAnswerSpecificity\((?:c|existingCase)\.answer_specificity\))\)/)[1]
    const aliases = ['Holstein Lewis', 'humeral shaft fracture']
    const record = {}
    for (const state of ['off', 'named_diagnosis', 'named_fracture', 'off']) {
      const values = { normalizeCreditValue: value => value || null, clues: [], answerSpecificity: state, storedSynonyms: aliases, answer: 'Holstein-Lewis fracture', prompt: 'Case prompt', caseDate: '2026-10-18', level: 'med_student' }
      const context = new Proxy(values, { has: () => true, get: (target, key) => key === Symbol.unscopables ? undefined : target[key] ?? '' })
      const saved = new Function('context', `with (context) { return (${payload}) }`)(context)
      Object.assign(record, JSON.parse(JSON.stringify(saved)))
      const loaded = new Function('c', 'existingCase', 'normalizeAnswerSpecificity', `return ${hydration}`)(record, record, helpers.normalizeAnswerSpecificity)
      assert.equal(loaded, state)
      assert.deepEqual(record.synonyms, aliases)
      assert.equal(record.answer, values.answer)
    }
    assert.match(text, /upsert\(casePayload,/)
    assert.match(text, /<AnswerSpecificityField value=\{answerSpecificity\}/)
  })
}

test('backups preserve specificity and detect setting-only changes', () => {
  const storage = new Map()
  globalThis.window = { localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) } }
  try {
    const backups = load('../lib/case-backups.ts', { './answer-specificity': helpers })
    const original = { case_date: '2026-10-18', level: 'med_student', answer: 'Holstein-Lewis fracture', synonyms: ['Holstein Lewis'] }
    assert.equal(backups.shouldCreateCaseBackup(original, { ...original, answer_specificity: 'off' }), false)
    for (const state of states) {
      const record = { ...original, answer_specificity: state }
      backups.saveCaseBackup(record, 'admin')
      const restored = backups.getCaseBackupsForSlot(original.case_date, original.level)[0].case
      assert.equal(restored.answer_specificity, state)
      assert.deepEqual(restored.synonyms, original.synonyms)
      assert.equal(backups.shouldCreateCaseBackup(original, record), state !== 'off')
    }
  } finally { delete globalThis.window }
})

test('main player uses persisted state and grading has no dependency on specificity', () => {
  assert.match(source('../app/page.tsx'), /<AnswerSpecificityBadge value=\{dailyCase.answer_specificity\}/)
  assert.doesNotMatch(source('../app/api/guess/route.ts'), /answer_specificity|answerSpecificity|answer-specificity/)
  assert.match(source('../supabase-answer-specificity.sql'), /not null default 'off'/)
})
