import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'
import { NextResponse } from 'next/server.js'

function setup(failInsert = false) {
  const rows = new Map()
  const db = { from(table) {
    const filters = {}
    let countQuery = false
    return {
      select(_fields, options) { countQuery = Boolean(options?.count); return this },
      eq(key, value) { filters[key] = value; return this },
      async single() {
        if (table === 'cases') return { data: { answer: 'correct', level: 'med_student' } }
        return { data: rows.get(filters.id) }
      },
      async insert(row) {
        if (failInsert) return { error: { code: 'offline' } }
        if (rows.has(row.id)) return { error: { code: '23505' } }
        rows.set(row.id, row)
        return { error: null }
      },
      then(resolve) { return Promise.resolve({ count: rows.size }).then(resolve) },
    }
  } }
  const exports = {}
  const mocks = {
    'next/server': { NextResponse }, '@/lib/supabase': { supabase: db },
    '@/lib/utils': { isAcceptedGuess: guess => guess === 'correct' },
    '@/lib/anatomy-quiz': { isAnatomyQuizCaseRecord: () => false },
  }
  const code = ts.transpileModule(readFileSync(new URL('../app/api/guess/route.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  new Function('require', 'exports', code)(name => mocks[name], exports)
  const send = body => exports.POST(new Request('https://orthodle.com/api/guess', { method: 'POST', body: JSON.stringify({ caseId: 'case', sessionId: 'browser', guess: 'correct', requestId: '11111111-1111-4111-8111-111111111111', ...body }) }))
  return { send, rows }
}

test('concurrent retries insert exactly one guess and return a successful result', async () => {
  const { send, rows } = setup()
  const responses = await Promise.all([send({}), send({}), send({})])
  assert.equal(rows.size, 1)
  for (const response of responses) {
    assert.equal(response.status, 200)
    assert.equal((await response.json()).correct, true)
  }
})
test('reusing an ID for another answer is rejected; a new attempt is allowed', async () => {
  const { send, rows } = setup()
  await send({})
  assert.equal((await send({ guess: 'different' })).status, 409)
  assert.equal((await send({ requestId: '22222222-2222-4222-8222-222222222222' })).status, 200)
  assert.equal(rows.size, 2)
})
test('invalid submissions and failed writes do not report success', async () => {
  const { send, rows } = setup()
  assert.equal((await send({ guess: null })).status, 400)
  assert.equal((await send({ requestId: 'invalid' })).status, 400)
  assert.equal(rows.size, 0)
  assert.equal((await setup(true).send({})).status, 503)
})
test('untracked previews do not insert records', async () => {
  const { send, rows } = setup()
  assert.equal((await send({ preview: true })).status, 200)
  assert.equal(rows.size, 0)
})

test('empty and whitespace guesses consume one attempt and retries stay deduplicated', async () => {
  const { send, rows } = setup()
  const response = await send({ guess: '   ' })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { correct: false, remaining: 5 })
  assert.equal([...rows.values()][0].guess_text, '')
  await send({ guess: '' })
  assert.equal(rows.size, 1)
  const next = await send({ guess: '', requestId: '22222222-2222-4222-8222-222222222222' })
  assert.equal((await next.json()).remaining, 4)
})

test('preview accepts an empty guess without recording it', async () => {
  const { send, rows } = setup()
  const response = await send({ guess: '', preview: true })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).correct, false)
  assert.equal(rows.size, 0)
})
