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
const { isPublicArchiveCase } = load('../lib/archive-publication.ts')
const settings = {
  no_resident_mode: true, no_resident_mode_start_date: '2026-05-17',
  no_anatomy_mode: true, no_anatomy_mode_start_date: '2026-06-15',
}
const monday = ['med_student', 'resident', 'attending'].map(level => ({ level, case_date: '2026-11-02' }))

test('Monday counts only its daily case even when older bonus cases are enabled', () => {
  for (const includeBonus of [false, true]) {
    assert.deepEqual(monday.filter(item => isPublicArchiveCase(item, settings, includeBonus)).map(item => item.level), ['med_student'])
  }
})

test('genuine historical bonus cases are opt-in and stop exactly on their retirement dates', () => {
  for (const [level, before, retired] of [
    ['resident', '2026-05-16', '2026-05-17'], ['attending', '2026-06-14', '2026-06-15'],
  ]) {
    assert.equal(isPublicArchiveCase({ level, case_date: before }, settings), false)
    assert.equal(isPublicArchiveCase({ level, case_date: before }, settings, true), true)
    assert.equal(isPublicArchiveCase({ level, case_date: retired }, settings, true), false)
  }
  assert.equal(isPublicArchiveCase(monday[0], null), true)
  assert.equal(isPublicArchiveCase(monday[1], null, true), false)
})

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const json = (body, options) => new Response(JSON.stringify(body), options)
const request = level => new Request('https://orthodle.com/api/cases/fallback', { method: 'POST', body: JSON.stringify({ level, targetDate: today }) })

test('fallback rejects retired slots before accessing the database', async () => {
  let accessed = false
  const route = load('../app/api/cases/fallback/route.ts', {
    'next/server': { NextResponse: { json } },
    '@/lib/supabase-admin': { getSupabaseAdmin() { accessed = true; throw Error('Must not run') } },
  })
  for (const level of ['resident', 'attending']) assert.equal((await route.POST(request(level))).status, 400)
  assert.equal(accessed, false)
})

test('a daily backup never overwrites a case published while fallback selection was running', async () => {
  const authored = { id: 'authored', level: 'med_student', case_date: today, answer: 'New authored case' }
  let options, payload
  const query = {
    select() { return this }, eq() { return this }, lt() { return this }, gte() { return this },
    maybeSingle: async () => ({ data: null, error: null }),
    order: async () => ({ data: [{ id: 'source', level: 'med_student', case_date: '2026-05-01', answer: 'Old backup' }], error: null }),
    single: async () => ({ data: authored, error: null }),
    upsert: async (value, opts) => { payload = value; options = opts; return { error: null } },
  }
  const route = load('../app/api/cases/fallback/route.ts', {
    'next/server': { NextResponse: { json } },
    '@/lib/supabase-admin': { getSupabaseAdmin: () => ({ from: () => query }) },
  })
  const response = await route.POST(request('med_student'))
  assert.equal(response.status, 200)
  assert.equal(payload.level, 'med_student')
  assert.equal(payload.case_date, today)
  assert.equal(options.ignoreDuplicates, true)
  assert.equal((await response.json()).case.id, 'authored')
})
