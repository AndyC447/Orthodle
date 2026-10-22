import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const compiled = ts.transpileModule(readFileSync(new URL('../lib/case-save.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const exports = {}
new Function('exports', compiled)(exports)
const { saveCaseCompat } = exports

test('modern schema writes all optional fields without retries or payload mutation', async () => {
  const payload = { answer_specificity: 'named_diagnosis', learning_image_caption: '**caption**', answer: 'Original answer' }
  let calls = 0
  const result = await saveCaseCompat(payload, async data => { calls++; assert.deepEqual(data, payload); return { error: null } })
  assert.equal(calls, 1)
  assert.deepEqual(result.omittedFields, [])
  assert.equal(payload.answer_specificity, 'named_diagnosis')
})

test('Postgres missing-column errors also retry without the optional field', async () => {
  for (const message of ['column "answer_specificity" of relation "cases" does not exist', 'column cases.answer_specificity does not exist']) {
    let calls = 0
    const result = await saveCaseCompat({ answer_specificity: 'off' }, async payload => {
      calls++
      return { error: 'answer_specificity' in payload ? { code: '42703', message } : null }
    })
    assert.equal(calls, 2)
    assert.equal(result.error, null)
  }
})

test('permission, unique constraint, network, and required-column errors are never retried', async () => {
  for (const error of [
    { code: '42501', message: 'Permission denied' },
    { code: '23505', message: 'duplicate key' },
    { message: 'Failed to fetch' },
    { code: 'PGRST204', message: "Could not find the 'answer' column of 'cases' in the schema cache" },
    { code: 'PGRST204', message: "Could not find the 'answer_specificity' column of 'another_table' in the schema cache" },
  ]) {
    let calls = 0
    const result = await saveCaseCompat({ answer_specificity: 'off', answer: 'Original' }, async () => { calls++; return { error } })
    assert.equal(calls, 1)
    assert.equal(result.error, error)
  }
})

test('repeated missing-column error stops after the field was already removed', async () => {
  let calls = 0
  const error = { message: "Could not find the 'answer_specificity' column of 'cases' in the schema cache" }
  const result = await saveCaseCompat({ answer_specificity: 'off' }, async () => { calls++; return { error } })
  assert.equal(calls, 2)
  assert.equal(result.error, error)
})

test('studio loading does not request optional columns explicitly', () => {
  const code = readFileSync(new URL('../app/admin/studio/page.tsx', import.meta.url), 'utf8')
  const load = code.slice(code.indexOf('async function loadExistingCase()'), code.indexOf('const existingCase = data as CaseRow'))
  assert.match(load, /\.select\('\*'\)/)
  assert.doesNotMatch(load, /\.select\([^)]*answer_specificity/)
})
