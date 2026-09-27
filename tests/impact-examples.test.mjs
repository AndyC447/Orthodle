import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import ts from 'typescript'

const require = createRequire(import.meta.url)
function load(path, mocks = {}) {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(name => mocks[name] ?? require(name), module, module.exports)
  return module.exports
}
const helpers = load('../lib/impact-examples.ts')
const id = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'

test('selection validation and stable case links', () => {
  assert(helpers.validExampleSelection({ featured: id, anatomy: null, classification: other }))
  for (const invalid of [null, [], {}, { featured: 'bad', anatomy: null, classification: null }, { ...helpers.EMPTY_EXAMPLES, extra: id }]) {
    assert.equal(helpers.validExampleSelection(invalid), false)
  }
  const link = new URL(helpers.exampleCaseHref({ id, case_date: '2026-05-14', level: 'attending' }), 'https://example.test')
  assert.equal(link.searchParams.get('case'), id)
  assert.equal(link.searchParams.get('level'), 'attending')
  assert.equal(link.searchParams.get('date'), '2026-05-14')
})

test('save requires authorization, rejects duplicates and unavailable cases, and persists every slot', async () => {
  const previous = process.env.ADMIN_PASSWORD
  process.env.ADMIN_PASSWORD = 'test-only'
  let saved = null
  const db = { from(table) {
    if (table === 'impact_examples') return { async upsert(rows) { saved = rows; return { error: null } } }
    return { select() { return this }, in(_column, ids) { this.ids = ids; return this }, async lte() { return { data: this.ids.filter(value => value === id).map(id => ({ id })), error: null } } }
  } }
  const route = load('../app/api/impact-examples/route.ts', {
    '@/lib/impact-examples': helpers,
    '@/lib/utils': { todayISO: () => '2026-09-27' },
    '@/lib/supabase-admin': { getSupabaseAdmin: () => db },
  })
  const save = body => route.POST(new Request('https://example.test/api/impact-examples', { method: 'POST', body: JSON.stringify(body) }))
  try {
    assert.equal((await save({ password: 'wrong' })).status, 401)
    assert.equal(saved, null)
    assert.equal((await save({ password: 'test-only', action: 'save', selection: {} })).status, 400)
    assert.equal((await save({ password: 'test-only', action: 'save', selection: { featured: id, anatomy: id, classification: null } })).status, 400)
    assert.equal((await save({ password: 'test-only', action: 'save', selection: { featured: other, anatomy: null, classification: null } })).status, 400)
    assert.equal((await save({ password: 'test-only', action: 'save', selection: { featured: id, anatomy: null, classification: null } })).status, 200)
    assert.deepEqual(saved, [{ slot: 'featured', case_id: id }, { slot: 'anatomy', case_id: null }, { slot: 'classification', case_id: null }])
  } finally {
    if (previous === undefined) delete process.env.ADMIN_PASSWORD
    else process.env.ADMIN_PASSWORD = previous
  }
})
